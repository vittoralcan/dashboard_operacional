// Notificador (RN-013, docs/arquitetura/backend.md §6.5) — oneshot,
// agendado pelo timer do systemd a cada 5 min, mesmo padrão de jobs/monitor.js.
// Cobre as 3 regras que `monitor.js` NÃO cobre (ele só cria as notificações
// de API fora do ar/de volta): gargalo, ETL atrasado e meta atingida. A 6ª
// regra da tabela (usuário criado) fica de fora — exige um canal
// back_auth → back_dashboard que não existe (F4).
//
//   node jobs/notificador.js
//
// Env: as mesmas do back_dashboard (espelho + PG_PAINEL_*).

const path = require('path');
const { criarPoolEspelho } = require('../src/core/db-espelho');
const { criarPoolPainel } = require('../src/core/db-painel');
const { carregarManifestos } = require('../src/core/manifestos');
const { buscarSincronizacao } = require('../src/core/sincronizacao');
const { instanciarModulos } = require('../src/app');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function logger() {
    const prefixo = '[notificador]';
    return {
        info: (msg) => console.log(`${prefixo} ${msg}`),
        erro: (msg) => console.error(`${prefixo} ${msg}`),
    };
}

// "Hoje" no fuso da operação, sem ida ao banco — só pra montar chave_unica e
// texto (mesmo padrão de `hojeBrasil()` em flow-viewer/index.js, B11).
function hojeBrasil() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function horaBrasil(isoString) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(isoString));
}

async function notificar(dbPainel, { tipo, titulo, texto, chaveUnica, destino }) {
    await dbPainel.query(
        `INSERT INTO painel.notificacao (tipo, titulo, texto, destino, chave_unica)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (chave_unica) DO NOTHING`,
        [tipo, titulo, texto, destino ? JSON.stringify(destino) : null, chaveUnica]
    );
}

// RN-009 — dedup por dia: enquanto a mesma fase continuar sendo o gargalo, no
// máximo 1 notificação por dia (não uma a cada 5 min). Se o gargalo mudar de
// fase no mesmo dia, é uma `chave_unica` diferente (`fasId` faz parte dela) —
// notifica de novo, intencional (é uma informação nova).
async function verificarGargalo(dbPainel, log, { projectId, instancia, hoje }) {
    const { gargalo } = await instancia.buscarGargaloAtual();
    if (!gargalo) return;

    await notificar(dbPainel, {
        tipo: 'alerta',
        titulo: 'Gargalo',
        texto: `Gargalo em ${gargalo.nome} — ${gargalo.pastas} pastas paradas em ${projectId} · ${instancia.instanceId}, ${gargalo.pctParadas ?? '-'}% das paradas.`,
        chaveUnica: `gargalo:${projectId}/${instancia.instanceId}/${gargalo.fasId}:${hoje}`,
        // Rota de deep-link assumida (`/<projeto>/<instancia>/fluxograma`) — o
        // frontend novo ainda não existe (F0/F1 não começaram); ajustar quando
        // a rota real for definida.
        destino: { rota: `/${projectId}/${instancia.instanceId}/fluxograma`, foco: { instancia: instancia.instanceId, fasId: gargalo.fasId } },
    });
    log.info(`gargalo em ${projectId}/${instancia.instanceId} (fase ${gargalo.fasId}, ${gargalo.pastas} pastas).`);
}

// RN-012/RN-013 — 1 notificação por dia por `fonte`, enquanto o atraso
// persistir. Verifica por `fonte` única (não por instância): várias
// instâncias do mesmo projeto costumam compartilhar o mesmo espelho/ETL
// (ex.: as 4 instâncias do ATLAS), então checar uma vez evita trabalho
// repetido e notificação duplicada (a `chave_unica` já dedupe por fonte).
async function verificarEtlAtrasado(db, dbPainel, log, { fonte, espelho, hoje }) {
    const sincronizacao = await buscarSincronizacao(db, espelho);
    if (!sincronizacao.atrasado) return;

    const texto = sincronizacao.ultimaSincronizacao
        ? `Dados de ${fonte} desatualizados — última sincronização às ${horaBrasil(sincronizacao.ultimaSincronizacao)}.`
        : `Dados de ${fonte} desatualizados — nenhuma sincronização bem-sucedida registrada ainda.`;

    await notificar(dbPainel, {
        tipo: 'alerta',
        titulo: 'Dados desatualizados',
        texto,
        chaveUnica: `etl-atrasado:${fonte}:${hoje}`,
    });
    log.info(`ETL atrasado: ${fonte}.`);
}

// RN-011/RN-013 — "pela 1ª vez no mês": a `chave_unica` inclui só
// projeto/escopo/ano-mês (sem o dia), então `ON CONFLICT DO NOTHING` garante
// que só a primeira checagem do mês que encontrar a meta batida notifica; as
// demais no mesmo mês (a cada 5 min, pelo resto do mês) não duplicam.
async function verificarMetaAtingida(dbPainel, log, { projectId, instancia, ano, mes }) {
    if (!instancia.buscarResumoPainel) return;
    const resumo = await instancia.buscarResumoPainel();
    const { metaPastas, finalizadasMes } = resumo;
    if (!Number.isFinite(metaPastas) || finalizadasMes.pastas < metaPastas) return;

    await notificar(dbPainel, {
        tipo: 'sucesso',
        titulo: 'Meta atingida',
        texto: `Meta de ${MESES[mes - 1]} atingida — ${instancia.instanceId}: ${finalizadasMes.pastas} de ${metaPastas}.`,
        chaveUnica: `meta:${projectId}/${instancia.instanceId}:${ano}-${String(mes).padStart(2, '0')}`,
        destino: { rota: `/${projectId}/${instancia.instanceId}` },
    });
    log.info(`meta atingida em ${projectId}/${instancia.instanceId} (${finalizadasMes.pastas}/${metaPastas}).`);
}

async function main() {
    const log = logger();
    const db = criarPoolEspelho();
    const dbPainel = criarPoolPainel();

    try {
        const manifestos = carregarManifestos(path.join(__dirname, '..', 'projects'));
        const projetos = instanciarModulos(manifestos, db, dbPainel);

        const hojeIso = hojeBrasil();
        const [ano, mes] = hojeIso.split('-').map(Number);

        // Fontes únicas de ETL entre todas as instâncias (várias instâncias
        // podem compartilhar o mesmo espelho — ver verificarEtlAtrasado).
        const fontesUnicas = new Map();
        for (const { instancias } of projetos) {
            for (const instancia of instancias) {
                if (instancia.espelho) fontesUnicas.set(`${instancia.espelho.processo}/${instancia.espelho.fonte}`, instancia.espelho);
            }
        }

        for (const espelho of fontesUnicas.values()) {
            try {
                await verificarEtlAtrasado(db, dbPainel, log, { fonte: espelho.fonte, espelho, hoje: hojeIso });
            } catch (erro) {
                // RNB-007 (degradação graciosa, mesmo princípio usado em todo
                // o resto do back_dashboard): uma fonte com espelho ausente ou
                // incompleto (ex.: schema nunca migrado
                // nesta VM) não pode impedir a checagem das demais fontes —
                // nem agora, nem nos próximos ciclos do timer.
                log.erro(`falha ao checar ETL de ${espelho.fonte}: ${erro.message}`);
            }
        }

        for (const { projectId, instancias } of projetos) {
            for (const instancia of instancias) {
                try {
                    if (instancia.buscarGargaloAtual) {
                        await verificarGargalo(dbPainel, log, { projectId, instancia, hoje: hojeIso });
                    }
                    await verificarMetaAtingida(dbPainel, log, { projectId, instancia, ano, mes });
                } catch (erro) {
                    // Mesmo motivo acima — uma instância quebrada não pode
                    // impedir a checagem das demais.
                    log.erro(`falha ao checar ${projectId}/${instancia.instanceId}: ${erro.message}`);
                }
            }
        }
    } finally {
        await db.end();
        await dbPainel.end();
    }
}

main().catch((erro) => {
    console.error('[notificador] encerrado com erro:', erro.message);
    process.exitCode = 1;
});
