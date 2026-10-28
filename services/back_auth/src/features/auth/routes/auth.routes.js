const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { buscarUsuarioPorLogin, registrarUltimoLogin } = require('../queries/usuarios.queries');
const { assinarToken } = require('../../../config/jwt');

const router = express.Router();

const CREDENCIAIS_INVALIDAS = 'Login ou senha inválidos.';
// Texto e formato exatos do contrato (docs/api/back-dashboard.md, A1) — o
// frontend novo já conta com essa mensagem/campo pra mostrar a contagem
// regressiva "Tente novamente em MM:SS".
const MENSAGEM_LIMITE_EXCEDIDO = 'Muitas tentativas. Tente novamente em alguns minutos.';

function handlerLimiteExcedido(req, res) {
    const resetMs = req.rateLimit?.resetTime ? req.rateLimit.resetTime.getTime() - Date.now() : 15 * 60 * 1000;
    const retryAfterSeg = Math.max(1, Math.ceil(resetMs / 1000));
    res.set('Retry-After', String(retryAfterSeg));
    return res.status(429).json({ success: false, message: MENSAGEM_LIMITE_EXCEDIDO, retryAfterSeg });
}

// BE-01 (docs/arquitetura/seguranca.md): sem limite, o login aceita tentativas
// ilimitadas — cada uma custa um bcrypt.compare de custo 12 em bcryptjs (JS
// puro), então poucas requisições por segundo já saturam a CPU do processo
// pra todo mundo, além de viabilizar password spraying contra logins
// previsíveis (padrão `nome.sobrenome`). Dois limitadores, por IP e por
// login normalizado — um IP numa rede compartilhada não deve travar o login
// de todo mundo atrás dele, nem um atacante deve poder tentar um login
// específico de IPs diferentes sem limite.
const limitadorPorIp = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: handlerLimiteExcedido,
});

const limitadorPorLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    // Chave é o login normalizado (não o IP) — se ausente/inválido, cai no IP
    // mesmo, pra nunca compartilhar uma única chave entre requisições
    // concorrentes de clientes diferentes.
    keyGenerator: (req) => {
        const login = typeof req.body?.login === 'string' ? req.body.login.trim().toLowerCase() : '';
        return login || req.ip;
    },
    handler: handlerLimiteExcedido,
});

// Hash bcrypt (custo 12) de um valor qualquer, fixo — só para igualar o
// tempo de resposta quando o login não existe, evitando que a ausência do
// bcrypt.compare vaze essa informação por timing (login inexistente
// responderia mais rápido que senha errada).
const HASH_DUMMY = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8u.qHAQEr.4S/7/xrJ.eZmi6ZuJIie';

// POST /api/auth/login
router.post('/auth/login', limitadorPorIp, limitadorPorLogin, async (req, res) => {
    try {
        const { login, senha } = req.body || {};

        if (typeof login !== 'string' || !login.trim() || typeof senha !== 'string' || !senha) {
            return res.status(400).json({ success: false, message: 'Login e senha são obrigatórios.' });
        }

        const loginNormalizado = login.trim().toLowerCase();
        const usuario = await buscarUsuarioPorLogin(loginNormalizado);

        // bcrypt.compare roda sempre, mesmo com login inexistente (contra o
        // hash dummy), pra não vazar por timing se o login existe ou não.
        const senhaConfere = await bcrypt.compare(senha, usuario ? usuario.senha_hash : HASH_DUMMY);

        // Mensagem genérica tanto para login inexistente quanto para senha
        // errada quanto para conta desativada — nunca revelar qual delas,
        // pra não dar pra um atacante descobrir logins válidos por tentativa.
        if (!usuario || !usuario.ativo || !senhaConfere) {
            // Log de falha sem a senha (BE-01) — só login tentado e IP, pra dar
            // visibilidade de password spraying sem gravar segredo nenhum.
            console.warn(`Login falhou: login="${loginNormalizado}" ip=${req.ip}`);
            return res.status(401).json({ success: false, message: CREDENCIAIS_INVALIDAS });
        }

        const token = assinarToken({ id: usuario.id, login: usuario.login, tipo: usuario.tipo });

        // Não bloqueia o login em caso de falha (ex.: banco lento) — só loga;
        // "último acesso" é informativo, nunca motivo de recusar a sessão.
        registrarUltimoLogin(usuario.id).catch((erro) => {
            console.error('Falha ao registrar último login:', erro.message);
        });

        return res.status(200).json({
            success: true,
            data: {
                token,
                usuario: {
                    id: usuario.id,
                    nome: usuario.nome,
                    login: usuario.login,
                    email: usuario.email,
                    tipo: usuario.tipo,
                    cargo: usuario.cargo,
                    precisaTrocarSenha: usuario.precisa_trocar_senha,
                },
            },
        });
    } catch (error) {
        console.error('Erro no login de usuário:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao fazer login.' });
    }
});

module.exports = router;
