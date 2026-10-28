import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApi, ErroApi } from '../../public/app/js/core/api.js';

const BASE_A = 'https://auth.exemplo/api';

/** fetch falso: recebe uma lista de respostas (ou funções) e registra as chamadas. */
function fetchFalso(respostas) {
  const chamadas = [];
  const f = async (url, init) => {
    chamadas.push({ url, init });
    const r = respostas.shift();
    if (typeof r === 'function') return r(url, init);
    if (r instanceof Error) throw r;
    return r;
  };
  f.chamadas = chamadas;
  return f;
}
const res = (status, corpo, cab = {}) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (k) => cab[k] ?? cab[k.toLowerCase()] ?? null },
  text: async () => (corpo === undefined ? '' : typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
});

test('anexa o token SÓ a URLs das bases configuradas', async () => {
  const f = fetchFalso([res(200, { ok: 1 }), res(200, { ok: 2 })]);
  const api = criarApi({ fetch: f, bases: [BASE_A], obterToken: () => 'TOK', esperas: [] });
  await api.get(`${BASE_A}/me`);
  await api.get('https://terceiro.exemplo/x');
  assert.equal(f.chamadas[0].init.headers.Authorization, 'Bearer TOK');
  assert.equal(f.chamadas[1].init.headers.Authorization, undefined);
});

test('base não casa por prefixo parcial (auth.exemplo/api2 não é a base)', async () => {
  const f = fetchFalso([res(200, {})]);
  const api = criarApi({ fetch: f, bases: [BASE_A], obterToken: () => 'TOK', esperas: [] });
  await api.get('https://auth.exemplo/api2/x');
  assert.equal(f.chamadas[0].init.headers.Authorization, undefined);
});

test('POST envia JSON e devolve o corpo', async () => {
  const f = fetchFalso([res(200, { token: 't' })]);
  const api = criarApi({ fetch: f, bases: [BASE_A], esperas: [] });
  const r = await api.post(`${BASE_A}/auth/login`, { login: 'a', senha: 'b' });
  assert.deepEqual(r.dados, { token: 't' });
  assert.equal(f.chamadas[0].init.method, 'POST');
  assert.equal(f.chamadas[0].init.body, '{"login":"a","senha":"b"}');
  assert.equal(f.chamadas[0].init.headers['Content-Type'], 'application/json');
});

test('erro HTTP vira ErroApi com a mensagem do servidor (message ou error)', async () => {
  const f = fetchFalso([res(401, { message: 'Login ou senha inválidos.' }), res(400, { error: 'Campo obrigatório.' })]);
  const api = criarApi({ fetch: f, bases: [BASE_A], esperas: [] });
  await assert.rejects(api.post(`${BASE_A}/l`, {}), (e) => e instanceof ErroApi && e.status === 401 && e.message === 'Login ou senha inválidos.');
  await assert.rejects(api.post(`${BASE_A}/l`, {}), (e) => e.status === 400 && e.message === 'Campo obrigatório.');
});

test('sem mensagem no corpo usa o texto padrão do status', async () => {
  const f = fetchFalso([res(403, undefined)]);
  const api = criarApi({ fetch: f, bases: [BASE_A], esperas: [] });
  await assert.rejects(api.get(`${BASE_A}/x`), (e) => e.status === 403 && /permissão/.test(e.message));
});

test('429 expõe retryAfterSeg', async () => {
  const f = fetchFalso([res(429, { message: 'Muitas tentativas.' }, { 'Retry-After': '30' })]);
  const api = criarApi({ fetch: f, bases: [BASE_A], esperas: [] });
  await assert.rejects(api.post(`${BASE_A}/l`, {}), (e) => e.status === 429 && e.retryAfterSeg === 30);
});

test('401 em base conhecida chama aoSessaoInvalida; em URL externa, não', async () => {
  let chamou = 0;
  const f = fetchFalso([res(401, {}), res(401, {})]);
  const api = criarApi({ fetch: f, bases: [BASE_A], aoSessaoInvalida: () => { chamou++; }, esperas: [] });
  await assert.rejects(api.get(`${BASE_A}/me`));
  await assert.rejects(api.get('https://externo.exemplo/x'));
  assert.equal(chamou, 1);
});

test('GET refaz em 503 e acaba funcionando; POST não refaz', async () => {
  const f1 = fetchFalso([res(503, {}), res(200, { ok: true })]);
  const api1 = criarApi({ fetch: f1, bases: [BASE_A], esperas: [1, 1] });
  assert.deepEqual((await api1.get(`${BASE_A}/x`)).dados, { ok: true });
  assert.equal(f1.chamadas.length, 2);

  const f2 = fetchFalso([res(503, {}), res(200, {})]);
  const api2 = criarApi({ fetch: f2, bases: [BASE_A], esperas: [1, 1] });
  await assert.rejects(api2.post(`${BASE_A}/x`, {}), (e) => e.status === 503);
  assert.equal(f2.chamadas.length, 1);
});

test('GET refaz em falha de rede e desiste depois das tentativas', async () => {
  const f = fetchFalso([new TypeError('falhou'), new TypeError('falhou'), new TypeError('falhou')]);
  const api = criarApi({ fetch: f, bases: [BASE_A], esperas: [1, 1] });
  await assert.rejects(api.get(`${BASE_A}/x`), (e) => e.status === 0 && e.tipo === 'rede' && /Erro de conexão/.test(e.message));
  assert.equal(f.chamadas.length, 3);
});

test('ETag: envia If-None-Match e usa o corpo guardado no 304', async () => {
  const f = fetchFalso([res(200, { v: 1 }, { ETag: '"abc"' }), res(304, undefined)]);
  const api = criarApi({ fetch: f, bases: [BASE_A], esperas: [] });
  const a = await api.get(`${BASE_A}/lista`);
  const b = await api.get(`${BASE_A}/lista`);
  assert.deepEqual(a.dados, { v: 1 });
  assert.equal(f.chamadas[1].init.headers['If-None-Match'], '"abc"');
  assert.deepEqual(b.dados, { v: 1 });
  assert.equal(b.semMudanca, true);
});

test('X-Total-Count vira `total`', async () => {
  const f = fetchFalso([res(200, [1, 2], { 'X-Total-Count': '250' })]);
  const api = criarApi({ fetch: f, bases: [BASE_A], esperas: [] });
  assert.equal((await api.get(`${BASE_A}/lista`)).total, 250);
});

test('timeout vira ErroApi tipo "timeout"', async () => {
  const f = fetchFalso([(url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('abortado'))))]);
  const api = criarApi({ fetch: f, bases: [BASE_A], esperas: [], tempoPadrao: 20 });
  await assert.rejects(api.get(`${BASE_A}/lento`), (e) => e.status === 0 && e.tipo === 'timeout');
});

test('sinal externo já abortado cancela sem chamar a rede', async () => {
  const f = fetchFalso([res(200, {})]);
  const api = criarApi({ fetch: f, bases: [BASE_A], esperas: [] });
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(api.get(`${BASE_A}/x`, { sinal: ctl.signal }), (e) => e.status === 0);
  assert.equal(f.chamadas.length, 0);
});

test('corpo que não é JSON não derruba (dados = null)', async () => {
  const f = fetchFalso([res(200, '<html>oops</html>')]);
  const api = criarApi({ fetch: f, bases: [BASE_A], esperas: [] });
  assert.equal((await api.get(`${BASE_A}/x`)).dados, null);
});
