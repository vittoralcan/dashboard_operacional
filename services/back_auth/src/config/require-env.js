/**
 * Lê uma variável de ambiente obrigatória. Falha alto e claro no boot se estiver
 * ausente, em vez de cair silenciosamente num valor hardcoded no código-fonte
 * (credenciais reais nunca devem viver como fallback aqui — só no .env, fora do git).
 */
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Variável de ambiente obrigatória não definida: ${name}. Configure-a no arquivo .env (veja .env.example).`);
    }
    return value;
}

module.exports = { requireEnv };
