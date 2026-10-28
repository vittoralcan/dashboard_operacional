const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { requireEnv } = require('./require-env');

// Só valida tokens emitidos pelo back_auth (mesma JWT_SECRET, RA-016) — nunca assina.
// Mesmos formatos de erro de back_boreal/back_atlas, que o frontend (public/auth.js) já trata.
function exigirAutenticacao(req, res, next) {
    const [esquema, token] = (req.headers.authorization || '').split(' ');

    if (esquema !== 'Bearer' || !token) {
        return res.status(401).json({ success: false, message: 'Token de autenticação ausente.' });
    }

    try {
        // BE-02 (docs/arquitetura/seguranca.md): fixar o algoritmo aceito na verificação.
        const payload = jwt.verify(token, requireEnv('JWT_SECRET'), { algorithms: ['HS256'] });
        req.usuario = {
            id: payload.sub,
            login: payload.login,
            tipo: payload.tipo,
            // Só presentes numa credencial de serviço (A9)
            // — undefined pra um usuário comum, ignorado pelo resto do código.
            instancia: payload.instancia,
            escopo: payload.escopo,
        };
        return next();
    } catch (erro) {
        if (erro instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ success: false, message: 'Sessão expirada. Faça login novamente.' });
        }
        return res.status(401).json({ success: false, message: 'Token de autenticação inválido.' });
    }
}

// Usado pelas rotas de apoio do painel que só admin pode escrever (ex.: PUT
// /metas) — mesma checagem de back_auth/.../middleware/auth.middleware.js.
function exigirAdmin(req, res, next) {
    if (!req.usuario || req.usuario.tipo !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acesso restrito a administradores.' });
    }
    return next();
}

/**
 * BD-16 (docs/api/envio-bridge.md §6.2): uma credencial de
 * serviço (A9) só pode chamar as rotas de envio — nunca os demais dados do
 * painel (ATLAS/Captura via db_espelho, metas, notificações…), mesmo tendo
 * um JWT válido. Sem isto, um token de serviço vazado — que a análise de
 * risco da proposta (§7) assume só poder poluir `envio_caixa` — na prática
 * conseguiria ler qualquer rota GET que hoje não exige admin. Roda logo
 * depois de `exigirAutenticacao`, antes de qualquer rota global do painel.
 * `req.path` aqui já vem sem o prefixo `/api` (mesma convenção de todo
 * `core/*.js`, que registra rotas como `/metas`, não `/api/metas`).
 */
function bloquearServicoForaDeEnvio(req, res, next) {
    if (req.usuario?.tipo === 'servico' && !req.path.startsWith('/envio')) {
        return res.status(403).json({ success: false, message: 'Acesso restrito a administradores.' });
    }
    return next();
}

// Terminal operacional: conta compartilhada por turno (docs/decisoes.md).
function exigirTurno(req, res, next) {
    if (req.usuario?.tipo !== 'turno') {
        return res.status(403).json({ success: false, message: 'Acesso restrito a contas de turno.' });
    }
    return next();
}

function exigirTurnoOuAdmin(req, res, next) {
    if (req.usuario?.tipo !== 'turno' && req.usuario?.tipo !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acesso restrito a turnos e administradores.' });
    }
    return next();
}

// Relatórios de gestão: admin e standard (turno e serviço ficam de fora).
function exigirGestao(req, res, next) {
    if (req.usuario?.tipo !== 'admin' && req.usuario?.tipo !== 'standard') {
        return res.status(403).json({ success: false, message: 'Acesso restrito à gestão.' });
    }
    return next();
}

// Par do back_auth (config/jwt.js, R-03): mesma derivação HMAC(JWT_SECRET, 'confirmacao-senha').
function segredoConfirmacao() {
    return crypto.createHmac('sha256', requireEnv('JWT_SECRET')).update('confirmacao-senha').digest('hex');
}

// Alterações exigem o token de confirmação de senha do próprio usuário logado.
function exigirConfirmacaoSenha(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const token = req.headers['x-confirmacao-senha'];
    try {
        const payload = jwt.verify(token, segredoConfirmacao(), { algorithms: ['HS256'] });
        if (payload.sub !== undefined && payload.sub === req.usuario?.id) return next();
    } catch {
        // token ausente, inválido ou expirado: cai na resposta 403 abaixo
    }
    return res.status(403).json({ success: false, codigo: 'confirmacao', message: 'Confirme sua senha para corrigir.' });
}

/**
 * Token de turno só enxerga o terminal do módulo operacional.
 * Roda antes de qualquer rota global, sem tocar no banco. `req.path` vem sem
 * o prefixo `/api`, como em `bloquearServicoForaDeEnvio`.
 */
function bloquearTurnoForaDeOperacional(req, res, next) {
    const p = req.path;
    const noTerminal = p === '/operacional/terminal' || p.startsWith('/operacional/terminal/');
    if (req.usuario?.tipo === 'turno' && !noTerminal) {
        return res.status(403).json({ success: false, message: 'Contas de turno só acessam o terminal.' });
    }
    return next();
}

module.exports = {
    exigirAutenticacao,
    exigirAdmin,
    bloquearServicoForaDeEnvio,
    exigirTurno,
    exigirTurnoOuAdmin,
    exigirGestao,
    exigirConfirmacaoSenha,
    bloquearTurnoForaDeOperacional,
};
