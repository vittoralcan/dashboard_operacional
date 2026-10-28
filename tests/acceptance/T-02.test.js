const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '../..');
const json = (rel) => JSON.parse(fs.readFileSync(path.join(raiz, rel), 'utf8'));

test('CA1: manifesto do back_dashboard: cartografia validado, inventarios ainda a validar', () => {
  const instancias = json('services/back_dashboard/projects/atlas.json').modules;
  const aValidar = (id) => instancias.find((m) => m.instanceId === id).config.apresentacao.aValidar;
  assert.equal(aValidar('cartografia'), false);
  assert.equal(aValidar('inventarios'), true);
  assert.equal(aValidar('negativos'), false);
  assert.equal(aValidar('certidoes'), false);
});

test('CA2: config do fluxo no front', () => {
  assert.equal(json('public/app/config/fluxos/cartografia.json').aValidar, false);
  assert.equal(json('public/app/config/fluxos/inventarios.json').aValidar, true);
});

test('CA3: catálogo de projetos do front', () => {
  const atlas = json('public/app/config/projetos.json').projetos.find((p) => p.id === 'atlas');
  const porId = Object.fromEntries(atlas.fluxos.map((f) => [f.id, f.aValidar]));
  assert.equal(porId['cartografia'], false);
  assert.equal(porId['inventarios'], true);
  assert.equal(porId['negativos'], false);
  assert.equal(porId['certidoes'], false);
});

test('CA4: a expectativa do teste de catálogo foi atualizada (só Inventários a validar)', () => {
  const fonte = fs.readFileSync(path.join(raiz, 'tests/app/catalogo.test.js'), 'utf8');
  assert.match(fonte, /deepEqual\(f\.filter\(\(i\) => i\.aValidar\)\.map\(\(i\) => i\.rotulo\), \['Inventários'\]\)/);
  assert.doesNotMatch(fonte, /\['Inventários', 'Cartografia'\]/);
});
