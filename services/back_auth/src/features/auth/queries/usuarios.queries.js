const { pool } = require('../../../config/db-postgres');

/**
 * Insere um novo usuário. A senha já deve chegar aqui como hash (bcrypt) —
 * esta camada nunca recebe nem grava senha em texto puro.
 * Lança erro com `code === '23505'` se `login` ou `email` já existirem
 * (constraints UNIQUE) — `error.constraint` diz qual das duas foi.
 */
async function criarUsuario({ nome, login, email, senhaHash, tipo, precisaTrocarSenha, cargo }) {
    const result = await pool.query(
        `INSERT INTO usuarios (nome, login, email, senha_hash, tipo, precisa_trocar_senha, cargo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, nome, login, email, tipo, cargo, criado_em`,
        [nome, login, email, senhaHash, tipo, precisaTrocarSenha, cargo ?? null]
    );
    return result.rows[0];
}

/**
 * Busca um usuário pelo login (já normalizado para minúsculas por quem
 * chama). Inclui `senha_hash` no retorno — só para uso interno da rota de
 * login comparar com bcrypt; nunca deve ser repassado numa resposta HTTP.
 */
async function buscarUsuarioPorLogin(login) {
    const result = await pool.query(
        `SELECT id, nome, login, email, senha_hash, tipo, cargo, precisa_trocar_senha, ativo
         FROM usuarios
         WHERE login = $1`,
        [login]
    );
    return result.rows[0] || null;
}

/**
 * Busca mínima para revalidar a sessão a cada requisição (BE-02 item 4/BE-06,
 * docs/arquitetura/seguranca.md) — só os campos que o middleware de autenticação
 * precisa pra decidir se o token ainda vale; GET /auth/me usa a mais cara
 * `buscarPerfilPorId` abaixo, que não serve pra rodar em toda requisição.
 */
async function buscarUsuarioPorId(id) {
    const result = await pool.query(`SELECT id, login, tipo, ativo FROM usuarios WHERE id = $1`, [id]);
    return result.rows[0] || null;
}

/**
 * Perfil completo (A2, GET /auth/me) — nunca inclui senha_hash. `preferencias`
 * já vem como objeto (o driver `pg` decodifica JSONB sozinho).
 */
async function buscarPerfilPorId(id) {
    const result = await pool.query(
        `SELECT id, nome, login, email, tipo, cargo, precisa_trocar_senha,
                ultimo_login_em, criado_em, preferencias, ativo
         FROM usuarios
         WHERE id = $1`,
        [id]
    );
    return result.rows[0] || null;
}

/**
 * Grava a nova senha (já hasheada) e limpa a flag de senha temporária.
 * Usada tanto na troca obrigatória do primeiro acesso quanto numa futura
 * troca de senha voluntária — não há distinção de fluxo no banco.
 */
async function atualizarSenha(id, senhaHash) {
    const result = await pool.query(
        `UPDATE usuarios
         SET senha_hash = $1, precisa_trocar_senha = false, atualizado_em = now()
         WHERE id = $2
         RETURNING id, nome, login`,
        [senhaHash, id]
    );
    return result.rows[0] || null;
}

// A3 — só `nome` é editável pelo próprio usuário nesta rota (e-mail/login/
// tipo/cargo não; cargo é A7, só admin).
async function atualizarNome(id, nome) {
    const result = await pool.query(
        `UPDATE usuarios SET nome = $1, atualizado_em = now() WHERE id = $2 RETURNING id`,
        [nome, id]
    );
    return result.rows[0] ? buscarPerfilPorId(id) : null;
}

// A4 — merge raso no próprio Postgres (operador `||` do jsonb), atômico:
// duas chamadas concorrentes (debounce de UI) nunca perdem a chave que a
// outra acabou de gravar, diferente de um read-modify-write em JS.
async function atualizarPreferencias(id, patch) {
    const result = await pool.query(
        `UPDATE usuarios
         SET preferencias = preferencias || $1::jsonb, atualizado_em = now()
         WHERE id = $2
         RETURNING preferencias`,
        [JSON.stringify(patch), id]
    );
    return result.rows[0]?.preferencias ?? null;
}

// Chamada depois de um login bem-sucedido (auth.routes.js) — falha aqui
// nunca deve derrubar o login em si, quem chama decide isso.
async function registrarUltimoLogin(id) {
    await pool.query(`UPDATE usuarios SET ultimo_login_em = now() WHERE id = $1`, [id]);
}

module.exports = {
    criarUsuario,
    buscarUsuarioPorLogin,
    buscarUsuarioPorId,
    buscarPerfilPorId,
    atualizarSenha,
    atualizarNome,
    atualizarPreferencias,
    registrarUltimoLogin,
};
