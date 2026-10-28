// "Alto volume" no lugar de "gargalo" por volume (RF-54). Funções puras por import dinâmico; telas por varredura de texto.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.resolve(__dirname, '../..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

test('CA1: normalizarGargaloInstancia devolve altoVolume (fase ou null); resposta sem o campo continua válida', async () => {
  const { normalizarGargaloInstancia } = await import(pathToFileURL(path.join(RAIZ, 'public/app/js/core/gargalos.js')).href);
  const r = normalizarGargaloInstancia({
    paradas: { pastas: 200, imagens: 20000 },
    gargalo: { fasId: 3, nome: 'Indexação', pastas: 30, imagens: 3000, pctParadas: 15, vazao: 0 },
    altoVolume: { fasId: 2, nome: 'Validação', pastas: 120, imagens: 12000, pctParadas: 60 },
  });
  assert.deepEqual([r.gargalo.fasId, r.gargalo.pastas], [3, 30]);
  assert.deepEqual([r.altoVolume.fasId, r.altoVolume.nome, r.altoVolume.pastas, r.altoVolume.pctParadas], [2, 'Validação', 120, 60]);
  const antigo = normalizarGargaloInstancia({ paradas: { pastas: 5, imagens: 9 }, gargalo: null });
  assert.equal(antigo.gargalo, null);
  assert.equal(antigo.altoVolume, null);
  assert.equal(normalizarGargaloInstancia(null).altoVolume, null);
  assert.equal(normalizarGargaloInstancia({ altoVolume: { fasId: 'x' } }).altoVolume, null, 'fase inválida vira null');
});

test('CA2: o fluxograma rotula a fase de volume como "ALTO VOLUME" e mantém "GARGALO" só para a vazão', () => {
  const g = ler('public/app/js/features/fluxo/grafo-prod.js');
  assert.match(g, /ALTO VOLUME/);
  assert.match(g, /GARGALO/);
  assert.match(g, /Alto volume/, 'a legenda do fluxograma ganha a entrada "Alto volume"');
  assert.match(g, /marcarAltoVolume/);
});

test('CA3: a tela do fluxo lê altoVolume da resposta e o marca no fluxograma', () => {
  const f = ler('public/app/js/features/fluxo/fluxo.js');
  assert.match(f, /altoVolume/);
  assert.match(f, /marcarAltoVolume/);
});

test('CA4: o estilo do rótulo de alto volume existe e é distinto do gargalo', () => {
  const css = ler('public/app/css/screens/fluxo.css');
  assert.match(css, /\.alto-volume\b/);
  assert.match(css, /\.gargalo\b/, 'o estilo do gargalo por vazão segue existindo');
});
