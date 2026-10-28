const sql = require('mssql');

// datetime do SQL Server não tem fuso. Extraído como texto ISO (estilo 126) para chegar ao
// Postgres sem passar por objeto Date do JS — o driver mssql leria como UTC e o pg gravaria
// no fuso do processo, deslocando os horários conforme o fuso configurado na VM.
function expressaoColuna(nome, tipo) {
    const coluna = `X.${nome.toUpperCase()}`;
    return tipo === 'timestamp'
        ? `CONVERT(varchar(23), ${coluna}, 126) AS ${nome}`
        : `${coluna} AS ${nome}`;
}

function montarSelect(tabela, fluIds) {
    const colunas = Object.entries(tabela.colunas).map(([nome, tipo]) => expressaoColuna(nome, tipo));
    return `SELECT ${colunas.join(', ')} ${tabela.origem(fluIds)}`;
}

// Extrai todas as tabelas antes de abrir a transação no Postgres, para que a transação
// de carga dure só o tempo de gravar (segundos), não o tempo de rede até a origem.
async function extrair(configSqlServer, tabelas, fluIds) {
    const pool = await new sql.ConnectionPool(configSqlServer).connect();
    try {
        const dados = {};
        for (const tabela of tabelas) {
            const { recordset } = await pool.request().query(montarSelect(tabela, fluIds));
            dados[tabela.nome] = recordset;
        }
        return dados;
    } finally {
        await pool.close();
    }
}

module.exports = { extrair, montarSelect };
