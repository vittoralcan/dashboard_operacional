require('dotenv').config();

const app = require('./app');
const { checkDbConnection } = require('./config/db-postgres');

const PORT = Number(process.env.PORT || 3002);
// Atrás do Nginx na VM: escuta só em loopback por padrão (mesmo padrão do back_dashboard).
// Defina HOST=0.0.0.0 só se precisar expor a porta diretamente (ex.: container).
const HOST = process.env.HOST || '127.0.0.1';

async function startServer() {
  try {
    console.log('🔄 Inicializando checagens de conexões com bancos...');

    await checkDbConnection();
    console.log('✅ PostgreSQL (Autenticação/Usuários): Conectado com sucesso.');

    app.listen(PORT, HOST, () => {
      console.log(`🚀 API Auth rodando com sucesso em http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Erro crítico na inicialização do servidor:', err.message || err);
    process.exit(1);
  }
}

startServer();
