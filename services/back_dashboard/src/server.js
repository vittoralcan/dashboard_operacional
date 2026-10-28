const path = require('path');
const { requireEnv } = require('./core/require-env');
const { criarPoolEspelho } = require('./core/db-espelho');
const { criarPoolPainel } = require('./core/db-painel');
const { carregarManifestos } = require('./core/manifestos');
const { criarApp } = require('./app');

async function iniciar() {
    // Validadas no boot: sem elas, o sintoma só apareceria em runtime (todo token "inválido").
    requireEnv('JWT_SECRET');
    const corsOrigins = requireEnv('CORS_ORIGIN').split(',').map((origem) => origem.trim());

    const db = criarPoolEspelho();
    await db.query('SELECT 1');

    // db_dashboard (schema painel) — metas, notificações, auditoria (Noir
    // Bento F3). Falha alto e claro no boot se faltar config (mesmo padrão do
    // espelho) — ver ordem de deploy em docs/arquitetura/backend.md §12:
    // os env vars PG_PAINEL_* entram ANTES desta versão do código subir.
    const dbPainel = criarPoolPainel();
    await dbPainel.query('SELECT 1');

    const manifestos = carregarManifestos(path.join(__dirname, '..', 'projects'));
    const app = criarApp({ db, dbPainel, manifestos, corsOrigins });

    const porta = Number(process.env.PORT || 3010);
    const host = process.env.HOST || '127.0.0.1';
    app.listen(porta, host, () => {
        const projetos = manifestos.map((m) => `${m.projectId} (${m.modules.map((mod) => mod.instanceId).join(', ')})`);
        console.log(`back-dashboard em http://${host}:${porta} — projetos: ${projetos.join('; ')}`);
    });
}

iniciar().catch((erro) => {
    console.error('Falha ao iniciar o back-dashboard:', erro.message);
    process.exit(1);
});
