const { pool } = require('../../../config/db-postgres');

/**
 * Grava uma sessão de serviço (A9, docs/api/envio-bridge.md) —
 * nunca usada para sessões 'web'/'tv' (ainda não implementadas, ver F4 em
 * backend_spec.md §4.1). `escopo` é gravado como jsonb.
 */
async function criarSessaoServico({ id, usuarioId, tokenHash, descricao, instancia, escopo, expiraEm }) {
    await pool.query(
        `INSERT INTO sessao (id, usuario_id, token_hash, tipo, descricao, instancia, escopo, expira_em)
         VALUES ($1, $2, $3, 'servico', $4, $5, $6::jsonb, $7)`,
        [id, usuarioId, tokenHash, descricao, instancia, JSON.stringify(escopo), expiraEm]
    );
}

module.exports = { criarSessaoServico };
