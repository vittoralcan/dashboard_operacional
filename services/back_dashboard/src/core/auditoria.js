// Escreve em painel.auditoria (RNB-B6 — "tudo que escreve, audita"). Nunca
// lança: uma falha ao gravar o registro de auditoria não deve derrubar a ação
// que a originou (ex.: a meta já foi gravada; perder a linha de auditoria é
// ruim, mas devolver 500 pro admin depois de já ter escrito a meta seria pior).
async function registrarAuditoria(dbPainel, { usuarioId, usuarioLogin, acao, alvo, onde, detalhe }) {
    try {
        await dbPainel.query(
            `INSERT INTO painel.auditoria (usuario_id, usuario_login, acao, alvo, onde, detalhe)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [usuarioId ?? null, usuarioLogin ?? null, acao, alvo ?? null, onde ?? null, detalhe ? JSON.stringify(detalhe) : null]
        );
    } catch (erro) {
        console.error('Falha ao gravar auditoria:', erro.message);
    }
}

module.exports = { registrarAuditoria };
