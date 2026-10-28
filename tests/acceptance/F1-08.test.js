// Lista de projetos e turnos para a gestão (alimenta os filtros do relatório hora a hora).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { BACK, subir, bancoSimulado } = require('./_helpers/http');

const { criarRelatoriosRouter } = require(path.join(BACK, 'src/operacional/relatorios'));

const PROJETOS = [{ id: 5, slug: 'acervo', nome: 'Acervo Central' }, { id: 6, slug: 'outro', nome: 'Outro' }];
const TURNOS = [{ id: 8, projeto_id: 5, nome: 'Matutino 1' }, { id: 9, projeto_id: 5, nome: 'Vespertino 1' }];
const db = bancoSimulado([
  [/FROM painel\.op_projeto/i, () => ({ rows: PROJETOS })],
  [/FROM painel\.op_turno/i, () => ({ rows: TURNOS })],
]);
let api;
before(async () => {
  api = await subir((app) => app.use('/api/operacional/relatorios', criarRelatoriosRouter({ dbPainel: db })), { id: 2, login: 'analista', tipo: 'standard' });
});
after(() => api.fechar());

test('CA1: GET /projetos devolve os projetos ativos com seus turnos ativos (id, slug, nome)', async () => {
  const r = await api.get('/operacional/relatorios/projetos');
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.success, true);
  const [p5, p6] = r.json.data.projetos;
  assert.deepEqual(p5, { id: 5, slug: 'acervo', nome: 'Acervo Central', turnos: [{ id: 8, nome: 'Matutino 1' }, { id: 9, nome: 'Vespertino 1' }] });
  assert.deepEqual(p6, { id: 6, slug: 'outro', nome: 'Outro', turnos: [] });
});

test('CA2: só projetos e turnos ativos, sem parâmetros do usuário, e nenhum dado de colaborador', async () => {
  db.chamadas.length = 0;
  const r = await api.get('/operacional/relatorios/projetos');
  assert.equal(db.chamadas.length, 2);
  for (const c of db.chamadas) {
    assert.match(c.sql, /ativo/i);
    assert.doesNotMatch(c.sql, /op_colaborador|usuario_auth_id/i);
  }
  assert.ok(!/usuario|colaborador/i.test(JSON.stringify(r.json.data)));
});

test('CA3: a rota só aceita leitura (POST não existe)', async () => {
  const r = await api.post('/operacional/relatorios/projetos', {});
  assert.ok(r.status === 404 || r.status === 405, String(r.status));
});
