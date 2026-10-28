// ETL Captura → db_espelho. Uma execução = um ciclo completo de uma fonte, depois sai.
// Quem agenda é o systemd (etl-captura@<fonte>.timer, a cada 10 min) — sem loop interno.
//
//   node --env-file=atlas.env app.js             ciclo de sincronização
//   node --env-file=atlas.env app.js --preparar  cria/evolui as tabelas do espelho (deploy)

const { Client } = require('pg');
const { lerConfig } = require('./config');
const { TABELAS } = require('./tabelas');
const { extrair } = require('./sqlserver');
const { prepararSchema, carregarTabela, registrarInicio, registrarFim, podarExecucoes } = require('./postgres');

const PROCESSO = 'captura';

function logger(fonte) {
    const prefixo = `[${PROCESSO}/${fonte}]`;
    return {
        info: (msg) => console.log(`${prefixo} ${msg}`),
        erro: (msg) => console.error(`${prefixo} ${msg}`),
    };
}

async function prepararEspelho(config, log) {
    const pg = new Client(config.postgres);
    await pg.connect();
    try {
        await prepararSchema(pg, config.schema, TABELAS);
        log.info(`schema ${config.schema} pronto (${TABELAS.length} tabelas).`);
    } finally {
        await pg.end();
    }
}

async function executarCiclo(config, log) {
    const pg = new Client(config.postgres);
    await pg.connect();
    try {
        const { rows } = await pg.query('SELECT pg_try_advisory_lock(hashtext($1)) AS obtido', [`etl:${PROCESSO}:${config.fonte}`]);
        if (!rows[0].obtido) {
            log.info('outra execução desta fonte já está em andamento — nada a fazer.');
            return;
        }

        const execucaoId = await registrarInicio(pg, PROCESSO, config.fonte);
        const detalhes = { tabelas: {} };
        let emTransacao = false;

        try {
            const inicioExtracao = Date.now();
            const dados = await extrair(config.sqlserver, TABELAS, config.fluIds);
            detalhes.extracao_ms = Date.now() - inicioExtracao;

            // Uma transação para o ciclo inteiro: quem lê o espelho sempre vê todas as tabelas
            // do mesmo ciclo; se qualquer uma falhar, o retrato anterior fica intacto.
            const inicioCarga = Date.now();
            await pg.query('BEGIN');
            emTransacao = true;
            for (const tabela of TABELAS) {
                detalhes.tabelas[tabela.nome] = await carregarTabela(pg, config.schema, tabela, dados[tabela.nome]);
            }
            await pg.query('COMMIT');
            emTransacao = false;
            detalhes.carga_ms = Date.now() - inicioCarga;

            await registrarFim(pg, execucaoId, 'sucesso', detalhes, null);

            for (const [nome, t] of Object.entries(detalhes.tabelas)) {
                log.info(`${nome}: ${t.extraidas} extraídas, ${t.inseridas} inseridas, ${t.atualizadas} atualizadas, ${t.removidas} removidas`);
            }
            log.info(`ciclo concluído (extração ${detalhes.extracao_ms} ms, carga ${detalhes.carga_ms} ms).`);
        } catch (erro) {
            log.erro(`ciclo falhou: ${erro.message}`);
            if (emTransacao) await pg.query('ROLLBACK');
            await registrarFim(pg, execucaoId, 'erro', detalhes, erro.message);
            throw erro;
        } finally {
            await podarExecucoes(pg, PROCESSO, config.fonte);
        }
    } finally {
        await pg.end();
    }
}

async function main() {
    const preparar = process.argv.includes('--preparar');
    const config = lerConfig({ precisaOrigem: !preparar });
    const log = logger(config.fonte);

    if (preparar) {
        await prepararEspelho(config, log);
    } else {
        await executarCiclo(config, log);
    }
}

main().catch((erro) => {
    console.error(`[${PROCESSO}/${process.env.ETL_FONTE ?? '?'}] encerrado com erro: ${erro.message}`);
    process.exitCode = 1;
});
