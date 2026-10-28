function requireEnv(nome) {
    const valor = process.env[nome];
    if (!valor) {
        throw new Error(`Variável de ambiente obrigatória não definida: ${nome} (veja .env.example).`);
    }
    return valor;
}

module.exports = { requireEnv };
