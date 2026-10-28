// Verificador de APIs monitoradas (B10, RN-013). Oneshot, agendado pelo timer do
// systemd — mesmo padrão do ETL (services/etl/captura/app.js): o timer dispara
// a cada 5 min, o job confere `monitor_config.intervalo_min` e pula se ainda não
// venceu (não é o job quem decide o intervalo, só obedece o que está no banco).
//
//   node jobs/monitor.js
//
// Env: as mesmas PG_PAINEL_* do back_dashboard (EnvironmentFile do mesmo unit,
// ou um .env local em dev — ver .env.example).

const { criarPoolPainel } = require('../src/core/db-painel');
const { verificarApi } = require('../src/core/monitoramento-verificador');

// Tolerância contra o timer disparar um pouco antes do intervalo configurado
// vencer (ex.: timer de 5 min, intervalo configurado de 15 — sem isso, um
// pequeno desalinhamento de relógio faria o job pular um ciclo à toa).
const TOLERANCIA_MS = 60_000;

function logger() {
    const prefixo = '[monitor]';
    return {
        info: (msg) => console.log(`${prefixo} ${msg}`),
        erro: (msg) => console.error(`${prefixo} ${msg}`),
    };
}

// Insere a notificação de transição de estado (RN-013) — ON CONFLICT DO NOTHING
// porque `chave_unica` já deduplica por hora (um timer de 5 min rodando 3x na
// mesma hora não cria 3 notificações da mesma transição).
async function notificarTransicao(dbPainel, api, estadoAnterior, estadoNovo) {
    const agora = new Date();
    const chaveHora = agora.toISOString().slice(0, 13); // AAAA-MM-DDTHH

    if (estadoAnterior && estadoAnterior !== 'f' && estadoNovo === 'f') {
        await dbPainel.query(
            `INSERT INTO painel.notificacao (tipo, titulo, texto, chave_unica)
             VALUES ('erro', 'API fora do ar', $1, $2)
             ON CONFLICT (chave_unica) DO NOTHING`,
            [`${api.nome} não responde desde ${agora.toISOString().slice(11, 16)}.`, `api-fora:${api.id}:${chaveHora}`]
        );
    } else if (estadoAnterior === 'f' && estadoNovo !== 'f') {
        await dbPainel.query(
            `INSERT INTO painel.notificacao (tipo, titulo, texto, chave_unica)
             VALUES ('sucesso', 'API de volta', $1, $2)
             ON CONFLICT (chave_unica) DO NOTHING`,
            [`${api.nome} voltou a responder.`, `api-volta:${api.id}:${chaveHora}`]
        );
    }
}

async function main() {
    const log = logger();
    const dbPainel = criarPoolPainel();

    try {
        const { rows: [configuracao] } = await dbPainel.query(`SELECT intervalo_min FROM painel.monitor_config WHERE id = 1`);
        const { rows: [ultimaExecucao] } = await dbPainel.query(
            `SELECT max(em) AS em FROM painel.monitor_verificacao WHERE origem = 'auto'`
        );

        if (ultimaExecucao.em) {
            const decorridoMs = Date.now() - new Date(ultimaExecucao.em).getTime();
            const intervaloMs = configuracao.intervalo_min * 60_000;
            if (decorridoMs < intervaloMs - TOLERANCIA_MS) {
                log.info(`última verificação há ${Math.round(decorridoMs / 1000)}s; intervalo configurado é ${configuracao.intervalo_min} min — nada a fazer.`);
                return;
            }
        }

        const { rows: apis } = await dbPainel.query(
            `SELECT id, sistema, nome, url, limiar_lento_ms, timeout_ms FROM painel.monitor_api WHERE ativo ORDER BY ordem, id`
        );
        if (apis.length === 0) {
            log.info('nenhuma API ativa cadastrada em painel.monitor_api.');
            return;
        }

        for (const api of apis) {
            const { rows: [anterior] } = await dbPainel.query(
                `SELECT estado FROM painel.monitor_verificacao WHERE api_id = $1 ORDER BY em DESC LIMIT 1`,
                [api.id]
            );

            const resultado = await verificarApi(api);
            await dbPainel.query(
                `INSERT INTO painel.monitor_verificacao (api_id, estado, latencia_ms, http_status, log, origem)
                 VALUES ($1, $2, $3, $4, $5, 'auto')`,
                [api.id, resultado.estado, resultado.latenciaMs, resultado.httpStatus, resultado.log]
            );
            await notificarTransicao(dbPainel, api, anterior?.estado, resultado.estado);

            log.info(`${api.nome}: ${resultado.estado} (${resultado.latenciaMs ?? '-'} ms)${resultado.log ? ' — ' + resultado.log : ''}`);
        }
    } finally {
        await dbPainel.end();
    }
}

main().catch((erro) => {
    console.error('[monitor] encerrado com erro:', erro.message);
    process.exitCode = 1;
});
