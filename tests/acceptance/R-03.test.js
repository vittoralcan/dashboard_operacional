// back_auth: confirmação de senha. Router real, queries simuladas por require.cache (sem banco).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const AUTH = path.resolve(__dirname, '../../services/back_auth');
const doAuth = (m) => require(require.resolve(m, { paths: [AUTH] }));
process.env.JWT_SECRET = 'segredo-de-teste-r-03';
const express = doAuth('express');
const bcrypt = doAuth('bcryptjs');
const jwt = doAuth('jsonwebtoken');

const SENHA = 'uma-senha-bem-longa-123';
const HASH = bcrypt.hashSync(SENHA, 4);
const USUARIOS = {
  sup: { id: 5, nome: 'Sup', login: 'sup', tipo: 'standard', ativo: true, senha_hash: HASH, precisa_trocar_senha: false },
  eq1: { id: 6, nome: 'Eq', login: 'eq1', tipo: 'turno', ativo: true, senha_hash: HASH, precisa_trocar_senha: false },
  off: { id: 7, nome: 'Off', login: 'off', tipo: 'standard', ativo: false, senha_hash: HASH, precisa_trocar_senha: false },
};
const queries = require.resolve(path.join(AUTH, 'src/features/auth/queries/usuarios.queries'));
require.cache[queries] = { id: queries, filename: queries, loaded: true, exports: {
  buscarUsuarioPorLogin: async (login) => USUARIOS[login] ?? null, criarUsuario: async () => ({}), atualizarSenha: async () => ({}),
} };
const rotas = require(path.join(AUTH, 'src/features/auth/routes/usuarios.routes'));

let servidor; let base; let logado = USUARIOS.sup;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', (req, _res, next) => { if (logado) req.usuario = { id: logado.id, login: logado.login, tipo: logado.tipo }; next(); }, rotas);
  servidor = http.createServer(app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});
after(() => new Promise((ok) => servidor.close(ok)));
const chamar = async (corpo) => {
  const r = await fetch(`${base}/auth/confirmar-senha`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const derivado = crypto.createHmac('sha256', process.env.JWT_SECRET).update('confirmacao-senha').digest('hex');

test('CA1: senha certa devolve token HS256 do segredo derivado, com sub e login, de até 5 minutos', async () => {
  logado = USUARIOS.sup;
  const r = await chamar({ senha: SENHA });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.success, true);
  const p = jwt.verify(r.json.data.token, derivado, { algorithms: ['HS256'] });
  assert.equal(p.sub, 5);
  assert.equal(p.login, 'sup');
  assert.ok(p.exp - p.iat <= 300 && p.exp > p.iat);
  assert.throws(() => jwt.verify(jwt.sign({ sub: 5 }, 'outro'), derivado, { algorithms: ['HS256'] }), 'prova negativa: token de outro segredo reprova');
});

test('CA2: o token de confirmação não vale como token de sessão', async () => {
  logado = USUARIOS.sup;
  const { token } = (await chamar({ senha: SENHA })).json.data;
  assert.throws(() => jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }));
});

test('CA3: senha errada dá 401 e ausente dá 400, sem token', async () => {
  logado = USUARIOS.sup;
  const errada = await chamar({ senha: 'senha-errada-qualquer' });
  assert.equal(errada.status, 401);
  assert.equal(errada.json.success, false);
  assert.equal(errada.json.data?.token, undefined);
  for (const corpo of [{}, { senha: '' }, { senha: 123 }]) {
    const r = await chamar(corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.equal(r.json.data?.token, undefined);
  }
});

test('CA4: conta de turno dá 403 e conta inativa dá 401, sem token', async () => {
  logado = USUARIOS.eq1;
  const t = await chamar({ senha: SENHA });
  assert.equal(t.status, 403);
  assert.equal(t.json.data?.token, undefined);
  logado = USUARIOS.off;
  const i = await chamar({ senha: SENHA });
  assert.equal(i.status, 401);
  assert.equal(i.json.data?.token, undefined);
});

test('CA5: há limite de tentativas por usuário (429 depois de muitas senhas erradas)', async () => {
  logado = { id: 99, login: 'sup', tipo: 'standard' };
  let ultimo = 0;
  for (let n = 0; n < 40; n++) { ultimo = (await chamar({ senha: 'errada-errada-errada' })).status; if (ultimo === 429) break; }
  assert.equal(ultimo, 429);
});
