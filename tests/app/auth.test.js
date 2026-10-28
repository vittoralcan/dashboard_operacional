import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { expDoToken, tokenValido, salvarSessao, limparSessao, sessaoVigente, obterToken, obterUsuario, atualizarUsuario, avisarLogin, consumirAviso, guardarDestino, consumirDestino, fazerLogin, alterarSenha } from '../../public/app/js/core/auth.js';
import { definirArmazenamento, store, CHAVES } from '../../public/app/js/core/store.js';
import { criarApi } from '../../public/app/js/core/api.js';
import { ROTAS } from '../../public/app/js/rotas.js';

const falso = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (exp) => `${b64({ alg: 'HS256' })}.${b64({ sub: 1, login: 'a', exp })}.assinatura`;
const AGORA = 1_800_000_000_000;

beforeEach(() => definirArmazenamento({ local: falso(), sessao: falso() }));

test('expDoToken lê o exp; lixo devolve null', () => {
  assert.equal(expDoToken(jwt(123)), 123);
  assert.equal(expDoToken('abc'), null);
  assert.equal(expDoToken(null), null);
  assert.equal(expDoToken(`x.${b64({ sem: 'exp' })}.y`), null);
  assert.equal(expDoToken(`x.${Buffer.from('{ruim').toString('base64url')}.y`), null);
});

test('expDoToken tolera acentos no payload (UTF-8)', () => {
  const t = `x.${Buffer.from(JSON.stringify({ nome: 'João', exp: 77 })).toString('base64url')}.y`;
  assert.equal(expDoToken(t), 77);
});

test('tokenValido: vencido não vale; sem exp legível vale; vazio não vale', () => {
  assert.equal(tokenValido(jwt(AGORA / 1000 + 60), AGORA), true);
  assert.equal(tokenValido(jwt(AGORA / 1000 - 1), AGORA), false);
  assert.equal(tokenValido('opaco', AGORA), true);
  assert.equal(tokenValido('', AGORA), false);
  assert.equal(tokenValido(null, AGORA), false);
});

test('salvar/obter/limpar sessão com as chaves do legado', () => {
  salvarSessao('T', { id: 1, login: 'a', tipo: 'admin' });
  assert.equal(store.texto(CHAVES.token), 'T');
  assert.deepEqual(JSON.parse(store.texto(CHAVES.usuario)), { id: 1, login: 'a', tipo: 'admin' });
  assert.equal(obterToken(), 'T');
  assert.equal(obterUsuario().login, 'a');
  limparSessao();
  assert.equal(obterToken(), null);
  assert.equal(obterUsuario(), null);
});

test('sessaoVigente: vigente, vencida (limpa e avisa) e ausente', () => {
  assert.equal(sessaoVigente(AGORA), null);
  assert.equal(consumirAviso(), null, 'sem sessão não há aviso de expiração');
  salvarSessao(jwt(AGORA / 1000 + 600), { login: 'a' });
  assert.equal(sessaoVigente(AGORA).login, 'a');
  salvarSessao(jwt(AGORA / 1000 - 5), { login: 'a' });
  assert.equal(sessaoVigente(AGORA), null);
  assert.equal(obterToken(), null);
  assert.deepEqual(consumirAviso(), { tipo: 'info', texto: 'Sua sessão expirou. Entre novamente.' });
  assert.equal(consumirAviso(), null, 'o aviso é consumido');
});

test('sessão pela metade (só token ou só usuário) é descartada', () => {
  store.gravarTexto(CHAVES.token, jwt(AGORA / 1000 + 600));
  assert.equal(sessaoVigente(AGORA), null);
  assert.equal(obterToken(), null);
});

test('atualizarUsuario mescla e persiste', () => {
  salvarSessao('T', { login: 'a', precisaTrocarSenha: true });
  assert.equal(atualizarUsuario({ precisaTrocarSenha: false }).precisaTrocarSenha, false);
  assert.equal(obterUsuario().login, 'a');
  limparSessao();
  assert.equal(atualizarUsuario({ x: 1 }), null);
});

test('aviso do login: grava e consome', () => {
  avisarLogin('erro', 'x');
  assert.deepEqual(consumirAviso(), { tipo: 'erro', texto: 'x' });
  assert.equal(consumirAviso(), null);
});

test('destino pós-login: só rota conhecida (nunca valor externo)', () => {
  assert.equal(guardarDestino('#/atlas/inventarios/fluxograma', ROTAS), true);
  assert.equal(consumirDestino(ROTAS), '/atlas/inventarios/fluxograma');
  assert.equal(consumirDestino(ROTAS), '/projetos', 'consumido: volta ao padrão');
  for (const ruim of ['https://mal.exemplo', 'javascript:alert(1)', '#/nao-existe', '#/login', '#/', '#/primeiro-acesso']) assert.equal(guardarDestino(ruim, ROTAS), false, ruim);
  assert.equal(consumirDestino(ROTAS), '/projetos');
});

test('destino adulterado no armazenamento também é recusado ao consumir', () => {
  store.gravarTexto(CHAVES.destino, 'https://mal.exemplo', 'sessao');
  assert.equal(consumirDestino(ROTAS), '/projetos');
});

function apiCom(respostas, chamadas = []) {
  const f = async (url, init) => { chamadas.push({ url, init }); return respostas.shift(); };
  const res = (status, corpo) => ({ status, ok: status < 300, headers: { get: () => null }, text: async () => JSON.stringify(corpo) });
  return { api: criarApi({ fetch: f, bases: ['https://a/api'], aoSessaoInvalida: () => chamadas.push('SESSAO_INVALIDA'), esperas: [] }), res, chamadas };
}

test('fazerLogin: envia login aparado, devolve token+usuário', async () => {
  const c = [];
  const { api, res } = apiCom([], c);
  const f = async (url, init) => { c.push({ url, init }); return res(200, { success: true, data: { token: 'T', usuario: { login: 'a', tipo: 'standard' } } }); };
  const api2 = criarApi({ fetch: f, bases: ['https://a/api'], esperas: [] });
  const r = await fazerLogin(api2, 'https://a/api', '  Joao ', 'segredo');
  assert.equal(r.token, 'T');
  assert.equal(c[0].url, 'https://a/api/auth/login');
  assert.deepEqual(JSON.parse(c[0].init.body), { login: 'Joao', senha: 'segredo' });
  void api;
});

test('fazerLogin: 401 de credencial NÃO é tratado como sessão expirada', async () => {
  const c = [];
  const res = (status, corpo) => ({ status, ok: false, headers: { get: () => null }, text: async () => JSON.stringify(corpo) });
  const api = criarApi({ fetch: async () => res(401, { success: false, message: 'Login ou senha inválidos.' }), bases: ['https://a/api'], aoSessaoInvalida: () => c.push('SESSAO'), esperas: [] });
  await assert.rejects(fazerLogin(api, 'https://a/api', 'a', 'b'), (e) => e.status === 401 && e.message === 'Login ou senha inválidos.');
  assert.deepEqual(c, []);
});

test('fazerLogin: resposta sem token é erro', async () => {
  const api = criarApi({ fetch: async () => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => '{"success":true,"data":{}}' }), bases: ['https://a/api'], esperas: [] });
  await assert.rejects(fazerLogin(api, 'https://a/api', 'a', 'b'), /inesperada/);
});

test('alterarSenha: PATCH e 401 ("senha atual incorreta") não derruba a sessão', async () => {
  const c = [];
  const res = (status, corpo) => ({ status, ok: status < 300, headers: { get: () => null }, text: async () => JSON.stringify(corpo) });
  const api = criarApi({ fetch: async (u, i) => { c.push(i.method); return res(401, { success: false, message: 'Senha atual incorreta.' }); }, bases: ['https://a/api'], obterToken: () => 'T', aoSessaoInvalida: () => c.push('SESSAO'), esperas: [] });
  await assert.rejects(alterarSenha(api, 'https://a/api', { senhaAtual: 'x', novaSenha: 'y' }), (e) => e.message === 'Senha atual incorreta.');
  assert.deepEqual(c, ['PATCH']);
});
