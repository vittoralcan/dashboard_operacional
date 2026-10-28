import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrarItens, achatar, moverSelecao, ORDEM_GRUPOS } from '../../public/app/js/core/paleta.js';

const ITENS = [
  { id: 'n1', grupo: 'Navegação', titulo: 'Seleção de projetos', atalho: 'G P' },
  { id: 'n2', grupo: 'Navegação', titulo: 'Macro View', atalho: 'G M', palavras: 'tv painel gigante' },
  { id: 'm1', grupo: 'Módulos', titulo: 'Higienização', sub: 'BOREAL · Operação Galpão Norte' },
  { id: 'm2', grupo: 'Módulos', titulo: 'Digitalização', sub: 'BOREAL · Captura' },
  { id: 'f1', grupo: 'Fluxos', titulo: 'Negativos', sub: 'ATLAS' },
  { id: 'p1', grupo: 'Fases', titulo: 'VALIDAÇÃO', sub: 'Negativos', metrica: '118 pastas' },
  { id: 'p2', grupo: 'Fases', titulo: 'VALIDAÇÃO', sub: 'Inventários' },
  { id: 'a1', grupo: 'Ações', titulo: 'Alternar tema', atalho: 'T' },
  { id: 'a2', grupo: 'Ações', titulo: 'Notificações', emBreve: 'notificacoes' },
];

test('sem texto: grupos na ordem fixa e "Fases" fica de fora', () => {
  const g = filtrarItens(ITENS, '');
  assert.deepEqual(g.map((x) => x.grupo), ['Navegação', 'Módulos', 'Fluxos', 'Ações']);
  assert.ok(!achatar(g).some((r) => r.item.grupo === 'Fases'));
});

test('com texto: "valid" acha VALIDAÇÃO nos fluxos (grupo Fases aparece)', () => {
  const g = filtrarItens(ITENS, 'valid');
  assert.deepEqual(g.map((x) => x.grupo), ['Fases']);
  assert.equal(g[0].itens.length, 2);
});

test('busca sem acento e sem caixa', () => {
  assert.equal(achatar(filtrarItens(ITENS, 'higienizacao'))[0].item.id, 'm1');
  assert.equal(achatar(filtrarItens(ITENS, 'SELECAO'))[0].item.id, 'n1');
});

test('casa também por subtítulo e sinônimos, sem realce de posições', () => {
  const porSub = achatar(filtrarItens(ITENS, 'captura'));
  assert.equal(porSub[0].item.id, 'm2');
  assert.deepEqual(porSub[0].posicoes, []);
  assert.equal(achatar(filtrarItens(ITENS, 'gigante'))[0].item.id, 'n2');
});

test('casamento pelo título vale mais que pelo subtítulo', () => {
  const itens = [
    { id: 'a', grupo: 'Módulos', titulo: 'Outro', sub: 'indexacao aqui' },
    { id: 'b', grupo: 'Módulos', titulo: 'Indexação IA' },
  ];
  assert.equal(achatar(filtrarItens(itens, 'indexacao'))[0].item.id, 'b');
});

test('posições do título vêm para o realce', () => {
  const r = achatar(filtrarItens(ITENS, 'macro'))[0];
  assert.equal(r.item.id, 'n2');
  assert.deepEqual(r.posicoes, [0, 1, 2, 3, 4]);
});

test('itens "Em breve" vão para o fim do grupo', () => {
  const g = filtrarItens(ITENS, '').find((x) => x.grupo === 'Ações');
  assert.deepEqual(g.itens.map((r) => r.item.id), ['a1', 'a2']);
  const g2 = filtrarItens(ITENS, 'o').find((x) => x.grupo === 'Ações');
  assert.equal(g2.itens[g2.itens.length - 1].item.id, 'a2');
});

test('nada casa → lista vazia', () => assert.deepEqual(filtrarItens(ITENS, 'zzzzz'), []));

test('limite por grupo', () => {
  const muitos = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, grupo: 'Módulos', titulo: `Módulo ${i}` }));
  assert.equal(filtrarItens(muitos, '')[0].itens.length, 8);
  assert.equal(filtrarItens(muitos, 'mod')[0].itens.length, 6);
});

test('moverSelecao: circular e pula "Em breve"', () => {
  const l = achatar(filtrarItens(ITENS, ''));
  const ultimoOk = l.map((r) => !r.item.emBreve).lastIndexOf(true);
  assert.equal(moverSelecao(l, ultimoOk, 1), 0);
  assert.equal(moverSelecao(l, 0, -1), ultimoOk);
  assert.equal(moverSelecao([], 0, 1), -1);
  const so = [{ item: { emBreve: 'x' } }];
  assert.equal(moverSelecao(so, 0, 1), 0);
});

test('ORDEM_GRUPOS cobre todos os grupos usados', () => {
  for (const i of ITENS) assert.ok(ORDEM_GRUPOS.includes(i.grupo), i.grupo);
});

test('letras espalhadas no subtítulo NÃO casam ("tema" não acha Digitalização · Captura)', () => {
  const r = achatar(filtrarItens(ITENS, 'tema'));
  assert.deepEqual(r.map((x) => x.item.id), ['a1']);
});

test('um casamento pelo título aparece mesmo em grupo posterior e o subtítulo contíguo ainda funciona', () => {
  assert.equal(achatar(filtrarItens(ITENS, 'galpao'))[0].item.id, 'm1');
});
