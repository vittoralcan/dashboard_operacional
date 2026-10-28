// Correções: colaboradores do projeto.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { BACK, subir, bancoSimulado } = require('./_helpers/http');

const { criarCorrecoesRouter } = require(path.join(BACK, 'src/operacional/correcoes'));
const LINHAS = [
  { id: 3, nome: 'Zélia', turno_id: 8 },
  { id: 1, nome: 'bruno', turno_id: 9 },
  { id: 2, nome: 'Érica', turno_id: 8 },
  { id: 4, nome: 'Ana', turno_id: null },
];
const db = bancoSimulado([
  [/^\s*(UPDATE painel\.op_pausa|SELECT\s+COALESCE\(SUM)/i, () => ({ rows: [{ pausado_s: 0 }] })],
  [/FROM painel\.op_colaborador/i, () => ({ rows: LINHAS })],
  [/FROM painel\.op_caixa_registro/i, () => ({ rows: [] })],
]);
let api;
before(async () => { api = await subir((app) => app.use('/api/operacional/correcoes', (req, _r, n) => n(), criarCorrecoesRouter({ dbPainel: db })), { id: 1, login: 'chefe', tipo: 'admin' }); });
after(() => api.fechar());
const B = '/operacional/correcoes';

test('CA1: /colaboradores devolve id, nome e turnoId em ordem A-Z (acentos e caixa ignorados)', async () => {
  db.chamadas.length = 0;
  const r = await api.get(`${B}/colaboradores?projetoId=5`);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.success, true);
  assert.deepEqual(r.json.data.map((c) => c.nome), ['Ana', 'bruno', 'Érica', 'Zélia']);
  assert.deepEqual(r.json.data[1], { id: 1, nome: 'bruno', turnoId: 9 });
  assert.equal(r.json.data[0].turnoId, null);
});

test('CA2: o projeto vai como parâmetro e só ativos são pedidos', async () => {
  db.chamadas.length = 0;
  await api.get(`${B}/colaboradores?projetoId=5`);
  const c = db.chamadas[0];
  assert.deepEqual(c.params, [5]);
  assert.match(c.sql, /\bativo\b/i);
});

test('CA3: projetoId ausente ou inválido responde 400 sem consultar o banco', async () => {
  db.chamadas.length = 0;
  for (const qs of ['', '?projetoId=abc', '?projetoId=0', '?projetoId=-1', '?projetoId=1;drop']) {
    assert.equal((await api.get(`${B}/colaboradores${qs}`)).status, 400, qs);
  }
  assert.equal(db.chamadas.length, 0);
});

test('CA4: GET /caixas continua respondendo', async () => {
  const r = await api.get(`${B}/caixas`);
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.data, []);
});
