// Usa o app real (criarApp) com bancos simulados e JWT de verdade.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');

const BACK = path.resolve(__dirname, '../../services/back_dashboard');
const doBack = (m) => require(require.resolve(m, { paths: [BACK] }));
process.env.JWT_SECRET = 'segredo-de-teste-f0-02';
const jwt = doBack('jsonwebtoken');
const { criarApp } = require(path.join(BACK, 'src/app'));
const auth = require(path.join(BACK, 'src/core/auth.middleware'));

// Turno 7 (usuário do back_auth) está vinculado ao turno 3; o usuário 8 não tem vínculo.
let vinculos = { 7: { id: 3, projeto_id: 1, nome: 'Matutino 1' } };
const chamadasPainel = [];
const dbPainel = {
  async query(sql, params = []) {
    chamadasPainel.push({ sql, params });
    if (/painel\.op_turno/.test(sql)) return { rows: vinculos[params[0]] ? [vinculos[params[0]]] : [] };
    if (/painel\.meta/.test(sql)) return { rows: [] };
    throw new Error(`consulta inesperada: ${sql.replace(/\s+/g, ' ').slice(0, 60)}`);
  },
};
const db = { query: async () => ({ rows: [] }) };

const token = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
const TOKENS = {
  admin: token({ sub: 1, login: 'chefe', tipo: 'admin' }),
  standard: token({ sub: 2, login: 'analista', tipo: 'standard' }),
  turno: token({ sub: 7, login: 'matutino1', tipo: 'turno' }),
  turnoSemVinculo: token({ sub: 8, login: 'orfao', tipo: 'turno' }),
  servico: token({ tipo: 'servico', sessaoId: 'x', instancia: 'hwi', escopo: ['envio'] }),
};

let servidor;
let base;
before(async () => {
  const app = criarApp({ db, dbPainel, manifestos: [], corsOrigins: ['http://localhost'] });
  servidor = http.createServer(app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});
after(() => new Promise((ok) => servidor.close(ok)));

async function ir(quem, caminho) {
  chamadasPainel.length = 0;
  const r = await fetch(`${base}${caminho}`, { headers: { authorization: `Bearer ${TOKENS[quem]}` } });
  return { status: r.status, json: await r.json().catch(() => null) };
}
// "Passou pelos guardas": o esqueleto ainda não tem rotas, então o fim da linha é o 404 padrão da API.
const passa = (r) => assert.equal(r.status, 404, `esperava passar pelos guardas (404), veio ${r.status}: ${JSON.stringify(r.json)}`);
const barra = (r) => { assert.equal(r.status, 403, `esperava 403, veio ${r.status}: ${JSON.stringify(r.json)}`); assert.equal(r.json.success, false); };

test('CA1: módulos do contrato e novos guardas exportados', () => {
  const o = (f) => require(path.join(BACK, 'src/operacional', f));
  assert.equal(typeof o('index.js').criarOperacionalRouter, 'function');
  assert.equal(typeof o('cadastros.js').criarCadastrosRouter, 'function');
  assert.equal(typeof o('terminal.js').criarTerminalRouter, 'function');
  assert.equal(typeof o('correcoes.js').criarCorrecoesRouter, 'function');
  assert.equal(typeof o('relatorios.js').criarRelatoriosRouter, 'function');
  assert.equal(typeof o('turno.js').resolverTurno, 'function');
  assert.equal(typeof o('turno.js').resolverTurnoSeTurno, 'function');
  for (const nome of ['exigirTurno', 'exigirGestao', 'bloquearTurnoForaDeOperacional', 'exigirAutenticacao', 'exigirAdmin', 'bloquearServicoForaDeEnvio']) {
    assert.equal(typeof auth[nome], 'function', `auth.middleware sem ${nome}`);
  }
});

test('CA2: turno é barrado fora do operacional, sem tocar no banco; standard segue lendo as metas', async () => {
  barra(await ir('turno', '/metas'));
  assert.equal(chamadasPainel.length, 0, 'o turno não pode causar consulta ao banco fora do operacional');
  barra(await ir('turno', '/gargalos'));
  const metas = await ir('standard', '/metas');
  assert.equal(metas.status, 200);
  assert.deepEqual(metas.json, { success: true, data: [] });
});

test('CA3: terminal só para turno com vínculo ativo', async () => {
  passa(await ir('turno', '/operacional/terminal/ping'));
  const consulta = chamadasPainel.find((c) => /painel\.op_turno/.test(c.sql));
  assert.ok(consulta, 'deve consultar painel.op_turno');
  assert.equal(consulta.params[0], 7, 'a busca é pelo sub do token');
  barra(await ir('turnoSemVinculo', '/operacional/terminal/ping'));
  for (const quem of ['admin', 'standard', 'servico']) barra(await ir(quem, '/operacional/terminal/ping'));
});

test('CA4: admin só para admin', async () => {
  passa(await ir('admin', '/operacional/admin/ping'));
  for (const quem of ['standard', 'turno', 'servico']) barra(await ir(quem, '/operacional/admin/ping'));
});

test('CA5: relatórios para admin e standard', async () => {
  for (const quem of ['admin', 'standard']) passa(await ir(quem, '/operacional/relatorios/ping'));
  for (const quem of ['turno', 'servico']) barra(await ir(quem, '/operacional/relatorios/ping'));
});

test('CA6: correções para admin (a regra de turno e standard é provada pela R-04)', async () => {
  passa(await ir('admin', '/operacional/correcoes/ping'));
  barra(await ir('servico', '/operacional/correcoes/ping'));
});
