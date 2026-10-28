// CORS do painel: o preflight precisa liberar os cabeçalhos que o front envia (ex.: confirmação de senha das correções).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { criarApp } = require('../src/app');

const ORIGEM = 'https://app.example.com';
let servidor;
let base;

before(async () => {
    const app = criarApp({ db: {}, dbPainel: {}, manifestos: [], corsOrigins: [ORIGEM] });
    servidor = http.createServer(app);
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(() => new Promise((ok) => servidor.close(ok)));

async function preflight(metodo, cabecalhos) {
    const r = await fetch(`${base}/operacional/correcoes/caixas/1`, {
        method: 'OPTIONS',
        headers: { origin: ORIGEM, 'access-control-request-method': metodo, 'access-control-request-headers': cabecalhos },
    });
    const liberados = (r.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map((h) => h.trim());
    return { status: r.status, liberados, metodos: r.headers.get('access-control-allow-methods') || '' };
}

test('preflight do DELETE de correção libera X-Confirmacao-Senha', async () => {
    const { status, liberados, metodos } = await preflight('DELETE', 'authorization,x-confirmacao-senha');
    assert.equal(status, 204);
    assert.ok(liberados.includes('x-confirmacao-senha'));
    assert.match(metodos, /DELETE/);
});

test('preflight continua liberando os cabeçalhos antigos', async () => {
    const { liberados } = await preflight('GET', 'authorization,content-type,if-none-match');
    for (const h of ['authorization', 'content-type', 'if-none-match']) assert.ok(liberados.includes(h), h);
});
