// Relatórios por etapa.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { BACK, subir, bancoSimulado } = require('./_helpers/http');

const { criarRelatoriosRouter } = require(path.join(BACK, 'src/operacional/relatorios'));
const db = bancoSimulado([
  [/extract\(hour/i, () => ({ rows: [{ hora: 8, colaborador_id: 1, nome: 'Ana', caixas: 2 }] })],
  [/avg\(/i, () => ({ rows: [{ colaborador_id: 1, nome: 'Ana', caixas: 2, total_s: '600', media_s: '300' }] })],
]);
let api;
before(async () => { api = await subir((app) => app.use('/api/operacional/relatorios', criarRelatoriosRouter({ dbPainel: db })), { id: 2, login: 'analista', tipo: 'standard' }); });
after(() => api.fechar());
const B = '/operacional/relatorios';
const URLS = { 'hora-a-hora': '?projetoId=5&data=2026-10-20', 'tempo-medio': '?projetoId=5&de=2026-10-01&ate=2026-10-20' };

test('CA1: hora-a-hora e tempo-medio aceitam etapa=remontagem como parâmetro (não literal)', async () => {
  for (const [rota, qs] of Object.entries(URLS)) {
    db.chamadas.length = 0;
    const r = await api.get(`${B}/${rota}${qs}&etapa=remontagem`);
    assert.equal(r.status, 200, `${rota}: ${r.texto}`);
    const c = db.chamadas[0];
    assert.ok(c.params.includes('remontagem'), `${rota}: ${JSON.stringify(c.params)}`);
    assert.doesNotMatch(c.sql, /'higienizacao'|'remontagem'/, rota);
  }
});

test('CA2: sem etapa a consulta usa higienizacao', async () => {
  for (const [rota, qs] of Object.entries(URLS)) {
    db.chamadas.length = 0;
    const r = await api.get(`${B}/${rota}${qs}`);
    assert.equal(r.status, 200, r.texto);
    assert.ok(db.chamadas[0].params.includes('higienizacao'), rota);
  }
});

test('CA3: etapa inválida responde 400 sem consultar o banco', async () => {
  db.chamadas.length = 0;
  for (const [rota, qs] of Object.entries(URLS)) {
    for (const etapa of ['scanner', '', 'x%27']) assert.equal((await api.get(`${B}/${rota}${qs}&etapa=${etapa}`)).status, 400, `${rota} ${etapa}`);
  }
  assert.equal(db.chamadas.length, 0);
});

test('CA4: a resposta inclui a etapa', async () => {
  for (const [rota, qs] of Object.entries(URLS)) {
    assert.equal((await api.get(`${B}/${rota}${qs}&etapa=remontagem`)).json.data.etapa, 'remontagem', rota);
    assert.equal((await api.get(`${B}/${rota}${qs}`)).json.data.etapa, 'higienizacao', rota);
  }
});
