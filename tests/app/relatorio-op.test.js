// Casos extras de core/relatorio-op.js (os de aceite estão em tests/acceptance/F1-07.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const mod = () => import(pathToFileURL(path.resolve(__dirname, '../../public/app/js/core/relatorio-op.js')).href);

test('pico empatado fica na hora mais cedo e posições inválidas são ignoradas', async () => {
  const { normalizarHoraAHora } = await mod();
  const r = normalizarHoraAHora({ horas: [{ hora: 14, caixas: 2 }, { hora: 9, caixas: 2 }, { hora: 30, caixas: 9 }, { hora: 3, caixas: -1 }] });
  assert.deepEqual(r.pico, { hora: 9, caixas: 2 });
  assert.deepEqual(r.faixa, { de: 9, ate: 14 });
});

test('total 0 com horas preenchidas cai para a soma das horas; total válido do servidor é mantido', async () => {
  const { normalizarHoraAHora } = await mod();
  assert.equal(normalizarHoraAHora({ total: 0, horas: [{ hora: 8, caixas: 4 }, { hora: 9, caixas: 1 }] }).total, 5);
  assert.equal(normalizarHoraAHora({ total: 9, horas: [{ hora: 8, caixas: 4 }] }).total, 9);
});

test('duracaoCurta arredonda e urlHoraAHora ignora turno vazio', async () => {
  const { duracaoCurta, urlHoraAHora } = await mod();
  assert.equal(duracaoCurta(3600), '1 h 00 min');
  assert.equal(duracaoCurta(59.6), '1 min');
  assert.equal(urlHoraAHora({ projetoId: 1, data: '2026-01-02', turnoId: null }), '/operacional/relatorios/hora-a-hora?projetoId=1&data=2026-01-02');
});
