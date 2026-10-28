import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, fmtDec, fmtCompacto, norm, tempoRelativo, nomeArquivo, fmtVariacao, dataArquivo, saudacao, primeiroNome, clamp } from '../../public/app/js/core/format.js';

test('fmt usa separador de milhar pt-BR', () => {
  assert.equal(fmt(139870), '139.870');
  assert.equal(fmt('1284'), '1.284');
  assert.equal(fmt(0), '0');
});

test('fmtDec usa vírgula decimal', () => {
  assert.equal(fmtDec(12.4), '12,4');
  assert.equal(fmtDec(3, 2), '3,00');
});

test('fmtCompacto: inteiro, mil e mi', () => {
  assert.equal(fmtCompacto(950), '950');
  assert.equal(fmtCompacto(1284), '1.284');
  assert.equal(fmtCompacto(12500), '12,5 mil');
  assert.equal(fmtCompacto(3400000), '3,4 mi');
});

test('norm remove acentos e baixa a caixa (busca)', () => {
  assert.equal(norm('Higienização — AÇÃO'), 'higienizacao — acao');
  assert.equal(norm(null), '');
});

test('tempoRelativo — idade de um dado', () => {
  assert.equal(tempoRelativo(12), 'há 12 s');
  assert.equal(tempoRelativo(125), 'há 2 min');
  assert.equal(tempoRelativo(7300), 'há 2 h');
  assert.equal(tempoRelativo(200000), 'há 2 d');
  assert.equal(tempoRelativo(-5), 'há 0 s');
});

test('nomeArquivo: sem acento, maiúsculo, só A-Z0-9 e _', () => {
  assert.equal(nomeArquivo('Relatório de CX / Usuários'), 'RELATORIO_DE_CX_USUARIOS');
});

test('fmtVariacao com sinal tipográfico', () => {
  assert.equal(fmtVariacao(12.4), '+12,4%');
  assert.equal(fmtVariacao(-3), '−3,0%');
});

test('dataArquivo usa hífens (nome de arquivo exportado)', () => {
  assert.equal(dataArquivo(new Date(2026, 9, 2)), '02-10-2026');
});

test('saudacao e primeiroNome', () => {
  assert.equal(saudacao(3), 'Boa noite');
  assert.equal(saudacao(9), 'Bom dia');
  assert.equal(saudacao(15), 'Boa tarde');
  assert.equal(saudacao(21), 'Boa noite');
  assert.equal(primeiroNome('  Rafael Lima '), 'Rafael');
});

test('clamp', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});
