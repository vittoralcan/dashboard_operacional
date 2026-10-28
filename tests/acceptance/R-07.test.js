// Tablet: etapa (higienização ou remontagem).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const APP = path.resolve(__dirname, "../..", "public/app");
const ler = (p) => fs.readFileSync(path.join(APP, p), "utf8");
const mod = (p) => import(pathToFileURL(path.join(APP, p)).href);

test('CA1: ETAPAS, normalizarEtapa e rotuloEtapa', async () => {
  const m = await mod('js/core/operacional.js');
  assert.deepEqual([...m.ETAPAS].map((e) => (typeof e === 'string' ? e : e.id)).sort(), ['higienizacao', 'remontagem']);
  assert.equal(m.normalizarEtapa('remontagem'), 'remontagem');
  for (const ruim of ['scanner', '', null, undefined, 3]) assert.equal(m.normalizarEtapa(ruim), 'higienizacao', String(ruim));
  assert.equal(m.rotuloEtapa('remontagem'), 'Remontagem');
  assert.equal(m.rotuloEtapa('higienizacao'), 'Higienização');
});

test('CA2: normalizarEstado preserva a etapa de cada caixa aberta (ausente vira higienizacao)', async () => {
  const { normalizarEstado } = await mod('js/core/operacional.js');
  const base = { codigo: 'A', colaboradorId: 1, colaboradorNome: 'Ana', inicioEm: '2026-10-20T10:00:00.000Z' };
  const e = normalizarEstado({ agora: '2026-10-20T10:01:00.000Z', abertas: [{ id: 1, ...base, etapa: 'remontagem' }, { id: 2, ...base }] });
  assert.deepEqual(e.abertas.map((c) => c.etapa), ['remontagem', 'higienizacao']);
});

test('CA3: a tela envia etapa em POST /bip e POST /caixas', () => {
  const s = ler('js/features/tablet/tablet.js');
  assert.match(s, /\/bip`,\s*\{[^}]*\betapa\b/);
  assert.match(s, /\/caixas`,\s*\{[^}]*\betapa\b/);
});

test('CA4: seletor de etapa com os dois rótulos, etapa na caixa aberta e armazenamento protegido', () => {
  const s = ler('js/features/tablet/tablet.js');
  assert.match(s, /aria-pressed/);
  assert.match(s, /rotuloEtapa/);
  assert.match(s, /ETAPAS/);
  const i = s.indexOf('localStorage');
  assert.ok(i > -1, 'lembra a escolha');
  assert.match(s.slice(Math.max(0, i - 200), i + 300), /try\s*\{|catch/, 'localStorage dentro de try/catch');
});
