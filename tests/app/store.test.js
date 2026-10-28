import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, definirArmazenamento, CHAVES, lerTema } from '../../public/app/js/core/store.js';

const falso = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const quebrado = {
  getItem() { throw new Error('bloqueado'); },
  setItem() { throw new Error('cheio'); },
  removeItem() { throw new Error('x'); },
};

beforeEach(() => definirArmazenamento({ local: falso(), sessao: falso() }));

test('texto: lê, grava e usa o padrão quando ausente', () => {
  assert.equal(store.texto('a', 'x'), 'x');
  store.gravarTexto('a', 'valor');
  assert.equal(store.texto('a', 'x'), 'valor');
});

test('json: ida e volta, e JSON inválido devolve o padrão', () => {
  store.gravarJson('u', { id: 1 });
  assert.deepEqual(store.json('u', null), { id: 1 });
  store.gravarTexto('ruim', '{não é json');
  assert.deepEqual(store.json('ruim', { ok: 1 }), { ok: 1 });
});

test('local e sessão são independentes', () => {
  store.gravarTexto('k', 'L');
  store.gravarTexto('k', 'S', 'sessao');
  assert.equal(store.texto('k'), 'L');
  assert.equal(store.texto('k', null, 'sessao'), 'S');
});

test('armazenamento que lança nunca quebra a UI', () => {
  definirArmazenamento({ local: quebrado, sessao: quebrado });
  assert.equal(store.texto('a', 'padrao'), 'padrao');
  assert.equal(store.json('a', 7), 7);
  assert.equal(store.gravarTexto('a', 'v'), false);
  assert.equal(store.gravarJson('a', {}), false);
  assert.doesNotThrow(() => store.remover('a'));
});

test('tema: só "dark" é escuro; qualquer outra coisa é claro (padrão)', () => {
  assert.equal(lerTema(), 'light');
  store.gravarTexto(CHAVES.tema, 'dark');
  assert.equal(lerTema(), 'dark');
  store.gravarTexto(CHAVES.tema, '"dark"'); // o formato JSON do protótipo NÃO vale
  assert.equal(lerTema(), 'light');
});

test('chaves compartilhadas com o legado têm os nomes esperados', () => {
  assert.equal(CHAVES.token, 'dsn-auth-token');
  assert.equal(CHAVES.usuario, 'dsn-auth-usuario');
  assert.equal(CHAVES.tema, 'dsn-theme');
  assert.equal(CHAVES.macroIntervalo, 'dsn-macroview-interval');
});
