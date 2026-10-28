// Sobe o app real do back_auth com o pool do Postgres substituído por um simulado.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const AUTH = path.resolve(__dirname, '../../services/back_auth');
const doAuth = (m) => require(require.resolve(m, { paths: [AUTH] }));

Object.assign(process.env, {
  JWT_SECRET: 'segredo-de-teste-f0-03', CORS_ORIGIN: 'http://localhost',
  DB_HOST: 'localhost', DB_NAME: 'x', DB_USER: 'x', DB_PASSWORD: 'x',
});
const jwt = doAuth('jsonwebtoken');
const bcrypt = doAuth('bcryptjs');
const { pool } = require(path.join(AUTH, 'src/config/db-postgres'));
const app = require(path.join(AUTH, 'src/app'));

const SENHA = 'Senha-de-teste-123';
const HASH = bcrypt.hashSync(SENHA, 4);
const USUARIOS = {
  matutino1: { id: 11, nome: 'Matutino 1', login: 'matutino1', email: 'm1@x.com', senha_hash: HASH, tipo: 'turno', cargo: null, precisa_trocar_senha: false, ativo: true },
  chefe: { id: 1, nome: 'Chefe', login: 'chefe', email: 'c@x.com', senha_hash: HASH, tipo: 'admin', cargo: null, precisa_trocar_senha: false, ativo: true },
  analista: { id: 2, nome: 'Analista', login: 'analista', email: 'a@x.com', senha_hash: HASH, tipo: 'standard', cargo: null, precisa_trocar_senha: false, ativo: true },
};
const inserts = [];
pool.query = async (sql, params = []) => {
  if (/FROM usuarios\s+WHERE login/.test(sql)) return { rows: USUARIOS[params[0]] ? [USUARIOS[params[0]]] : [] };
  if (/FROM usuarios WHERE id/.test(sql.replace(/\s+/g, ' '))) return { rows: [Object.values(USUARIOS).find((u) => u.id === params[0])].filter(Boolean) };
  if (/INSERT INTO usuarios/.test(sql)) { inserts.push(params); return { rows: [{ id: 99, nome: params[0], login: params[1], email: params[2], tipo: params[4], cargo: params[6], criado_em: new Date() }] }; }
  if (/UPDATE usuarios/.test(sql)) return { rows: [] };
  throw new Error(`consulta inesperada: ${sql.replace(/\s+/g, ' ').slice(0, 70)}`);
};

let servidor;
let base;
before(async () => {
  servidor = http.createServer(app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});
after(() => new Promise((ok) => servidor.close(ok)));

async function chamar(metodo, caminho, corpo, token) {
  const r = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, json: await r.json() };
}
async function logar(login) {
  const r = await chamar('POST', '/auth/login', { login, senha: SENHA });
  assert.equal(r.status, 200, `login de ${login}: ${JSON.stringify(r.json)}`);
  return r.json.data;
}
const validade = (token) => { const p = jwt.decode(token); return p.exp - p.iat; };
const novoUsuario = (extra) => ({ nome: 'Turno Novo', login: 'noturno1', email: 'n1@x.com', tipo: 'turno', ...extra });

test('CA1: login de turno devolve token tipo "turno" de 13 h; admin e standard seguem em 8 h', async () => {
  const turno = await logar('matutino1');
  assert.equal(turno.usuario.tipo, 'turno');
  assert.equal(jwt.decode(turno.token).tipo, 'turno');
  assert.equal(validade(turno.token), 13 * 3600);
  assert.equal(validade((await logar('chefe')).token), 8 * 3600);
  assert.equal(validade((await logar('analista')).token), 8 * 3600);
});

test('CA2: admin cria conta de turno; tipo desconhecido continua dando 400', async () => {
  const admin = (await logar('chefe')).token;
  inserts.length = 0;
  const ok = await chamar('POST', '/auth/usuarios', novoUsuario(), admin);
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  assert.equal(ok.json.data.tipo, 'turno');
  assert.ok(inserts[0].includes('turno'), 'o tipo "turno" deve ir ao INSERT');
  const ruim = await chamar('POST', '/auth/usuarios', novoUsuario({ login: 'noturno2', email: 'n2@x.com', tipo: 'root' }), admin);
  assert.equal(ruim.status, 400);
});

test('CA3: token de turno não cria usuários', async () => {
  const turno = (await logar('matutino1')).token;
  inserts.length = 0;
  const r = await chamar('POST', '/auth/usuarios', novoUsuario({ login: 'noturno3', email: 'n3@x.com' }), turno);
  assert.equal(r.status, 403);
  assert.equal(inserts.length, 0);
});

test('CA4: schema.sql aceita "turno" e migra a restrição antiga de forma idempotente', () => {
  const sql = fs.readFileSync(path.join(AUTH, 'ops/schema.sql'), 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();
  assert.match(sql, /drop constraint if exists usuarios_tipo_check/);
  assert.match(sql, /add constraint usuarios_tipo_check check ?\(tipo in \('admin', ?'standard', ?'turno'\)\)/);
  assert.match(sql, /tipo varchar\(20\) not null default 'standard' check ?\(tipo in \('admin', ?'standard', ?'turno'\)\)/);
  assert.doesNotMatch(sql, /check ?\(tipo in \('admin', ?'standard'\)\)/, 'sobrou a restrição antiga de dois tipos');
});
