const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { BACK, subir, bancoSimulado } = require('./_helpers/http');

const { criarRelatoriosRouter } = require(path.join(BACK, 'src/operacional/relatorios'));

const HORAS = [
  { hora: 8, colaborador_id: 1, nome: 'Ana', caixas: 2 },
  { hora: 8, colaborador_id: 2, nome: 'Beto', caixas: 1 },
  { hora: 10, colaborador_id: 1, nome: 'Ana', caixas: 3 },
];
const TEMPOS = [
  { colaborador_id: 1, nome: 'Ana', caixas: 5, total_s: '3000.0', media_s: '600.0' },
  { colaborador_id: 2, nome: 'Beto', caixas: 1, total_s: '900', media_s: '900' },
];
const db = bancoSimulado([
  [/date_part\('hour'|extract\(hour/i, () => ({ rows: HORAS })],
  [/avg\(/i, () => ({ rows: TEMPOS })],
]);
let api;
before(async () => { api = await subir((app) => app.use('/api/operacional/relatorios', criarRelatoriosRouter({ dbPainel: db })), { id: 2, login: 'analista', tipo: 'standard' }); });
after(() => api.fechar());
const B = '/operacional/relatorios';

test('CA1: hora-a-hora devolve 24 horas com o total por hora e a linha de cada colaborador', async () => {
  db.chamadas.length = 0;
  const r = await api.get(`${B}/hora-a-hora?projetoId=5&data=2026-10-20`);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.success, true);
  const { horas, colaboradores } = r.json.data;
  assert.equal(horas.length, 24);
  assert.deepEqual(horas.find((h) => h.hora === 8), { hora: 8, caixas: 3 });
  assert.deepEqual(horas.find((h) => h.hora === 9), { hora: 9, caixas: 0 });
  assert.equal(r.json.data.total, 6);
  const ana = colaboradores.find((c) => c.colaboradorId === 1);
  assert.equal(ana.nome, 'Ana');
  assert.equal(ana.total, 5);
  assert.equal(ana.horas.length, 24);
  assert.equal(ana.horas[8], 2);
  assert.equal(ana.horas[10], 3);
});

test('CA2: a consulta hora-a-hora filtra por parâmetros, só caixas concluídas e usa o fuso de São Paulo', async () => {
  db.chamadas.length = 0;
  await api.get(`${B}/hora-a-hora?projetoId=5&data=2026-10-20&turnoId=2`);
  const c = db.chamadas[0];
  assert.ok(c.params.includes(5) && c.params.includes('2026-10-20') && c.params.includes(2), JSON.stringify(c.params));
  assert.match(c.sql, /painel\.op_caixa_registro/);
  assert.match(c.sql, /concluida/);
  assert.match(c.sql, /America\/Sao_Paulo/);
  assert.ok(!c.sql.includes('2026-10-20'), 'data não pode ser concatenada no SQL');
});

test('CA3: tempo-medio devolve por colaborador caixas, total e média em segundos inteiros, e a média geral', async () => {
  const r = await api.get(`${B}/tempo-medio?projetoId=5&de=2026-10-01&ate=2026-10-20`);
  assert.equal(r.status, 200, r.texto);
  const { colaboradores, mediaGeralS, caixas } = r.json.data;
  assert.deepEqual(colaboradores[0], { colaboradorId: 1, nome: 'Ana', caixas: 5, totalS: 3000, mediaS: 600 });
  assert.equal(caixas, 6);
  assert.equal(mediaGeralS, 650); // (3000 + 900) / 6
});

test('CA4: parâmetros ausentes ou inválidos dão 400 sem consultar o banco', async () => {
  db.chamadas.length = 0;
  for (const url of [`${B}/hora-a-hora`, `${B}/hora-a-hora?projetoId=abc&data=2026-10-20`, `${B}/hora-a-hora?projetoId=5&data=20-10-2026`,
    `${B}/tempo-medio?projetoId=5`, `${B}/tempo-medio?projetoId=5&de=2026-10-20&ate=2026-10-01`]) {
    const r = await api.get(url);
    assert.equal(r.status, 400, url);
    assert.equal(r.json.success, false);
  }
  assert.equal(db.chamadas.length, 0);
});
