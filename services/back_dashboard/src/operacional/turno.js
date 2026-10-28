// Resolve o vínculo da conta de turno (usuário do back_auth) com painel.op_turno.
function resolverTurno(dbPainel) {
    return async (req, res, next) => {
        try {
            const { rows } = await dbPainel.query(
                'SELECT id, projeto_id, nome FROM painel.op_turno WHERE usuario_auth_id = $1 AND ativo',
                [req.usuario.id],
            );
            if (rows.length === 0) {
                return res.status(403).json({ success: false, message: 'Conta de turno sem vínculo com um turno ativo.' });
            }
            req.turno = { id: rows[0].id, projetoId: rows[0].projeto_id, nome: rows[0].nome };
            return next();
        } catch (err) {
            return next(err);
        }
    };
}

// Em rotas compartilhadas com admin: só contas de turno precisam de vínculo.
function resolverTurnoSeTurno(dbPainel) {
    const resolver = resolverTurno(dbPainel);
    return (req, res, next) => (req.usuario?.tipo === 'turno' ? resolver(req, res, next) : next());
}

module.exports = { resolverTurno, resolverTurnoSeTurno };
