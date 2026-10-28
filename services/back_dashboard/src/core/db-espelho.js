const { Pool } = require('pg');
const { requireEnv } = require('./require-env');

// Os timestamps do espelho são relógio de parede de Brasília, sem fuso (ver
// services/etl/captura/tabelas.js). A sessão roda em America/Sao_Paulo para que
// current_date/localtimestamp signifiquem "hoje" no horário local, como o GETDATE() do
// Captura. Por isso as queries devolvem datas já formatadas (to_char): uma coluna
// timestamp crua viraria Date no fuso do processo Node.
function criarPoolEspelho() {
    return new Pool({
        host: requireEnv('PG_ESPELHO_HOST'),
        port: Number(process.env.PG_ESPELHO_PORT || 5432),
        database: requireEnv('PG_ESPELHO_DATABASE'),
        user: requireEnv('PG_ESPELHO_USER'),
        password: requireEnv('PG_ESPELHO_PASSWORD'),
        max: 10,
        // BE-04 (docs/arquitetura/seguranca.md): sem isso, uma conexão presa
        // (rede, DNS, servidor sobrecarregado) espera para sempre — o driver
        // `pg` não tem timeout de aquisição por padrão. Com o pool saturado
        // (ex.: vários /relatorio de intervalo grande em paralelo), toda
        // requisição nova — inclusive /api/health — ficava na fila
        // indefinidamente em vez de falhar rápido.
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        options: '-c TimeZone=America/Sao_Paulo -c statement_timeout=30000',
        application_name: 'back-dashboard',
    });
}

module.exports = { criarPoolEspelho };
