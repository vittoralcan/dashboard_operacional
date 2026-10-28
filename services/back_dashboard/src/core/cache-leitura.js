// BD-13 (docs/arquitetura/backend.md §7.2/§10): cache de leitura para as
// rotas mais pedidas pelo polling do frontend (status-fases, gestao,
// gargalos, resumo) — o dado-fonte (db_espelho) só muda a cada ciclo do ETL
// (10 min), então recalcular a cada requisição é desperdício.
//
// Duas camadas, para dois problemas diferentes:
//   1. Cache em processo (TTL 30s, por `chave`) — evita golpes repetidos no
//      Postgres quando várias abas/usuários pedem a mesma rota quase ao
//      mesmo tempo. Guarda a PROMESSA, não só o valor, para que requisições
//      concorrentes dentro do mesmo TTL compartilhem a mesma consulta em voo
//      em vez de disparar uma cada. Uma falha nunca fica em cache — a
//      próxima chamada recalcula, não repete o erro por 30s.
//   2. ETag + `Cache-Control: private, max-age=15` — permite ao navegador
//      (ou a um cliente HTTP que respeite `If-None-Match`) nem reenviar o
//      corpo quando nada mudou, mesmo depois do cache em processo expirar.
const crypto = require('crypto');

const TTL_MS = 30_000;
const cache = new Map();

function buscarOuCalcular(chave, calcular) {
    const entrada = cache.get(chave);
    const agora = Date.now();
    if (entrada && entrada.expiraEm > agora) return entrada.promessa;

    const promessa = Promise.resolve().then(calcular).catch((erro) => {
        cache.delete(chave);
        throw erro;
    });
    cache.set(chave, { expiraEm: agora + TTL_MS, promessa });
    return promessa;
}

// Envolve um handler de leitura pura (sem efeito colateral por requisição,
// como auditoria) — `calcularDados(req)` devolve só o `data` da resposta,
// não o envelope `{ success, data }` inteiro. Combinar com `rota()` por fora
// para o tratamento de erro/log de sempre: `rota('msg', rotaCacheavel(chave, fn))`.
function rotaCacheavel(chave, calcularDados) {
    return async (req, res) => {
        const data = await buscarOuCalcular(chave, () => calcularDados(req));
        const etag = `"${crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex')}"`;
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.set('ETag', etag);
        res.set('Cache-Control', 'private, max-age=15');
        res.json({ success: true, data });
    };
}

module.exports = { rotaCacheavel };
