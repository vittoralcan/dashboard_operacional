const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const {
    exigirAutenticacao,
    exigirAdmin,
    bloquearServicoForaDeEnvio,
    bloquearTurnoForaDeOperacional,
} = require('./core/auth.middleware');
const { atribuirRequestId } = require('./core/request-id');
const { criarHealthRouter } = require('./routes/health.routes');
const { criarMacroViewRouter } = require('./routes/macro-view.routes');
const { criarFlowViewer } = require('./modules/base/flow-viewer');
const { criarMetasRouter } = require('./core/metas');
const { criarAtividadesRouter } = require('./core/atividades');
const { criarNotificacoesRouter } = require('./core/notificacoes');
const { criarGargalosGlobaisRouter } = require('./core/gargalos');
const { criarPainelResumoRouter } = require('./core/painel-resumo');
const { criarCatalogoRouter } = require('./core/catalogo');
const { criarMonitoramentoRouter } = require('./core/monitoramento');
const { criarEnvioRouter } = require('./core/envio');
const { criarOperacionalRouter } = require('./operacional');

// moduleId (manifesto) → fábrica do módulo. Um módulo novo entra aqui e em modules/.
const MODULOS = {
    'base/flow-viewer': criarFlowViewer,
};

function instanciarModulos(manifestos, db, dbPainel) {
    return manifestos.map((manifesto) => ({
        projectId: manifesto.projectId,
        instancias: manifesto.modules.map((modulo) => {
            const criar = MODULOS[modulo.moduleId];
            if (!criar) throw new Error(`Manifesto ${manifesto.projectId}: moduleId desconhecido "${modulo.moduleId}".`);
            return {
                instanceId: modulo.instanceId,
                ...criar(modulo.config, { db, dbPainel, instanceId: modulo.instanceId, projectId: manifesto.projectId }),
            };
        }),
    }));
}

// Espelhos distintos lidos pelos módulos — o health reporta a sincronização de cada um.
function espelhosUsados(projetos) {
    const porChave = new Map();
    for (const { instancias } of projetos) {
        for (const { espelho } of instancias) {
            if (espelho) porChave.set(`${espelho.processo}/${espelho.fonte}`, espelho);
        }
    }
    return [...porChave.values()];
}

function criarApp({ db, dbPainel, manifestos, corsOrigins }) {
    const projetos = instanciarModulos(manifestos, db, dbPainel);
    const app = express();

    // BE-01 em espírito: IP real atrás do Nginx da VM, necessário para os
    // limitadores de taxa (BD-14) funcionarem por cliente, não pelo proxy inteiro.
    app.set('trust proxy', 1);
    // BE-09: não anunciar a stack tecnológica em cada resposta.
    app.disable('x-powered-by');
    // BD-14/BE-09: cabeçalhos de segurança padrão. `crossOriginResourcePolicy`
    // precisa ser `cross-origin` — esta API é consumida de uma origem diferente
    // (app.example.com); o padrão do helmet bloquearia a resposta no
    // navegador mesmo com o CORS abaixo liberando.
    app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
    // BD-14: um id por requisição, correlacionando log do servidor com o que
    // o cliente (ou um ticket de suporte) consegue reportar.
    app.use(atribuirRequestId);

    // BD-12 (docs/api/back-dashboard.md §0.4): sem expor esses cabeçalhos pelo CORS,
    // o JS do frontend não consegue ler X-Total-Count/ETag de uma resposta
    // cross-origin, mesmo que o servidor os mande — são invisíveis a `fetch()`.
    app.use(cors({
        origin: corsOrigins,
        exposedHeaders: ['X-Total-Count', 'ETag', 'Retry-After', 'X-Request-Id'],
        // X-Confirmacao-Senha: token de confirmação de senha das correções (operacional/correcoes).
        allowedHeaders: ['Authorization', 'Content-Type', 'If-None-Match', 'X-Confirmacao-Senha'],
    }));
    // BE-03 (docs/arquitetura/seguranca.md): sem `express.json()` global — a
    // maioria das rotas deste serviço é GET. Quem precisa ler corpo (hoje: só
    // PUT /metas) liga o parser no próprio router (ver core/metas.js), não
    // aqui — um corpo JSON malformado em rota pública (`/api/health`) não
    // deve nem tentar ser parseado.

    app.use('/api', criarHealthRouter({ db, espelhos: espelhosUsados(projetos) }));
    app.use('/api', exigirAutenticacao);
    // BD-16 (integracao_bridge.md): credencial de serviço só pode ir pra /envio/*.
    app.use('/api', bloquearServicoForaDeEnvio);
    // Token de turno só vê /operacional/terminal e /operacional/correcoes.
    app.use('/api', bloquearTurnoForaDeOperacional);

    // Rotas globais do painel (api_noir.md Parte B, B7-B9) — não pertencem a
    // um projeto/instância; por isso vêm antes do loop por projeto.
    app.use('/api', criarMetasRouter({ dbPainel, exigirAdmin }));
    app.use('/api', criarAtividadesRouter({ dbPainel }));
    app.use('/api', criarNotificacoesRouter({ dbPainel }));
    app.use('/api', criarGargalosGlobaisRouter(projetos));
    app.use('/api', criarPainelResumoRouter(projetos));
    app.use('/api', criarCatalogoRouter(manifestos, projetos));
    app.use('/api', criarMonitoramentoRouter({ dbPainel, exigirAdmin }));
    app.use('/api', criarEnvioRouter({ dbPainel }));
    app.use('/api', criarOperacionalRouter({ dbPainel, exigirAdmin }));

    // /api/<projeto>/<instância>/... — ex: /api/atlas/negativos/status-fases
    for (const { projectId, instancias } of projetos) {
        for (const instancia of instancias) {
            app.use(`/api/${projectId}/${instancia.instanceId}`, instancia.router);
        }
        app.use(`/api/${projectId}`, criarMacroViewRouter(instancias));
    }

    app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Rota não encontrada.' }));

    // BE-03: handler de erro final — nunca devolve stack trace, caminho ou
    // mensagem crua do driver; só loga no servidor. Último `app.use`, com 4
    // parâmetros (é o que o Express usa para reconhecer um error handler).
    app.use((err, req, res, next) => {
        console.error(`[${req.id ?? '-'}]`, err);
        const status = err.status && err.status < 500 ? err.status : 500;
        res.status(status).json({ success: false, message: status === 500 ? 'Erro interno.' : 'Requisição inválida.' });
    });

    return app;
}

// `instanciarModulos` também é usado por `jobs/notificador.js` (RN-013) —
// precisa dos mesmos objetos de instância (`buscarGargaloAtual`,
// `buscarResumoPainel`, `espelho`) que o app usa, sem reimplementar o mapa
// moduleId -> fábrica numa segunda cópia que poderia divergir.
module.exports = { criarApp, instanciarModulos };
