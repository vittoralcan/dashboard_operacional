// Relatório: filtro de etapa.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const APP = path.resolve(__dirname, "../..", "public/app");
const ler = (p) => fs.readFileSync(path.join(APP, p), "utf8");
const mod = (p) => import(pathToFileURL(path.join(APP, p)).href);

test('CA1: as URLs levam etapa só quando informada', async () => {
  const m = await mod('js/core/relatorio-op.js');
  const h = { projetoId: 5, data: '2026-10-20' }; const t = { projetoId: 5, de: '2026-10-01', ate: '2026-10-20' };
  assert.equal(m.urlHoraAHora(h), '/operacional/relatorios/hora-a-hora?projetoId=5&data=2026-10-20');
  assert.match(m.urlHoraAHora({ ...h, etapa: 'remontagem' }), /&etapa=remontagem$/);
  assert.equal(m.urlTempoMedio(t), '/operacional/relatorios/tempo-medio?projetoId=5&de=2026-10-01&ate=2026-10-20');
  assert.match(m.urlTempoMedio({ ...t, etapa: 'remontagem' }), /&etapa=remontagem$/);
});

test('CA2: os normalizadores mantêm a etapa (padrão higienizacao)', async () => {
  const m = await mod('js/core/relatorio-op.js');
  assert.equal(m.normalizarHoraAHora({ etapa: 'remontagem', total: 1, horas: [{ hora: 8, caixas: 1 }] }).etapa, 'remontagem');
  assert.equal(m.normalizarHoraAHora({ total: 1, horas: [] }).etapa, 'higienizacao');
  assert.equal(m.normalizarTempoMedio({ etapa: 'remontagem', colaboradores: [] }).etapa, 'remontagem');
  assert.equal(m.normalizarTempoMedio({ colaboradores: [] }).etapa, 'higienizacao');
});

test('CA3: a tela tem seletor de etapa e envia a etapa nas duas consultas', () => {
  const s = ler('js/features/operacional/relatorio.js');
  assert.match(s, /Higieniza/);
  assert.match(s, /Remontagem/);
  assert.match(s, /urlHoraAHora\(\{[^}]*etapa/);
  assert.match(s, /urlTempoMedio\(\{[^}]*etapa/);
});
