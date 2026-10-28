// Módulo base flow-viewer: acompanhamento de um fluxo de digitalização do Captura,
// lido do espelho Postgres. Não conhece projeto nenhum (RAM-001) — tudo vem do config.
// Contrato de resposta idêntico ao das rotas originais de back_atlas/back_boreal.

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { rota } = require('../../../core/rota');
const { rotaCacheavel } = require('../../../core/cache-leitura');
const { buscarSincronizacao } = require('../../../core/sincronizacao');
const { validarConfig } = require('./config');
const { montarQueries } = require('./queries');
const { agruparPorEstado } = require('./estados');
const { rotuloTipologia } = require('./tipologia');
const { calcularPeriodoResumo, projetarMes } = require('./periodo');
const { calcularGargalo, montarRetratos } = require('./gargalo');
const { registrarAuditoria } = require('../../../core/auditoria');

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UM_DIA_MS = 24 * 60 * 60 * 1000;
// B11 (api_noir.md): 92 dias — mais estrito que o teto de 366 que o BE-04
// original (docs/arquitetura/seguranca.md) tinha proposto como primeira defesa;
// o contrato do Noir Bento fecha num limite menor, e 92 ⊂ 366 não quebra
// nenhum uso legítimo de hoje (relatórios de período maior já não existiam).
const INTERVALO_MAXIMO_DIAS = 92;
const LIMITE_PADRAO = 500;
const LIMITE_MAXIMO = 5000;

// BD-14 (docs/arquitetura/backend.md §7.2): /relatorio é a rota mais
// pesada da API (até 92 dias de histórico, sem paginação — BE-04). Um só
// limitador aqui, no escopo do módulo (não dentro de `criarFlowViewer`):
// o módulo é instanciado uma vez por instância (4x hoje, no ATLAS), e um
// limitador por instância deixaria a cota efetiva 4x maior que o pretendido.
const limitadorRelatorio = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Muitas requisições de relatório. Tente novamente em alguns minutos.' },
});

// BE-04 (docs/arquitetura/seguranca.md): o regex sozinho aceita datas
// impossíveis (ex.: "2024-13-45", que vira 500 na query em vez de 400) e não
// limita o tamanho do intervalo — um `dataInicio=1900-01-01&dataFim=2100-12-31`
// faz a CTE de dedup percorrer todo o histórico da fase e devolve um JSON de
// vários MB, ocupando uma conexão do pool por até os 30s do statement_timeout.
function dataValida(valor) {
    if (!DATA_ISO.test(valor)) return false;
    const data = new Date(`${valor}T00:00:00Z`);
    return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

// "Hoje" no fuso da operação, sem depender do fuso do processo Node nem de ida
// ao banco — só pra rejeitar "data final no futuro" (B11); cálculos de negócio
// (RN-010/011) continuam vindo de `SELECT current_date` (ver periodo.js).
function hojeBrasil() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// B11 — limite/offset com os mesmos padrões do resto da API (§0.3 do contrato).
function lerPaginacao(query) {
    const limite = Math.min(Math.max(Number(query.limite) || LIMITE_PADRAO, 1), LIMITE_MAXIMO);
    const offset = Math.max(Number(query.offset) || 0, 0);
    return { limite, offset };
}

// `dbPainel` é opcional (BD-1/B11): quando ausente (ex.: testes que só
// passam `db`), o módulo funciona igual, só sem gravar auditoria do
// relatório nem meta no resumo do /gestao — nunca é motivo para a rota falhar.
// `projectId` identifica o projeto dono desta instância só para consultar
// painel.meta (chave projeto+escopo) — não é usado em nenhuma regra de
// negócio do módulo (RAM-001: seria diferente se o código ramificasse por
// projeto; aqui é só uma chave de busca, do mesmo jeito que `instanceId` já é).
function criarFlowViewer(configBruto, { db, instanceId, dbPainel, projectId }) {
    const config = validarConfig(configBruto, instanceId);
    const q = montarQueries(config.schema, { lotesIgnorados: config.lotesIgnorados });
    const espelho = { processo: 'captura', fonte: config.fonte };
    const router = express.Router();

    // Reaproveitada por /status-fases, /gargalos e pelo agregado global (B5) —
    // uma só consulta ao espelho, nomes/tipos vêm do manifesto (RAM-005: o
    // backend só devolve números, quem sabe o que cada FAS_ID significa é o config).
    async function buscarContagemPorFase() {
        const { rows } = await db.query(q.statusFases, [config.fluId, config.fasIds]);
        const porFase = new Map(rows.map((r) => [r.fas_id, r]));
        return config.fasIds.map((fasId) => {
            const meta = config.fasesPorId.get(fasId);
            const contagem = porFase.get(fasId);
            return { fasId, nome: meta.nome, tipo: meta.tipo, pastas: contagem?.pastas ?? 0, imagens: contagem?.imagens ?? 0 };
        });
    }

    // RN-009 — usada pela rota /gargalos desta instância e pelo agregado global
    // (core/gargalos.js, B5); por isso exportada no `return` do módulo, não só
    // uso interno da rota.
    async function buscarGargaloAtual() {
        const fases = await buscarContagemPorFase();
        const retratos = await buscarRetratos();
        return calcularGargalo(fases, config.gargalo, retratos);
    }

    // Dois últimos retratos (07h/19h) desta instância; sem painel ou com falha, só não há vazão.
    async function buscarRetratos() {
        if (!dbPainel) return null;
        try {
            const { rows } = await dbPainel.query(
                `SELECT fas_id, momento, estoque_pastas, estoque_imagens, finalizadas_total, suspensas
                   FROM painel.snapshot_fase
                  WHERE projeto = $1 AND instancia = $2
                    AND momento IN (SELECT DISTINCT momento FROM painel.snapshot_fase WHERE projeto = $1 AND instancia = $2 ORDER BY momento DESC LIMIT 2)`,
                [projectId, instanceId],
            );
            return montarRetratos(rows);
        } catch (err) {
            console.error(`Erro ao ler retratos de ${instanceId}:`, err.message);
            return null;
        }
    }

    // BD-13: chave inclui `instanceId` — o cache é em processo (módulo
    // compartilhado), e cada instância do flow-viewer precisa da sua própria
    // entrada, nunca reaproveitar o dado de outra instância.
    router.get('/status-fases', rota('Erro SQL', rotaCacheavel(`status-fases:${instanceId}`, async () => {
        const fases = await buscarContagemPorFase();
        return Object.fromEntries(fases.map((f) => [f.fasId, { pastas: f.pastas, imagens: f.imagens }]));
    })));

    router.get('/gargalos', rota('Erro ao calcular gargalo', rotaCacheavel(`gargalos:${instanceId}`, buscarGargaloAtual)));

    // B11 (api_noir.md) — paginada: `?limite&offset`, total real em X-Total-Count
    // (cabeçalho exposto via CORS, ver BD-12 em app.js); o corpo continua sendo o
    // array de sempre (compatibilidade com quem ainda não lê o cabeçalho).
    router.get('/fase/:id/pastas', rota('Erro ao listar pastas', async (req, res) => {
        const fasId = Number(req.params.id);
        if (!config.fasIds.includes(fasId)) return res.status(404).json({ success: false });

        const { limite, offset } = lerPaginacao(req.query);
        const [{ rows }, { rows: [{ total }] }] = await Promise.all([
            db.query(q.pastasNaFase, [config.fluId, fasId, limite, offset]),
            db.query(q.pastasNaFaseContagem, [config.fluId, fasId]),
        ]);
        res.set('X-Total-Count', String(total));
        res.json({ success: true, data: rows });
    }));

    // Genérico — mesma pasta, agrupada por lote (tipologia) em vez de listada uma a uma.
    // Existe em toda instância; útil sobretudo onde uma fase mistura mais de uma tipologia.
    router.get('/fase/:id/pastas-por-lote', rota('Erro ao agrupar pastas por lote', async (req, res) => {
        const fasId = Number(req.params.id);
        if (!config.fasIds.includes(fasId)) return res.status(404).json({ success: false });

        const { limite, offset } = lerPaginacao(req.query);
        const [{ rows }, { rows: [{ total }] }] = await Promise.all([
            db.query(q.pastasPorLote, [config.fluId, fasId, limite, offset]),
            db.query(q.pastasPorLoteContagem, [config.fluId, fasId]),
        ]);
        res.set('X-Total-Count', String(total));
        res.json({ success: true, data: rows });
    }));

    // B3 (api_noir.md) — resumo de meta/variação/projeção ao lado das chaves
    // `fase<N>` já existentes. Reaproveita o total do mês da fase final (já
    // calculado no /gestao) em vez de rodar a mesma consulta de novo.
    async function montarResumo(totaisFinalAtual, serieFinal) {
        // O período do "mês anterior" depende do dia de hoje — por isso não dá
        // pra paralelizar esta consulta com as duas de baixo (que dependem do
        // período já calculado); são 2 idas ao banco, não 3.
        const { rows: [{ hoje }] } = await db.query(q.hoje);
        const periodo = calcularPeriodoResumo(hoje);

        const [anterior, linhaMeta] = await Promise.all([
            db.query(q.passagens.final.totaisPeriodo, [config.fluId, config.faseFinal, periodo.mesAnterior.dataInicio, periodo.mesAnterior.dataFim]),
            dbPainel
                ? dbPainel.query(
                      `SELECT valor FROM painel.meta WHERE projeto = $1 AND escopo = $2 AND ano = $3 AND mes = $4`,
                      [projectId, instanceId, periodo.anoAtual, periodo.mesAtual]
                  )
                : Promise.resolve({ rows: [] }),
        ]);

        const finalizadasMes = { pastas: totaisFinalAtual.TotalPastas, imagens: totaisFinalAtual.TotalImagens };
        const mesAnteriorTotais = {
            pastas: anterior.rows[0].TotalPastas,
            imagens: anterior.rows[0].TotalImagens,
            ateDia: periodo.mesAnterior.ateDia,
        };

        const variacaoPct = mesAnteriorTotais.pastas > 0
            ? Number((((finalizadasMes.pastas - mesAnteriorTotais.pastas) / mesAnteriorTotais.pastas) * 100).toFixed(1))
            : null;

        const metaPastas = linhaMeta.rows[0]?.valor ?? null;
        // Dia de hoje = último ponto da série do mês (a série vai do dia 1 até hoje, com zeros).
        const pastasHoje = serieFinal?.[serieFinal.length - 1]?.pastas ?? 0;
        const projecaoMes = projetarMes({ realizado: finalizadasMes.pastas, hoje: pastasHoje, diaAtual: periodo.diaAtual, diasNoMesAtual: periodo.diasNoMesAtual });

        return { faseFinal: config.faseFinal, finalizadasMes, metaPastas, variacaoPct, projecaoMes, pastasHoje, mesAnterior: mesAnteriorTotais };
    }

    async function montarGestao() {
        const porFase = await Promise.all(config.kpiFases.map(async (fasId) => {
            const passagem = q.passagens[config.modoPassagem(fasId)];
            const consultas = [
                db.query(passagem.totaisMes, [config.fluId, fasId]),
                db.query(passagem.graficoMes, [config.fluId, fasId]),
                db.query(passagem.porTipoMes, [config.fluId, fasId]),
            ];
            // Aditivo (config.js): só roda a 3ª consulta quando a instância liga
            // `estadosDaFederacao` — hoje nenhuma instância do ATLAS liga isso, então o
            // comportamento delas não muda nem um pouco (mesmas 2 consultas de sempre).
            if (config.estadosDaFederacao) consultas.push(db.query(q.pastasPorEstado, [config.fluId, fasId]));

            const [totais, grafico, porTipo, porEstado] = await Promise.all(consultas);
            // `graficoMes`: mês até hoje, [{ dia, pastas, imagens }] — mesma janela e fonte de `totaisMes`.
            // `grafico7Dias` (pastas, últimos 7 dias do mês) fica por compatibilidade com clientes antigos.
            // `regra`: tipo de contagem da fase ('entrada' | 'processo' | 'final') — o que "pasta" e "imagens" significam
            // nesses totais (ver queries.js); a tela usa para rotular ("imagens digitalizadas" só na entrada).
            const resultado = {
                regra: config.modoPassagem(fasId),
                totaisMes: totais.rows[0],
                graficoMes: grafico.rows,
                grafico7Dias: grafico.rows.slice(-7).map((r) => r.pastas),
                // Aditivo: produção do mês por tipologia (projeto + lote), por pastas desc; a soma bate com `totaisMes`.
                porTipo: porTipo.rows.map((r) => ({ tipo: rotuloTipologia(r.projeto, r.lote), ...r })),
            };
            if (porEstado) resultado.estados = agruparPorEstado(porEstado.rows);
            return [`fase${fasId}`, resultado];
        }));

        const data = Object.fromEntries(porFase);
        try {
            data.resumo = await montarResumo(data[`fase${config.faseFinal}`].totaisMes, data[`fase${config.faseFinal}`].graficoMes);
        } catch (erro) {
            // RNB-007 (degradação graciosa): sem `resumo`, o frontend esconde só
            // o bloco de meta/variação — o resto do /gestao (que já funcionava)
            // não deve falhar por causa disso.
            console.error(`GET /gestao (${instanceId}) — Erro ao montar resumo:`, erro.message);
        }

        return data;
    }

    // BD-13: cache em processo (30s) + ETag/Cache-Control (15s) — ver
    // core/cache-leitura.js. `/gestao` é a rota mais consultada pelo polling
    // do frontend (60s), então é a que mais se beneficia de servir 304.
    router.get('/gestao', rota('Erro SQL Gestão', rotaCacheavel(`gestao:${instanceId}`, montarGestao)));

    router.get('/relatorio', limitadorRelatorio, rota('Erro ao gerar relatório', async (req, res) => {
        const { faseId, dataInicio, dataFim } = req.query;
        if (!faseId || !dataInicio || !dataFim) {
            return res.status(400).json({ success: false, message: 'Parâmetros incompletos.' });
        }
        const fasId = Number(faseId);
        if (!config.fasIds.includes(fasId) || !dataValida(dataInicio) || !dataValida(dataFim)) {
            return res.status(400).json({ success: false, message: 'Parâmetros inválidos.' });
        }

        const intervaloDias = (new Date(`${dataFim}T00:00:00Z`) - new Date(`${dataInicio}T00:00:00Z`)) / UM_DIA_MS;
        if (intervaloDias < 0) {
            return res.status(400).json({ success: false, message: 'Data de início não pode ser depois da data de fim.' });
        }
        // B11 (api_noir.md) — texto exato do contrato.
        if (dataFim > hojeBrasil()) {
            return res.status(400).json({ success: false, message: 'A data final não pode ser futura.' });
        }
        if (intervaloDias > INTERVALO_MAXIMO_DIAS) {
            return res.status(400).json({ success: false, message: `O período máximo é de ${INTERVALO_MAXIMO_DIAS} dias.` });
        }

        // Fases de KPI: o relatório usa o MESMO CTE de primeira passagem do card (a soma da lista == KPI).
        const sql = config.kpiFases.includes(fasId) ? q.passagens[config.modoPassagem(fasId)].relatorio : q.relatorioSnapshot;
        const { rows: lista } = await db.query(sql, [config.fluId, fasId, dataInicio, dataFim]);
        const imagens = lista.reduce((total, linha) => total + linha.Imagens, 0);
        res.json({ success: true, data: { lista, totais: { pastas: lista.length, imagens } } });
        if (dbPainel) {
            registrarAuditoria(dbPainel, {
                usuarioId: req.usuario?.id, usuarioLogin: req.usuario?.login,
                acao: 'relatorio.gerado', alvo: `Fase ${fasId}`, onde: instanceId,
                detalhe: { dataInicio, dataFim },
            });
        }
    }));

    // B11 — ETag: o dado só muda a cada ciclo do ETL (10 min), então o polling do
    // frontend (60s) normalmente recebe 304 em vez de recalcular/reenviar o corpo.
    router.get('/sincronizacao', rota('Erro ao consultar sincronização', async (req, res) => {
        const data = await buscarSincronizacao(db, espelho);
        const etag = `"${crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex')}"`;
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.set('ETag', etag);
        res.set('Cache-Control', 'private, max-age=15');
        res.json({ success: true, data });
    }));

    // B2 (api_noir.md) — tudo que a tela de fluxo genérica precisa pra desenhar,
    // sem nenhuma constante no frontend. Nunca expõe fluId/fonte/schema (internos).
    // Cacheável: o grafo só muda com um novo deploy do manifesto (não com o ETL).
    router.get('/config', rota('Erro ao montar config', async (req, res) => {
        res.set('Cache-Control', 'private, max-age=300');
        res.json({
            success: true,
            data: {
                instancia: instanceId,
                nome: config.apresentacao?.nome ?? instanceId,
                sub: config.apresentacao?.sub ?? null,
                aValidar: config.apresentacao?.aValidar ?? false,
                visualStyle: config.visualStyle,
                faseFinal: config.faseFinal,
                kpiFases: config.kpiFases,
                passo: config.apresentacao?.passo ?? null,
                gestaoColunas: config.gestaoColunas ?? [],
                fases: config.fases,
                grafo: config.grafo ?? { nos: [], juncoes: [], arestas: [] },
            },
        });
    }));

    // B6 (api_noir.md) — usada pelo agregado global (core/painel-resumo.js),
    // não por uma rota própria desta instância. Reaproveita buscarContagemPorFase
    // e montarResumo (mesmos dados do /gestao e do /gargalos, uma via só).
    async function buscarResumoPainel() {
        const [fases, grafico, totaisFinal, historico, sincronizacao] = await Promise.all([
            buscarContagemPorFase(),
            db.query(q.passagens.final.graficoMes, [config.fluId, config.faseFinal]),
            db.query(q.passagens.final.totaisMes, [config.fluId, config.faseFinal]),
            db.query(q.passagens.final.totalHistorico, [config.fluId, config.faseFinal]),
            buscarSincronizacao(db, espelho),
        ]);

        const resumo = await montarResumo(totaisFinal.rows[0], grafico.rows);
        const emAndamento = fases.filter((f) => f.tipo === 'entrada').reduce((acc, f) => acc + f.pastas, 0);
        // Histórico de pastas que já passaram pela fase final (uma vez cada) — não é o estoque atual da fase.
        const finalizadosTotal = historico.rows[0].total;

        return {
            projeto: projectId,
            emAndamento,
            finalizadosTotal,
            finalizadasMes: resumo.finalizadasMes,
            metaPastas: resumo.metaPastas,
            variacaoPct: resumo.variacaoPct,
            projecaoMes: resumo.projecaoMes,
            // `serieMes`: mês até hoje [{ dia, pastas, imagens }], mesma regra de `finalizadasMes`;
            // `serie7Dias` (pastas) mantida para clientes antigos.
            serieMes: grafico.rows,
            serie7Dias: grafico.rows.slice(-7).map((r) => r.pastas),
            mesAnterior: resumo.mesAnterior,
            sincronizacao,
        };
    }

    const resumoMacroView =
        config.faseMacroView === null
            ? null
            : async () => {
                  const { rows } = await db.query(q.passagens[config.modoPassagem(config.faseMacroView)].imagensHoje, [config.fluId, config.faseMacroView]);
                  return { imagensHoje: rows[0].total };
              };

    // B1 (api_noir.md) — ficha resumida desta instância pro catálogo global
    // (core/catalogo.js); dado estático do manifesto, não precisa de função async.
    const infoCatalogo = {
        nome: config.apresentacao?.nome ?? instanceId,
        sub: config.apresentacao?.sub ?? null,
        grupo: config.apresentacao?.grupo ?? null,
        aValidar: config.apresentacao?.aValidar ?? false,
        fases: config.fases.map((f) => ({ fasId: f.fasId, nome: f.nome, tipo: f.tipo })),
    };

    return { router, resumoMacroView, espelho, buscarGargaloAtual, buscarResumoPainel, infoCatalogo };
}

module.exports = { criarFlowViewer };
