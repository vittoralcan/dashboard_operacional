function requireEnv(nome) {
    const valor = process.env[nome];
    if (valor === undefined || valor === '') {
        throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
    }
    return valor;
}

// ETL_FONTE vira nome de schema (captura_<fonte>) interpolado em SQL — por isso a whitelist.
const FONTE_VALIDA = /^[a-z][a-z0-9_]{0,30}$/;

function lerFluIds() {
    const partes = requireEnv('CAPTURA_FLU_IDS').split(',').map((s) => s.trim());
    if (!partes.every((p) => /^\d+$/.test(p))) {
        throw new Error('CAPTURA_FLU_IDS inválida — use inteiros separados por vírgula (ex: 4,8).');
    }
    return partes.map(Number);
}

function lerConfig({ precisaOrigem }) {
    const fonte = requireEnv('ETL_FONTE');
    if (!FONTE_VALIDA.test(fonte)) {
        throw new Error(`ETL_FONTE inválida ("${fonte}") — só letras minúsculas, números e "_".`);
    }

    const config = {
        fonte,
        schema: `captura_${fonte}`,
        postgres: {
            host: requireEnv('PG_HOST'),
            port: Number(process.env.PG_PORT || 5432),
            database: requireEnv('PG_DATABASE'),
            user: requireEnv('PG_USER'),
            password: requireEnv('PG_PASSWORD'),
            application_name: `etl-captura-${fonte}`,
        },
    };

    if (precisaOrigem) {
        config.fluIds = lerFluIds();
        config.sqlserver = {
            server: requireEnv('SQLSERVER_HOST'),
            port: Number(process.env.SQLSERVER_PORT || 1433),
            database: requireEnv('SQLSERVER_DATABASE'),
            user: requireEnv('SQLSERVER_USER'),
            password: requireEnv('SQLSERVER_PASSWORD'),
            connectionTimeout: 30_000,
            // O default do driver (15 s) não comporta a extração completa de TBL_ESTATISTICA via VPN.
            requestTimeout: 180_000,
            pool: { max: 1, min: 0 },
            options: {
                encrypt: process.env.SQLSERVER_ENCRYPT === 'true',
                trustServerCertificate: process.env.SQLSERVER_TRUST_CERT === 'true',
                // Identifica as sessões deste ETL para quem administra o Captura (sp_who / Activity Monitor).
                appName: `etl-captura-${fonte}`,
            },
        };
    }

    return config;
}

module.exports = { lerConfig };
