import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hashTexto, iniciais, matizes, avatar } from '../../public/app/js/ui/avatar.js';
import { paraRgb, razaoContraste, luminancia } from '../../public/app/js/core/cor.js';
import { easeOutExpo, duracaoContagem } from '../../public/app/js/core/motion.js';

const CSS = (nome) => fs.readFileSync(new URL(`../../public/app/css/${nome}`, import.meta.url), 'utf8');

test('FNV-1a 32 bits (vetores conhecidos)', () => {
  assert.equal(hashTexto(''), 0x811c9dc5);
  assert.equal(hashTexto('a'), 0xe40c292c);
  assert.equal(hashTexto('foobar'), 0xbf9cf968);
});

test('iniciais: primeiro + último nome; nome único → duas letras', () => {
  assert.equal(iniciais('Rafael Lima'), 'RL');
  assert.equal(iniciais('Maria da Silva Souza'), 'MS');
  assert.equal(iniciais('joao'), 'JO');
  assert.equal(iniciais('  '), '?');
  assert.equal(iniciais('élia'), 'ÉL');
});

test('avatar: determinístico, semente = login (nome pode mudar sem mudar a cor)', () => {
  const a = String(avatar({ nome: 'Rafael Lima', semente: 'rafael.lima' }));
  const b = String(avatar({ nome: 'Rafael L. Moura', semente: 'rafael.lima' }));
  assert.equal(a.match(/--a1:[^;]+;--a2:[^"]+/)[0], b.match(/--a1:[^;]+;--a2:[^"]+/)[0]);
  assert.equal(String(avatar({ nome: 'X', semente: 'x' })), String(avatar({ nome: 'X', semente: 'x' })));
  const { h1, h2 } = matizes('rafael.lima');
  assert.ok(h1 >= 0 && h1 < 360 && h2 >= 0 && h2 < 360);
});

test('avatar: decorativo, escapa o nome e mostra o ponto de sessão só se pedido', () => {
  const a = String(avatar({ nome: '<b>Zé</b> Silva', tamanho: 34, online: true }));
  assert.match(a, /aria-hidden="true"/);
  assert.doesNotMatch(a, /<b>/);
  assert.match(a, /class="st"/);
  assert.doesNotMatch(String(avatar({ nome: 'Zé Silva' })), /class="st"/);
  assert.match(String(avatar({ nome: 'Z', tamanho: 'x' })), /--s:28px/);
});

test('contraste WCAG: referências', () => {
  assert.equal(razaoContraste([255, 255, 255], [0, 0, 0]).toFixed(1), '21.0');
  assert.equal(razaoContraste([0, 0, 0], [0, 0, 0]), 1);
  assert.ok(luminancia([255, 255, 255]) > 0.99);
  assert.deepEqual(paraRgb('#7c5cff'), [124, 92, 255]);
  assert.deepEqual(paraRgb('#abc'), [170, 187, 204]);
  assert.deepEqual(paraRgb('rgb(10, 20, 30)'), [10, 20, 30]);
  assert.equal(paraRgb('azul'), null);
});

/** Lê `--nome: valor;` de um bloco de CSS. */
function tokensDoBloco(css, abertura) {
  const i = css.indexOf(abertura);
  assert.ok(i >= 0, `bloco ${abertura} não encontrado`);
  const f = css.indexOf('\n}', i);
  const bloco = css.slice(i, f);
  const t = {};
  for (const m of bloco.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\b/g)) t[m[1]] = m[2];
  return t;
}

const PARES_AA = [
  ['fg', 'surface'], ['fg-2', 'surface'], ['fg-3', 'surface'], ['fg-3', 'surface-3'], ['fg-3', 'bg'], ['accent-text', 'surface'],
  ['ok', 'surface'], ['warn', 'surface'], ['err', 'surface'], ['info', 'surface'],
];

for (const [tema, abertura] of [['escuro', ':root, :root[data-theme="dark"]'], ['claro', ':root[data-theme="light"]']]) {
  test(`tokens AA (${tema}): texto normal ≥ 4,5:1 nos pares que carregam informação`, () => {
    const css = CSS('tokens.css');
    const t = { ...tokensDoBloco(css, ':root {'), ...tokensDoBloco(css, abertura) };
    for (const [f, b] of PARES_AA) {
      const r = razaoContraste(paraRgb(t[f]), paraRgb(t[b]));
      assert.ok(r >= 4.5, `${tema}: --${f} sobre --${b} = ${r.toFixed(2)}:1 (mínimo 4,5)`);
    }
    const branco = razaoContraste(paraRgb(t['on-accent']), paraRgb(t['accent-solid']));
    assert.ok(branco >= 4.5, `${tema}: texto branco sobre --accent-solid = ${branco.toFixed(2)}:1`);
  });
}

test('--fg-4 é decorativo: não passa AA e por isso nunca pode ser texto informativo', () => {
  const t = tokensDoBloco(CSS('tokens.css'), ':root, :root[data-theme="dark"]');
  assert.ok(razaoContraste(paraRgb(t['fg-4']), paraRgb(t.surface)) < 3);
});

test('ease-out exponencial e duração da contagem animada', () => {
  assert.equal(easeOutExpo(0), 1 - Math.pow(2, 0));
  assert.equal(easeOutExpo(1), 1);
  assert.ok(easeOutExpo(0.5) > 0.9);
  assert.equal(duracaoContagem(0), 650);
  assert.equal(duracaoContagem(1e12), 1500);
  assert.ok(duracaoContagem(1000) > 650 && duracaoContagem(1000) < 1500);
});
