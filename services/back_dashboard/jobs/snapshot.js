// Retrato de fases na virada de turno (RF-52). Oneshot, agendado pelo timer do
// systemd às 07h e 19h de São Paulo — mesmo padrão de jobs/retencao.js.
//
//   node jobs/snapshot.js
//
// Env: as mesmas PG_* (espelho) e PG_PAINEL_* do back_dashboard.

const path = require('node:path');
const { criarPoolEspelho } = require('../src/core/db-espelho');
const { criarPoolPainel } = require('../src/core/db-painel');
const { carregarManifestos } = require('../src/core/manifestos');
const { validarConfig } = require('../src/modules/base/flow-viewer/config');
const { montarQueries } = require('../src/modules/base/flow-viewer/queries');

const RETENCAO_DIAS = 180;
// São Paulo é UTC-3 sem horário de verão: 07h BRT = 10:00Z, 19h BRT = 22:00Z.
const HORAS_UTC_DA_VIRADA = [10, 22];

function logger() {
    const prefixo = '[snapshot]';
    return {
        info: (msg) => console.log(`${prefixo} ${msg}`),
        erro: (msg) => console.error(`${prefixo} ${msg}`),
    };
}

// Última virada de turno (07h ou 19h BRT) já ocorrida em `agora`.
function momentoDaVirada(agora = new Date()) {
    const dia = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
    const candidatas = [-1, 0].flatMap((deslocamento) =>
        HORAS_UTC_DA_VIRADA.map((hora) => dia + deslocamento * 86400000 + hora * 3600000));
    return new Date(Math.max(...candidatas.filter((ms) => ms <= agora.getTime())));
}

// Pastas distintas com ao menos uma passagem finalizada, por fase. Mesmo filtro
// de pasta do `statusFases` (fora de inexistentes e de lotes ignorados).
function queryFinalizadas(schema, lotesIgnorados) {
    const lotes = lotesIgnorados.map((l) => `'${String(l).toLowerCase().replace(/'/g, "''")}'`);
    const foraDeLoteIgnorado = lotes.length === 0 ? 'TRUE' : `NOT EXISTS (
            SELECT 1 FROM ${schema}.tbl_lote li
             WHERE li.prj_id = p.prj_id AND li.lot_id = p.lot_id AND lower(li.lot_nome) IN (${lotes.join(', ')}))`;
    return `
        SELECT e.fas_id, count(DISTINCT (e.prj_id, e.lot_id, e.pas_id))::int AS finalizadas
          FROM ${schema}.tbl_estatistica e
          JOIN ${schema}.tbl_projeto prj ON prj.prj_id = e.prj_id
          JOIN ${schema}.tbl_pasta p ON p.prj_id = e.prj_id AND p.lot_id = e.lot_id AND p.pas_id = e.pas_id
         WHERE prj.flu_id = $1 AND e.fas_id = ANY($2::int[]) AND e.ein_status_finalizado = 1
           AND coalesce(p.pas_inexistente, 0) = 0 AND ${foraDeLoteIgnorado}
         GROUP BY e.fas_id`;
}

async function coletarRetrato(db, config) {
    const lotesIgnorados = config.lotesIgnorados ?? [];
    const params = [config.fluId, config.fasIds];
    const estoque = await db.query(montarQueries(config.schema, { lotesIgnorados }).statusFases, params);
    const finalizadas = await db.query(queryFinalizadas(config.schema, lotesIgnorados), params);

    const estoquePorFase = new Map(estoque.rows.map((r) => [Number(r.fas_id), r]));
    const finalizadasPorFase = new Map(finalizadas.rows.map((r) => [Number(r.fas_id), r]));

    return config.fasIds.map((fasId) => {
        const tipo = config.fasesPorId.get(fasId).tipo;
        const est = estoquePorFase.get(fasId);
        const estoquePastas = Number(est?.pastas ?? 0);
        return {
            fasId,
            tipo,
            estoquePastas,
            estoqueImagens: Number(est?.imagens ?? 0),
            finalizadasTotal: Number(finalizadasPorFase.get(fasId)?.finalizadas ?? 0),
            suspensas: tipo === 'erro' ? estoquePastas : 0,
        };
    });
}

async function gravarRetrato(dbPainel, { projeto, instancia, momento, fases }) {
    let inseridas = 0;
    for (const f of fases) {
        const { rowCount } = await dbPainel.query(
            `INSERT INTO painel.snapshot_fase
                 (projeto, instancia, fas_id, tipo, momento, estoque_pastas, estoque_imagens, finalizadas_total, suspensas)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (projeto, instancia, fas_id, momento) DO NOTHING`,
            [projeto, instancia, f.fasId, f.tipo, momento, f.estoquePastas, f.estoqueImagens, f.finalizadasTotal, f.suspensas]
        );
        inseridas += rowCount;
    }
    return inseridas;
}

async function limparAntigos(dbPainel, dias = RETENCAO_DIAS) {
    const { rowCount } = await dbPainel.query(
        `DELETE FROM painel.snapshot_fase WHERE momento < now() - ($1 || ' days')::interval`,
        [dias]
    );
    return rowCount;
}

async function executar({ db, dbPainel, manifestos, agora = new Date(), log }) {
    const momento = momentoDaVirada(agora);
    let gravadas = 0;
    let falhas = 0;

    for (const manifesto of manifestos) {
        for (const modulo of manifesto.modules) {
            if (modulo.moduleId !== 'base/flow-viewer') continue;
            try {
                const config = validarConfig(modulo.config, modulo.instanceId);
                const fases = await coletarRetrato(db, config);
                const n = await gravarRetrato(dbPainel, {
                    projeto: manifesto.projectId, instancia: modulo.instanceId, momento, fases,
                });
                gravadas += n;
                log.info(`${manifesto.projectId}/${modulo.instanceId}: ${n} fase(s) gravada(s).`);
            } catch (erro) {
                // Uma instância fora do ar não impede o retrato das demais.
                falhas += 1;
                log.erro(`falha em ${manifesto.projectId}/${modulo.instanceId}: ${erro.message}`);
            }
        }
    }

    const apagadas = await limparAntigos(dbPainel);
    log.info(`${gravadas} linha(s) gravada(s), ${falhas} falha(s), ${apagadas} antiga(s) apagada(s) (> ${RETENCAO_DIAS} dias).`);
    return { gravadas, falhas };
}

async function main() {
    const log = logger();
    const db = criarPoolEspelho();
    const dbPainel = criarPoolPainel();

    try {
        const manifestos = carregarManifestos(path.join(__dirname, '..', 'projects'));
        await executar({ db, dbPainel, manifestos, log });
    } finally {
        await db.end();
        await dbPainel.end();
    }
}

module.exports = { momentoDaVirada, coletarRetrato, gravarRetrato, limparAntigos, executar };

if (require.main === module) {
    main().catch((erro) => {
        console.error('[snapshot] encerrado com erro:', erro.message);
        process.exitCode = 1;
    });
}
