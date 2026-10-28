const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { bloquearTurnoForaDeOperacional } = require(path.resolve(__dirname, '../../services/back_dashboard/src/core/auth.middleware'));

function passar(tipo, caminho) {
  const req = { usuario: { tipo }, path: caminho };
  let status = null;
  let corpo = null;
  let seguiu = false;
  const res = { status(s) { status = s; return this; }, json(c) { corpo = c; return this; } };
  bloquearTurnoForaDeOperacional(req, res, () => { seguiu = true; });
  return { status, corpo, seguiu };
}

test('CA1: o 403 do turno fora do operacional explica a regra, sem citar administradores', () => {
  const r = passar('turno', '/metas');
  assert.equal(r.status, 403);
  assert.equal(r.corpo.success, false);
  assert.match(r.corpo.message, /turno/i);
  assert.match(r.corpo.message, /terminal/i);
  assert.doesNotMatch(r.corpo.message, /administrador/i);
});

test('CA2: turno passa só no segmento exato de terminal', () => {
  for (const ok of ['/operacional/terminal', '/operacional/terminal/caixas']) {
    assert.equal(passar('turno', ok).seguiu, true, `devia passar: ${ok}`);
  }
  for (const nao of ['/operacional/terminalX', '/operacional/terminal-x/y', '/operacional/terminal-qualquer', '/operacional/admin', '/operacional']) {
    const r = passar('turno', nao);
    assert.equal(r.seguiu, false, `devia barrar: ${nao}`);
    assert.equal(r.status, 403);
  }
});

test('CA3: quem não é turno continua passando por qualquer caminho', () => {
  for (const tipo of ['admin', 'standard']) assert.equal(passar(tipo, '/metas').seguiu, true);
});
