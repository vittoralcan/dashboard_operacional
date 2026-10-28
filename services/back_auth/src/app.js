const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { requireEnv } = require('./config/require-env');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./features/auth/routes/auth.routes');
const usuariosRoutes = require('./features/auth/routes/usuarios.routes');
const meRoutes = require('./features/auth/routes/me.routes');
const sessaoServicoRoutes = require('./features/auth/routes/sessao-servico.routes');
const { exigirAutenticacao } = require('./features/auth/middleware/auth.middleware');

const app = express();

// BE-01 (docs/arquitetura/seguranca.md): necessário para que express-rate-limit
// (auth.routes.js) veja o IP real do cliente, não o do proxy — o back_auth
// hoje roda atrás do PaaS e/ou de um Nginx na VM (ver OPS-02), ambos
// proxies reversos de salto único.
app.set('trust proxy', 1);
// BE-09: não anunciar a stack tecnológica em cada resposta.
app.disable('x-powered-by');
// BD-14/BE-09 (docs/arquitetura/seguranca.md): cabeçalhos de segurança padrão
// (HSTS, nosniff, frame-ancestors etc.). `crossOriginResourcePolicy` precisa
// ser `cross-origin` porque esta API é consumida de uma origem diferente
// (o frontend em app.example.com) — o padrão do helmet ('same-origin')
// bloquearia essas respostas no navegador mesmo com o CORS abaixo liberando.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Configuração do CORS — lista explícita de origens permitidas (nunca '*'; ver RA-010)
const corsOrigins = requireEnv('CORS_ORIGIN').split(',').map((origin) => origin.trim());
// `Retry-After` (A1, 429 de login) precisa ser exposto pelo CORS — sem isso o
// `fetch()` do frontend não consegue ler o cabeçalho numa resposta cross-origin.
app.use(cors({ origin: corsOrigins, exposedHeaders: ['Retry-After'] }));
app.use(express.json());

app.use('/api', healthRoutes);
// Login fica aberto, sem token — precisa disso pra conseguir logar.
app.use('/api', authRoutes);
// Criação de usuário (admin-only) e troca de senha exigem sessão válida (RA-016).
app.use('/api', exigirAutenticacao, usuariosRoutes);
// Perfil e preferências do próprio usuário logado (Noir Bento A2-A4).
app.use('/api', exigirAutenticacao, meRoutes);
// Emissão de credencial de serviço (A9, admin-only) — integração com o Bridge.
app.use('/api', exigirAutenticacao, sessaoServicoRoutes);

// BE-03: handler de erro final — pega qualquer erro não tratado (ex.: JSON
// malformado em express.json(), que por padrão do Express cai aqui antes de
// qualquer middleware de auth) e devolve uma mensagem genérica, nunca a
// stack trace ou caminho do driver/arquivo. Precisa ser o último `app.use`,
// com 4 parâmetros (é o que o Express usa para reconhecer um error handler).
app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status && err.status < 500 ? err.status : 500;
    res.status(status).json({ success: false, message: status === 500 ? 'Erro interno.' : 'Requisição inválida.' });
});

module.exports = app;
