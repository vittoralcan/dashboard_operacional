// O codigoRegex é validado e gravado com o mesmo valor aparado (revisão do F0-04).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { BACK, requireBack, subir, bancoSimulado } = require('./_helpers/http');

const express = requireBack('express');
const { criarCadastrosRouter } = require(path.join(BACK, 'src/operacional/cadastros'));

const LINHA = { id: 5, slug: 'acervo', nome: 'Acervo Central', codigo_regex: '^AC-\\d+$', integracoes: [], ativo: true };
const db = bancoSimulado([
  [/INSERT INTO painel\.op_projeto/i, () => ({ rows: [LINHA] })],
  [/UPDATE painel\.op_projeto/i, () => ({ rows: [LINHA] })],
  [/INSERT INTO painel\.auditoria/i, () => ({ rows: [] })],
]);
let api;
before(async () => {
  api = await subir((app) => { app.use('/api/operacional/admin', express.json(), criarCadastrosRouter({ dbPainel: db })); }, { id: 1, login: 'chefe', tipo: 'admin' });
});
after(() => api.fechar());
const B = '/operacional/admin';
const gravacoes = () => db.chamadas.filter((c) => /(INSERT INTO|UPDATE) painel\.op_projeto/i.test(c.sql));

test('CA1: codigoRegex com espaços nas pontas é gravado aparado (o mesmo valor que foi validado)', async () => {
  db.chamadas.length = 0;
  const r = await api.post(`${B}/projetos`, { slug: 'acervo', nome: 'Acervo Central', codigoRegex: '  ^AC-\\d+$ \n' });
  assert.equal(r.status, 201, r.texto);
  const g = gravacoes()[0];
  assert.ok(g.params.includes('^AC-\\d+$'), 'grava o regex aparado');
  assert.ok(!g.params.some((p) => typeof p === 'string' && /^\s|\s$/.test(p)), 'nenhum parâmetro com espaço nas pontas');
});

test('CA2: codigoRegex só com espaços é recusado com 400 e nada é gravado (no POST e no PUT)', async () => {
  db.chamadas.length = 0;
  const a = await api.post(`${B}/projetos`, { slug: 'acervo', nome: 'Acervo Central', codigoRegex: '   ' });
  assert.equal(a.status, 400);
  assert.equal(a.json.success, false);
  const b = await api.put(`${B}/projetos/5`, { codigoRegex: ' \t ' });
  assert.equal(b.status, 400);
  assert.equal(gravacoes().length, 0);
});

test('CA3: regex inválido segue recusado, nome continua aparado e codigoRegex null limpa o campo', async () => {
  db.chamadas.length = 0;
  assert.equal((await api.post(`${B}/projetos`, { slug: 'acervo', nome: 'X', codigoRegex: ' ([ ' })).status, 400);
  assert.equal(gravacoes().length, 0);
  const ok = await api.put(`${B}/projetos/5`, { nome: '  Acervo Central  ', codigoRegex: null });
  assert.equal(ok.status, 200, ok.texto);
  const g = gravacoes()[0];
  assert.ok(g.params.includes('Acervo Central'));
  assert.ok(g.params.includes(null));
});
