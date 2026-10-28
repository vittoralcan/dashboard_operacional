import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJETOS_MACRO, valoresIniciais, valorDoCartao, rotacaoInicial, avancarTempo, irParaProjeto, alternarPausa, larguraDaBarra,
} from '../../public/app/js/core/macro.js';

const BOREAL = PROJETOS_MACRO[0];
const ATLAS = PROJETOS_MACRO[1];
const cartao = (p, id) => p.cartoes.find((c) => c.id === id);

test('Macro View: BOREAL tem 1 cartão (Monitoramento), ATLAS 4 e COBALTO "ainda não iniciado" (sem cartões)', () => {
  assert.deepEqual(PROJETOS_MACRO.map((p) => [p.id, p.cartoes ? p.cartoes.length : null]), [['boreal', 1], ['atlas', 4], ['cobalto', null]]);
  assert.deepEqual(ATLAS.cartoes.map((c) => c.sub), ['Negativos', 'Certidões', 'Inventários', 'Cartografia']);
});

test('valorDoCartao: número, fração online/total e "—" sem histórico', () => {
  const v = valoresIniciais();
  assert.equal(valorDoCartao(ATLAS, cartao(ATLAS, 'inventarios'), v).tipo, 'vazio', 'sem dado: "—", nunca 0');
  v.apis = { online: 5, total: 6 }; v.atlas.inventarios = 700; v.atlas['cartografia'] = 0;
  assert.deepEqual(valorDoCartao(ATLAS, cartao(ATLAS, 'cartografia'), v), { tipo: 'numero', n: 0 }, 'zero é valor');
  assert.deepEqual(valorDoCartao(BOREAL, cartao(BOREAL, 'monitoramento'), v), { tipo: 'texto', texto: '5/6' });
  assert.deepEqual(valorDoCartao(ATLAS, cartao(ATLAS, 'inventarios'), v), { tipo: 'numero', n: 700 });
  assert.equal(valorDoCartao(ATLAS, cartao(ATLAS, 'negativos'), v).tipo, 'vazio');
  assert.equal(valorDoCartao(BOREAL, cartao(BOREAL, 'monitoramento'), valoresIniciais()).tipo, 'vazio');
});

test('rotação: acumula tempo, troca ao completar o intervalo e volta ao primeiro (BOREAL → ATLAS → COBALTO → BOREAL)', () => {
  let r = rotacaoInicial();
  r = avancarTempo(r, 4, 10, 3); assert.deepEqual([r.idx, r.decorrido, r.trocou], [0, 4, false]);
  r = avancarTempo(r, 6, 10, 3); assert.deepEqual([r.idx, r.decorrido, r.trocou], [1, 0, true]);
  r = avancarTempo(r, 10, 10, 3); assert.equal(r.idx, 2);
  r = avancarTempo(r, 10, 10, 3); assert.equal(r.idx, 0, 'dá a volta');
});

test('pausa congela a rotação e o tempo; retomar continua de onde parou', () => {
  let r = avancarTempo(rotacaoInicial(), 3, 10, 3);
  r = alternarPausa(r);
  const p = avancarTempo(r, 50, 10, 3);
  assert.deepEqual([p.idx, p.decorrido, p.trocou, p.pausado], [0, 3, false, true]);
  r = alternarPausa(r);
  assert.deepEqual([r.pausado, r.decorrido], [false, 3]);
  assert.equal(avancarTempo(r, 7, 10, 3).idx, 1);
});

test('irParaProjeto: ←/→ e clique em barra/aba (com volta nas pontas); zera o tempo e mantém a pausa', () => {
  const r = { idx: 0, decorrido: 6, pausado: true };
  assert.deepEqual(irParaProjeto(r, -1, 3), { idx: 2, decorrido: 0, pausado: true });
  assert.deepEqual(irParaProjeto(r, 3, 3), { idx: 0, decorrido: 0, pausado: true });
  assert.equal(irParaProjeto(r, 1, 3).idx, 1);
});

test('avancarTempo: entradas inválidas não quebram (sem projetos, intervalo 0, dt negativo)', () => {
  const r = rotacaoInicial();
  assert.equal(avancarTempo(r, 5, 10, 0).trocou, false);
  assert.equal(avancarTempo(r, 5, 0, 3).trocou, false);
  assert.equal(avancarTempo(r, -5, 10, 3).decorrido, 0);
});

test('barras stories: anteriores cheias, atual proporcional, próximas vazias', () => {
  const r = { idx: 1, decorrido: 2.5, pausado: false };
  assert.deepEqual([0, 1, 2].map((i) => larguraDaBarra(r, i, 10)), [100, 25, 0]);
  assert.equal(larguraDaBarra({ idx: 0, decorrido: 99, pausado: false }, 0, 10), 100, 'nunca passa de 100');
});
