const TAMANHO_LOTE = 5000;
const RETENCAO_EXECUCOES_DIAS = 30;

// O Postgres rejeita o byte nulo em colunas de texto (o SQL Server aceita).
const semByteNulo = (_chave, valor) => (typeof valor === 'string' ? valor.replace(/\u0000/g, '') : valor);

// Idempotente: cria o que falta e adiciona colunas novas de tabelas.js. Mudança de tipo ou
// remoção de coluna continua manual — como o espelho é descartável, basta dropar a tabela e
// deixar a próxima carga completa reconstruí-la.
async function prepararSchema(client, schema, tabelas) {
    for (const tabela of tabelas) {
        const destino = `${schema}.${tabela.nome}`;
        const colunas = Object.entries(tabela.colunas).map(([nome, tipo]) => `${nome} ${tipo}`);

        await client.query(`CREATE TABLE IF NOT EXISTS ${destino} (${colunas.join(', ')}, PRIMARY KEY (${tabela.pk.join(', ')}))`);
        for (const definicao of colunas) {
            await client.query(`ALTER TABLE ${destino} ADD COLUMN IF NOT EXISTS ${definicao}`);
        }
        for (const colunasIndice of tabela.indices) {
            await client.query(
                `CREATE INDEX IF NOT EXISTS idx_${tabela.nome}_${colunasIndice.join('_')} ON ${destino} (${colunasIndice.join(', ')})`
            );
        }
    }
}

// Deve rodar dentro da transação do ciclo. Carrega a tabela inteira numa staging temporária
// (descartada pelo próprio Postgres no COMMIT/ROLLBACK) e faz o merge set-based:
// só grava linhas novas ou que mudaram, e remove o que não existe mais na origem.
async function carregarTabela(client, schema, tabela, linhas) {
    const destino = `${schema}.${tabela.nome}`;
    const staging = `stg_${tabela.nome}`;
    const colunas = Object.keys(tabela.colunas);
    const naoPk = colunas.filter((c) => !tabela.pk.includes(c));

    if (linhas.length === 0) {
        const { rows } = await client.query(`SELECT EXISTS (SELECT 1 FROM ${destino}) AS tem_dados`);
        if (rows[0].tem_dados) {
            throw new Error(`${tabela.nome}: a origem devolveu 0 linhas e o espelho tem dados — ciclo abortado para não esvaziar o espelho.`);
        }
    }

    await client.query(`CREATE TEMP TABLE ${staging} (LIKE ${destino}) ON COMMIT DROP`);
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
        const lote = JSON.stringify(linhas.slice(i, i + TAMANHO_LOTE), semByteNulo);
        await client.query(`INSERT INTO ${staging} SELECT * FROM json_populate_recordset(NULL::${staging}, $1::json)`, [lote]);
    }
    // Tabela temporária não passa pelo autovacuum: sem estatísticas o planner pode escolher
    // nested loop no anti-join do DELETE abaixo (quadrático em ~100k linhas).
    await client.query(`ANALYZE ${staging}`);

    const { rows: [gravacao] } = await client.query(`
        WITH gravadas AS (
            INSERT INTO ${destino} AS t (${colunas.join(', ')})
            SELECT ${colunas.join(', ')} FROM ${staging}
            ON CONFLICT (${tabela.pk.join(', ')}) DO UPDATE
               SET ${naoPk.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}
             WHERE (${naoPk.map((c) => `t.${c}`).join(', ')}) IS DISTINCT FROM (${naoPk.map((c) => `EXCLUDED.${c}`).join(', ')})
            RETURNING (xmax = 0) AS inserida
        )
        SELECT count(*) FILTER (WHERE inserida)::int AS inseridas,
               count(*) FILTER (WHERE NOT inserida)::int AS atualizadas
        FROM gravadas
    `);

    const { rowCount: removidas } = await client.query(`
        DELETE FROM ${destino} t
        WHERE NOT EXISTS (
            SELECT 1 FROM ${staging} s WHERE ${tabela.pk.map((c) => `s.${c} = t.${c}`).join(' AND ')}
        )
    `);

    return { extraidas: linhas.length, inseridas: gravacao.inseridas, atualizadas: gravacao.atualizadas, removidas };
}

// Só é seguro marcar "executando" antigos como interrompidos porque o chamador segura o
// advisory lock da fonte: nenhuma outra execução dela pode estar viva agora.
async function registrarInicio(client, processo, fonte) {
    await client.query(
        `UPDATE etl.execucao SET status = 'interrompido', fim = now()
          WHERE processo = $1 AND fonte = $2 AND status = 'executando'`,
        [processo, fonte]
    );
    const { rows } = await client.query(
        `INSERT INTO etl.execucao (processo, fonte, status) VALUES ($1, $2, 'executando') RETURNING id`,
        [processo, fonte]
    );
    return rows[0].id;
}

async function registrarFim(client, id, status, detalhes, erro) {
    await client.query(
        `UPDATE etl.execucao SET fim = now(), status = $2, detalhes = $3::jsonb, erro = $4 WHERE id = $1`,
        [id, status, JSON.stringify(detalhes), erro]
    );
}

async function podarExecucoes(client, processo, fonte) {
    await client.query(
        `DELETE FROM etl.execucao
          WHERE processo = $1 AND fonte = $2 AND inicio < now() - make_interval(days => $3)`,
        [processo, fonte, RETENCAO_EXECUCOES_DIAS]
    );
}

module.exports = { prepararSchema, carregarTabela, registrarInicio, registrarFim, podarExecucoes };
