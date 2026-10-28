// Monta só o router de cadastros (os guardas de perfil já são cobertos pelo F0-02) com banco simulado.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { BACK, requireBack, subir, bancoSimulado } = require('./_helpers/http');

const express = requireBack('express');
const { criarCadastrosRouter } = require(path.join(BACK, 'src/operacional/cadastros'));

const LINHA_PROJETO = { id: 5, slug: 'acervo', nome: 'Acervo Central', codigo_regex: '^AC-\\d{6}$', integracoes: ['captura'], ativo: true };
let falha = null;
const db = bancoSimulado([
  [/INSERT INTO painel\.op_projeto/i, () => { if (falha) throw falha; return { rows: [LINHA_PROJETO] }; }],
  [/UPDATE painel\.op_projeto/i, () => ({ rows: [{ ...LINHA_PROJETO, nome: 'Acervo Central 2' }] })],
  [/FROM painel\.op_projeto/i, () => ({ rows: [LINHA_PROJETO] })],
  [/INSERT INTO painel\.op_turno/i, () => ({ rows: [{ id: 2, projeto_id: 5, nome: 'Matutino 1', usuario_auth_id: 7, ativo: true }] })],
  [/INSERT INTO painel\.op_colaborador/i, () => ({ rows: [{ id: 3, nome: 'Ana', funcao: 'higienizador', projeto_id: 5, turno_id: 2, avatar: null, ativo: true }] })],
  [/FROM painel\.op_colaborador/i, () => ({ rows: [{ id: 3, nome: 'Ana', funcao: 'higienizador', projeto_id: 5, turno_id: 2, avatar: null, ativo: true }] })],
  [/INSERT INTO painel\.op_mesa/i, () => ({ rows: [{ id: 4, projeto_id: 5, codigo: '1A', tipo: 'higienizacao', ativo: true }] })],
  [/INSERT INTO painel\.op_meta/i, () => ({ rows: [{ id: 1, projeto_id: 5, etapa: 'higienizacao', valor_dia: 60, unidade: 'caixas' }] })],
  [/INSERT INTO painel\.auditoria/i, () => ({ rows: [] })],
]);

let api;
before(async () => {
  api = await subir((app) => {
    app.use('/api/operacional/admin', express.json(), criarCadastrosRouter({ dbPainel: db }));
  }, { id: 1, login: 'chefe', tipo: 'admin' });
});
after(() => api.fechar());
const B = '/operacional/admin';
const chamou = (re) => db.chamadas.filter((c) => re.test(c.sql));

test('CA1: POST /projetos grava com parâmetros e devolve 201 com os campos em camelCase', async () => {
  db.chamadas.length = 0;
  const r = await api.post(`${B}/projetos`, { slug: 'acervo', nome: 'Acervo Central', codigoRegex: '^AC-\\d{6}$', integracoes: ['captura'] });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.success, true);
  assert.equal(r.json.data.id, 5);
  assert.equal(r.json.data.codigoRegex, '^AC-\\d{6}$');
  const ins = chamou(/INSERT INTO painel\.op_projeto/i)[0];
  assert.ok(ins, 'nenhum INSERT em op_projeto');
  assert.ok(ins.params.includes('acervo') && ins.params.includes('Acervo Central'), 'valores devem ir como parâmetros');
  assert.ok(!/acervo/i.test(ins.sql.replace(/op_projeto/gi, '')), 'valores não podem ser concatenados no SQL');
  assert.ok(chamou(/INSERT INTO painel\.auditoria/i).length >= 1, 'o cadastro deve ser auditado');
});

test('CA2: validação recusa com 400 e sem tocar nas tabelas op_*', async () => {
  db.chamadas.length = 0;
  const ruins = [
    ['projetos', { slug: 'Slug Inválido!', nome: 'X' }],
    ['projetos', { slug: 'ok', nome: 'X', codigoRegex: '([' }],
    ['projetos', { slug: 'ok', nome: 'X', integracoes: ['outra'] }],
    ['turnos', { nome: 'Sem projeto' }],
    ['mesas', { projetoId: 5, codigo: '1A', tipo: 'inexistente' }],
    ['colaboradores', { projetoId: 5 }],
  ];
  for (const [rec, corpo] of ruins) {
    const r = await api.post(`${B}/${rec}`, corpo);
    assert.equal(r.status, 400, `${rec} ${JSON.stringify(corpo)} → ${r.status}`);
    assert.equal(r.json.success, false);
  }
  const r = await api.put(`${B}/metas`, { projetoId: 5, etapa: 'higienizacao', valorDia: 0, unidade: 'caixas' });
  assert.equal(r.status, 400);
  assert.equal(chamou(/painel\.op_(projeto|turno|colaborador|mesa|meta)\b/i).length, 0);
});

test('CA3: GET lista, aceita ?projetoId e PUT /:id atualiza e devolve a linha', async () => {
  db.chamadas.length = 0;
  const l = await api.get(`${B}/colaboradores?projetoId=5`);
  assert.equal(l.status, 200);
  assert.equal(l.json.data[0].nome, 'Ana');
  assert.equal(l.json.data[0].turnoId, 2);
  assert.ok(chamou(/FROM painel\.op_colaborador/i)[0].params.includes(5), 'projetoId deve filtrar por parâmetro');
  const p = await api.put(`${B}/projetos/5`, { nome: 'Acervo Central 2' });
  assert.equal(p.status, 200, p.texto);
  assert.equal(p.json.data.nome, 'Acervo Central 2');
  const upd = chamou(/UPDATE painel\.op_projeto/i)[0];
  assert.ok(upd.params.includes(5) && upd.params.includes('Acervo Central 2'));
});

test('CA4: turnos, colaboradores, mesas e metas gravam nas tabelas certas', async () => {
  db.chamadas.length = 0;
  assert.equal((await api.post(`${B}/turnos`, { projetoId: 5, nome: 'Matutino 1', usuarioAuthId: 7 })).status, 201);
  assert.equal((await api.post(`${B}/colaboradores`, { nome: 'Ana', funcao: 'higienizador', projetoId: 5, turnoId: 2 })).status, 201);
  assert.equal((await api.post(`${B}/mesas`, { projetoId: 5, codigo: '1A', tipo: 'higienizacao' })).status, 201);
  const m = await api.put(`${B}/metas`, { projetoId: 5, etapa: 'higienizacao', valorDia: 60, unidade: 'caixas' });
  assert.equal(m.status, 200, m.texto);
  assert.equal(m.json.data.valorDia, 60);
  const meta = chamou(/INSERT INTO painel\.op_meta/i)[0];
  assert.match(meta.sql, /ON CONFLICT/i, 'meta é upsert por (projeto, etapa)');
});

test('CA5: violação de unicidade do banco vira 409 com mensagem genérica', async () => {
  falha = Object.assign(new Error('duplicate key value violates unique constraint "op_projeto_slug_key"'), { code: '23505' });
  try {
    const r = await api.post(`${B}/projetos`, { slug: 'acervo', nome: 'Acervo Central' });
    assert.equal(r.status, 409, r.texto);
    assert.equal(r.json.success, false);
    assert.ok(!/constraint|duplicate key|op_projeto_slug_key/i.test(r.json.message), 'não vazar detalhe do banco');
  } finally { falha = null; }
});
