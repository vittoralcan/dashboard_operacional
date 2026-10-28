// Contrato: rotas, menu, migalhas e esqueletos das telas novas da gestão.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const APP = path.resolve(__dirname, "../..", "public/app");
const ler = (p) => fs.readFileSync(path.join(APP, p), "utf8");
const mod = (p) => import(pathToFileURL(path.join(APP, p)).href);

const CAT = () => JSON.parse(ler('config/projetos.json'));
const NOVAS = ['/operacional/caixas', '/operacional/correcoes'];

test('CA1: as duas rotas existem como shell/gestao e carregar aponta para arquivo real', async () => {
  const { ROTAS } = await mod('js/rotas.js');
  for (const c of NOVAS) {
    const r = ROTAS.find((x) => x.caminho === c);
    assert.ok(r, c);
    assert.deepEqual([r.camada, r.acesso], ['shell', 'gestao'], c);
    const alvo = /import\('\.\/([^']+)'\)/.exec(String(r.carregar));
    assert.ok(alvo && fs.existsSync(path.join(APP, 'js', alvo[1])), `${c} → ${alvo && alvo[1]}`);
  }
});

test('CA2: a seção Operação lista Caixas ao vivo e Correções, para admin e não admin', async () => {
  const { secoesSidebar } = await mod('js/core/catalogo.js');
  for (const o of [{}, { admin: true }]) {
    const op = secoesSidebar(CAT(), o).find((s) => s.secao === 'Operação');
    const rotas = op.itens.map((i) => i.rota);
    for (const c of ['/operacional/relatorios', ...NOVAS]) assert.ok(rotas.includes(c), `${c} (${JSON.stringify(o)})`);
  }
});

test('CA3: migalhas passam por Operação e terminam no título da rota', async () => {
  const { migalhas } = await mod('js/core/catalogo.js');
  for (const c of NOVAS) {
    const m = migalhas(c, CAT(), 'Título X').map((x) => x[0]);
    assert.deepEqual(m.slice(-2), ['Operação', 'Título X'], c);
  }
});

test('CA4: index.html carrega os dois CSS novos e eles existem', () => {
  const h = ler('index.html');
  for (const f of ['caixas-op.css', 'correcoes-op.css']) {
    assert.match(h, new RegExp(`css/screens/${f}`), f);
    assert.ok(fs.existsSync(path.join(APP, 'css/screens', f)), f);
  }
});

test('CA5: os esqueletos exportam montar()', async () => {
  for (const f of ['caixas', 'correcoes']) assert.equal(typeof (await mod(`js/features/operacional/${f}.js`)).montar, 'function', f);
});
