const crypto = require('crypto');

/**
 * Gera uma senha temporária aleatória (16 caracteres, sem os símbolos
 * `+`, `/`, `=` do base64 — mais fácil de ler/copiar/colar). Usada só na
 * criação de conta por um admin; o usuário troca por uma senha própria no
 * primeiro login (ver PATCH /auth/senha).
 */
function gerarSenhaTemporaria() {
    return crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16);
}

module.exports = { gerarSenhaTemporaria };
