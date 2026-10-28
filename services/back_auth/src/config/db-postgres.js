const { Pool } = require('pg');
const { requireEnv } = require('./require-env');

// Flag de SSL — provedores cloud gratuitos (ex: Postgres gerenciado) exigem SSL por padrão
const shouldUseSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';

// Pool de conexão exclusivo para o PostgreSQL de credenciais (usuários).
// connectionTimeoutMillis evita que uma conexão presa (rede, DNS, compute do
// Postgres gerenciado suspenso) fique esperando indefinidamente — sem isso, o driver `pg`
// não tem timeout algum por padrão. Tamanho do pool não é limitado (usa o
// default do `pg`, 10) — diferente de um ambiente serverless, aqui é um
// único processo persistente (PaaS), então múltiplas conexões
// concorrentes são normais, não um problema a evitar.
const pool = new Pool({
    host: requireEnv('DB_HOST'),
    port: Number(process.env.DB_PORT || 5432),
    database: requireEnv('DB_NAME'),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    // BE-05 (docs/arquitetura/seguranca.md): `rejectUnauthorized: false` aceita
    // qualquer certificado, inclusive de um MITM na rota PaaS/VM → Postgres gerenciado —
    // quem estivesse nessa posição leria a senha do banco e todo
    // `senha_hash`. O Postgres gerenciado usa uma CA pública (o trust store padrão do Node
    // já resolve), então `true` basta sem precisar apontar uma CA própria.
    // ATENÇÃO ao implantar: testar a conexão num ambiente não-produtivo antes
    // (achado original já recomendava isso) — se a cadeia de certificado do
    // host configurado em DB_HOST não validar, a conexão passa a falhar.
    ssl: shouldUseSsl ? { rejectUnauthorized: true } : false,
    connectionTimeoutMillis: 10000,
});

/**
 * Função de checagem de saúde de conexão com o PostgreSQL
 */
async function checkDbConnection() {
    const client = await pool.connect();
    try {
        await client.query('SELECT 1');
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    checkDbConnection,
};
