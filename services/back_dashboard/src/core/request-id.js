const crypto = require('crypto');

// BD-14 (docs/arquitetura/backend.md §7.2): um id por requisição — o log
// do servidor (`rota()`, handler de erro final) e o cabeçalho de resposta
// usam o mesmo valor, então um erro reportado por um cliente é achável no
// log sem precisar casar por timestamp/rota.
function atribuirRequestId(req, res, next) {
    req.id = crypto.randomUUID();
    res.set('X-Request-Id', req.id);
    next();
}

module.exports = { atribuirRequestId };
