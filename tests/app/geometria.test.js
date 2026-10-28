import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tetoBonito, curvaMonotona, indicesRotulos, geometriaAnel, indiceMaisProximo } from '../../public/app/js/core/geometria.js';

test('tetoBonito: 1, 2, 2.5, 5 ou 10 × potência de 10', () => {
  assert.equal(tetoBonito(0), 1);
  assert.equal(tetoBonito(-5), 1);
  assert.equal(tetoBonito(NaN), 1);
  assert.equal(tetoBonito(1), 1);
  assert.equal(tetoBonito(1.3), 2);
  assert.equal(tetoBonito(2.2), 2.5);
  assert.equal(tetoBonito(3), 5);
  assert.equal(tetoBonito(7), 10);
  assert.equal(tetoBonito(168), 200);
  assert.equal(tetoBonito(1284), 2000);
  assert.equal(tetoBonito(139870), 200000);
  assert.equal(tetoBonito(0.03), 0.05);
});

test('curvaMonotona: casos extremos', () => {
  assert.equal(curvaMonotona([]), '');
  assert.equal(curvaMonotona([[5, 6]]), 'M5.0,6.0');
  assert.match(curvaMonotona([[0, 0], [10, 10]]), /^M0\.0,0\.0C/);
});

test('curvaMonotona não passa de nenhum ponto vizinho (sem overshoot abaixo de zero)', () => {
  // fim de semana: 100, 120, 0, 0, 110 — uma curva comum "afundaria" abaixo de 0 (y maior que o eixo)
  const ys = [100, 120, 0, 0, 110];
  const pts = ys.map((v, i) => [i * 50, 200 - v]);
  const d = curvaMonotona(pts);
  const nums = [...d.matchAll(/(-?\d+\.\d),(-?\d+\.\d)/g)].map((m) => Number(m[2]));
  assert.ok(Math.max(...nums) <= 200.05, `y máximo ${Math.max(...nums)} ultrapassou a linha de base 200`);
  assert.ok(Math.min(...nums) >= 80 - 0.05, 'não passa do topo (120)');
});

test('curvaMonotona termina exatamente no último ponto', () => {
  const d = curvaMonotona([[0, 10], [40, 30], [80, 20]]);
  assert.ok(d.endsWith('80.0,20.0'));
});

test('indicesRotulos: primeiro e último sempre aparecem; espaçamento ≥ minPx', () => {
  const idx = indicesRotulos(7, 300);
  assert.equal(idx[0], 0);
  assert.equal(idx[idx.length - 1], 6);
  const muitos = indicesRotulos(30, 300);
  assert.equal(muitos[0], 0);
  assert.equal(muitos[muitos.length - 1], 29);
  assert.ok(muitos.length <= Math.floor(300 / 42) + 2);
  // regressão (tela de Envio): 8 pontos em 300 px davam passo 2 → rótulos 0,2,4,6,7 e os dois últimos se sobrepunham
  assert.deepEqual(indicesRotulos(8, 300), [0, 2, 4, 7]);
  for (const [n, w] of [[8, 300], [24, 300], [60, 300], [12, 180], [7, 700]]) {
    const i = indicesRotulos(n, w); const px = (w - 0) / Math.max(1, n - 1);
    for (let k = 1; k < i.length; k++) assert.ok((i[k] - i[k - 1]) * px >= 42 * 0.7, `${n} pontos em ${w}px: rótulos ${i[k - 1]} e ${i[k]} colados`);
  }
  assert.deepEqual(indicesRotulos(0, 300), []);
  assert.deepEqual(indicesRotulos(1, 300), [0]);
});

test('geometriaAnel: perímetro e deslocamento', () => {
  const g = geometriaAnel(0.25, 64, 5);
  assert.equal(g.r, 29.5);
  assert.ok(Math.abs(g.circunferencia - 2 * Math.PI * 29.5) < 1e-9);
  assert.ok(Math.abs(g.deslocamento - g.circunferencia * 0.75) < 1e-9);
  assert.equal(geometriaAnel(2, 64, 5).deslocamento, 0);
  assert.ok(Math.abs(geometriaAnel(-1, 64, 5).deslocamento - geometriaAnel(0, 64, 5).circunferencia) < 1e-9);
  assert.ok(geometriaAnel(NaN, 64, 5).deslocamento > 0);
});

test('indiceMaisProximo: arredonda e limita às pontas', () => {
  assert.equal(indiceMaisProximo(36, 36, 100, 5), 0);
  assert.equal(indiceMaisProximo(136, 36, 100, 5), 4);
  assert.equal(indiceMaisProximo(1000, 36, 100, 5), 4);
  assert.equal(indiceMaisProximo(-50, 36, 100, 5), 0);
  assert.equal(indiceMaisProximo(86, 36, 100, 5), 2);
  assert.equal(indiceMaisProximo(86, 36, 100, 1), 0);
});
