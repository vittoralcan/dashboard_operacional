const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const bip = require(path.resolve(__dirname, '../../services/back_dashboard/src/operacional/bip'));
const AGORA = new Date('2026-10-20T13:00:00.000Z');
const antes = (s) => new Date(AGORA.getTime() - s * 1000).toISOString();

test('CA1: normalizarCodigo tira espaços e quebras de linha do leitor; validarCodigo aplica o regex do projeto por inteiro', () => {
  assert.equal(bip.normalizarCodigo('  ABC123\r\n'), 'ABC123');
  assert.equal(bip.normalizarCodigo(null), '');
  assert.deepEqual(bip.validarCodigo(' AC-000123\n', '^AC-\\d{6}$'), { ok: true, codigo: 'AC-000123' });
  assert.equal(bip.validarCodigo('AC-12', '^AC-\\d{6}$').ok, false);
  assert.equal(bip.validarCodigo('XAC-000123', 'AC-\\d{6}').ok, false, 'o regex vale para o código inteiro');
  assert.equal(bip.validarCodigo('AC-000123', 'AC-\\d{6}').ok, true);
});

test('CA2: sem regex configurado aceita qualquer texto não vazio; vazio e acima de 60 caracteres são recusados', () => {
  assert.deepEqual(bip.validarCodigo('qualquer coisa 1', null), { ok: true, codigo: 'qualquer coisa 1' });
  assert.deepEqual(bip.validarCodigo('x', ''), { ok: true, codigo: 'x' });
  assert.deepEqual(bip.validarCodigo('  \n', null), { ok: false, motivo: 'vazio' });
  assert.deepEqual(bip.validarCodigo('a'.repeat(61), null), { ok: false, motivo: 'longo' });
  assert.deepEqual(bip.validarCodigo('abc', '^\\d+$'), { ok: false, motivo: 'formato' });
  assert.throws(() => bip.validarCodigo('abc', '(['), /regex|padr/i);
});

test('CA3: decidirBip inicia a caixa nova e rejeita código fora do padrão como inexistente', () => {
  const base = { codigoRegex: '^AC-\\d{6}$', aberta: null, ultima: null, agora: AGORA };
  assert.deepEqual(bip.decidirBip({ ...base, texto: 'AC-000123\r' }), { acao: 'iniciar', codigo: 'AC-000123' });
  const r = bip.decidirBip({ ...base, texto: 'lixo' });
  assert.equal(r.acao, 'inexistente');
  assert.equal(r.motivo, 'formato');
});

test('CA4: segundo bip finaliza a caixa aberta com a duração em segundos; bip repetido em até 3 s é duplicado', () => {
  const aberta = { id: 41, inicio_em: antes(125) };
  const fim = bip.decidirBip({ texto: 'C1', codigoRegex: null, aberta, ultima: aberta, agora: AGORA });
  assert.deepEqual(fim, { acao: 'finalizar', registroId: 41, duracaoS: 125, codigo: 'C1' });
  const dup = bip.decidirBip({ texto: 'C1', codigoRegex: null, aberta: { id: 41, inicio_em: antes(2) }, ultima: null, agora: AGORA });
  assert.equal(dup.acao, 'duplicado');
  assert.equal(bip.duracaoSegundos(antes(90), AGORA), 90);
});

test('CA5: caixa já concluída vira ja_concluida, ou duplicado se acabou de ser concluída (até 3 s)', () => {
  const velha = { id: 9, status: 'concluida', fim_em: antes(600) };
  const r = bip.decidirBip({ texto: 'C1', codigoRegex: null, aberta: null, ultima: velha, agora: AGORA });
  assert.equal(r.acao, 'ja_concluida');
  const recente = { id: 9, status: 'concluida', fim_em: antes(1) };
  assert.equal(bip.decidirBip({ texto: 'C1', codigoRegex: null, aberta: null, ultima: recente, agora: AGORA }).acao, 'duplicado');
  const cancelada = { id: 9, status: 'cancelada', fim_em: antes(600) };
  assert.equal(bip.decidirBip({ texto: 'C1', codigoRegex: null, aberta: null, ultima: cancelada, agora: AGORA }).acao, 'iniciar');
});
