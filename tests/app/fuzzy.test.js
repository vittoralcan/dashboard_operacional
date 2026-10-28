import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzzy, buscar, realcar } from '../../public/app/js/core/fuzzy.js';
import { esc } from '../../public/app/js/core/html.js';

test('casa sem acento e sem diferenciar caixa', () => {
  assert.ok(fuzzy('higien', 'Higienização'));
  assert.ok(fuzzy('HIGIENIZACAO', 'Higienização'));
});

test('exige os caracteres em ordem', () => {
  assert.equal(fuzzy('zh', 'Higienização'), null);
  assert.ok(fuzzy('hz', 'Higienização'));
});

test('consulta vazia casa tudo', () => {
  assert.deepEqual(fuzzy('', 'qualquer'), { pontos: 0, posicoes: [] });
});

test('prefere substring exata e começo de palavra', () => {
  const r = buscar('val', ['Avaliação', 'Validação', 'Verificação de alertas'], (t) => t);
  assert.equal(r[0].item, 'Validação');
});

test('buscar descarta quem não casa e ordena por pontos', () => {
  const r = buscar('dig', ['Digitalização', 'Indexação IA', 'Monitoramento de APIs'], (t) => t);
  assert.deepEqual(r.map((x) => x.item), ['Digitalização']);
});

test('realcar marca as posições e escapa o resto', () => {
  const f = fuzzy('hi', 'Hi<');
  assert.equal(realcar('Hi<', f.posicoes, esc), '<mark>Hi</mark>&lt;');
});

test('realcar não quebra quando norm muda o comprimento', () => {
  assert.equal(realcar('áb', [0], esc), 'áb');
});
