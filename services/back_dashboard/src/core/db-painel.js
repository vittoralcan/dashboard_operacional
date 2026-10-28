const { Pool } = require('pg');
const { requireEnv } = require('./require-env');

// Pool do db_dashboard (schema painel) — diferente do db-espelho.js: este banco
// é escrito pela própria API (metas, notificações, auditoria), não só lido.
// Mesmo molde de configuração do espelho (fuso, timeout de consulta e de
// aquisição — ver BE-04 em docs/arquitetura/seguranca.md).
function criarPoolPainel() {
    return new Pool({
        host: requireEnv('PG_PAINEL_HOST'),
        port: Number(process.env.PG_PAINEL_PORT || 5432),
        database: requireEnv('PG_PAINEL_DATABASE'),
        user: requireEnv('PG_PAINEL_USER'),
        password: requireEnv('PG_PAINEL_PASSWORD'),
        max: 5,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        options: '-c TimeZone=America/Sao_Paulo -c statement_timeout=30000',
        application_name: 'back-dashboard',
    });
}

module.exports = { criarPoolPainel };
