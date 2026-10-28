import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, raw, html, seguro, Html } from '../../public/app/js/core/html.js';

test('esc escapa os 5 caracteres perigosos e tolera null/undefined', () => {
  assert.equal(esc(`<a href="x" onclick='y'>&`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});

test('html escapa tudo que é interpolado', () => {
  const nome = '<img src=x onerror=alert(1)>';
  assert.equal(String(html`<td>${nome}</td>`), '<td>&lt;img src=x onerror=alert(1)&gt;</td>');
});

test('raw passa markup confiável sem escapar', () => {
  assert.equal(String(html`<b>${raw('<i>ok</i>')}</b>`), '<b><i>ok</i></b>');
});

test('html aninhado não escapa duas vezes, mas string comum é escapada', () => {
  const lista = ['a', '<b>'].map((i) => html`<li>${i}</li>`);
  assert.equal(String(html`<ul>${lista}</ul>`), '<ul><li>a</li><li>&lt;b&gt;</li></ul>');
});

test('uma string que parece HTML NÃO vira markup ao ser interpolada', () => {
  const dentro = String(html`<div>${'<b>x</b>'}</div>`);
  assert.equal(dentro, '<div>&lt;b&gt;x&lt;/b&gt;</div>');
});

test('resultado é Html e funciona em concatenação e template literal', () => {
  const h = html`<p>${'x'}</p>`;
  assert.ok(h instanceof Html);
  assert.equal(`${h}`, '<p>x</p>');
  assert.equal('' + h, '<p>x</p>');
});

test('seguro: Html passa, o resto é escapado', () => {
  assert.equal(seguro(raw('<i>')), '<i>');
  assert.equal(seguro('<i>'), '&lt;i&gt;');
  assert.equal(seguro(12), '12');
  assert.equal(seguro([raw('<i>'), 'a<']), '<i>a&lt;');
});

test('valores vazios viram texto vazio; zero é preservado', () => {
  assert.equal(String(html`[${null}][${undefined}][${0}]`), '[][][0]');
});
