// Terminal: remontagem como etapa. Router isolado, turno já resolvido e banco simulado.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { BACK, requireBack, subir, bancoSimulado } = require('./_helpers/http');

const express = requireBack('express');
const { criarTerminalRouter } = require(path.join(BACK, 'src/operacional/terminal'));

const AGORA = new Date('2026-10-20T13:00:00.000Z');
const TURNO = { id: 8, projetoId: 5, nome: 'Equipe 1' };
const REG = { id: 11, projeto_id: 5, turno_id: 8, colaborador_id: 1, mesa_id: null, etapa: 'remontagem', codigo: 'CX-1', status: 'aberta', inicio_em: AGORA.toISOString(), fim_em: null, duracao_s: null };
const estado = { aberta: null };
const db = bancoSimulado([
  [/^\s*(UPDATE painel\.op_pausa|SELECT\s+COALESCE\(SUM)/i, () => ({ rows: [{ pausado_s: 0 }] })],
  [/INSERT INTO painel\.op_caixa_registro/i, (p) => ({ rows: [{ ...REG, etapa: p.includes('remontagem') ? 'remontagem' : 'higienizacao' }] })],
  [/UPDATE painel\.op_caixa_registro/i, () => ({ rows: [{ ...REG, status: 'concluida', fim_em: AGORA.toISOString(), duracao_s: 125 }] })],
  [/JOIN painel\.op_colaborador/i, () => ({ rows: [{ id: 20, codigo: 'CX-2', colaborador_id: 1, colaborador_nome: 'Bruno', mesa_id: null, etapa: 'remontagem', inicio_em: AGORA.toISOString() }] })],
  [/FROM painel\.op_colaborador/i, () => ({ rows: [{ id: 1 }] })],
  [/FROM painel\.op_mesa/i, () => ({ rows: [] })],
  [/FROM painel\.op_projeto/i, () => ({ rows: [{ id: 5, codigo_regex: null }] })],
  [/FROM painel\.op_caixa_registro/i, (_p, sql) => ({ rows: /status\s*=\s*'aberta'/i.test(sql) && estado.aberta ? [estado.aberta] : [] })],
]);
let api;
before(async () => {
  api = await subir((app) => {
    app.use('/api/operacional/terminal', express.json(), (req, _res, next) => { req.turno = TURNO; next(); }, criarTerminalRouter({ dbPainel: db, agora: () => AGORA }));
  }, { id: 30, login: 'equipe-1', tipo: 'turno' });
});
after(() => api.fechar());
const B = '/operacional/terminal';
const zerar = (aberta = null) => { db.chamadas.length = 0; estado.aberta = aberta; };
const doRegistro = () => db.chamadas.filter((c) => /FROM painel\.op_caixa_registro/i.test(c.sql));

test('CA1: /bip com etapa remontagem consulta essa etapa por parâmetro; sem etapa usa higienizacao', async () => {
  zerar();
  const r = await api.post(`${B}/bip`, { codigo: 'CX-1', etapa: 'remontagem' });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.data.acao, 'iniciar');
  const q = doRegistro().filter((c) => /etapa = \$/.test(c.sql)); // a busca da caixa aberta é por código, em qualquer etapa
  assert.ok(q.length >= 1);
  for (const c of q) {
    assert.ok(c.params.includes('remontagem'), `etapa como parâmetro: ${JSON.stringify(c.params)}`);
    assert.doesNotMatch(c.sql, /'higienizacao'|'remontagem'/, 'sem literal de etapa no SQL');
  }
  zerar();
  await api.post(`${B}/bip`, { codigo: 'CX-1' });
  for (const c of doRegistro().filter((x) => /etapa = \$/.test(x.sql))) assert.ok(c.params.includes('higienizacao'), JSON.stringify(c.params));
});

test('CA2: /caixas grava a etapa escolhida; sem etapa grava higienizacao', async () => {
  zerar();
  const r = await api.post(`${B}/caixas`, { codigo: 'CX-1', colaboradorId: 1, etapa: 'remontagem' });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.data.etapa, 'remontagem');
  const ins = db.chamadas.find((c) => /INSERT INTO/i.test(c.sql));
  assert.ok(ins.params.includes('remontagem'));
  zerar();
  const padrao = await api.post(`${B}/caixas`, { codigo: 'CX-1', colaboradorId: 1 });
  assert.equal(padrao.status, 201, padrao.texto);
  assert.ok(db.chamadas.find((c) => /INSERT INTO/i.test(c.sql)).params.includes('higienizacao'));
});

test('CA3: etapa inválida responde 400 sem consultar o banco', async () => {
  zerar();
  for (const etapa of ['scanner', '', 7, null]) {
    const a = await api.post(`${B}/bip`, { codigo: 'CX-1', etapa });
    const b = await api.post(`${B}/caixas`, { codigo: 'CX-1', colaboradorId: 1, etapa });
    assert.equal(a.status, 400, `bip etapa=${etapa}`);
    assert.equal(b.status, 400, `caixas etapa=${etapa}`);
    assert.equal(a.json.success, false);
  }
  assert.equal(db.chamadas.length, 0);
});

test('CA4: /estado devolve a etapa de cada aberta e finalizar devolve o registro da remontagem', async () => {
  zerar();
  const e = await api.get(`${B}/estado`);
  assert.equal(e.status, 200, e.texto);
  assert.equal(e.json.data.abertas[0].etapa, 'remontagem');
  zerar({ id: 11, inicio_em: new Date(AGORA.getTime() - 125000).toISOString() });
  const f = await api.post(`${B}/bip`, { codigo: 'CX-1', etapa: 'remontagem' });
  assert.equal(f.json.data.acao, 'finalizar', f.texto);
  assert.equal(f.json.data.registro.etapa, 'remontagem');
});
