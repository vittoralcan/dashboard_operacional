import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarGrafo, calcularLayout, caminhoOrtogonal, dePontos, cargaRelativa, zoomEm, vistaAjustada, vistaInicial,
  vistaCentrada, retanguloVisivel, pontoDoMinimapa, ehArrasto, fatorDaRoda, ZOOM_MIN, ZOOM_MAX, MARGEM,
} from '../../public/app/js/core/fluxo.js';

const G = {
  cw: 200, ch: 130, nw: 164, nh: 92,
  nos: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }, { id: 'c', x: 1, y: 1 }],
  juncoes: [{ id: 'j', x: 2, y: 0 }],
  arestas: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'b', to: 'j' }],
};

test('validarGrafo: grafo coerente passa', () => {
  assert.deepEqual(validarGrafo(G), { ok: true, erros: [] });
});

test('validarGrafo: aponta cada tipo de erro de configuração em português', () => {
  assert.equal(validarGrafo(null).ok, false);
  assert.match(validarGrafo({ ...G, cw: 0 }).erros[0], /"cw"/);
  assert.match(validarGrafo({ ...G, nos: [] }).erros[0], /pelo menos uma fase/);
  assert.match(validarGrafo({ ...G, nos: [...G.nos, { id: 'a', x: 5, y: 5 }] }).erros.join(' '), /repetido: a/);
  assert.match(validarGrafo({ ...G, nos: [{ id: 'a', x: 'x', y: 0 }], arestas: [] }).erros.join(' '), /posição/);
  assert.match(validarGrafo({ ...G, arestas: [{ from: 'a', to: 'zz' }] }).erros.join(' '), /não existe/);
  assert.match(validarGrafo({ ...G, arestas: [{ from: 'a', to: 'a' }] }).erros.join(' '), /para si mesma/);
  assert.equal(validarGrafo({ ...G, arestas: undefined }).ok, false);
});

test('ids numéricos e texto são equivalentes (chave string)', () => {
  const g = { cw: 10, ch: 10, nw: 4, nh: 4, nos: [{ id: 0, x: 0, y: 0 }, { id: 1, x: 1, y: 0 }], arestas: [{ from: '0', to: 1 }] };
  assert.equal(validarGrafo(g).ok, true);
  assert.ok(calcularLayout(g).pos['0']);
});

test('calcularLayout: centro na célula, margem de 70 px e mundo = caixa envolvente + margem', () => {
  const { W, H, pos } = calcularLayout(G);
  // caixa envolvente: nós 164 × 92 e losango (30 × 30) — x vai de a.esq a j.dir
  assert.equal(pos.a.cx - pos.a.hw, MARGEM, 'o conjunto começa a MARGEM do canto');
  assert.equal(pos.b.cx - pos.a.cx, 200, 'passo horizontal = cw');
  assert.equal(pos.c.cy - pos.b.cy, 130, 'passo vertical = ch');
  assert.equal(pos.a.hw, 82); assert.equal(pos.a.hh, 46);
  assert.equal(pos.j.hw, 15);
  const direita = Math.max(...Object.values(pos).map((p) => p.cx + p.hw));
  const baixo = Math.max(...Object.values(pos).map((p) => p.cy + p.hh));
  assert.equal(W, direita + MARGEM);
  assert.equal(H, baixo + MARGEM);
});

test('caminhoOrtogonal: reta na mesma linha, reta na mesma coluna e um cotovelo nos demais', () => {
  const a = { cx: 100, cy: 100, hw: 80, hh: 40 };
  assert.deepEqual(caminhoOrtogonal(a, { cx: 400, cy: 100, hw: 80, hh: 40 }), [[180, 100], [320, 100]]);
  assert.deepEqual(caminhoOrtogonal(a, { cx: 100, cy: 300, hw: 80, hh: 40 }), [[100, 140], [100, 260]]);
  assert.deepEqual(caminhoOrtogonal({ cx: 400, cy: 100, hw: 80, hh: 40 }, a), [[320, 100], [180, 100]], 'para a esquerda');
  // diagonal: horizontal a partir da origem e depois vertical até o topo do destino
  assert.deepEqual(caminhoOrtogonal(a, { cx: 400, cy: 300, hw: 80, hh: 40 }), [[180, 100], [400, 100], [400, 260]]);
  // para cima: chega pela base do destino
  assert.deepEqual(caminhoOrtogonal({ cx: 400, cy: 300, hw: 80, hh: 40 }, a), [[320, 300], [100, 300], [100, 140]]);
});

test('dePontos: atributo d com 1 casa decimal', () => {
  assert.equal(dePontos([[1, 2], [3.14159, 4]]), 'M1.0,2.0L3.1,4.0');
});

test('cargaRelativa: relativa ao maior, mínimo 4 %, final sempre cheio, sem divisão por zero', () => {
  assert.equal(cargaRelativa(50, 200), 25);
  assert.equal(cargaRelativa(1, 1000), 4);
  assert.equal(cargaRelativa(0, 1000), 4);
  assert.equal(cargaRelativa(10, 0), 4);
  assert.equal(cargaRelativa(10, 200, true), 100);
  assert.equal(cargaRelativa(900, 800), 100, 'nunca passa de 100');
});

test('zoomEm: mantém o ponto sob o cursor parado e respeita 15 %–220 %', () => {
  const v = { x: 30, y: 20, k: 1 };
  const z = zoomEm(v, 2, 200, 100);
  assert.equal(z.k, 2);
  // ponto do mundo sob (200,100) antes e depois
  assert.equal((200 - v.x) / v.k, (200 - z.x) / z.k);
  assert.equal((100 - v.y) / v.k, (100 - z.y) / z.k);
  assert.equal(zoomEm(v, 100, 0, 0).k, ZOOM_MAX);
  assert.equal(zoomEm(v, 0.0001, 0, 0).k, ZOOM_MIN);
  assert.equal(zoomEm({ x: 0, y: 0, k: ZOOM_MAX }, 2, 0, 0).k, ZOOM_MAX);
  assert.deepEqual(zoomEm({ x: 1, y: 2, k: ZOOM_MAX }, 2, 5, 5), { x: 1, y: 2, k: ZOOM_MAX }, 'no limite devolve a mesma vista');
});

test('vistaAjustada: cabe tudo, centralizado, entre 15 % e 130 %', () => {
  const v = vistaAjustada(1000, 400, 800, 500);
  assert.ok(v.k <= 1.3 && v.k >= 0.15);
  assert.ok(Math.abs(v.x - (800 - 1000 * v.k) / 2) < 1e-9);
  assert.ok(1000 * v.k <= 800 - 80 + 1e-9);
  assert.equal(vistaAjustada(100, 100, 5000, 5000).k, 1.3);
  assert.equal(vistaAjustada(100000, 100000, 500, 500).k, ZOOM_MIN);
});

test('vistaInicial: 80–100 %; centralizada se couber, senão ancorada à esquerda', () => {
  const cabe = vistaInicial(400, 200, 1000, 600);
  assert.equal(cabe.k, 1);
  assert.equal(cabe.x, 300);
  const grande = vistaInicial(2000, 400, 800, 600);
  assert.equal(grande.k, 0.8);
  assert.equal(grande.x, 18 - MARGEM * 0.8);
});

test('vistaCentrada e retanguloVisivel são inversas', () => {
  const v = vistaCentrada({ x: 0, y: 0, k: 1 }, 500, 300, 800, 600, 2);
  assert.equal(v.k, 2);
  const r = retanguloVisivel(v, 800, 600);
  assert.equal(r.x + r.w / 2, 500);
  assert.equal(r.y + r.h / 2, 300);
  assert.equal(vistaCentrada(v, 0, 0, 800, 600).k, 2, 'sem k mantém a escala');
});

test('pontoDoMinimapa: leva em conta as faixas do "meet" e limita ao mundo', () => {
  const caixa = { left: 10, top: 20, width: 200, height: 100 };
  // mundo 400 × 100 → escala 0,5; sobra vertical (100 − 50)/2 = 25
  const p = pontoDoMinimapa(10 + 100, 20 + 50, caixa, 400, 100);
  assert.deepEqual(p, { x: 200, y: 50 });
  assert.deepEqual(pontoDoMinimapa(-999, -999, caixa, 400, 100), { x: 0, y: 0 });
  assert.deepEqual(pontoDoMinimapa(9999, 9999, caixa, 400, 100), { x: 400, y: 100 });
});

test('ehArrasto: limiar de 4 px; fatorDaRoda é simétrico', () => {
  assert.equal(ehArrasto(3, 3), true);
  assert.equal(ehArrasto(2, 2), false);
  assert.equal(ehArrasto(0, 4), false);
  assert.equal(ehArrasto(0, 4.1), true);
  assert.ok(Math.abs(fatorDaRoda(100) * fatorDaRoda(-100) - 1) < 1e-12);
  assert.ok(fatorDaRoda(-100) > 1);
});
