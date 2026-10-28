// Fiação da página do tablet: rotas, camada no HTML e no bootstrap, tela mínima do tablet e E2E.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP = path.resolve(__dirname, '../..', 'public/app');
const ler = (p) => fs.readFileSync(path.join(APP, p), 'utf8');
const rotas = async () => (await import(pathToFileURL(path.join(APP, 'js/rotas.js')).href)).ROTAS;

test('CA1: as três rotas novas existem com camada e acesso certos', async () => {
  const R = await rotas();
  const por = (c) => R.find((r) => r.caminho === c);
  assert.deepEqual([por('/tablet')?.camada, por('/tablet')?.acesso], ['tablet', 'turno']);
  assert.deepEqual([por('/operacional/relatorios')?.camada, por('/operacional/relatorios')?.acesso], ['shell', 'gestao']);
  assert.deepEqual([por('/operacional/cadastros')?.camada, por('/operacional/cadastros')?.acesso], ['shell', 'admin']);
  for (const c of ['/tablet', '/operacional/relatorios', '/operacional/cadastros']) assert.equal(typeof por(c).carregar, 'function', c);
});

test('CA2: o módulo de cada rota nova existe em disco (carregar aponta para arquivo real)', async () => {
  const R = await rotas();
  for (const c of ['/tablet', '/operacional/relatorios', '/operacional/cadastros']) {
    const alvo = /import\('\.\/([^']+)'\)/.exec(String(R.find((r) => r.caminho === c).carregar));
    assert.ok(alvo, c);
    assert.ok(fs.existsSync(path.join(APP, 'js', alvo[1])), `${c} → ${alvo[1]}`);
  }
});

test('CA3: index.html tem o contêiner #tablet (oculto) e carrega os três CSS novos', () => {
  const h = ler('index.html');
  assert.match(h, /<div id="tablet"[^>]*\bhidden\b/);
  for (const f of ['tablet.css', 'relatorio-op.css', 'cadastros-op.css']) {
    assert.match(h, new RegExp(`css/screens/${f}`), f);
    assert.ok(fs.existsSync(path.join(APP, 'css/screens', f)), `${f} existe`);
  }
});

test('CA4: main.js conhece a camada tablet, manda conta de turno para /tablet e não monta a casca para ela', () => {
  const m = ler('js/main.js');
  assert.match(m, /'tablet'/);
  assert.match(m, /'\/tablet'/);
  assert.match(m, /tipo === 'turno'/);
});

test('CA5: a tela do tablet exporta montar(), mostra o nome do turno e um botão Sair, e escapa texto', async () => {
  const mod = await import(pathToFileURL(path.join(APP, 'js/features/tablet/tablet.js')).href);
  assert.equal(typeof mod.montar, 'function');
  const fonte = ler('js/features/tablet/tablet.js');
  assert.match(fonte, /acesso\.sair|\.sair\(/);
  assert.doesNotMatch(fonte, /innerHTML\s*=\s*`/);
});

test('CA6: existe o E2E do tablet com capturas de tela', () => {
  const spec = fs.readFileSync(path.resolve(__dirname, '../..', 'tests/e2e/tablet.spec.mjs'), 'utf8');
  assert.match(spec, /page\.screenshot/);
  assert.match(spec, /#\/tablet/);
  assert.match(spec, /Caixa conclu[ií]da/);
});
