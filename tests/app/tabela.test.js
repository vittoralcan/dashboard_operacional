import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrar, ordenar, contarPor, proximaOrdem } from '../../public/app/js/core/tabela.js';

const colunas = [
  { chave: 'caixa', rotulo: 'Caixa', forte: true },
  { chave: 'fase', rotulo: 'Fase' },
  { chave: 'imagens', rotulo: 'Imagens', num: true },
  { chave: 'inicio', rotulo: 'Início', ordenarPor: 'ts' },
];
const linhas = [
  { caixa: 'CX10', fase: 'VALIDAÇÃO', imagens: 900, inicio: '02/10 09:00', ts: 3 },
  { caixa: 'CX2', fase: 'DIGITALIZAÇÃO', imagens: 1840, inicio: '01/10 16:30', ts: 1 },
  { caixa: 'CX1', fase: 'VALIDAÇÃO', imagens: 75, inicio: '02/10 08:10', ts: 2 },
];

test('filtrar por pílula (categoria)', () => {
  assert.equal(filtrar(linhas, colunas, { pilulaChave: 'fase', pilula: 'VALIDAÇÃO' }).length, 2);
  assert.equal(filtrar(linhas, colunas, { pilulaChave: 'fase', pilula: 'todos' }).length, 3);
  assert.equal(filtrar(linhas, colunas, {}).length, 3);
});

test('filtrar por busca sem acento e sem caixa, em qualquer coluna', () => {
  assert.equal(filtrar(linhas, colunas, { busca: 'validacao' }).length, 2);
  assert.equal(filtrar(linhas, colunas, { busca: 'digitalizacao' }).length, 1);
  assert.equal(filtrar(linhas, colunas, { busca: '1840' }).length, 1);
  assert.equal(filtrar(linhas, colunas, { busca: 'zzz' }).length, 0);
});

test('filtrar combina pílula e busca', () => {
  assert.equal(filtrar(linhas, colunas, { pilulaChave: 'fase', pilula: 'VALIDAÇÃO', busca: 'cx1' }).length, 2);
  assert.equal(filtrar(linhas, colunas, { pilulaChave: 'fase', pilula: 'VALIDAÇÃO', busca: 'cx10' }).length, 1);
});

test('ordenar: números como números, texto "natural" pt-BR (CX2 < CX10)', () => {
  assert.deepEqual(ordenar(linhas, colunas, { chave: 'imagens', dir: -1 }).map((l) => l.imagens), [1840, 900, 75]);
  assert.deepEqual(ordenar(linhas, colunas, { chave: 'caixa', dir: 1 }).map((l) => l.caixa), ['CX1', 'CX2', 'CX10']);
});

test('ordenar usa `ordenarPor` (timestamp) em vez do texto exibido', () => {
  assert.deepEqual(ordenar(linhas, colunas, { chave: 'inicio', dir: 1 }).map((l) => l.ts), [1, 2, 3]);
});

test('ordenar não altera o array original e sem chave devolve o mesmo array', () => {
  const copia = linhas.map((l) => l.caixa);
  ordenar(linhas, colunas, { chave: 'caixa', dir: 1 });
  assert.deepEqual(linhas.map((l) => l.caixa), copia);
  assert.equal(ordenar(linhas, colunas, { chave: null, dir: 1 }), linhas);
});

test('ordenar tolera valores ausentes', () => {
  const l = [{ a: 'b' }, { a: undefined }, { a: 'a' }];
  assert.deepEqual(ordenar(l, [{ chave: 'a', rotulo: 'A' }], { chave: 'a', dir: 1 }).map((x) => x.a), [undefined, 'a', 'b']);
});

test('contarPor', () => {
  assert.deepEqual(contarPor(linhas, 'fase'), { 'VALIDAÇÃO': 2, 'DIGITALIZAÇÃO': 1 });
});

test('proximaOrdem: coluna nova (número desc, texto asc) e inversão na mesma', () => {
  assert.deepEqual(proximaOrdem({ chave: null, dir: -1 }, colunas[2]), { chave: 'imagens', dir: -1 });
  assert.deepEqual(proximaOrdem({ chave: null, dir: -1 }, colunas[0]), { chave: 'caixa', dir: 1 });
  assert.deepEqual(proximaOrdem({ chave: 'caixa', dir: 1 }, colunas[0]), { chave: 'caixa', dir: -1 });
});
