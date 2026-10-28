const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { requireEnv } = require('./require-env');

// Tempo de expiração do token — não é segredo, não precisa vir do .env.
const TOKEN_EXPIRES_IN_PADRAO = '8h';
const TOKEN_EXPIRES_IN_POR_TIPO = {
    turno: '13h', // plantão de 12 h + folga
};

/**
 * Assina um token JWT contendo só os dados necessários pra identificar o
 * usuário e seu papel (nunca a senha/hash). O segredo é lido a cada chamada
 * (em vez de uma constante no topo do módulo) só para que o erro de
 * `requireEnv` só apareça quando alguém de fato tentar logar, não no boot
 * do servidor.
 */
function assinarToken({ id, login, tipo }) {
    return jwt.sign({ sub: id, login, tipo }, requireEnv('JWT_SECRET'), {
        expiresIn: TOKEN_EXPIRES_IN_POR_TIPO[tipo] || TOKEN_EXPIRES_IN_PADRAO,
    });
}

/**
 * Verifica um token JWT. Lança se ausente/inválido/expirado — quem chama
 * decide como traduzir isso pra uma resposta HTTP (ver auth.middleware.js).
 */
function verificarToken(token) {
    // BE-02 (docs/arquitetura/seguranca.md): fixar o algoritmo aceito. Sem isso,
    // um token forjado anunciando outro algoritmo no header poderia, em tese,
    // ser aceito por uma combinação de biblioteca/configuração diferente da
    // atual — `jsonwebtoken` 9.x já recusa `alg: none`, mas fixar aqui remove
    // a dependência desse comportamento de versão.
    return jwt.verify(token, requireEnv('JWT_SECRET'), { algorithms: ['HS256'] });
}

/**
 * Assina um token de credencial de serviço (A9, .spec_noir_bento/
 * integracao_bridge.md) — longa duração, nunca atrelado a um usuário final,
 * com claims próprios (`instancia`, `escopo`) que o back_dashboard confere
 * antes de aceitar escrita em `/envio/eventos`/`/envio/heartbeat` (D-09).
 * `expiresIn` em segundos (não uma string tipo '365d') para que o `exp` do
 * JWT bata exatamente com o `expira_em` gravado em `sessao` e devolvido na
 * resposta — não há refresh para este tipo, de propósito.
 */
function assinarTokenServico({ sessaoId, instancia, escopo, expiresInSegundos }) {
    return jwt.sign(
        { tipo: 'servico', sessaoId, instancia, escopo },
        requireEnv('JWT_SECRET'),
        { expiresIn: expiresInSegundos }
    );
}

/**
 * Segredo próprio do token de confirmação de senha, derivado do JWT_SECRET.
 * Como é outro segredo, o token de confirmação nunca verifica como sessão
 * (`exigirAutenticacao` usa o JWT_SECRET puro).
 */
function segredoConfirmacao() {
    return crypto.createHmac('sha256', requireEnv('JWT_SECRET')).update('confirmacao-senha').digest('hex');
}

/**
 * Token curto, de uso exclusivo das correções no painel.
 */
function assinarTokenConfirmacao({ id, login }) {
    return jwt.sign({ sub: id, login }, segredoConfirmacao(), {
        algorithm: 'HS256',
        expiresIn: '2m',
    });
}

module.exports = {
    assinarToken,
    assinarTokenConfirmacao,
    segredoConfirmacao,
    assinarTokenServico,
    verificarToken,
};
