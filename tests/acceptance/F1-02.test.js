// Terminal do tablet: monta só o router do terminal, com o turno já resolvido e banco simulado.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { BACK, requireBack, subir, bancoSimulado } = require('./_helpers/http');

const express = requireBack('express');
const { criarTerminalRouter } = require(path.join(BACK, 'src/operacional/terminal'));

const AGORA = new Date('2026-10-20T13:00:00.000Z');
const antes = (s) => new Date(AGORA.getTime() - s * 1000).toISOString();
const TURNO = { id: 8, projetoId: 5, nome: 'Matutino 1' };
const COLABS = [
  { id: 3, nome: 'Zélia', funcao: 'higienizador', avatar: null, turno_id: 8 },
  { id: 1, nome: 'Bruno', funcao: 'higienizador', avatar: null, turno_id: 8 },
  { id: 2, nome: 'Érica', funcao: 'higienizador', avatar: null, turno_id: 8 },
  { id: 4, nome: 'Ana', funcao: 'higienizador', avatar: null, turno_id: 8 },
];
const REGISTRO = { id: 11, projeto_id: 5, turno_id: 8, colaborador_id: 1, mesa_id: null, etapa: 'higienizacao', codigo: 'AC-000123', status: 'aberta', inicio_em: AGORA.toISOString(), fim_em: null, duracao_s: null };

const estado = { aberta: null, ultima: null, codigoRegex: '^AC-\\d{6}$', erroInsert: null };
const db = bancoSimulado([
  [/^\s*(UPDATE painel\.op_pausa|SELECT\s+COALESCE\(SUM)/i, () => ({ rows: [{ pausado_s: 0 }] })],
  [/INSERT INTO painel\.op_caixa_registro/i, () => { if (estado.erroInsert) throw estado.erroInsert; return { rows: [REGISTRO] }; }],
  [/UPDATE painel\.op_caixa_registro/i, () => ({ rows: [{ ...REGISTRO, id: 7, status: 'concluida', fim_em: AGORA.toISOString(), duracao_s: 125 }] })],
  [/JOIN painel\.op_colaborador/i, () => ({ rows: [
    { id: 20, codigo: 'AC-000200', colaborador_id: 1, colaborador_nome: 'Bruno', mesa_id: null, inicio_em: antes(60) },
    { id: 21, codigo: 'AC-000201', colaborador_id: 4, colaborador_nome: 'Ana', mesa_id: null, inicio_em: antes(30) },
  ] })],
  [/FROM painel\.op_colaborador/i, (p) => ({ rows: p.length === 1 ? COLABS : COLABS.filter((c) => c.id === p[0]) })],
  [/FROM painel\.op_mesa/i, (p) => ({ rows: p.length === 1 ? [{ id: 4, codigo: '1A', tipo: 'higienizacao' }] : (p[0] === 4 ? [{ id: 4 }] : []) })],
  [/FROM painel\.op_projeto/i, () => ({ rows: [{ id: 5, codigo_regex: estado.codigoRegex }] })],
  [/FROM painel\.op_caixa_registro/i, (_p, sql) => {
    const linha = /status\s*=\s*'aberta'/i.test(sql) ? estado.aberta : estado.ultima;
    return { rows: linha ? [linha] : [] };
  }],
]);

let api;
before(async () => {
  api = await subir((app) => {
    app.use('/api/operacional/terminal', express.json(), (req, _res, next) => { req.turno = TURNO; next(); }, criarTerminalRouter({ dbPainel: db, agora: () => AGORA }));
  }, { id: 30, login: 'turno-a', tipo: 'turno' });
});
after(() => api.fechar());
const B = '/operacional/terminal';
const chamou = (re) => db.chamadas.filter((c) => re.test(c.sql));
const zerar = (aberta = null, ultima = null) => { db.chamadas.length = 0; estado.aberta = aberta; estado.ultima = ultima; estado.erroInsert = null; };

test('CA1: GET /colaboradores devolve só os ativos do turno em ordem alfabética A-Z (acentos e caixa ignorados)', async () => {
  zerar();
  const r = await api.get(`${B}/colaboradores`);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.success, true);
  assert.deepEqual(r.json.data.map((c) => c.nome), ['Ana', 'Bruno', 'Érica', 'Zélia']);
  assert.deepEqual(Object.keys(r.json.data[0]).sort(), ['avatar', 'funcao', 'id', 'nome']);
  const q = chamou(/FROM painel\.op_colaborador/i)[0];
  assert.deepEqual(q.params, [8], 'filtra pelo turno da conta, como parâmetro');
});

test('CA2: POST /bip com caixa nova responde "iniciar" sem gravar; código fora do padrão responde 422 "inexistente"', async () => {
  zerar();
  const ok = await api.post(`${B}/bip`, { codigo: ' AC-000123\r\n' });
  assert.equal(ok.status, 200, ok.texto);
  assert.equal(ok.json.success, true);
  assert.equal(ok.json.data.acao, 'iniciar');
  assert.equal(ok.json.data.codigo, 'AC-000123');
  assert.equal(chamou(/INSERT INTO painel\.op_caixa_registro/i).length, 0, 'o registro só nasce quando o nome é escolhido');
  const ruim = await api.post(`${B}/bip`, { codigo: 'lixo' });
  assert.equal(ruim.status, 422);
  assert.equal(ruim.json.success, false);
  assert.equal(ruim.json.acao, 'inexistente');
  assert.equal((await api.post(`${B}/bip`, {})).status, 400, 'sem código no corpo');
});

test('CA3: POST /caixas abre a caixa para um colaborador do turno (201); colaborador alheio ao turno é recusado', async () => {
  zerar();
  const ok = await api.post(`${B}/caixas`, { codigo: 'AC-000123', colaboradorId: 1, mesaId: 4 });
  assert.equal(ok.status, 201, ok.texto);
  assert.equal(ok.json.data.codigo, 'AC-000123');
  assert.equal(ok.json.data.colaboradorId, 1);
  assert.equal(ok.json.data.status, 'aberta');
  const ins = chamou(/INSERT INTO painel\.op_caixa_registro/i)[0];
  assert.ok(ins, 'nenhum INSERT');
  for (const v of ['AC-000123', 1, 8, 5, 4]) assert.ok(ins.params.includes(v), `parâmetro ${v} ausente`);
  assert.ok(!ins.sql.includes('AC-000123'), 'valores não podem ser concatenados no SQL');

  zerar();
  const alheio = await api.post(`${B}/caixas`, { codigo: 'AC-000123', colaboradorId: 99 });
  assert.equal(alheio.status, 400);
  assert.equal(alheio.json.success, false);
  assert.equal(chamou(/INSERT INTO painel\.op_caixa_registro/i).length, 0);

  zerar(null, null);
  estado.erroInsert = Object.assign(new Error('dup'), { code: '23505' });
  assert.equal((await api.post(`${B}/caixas`, { codigo: 'AC-000123', colaboradorId: 1 })).status, 409, 'caixa já aberta por outro operador');

  zerar(REGISTRO);
  assert.notEqual((await api.post(`${B}/caixas`, { codigo: 'AC-000123', colaboradorId: 1 })).status, 201, 'não abre caixa que já está aberta');
  assert.equal(chamou(/INSERT INTO painel\.op_caixa_registro/i).length, 0);
});

test('CA4: o segundo bip da mesma caixa conclui com a duração; bip repetido em até 3 s é duplicado; caixa concluída avisa', async () => {
  zerar({ id: 7, inicio_em: antes(125) });
  const fim = await api.post(`${B}/bip`, { codigo: 'AC-000123' });
  assert.equal(fim.status, 200, fim.texto);
  assert.equal(fim.json.data.acao, 'finalizar');
  assert.equal(fim.json.data.duracaoS, 125);
  assert.equal(fim.json.data.registro.status, 'concluida');
  const up = chamou(/UPDATE painel\.op_caixa_registro/i)[0];
  assert.ok(up, 'nenhum UPDATE');
  for (const v of [7, 125, 'concluida']) assert.ok(up.params.includes(v), `parâmetro ${v} ausente`);

  zerar({ id: 7, inicio_em: antes(2) });
  const dup = await api.post(`${B}/bip`, { codigo: 'AC-000123' });
  assert.equal(dup.status, 200);
  assert.equal(dup.json.data.acao, 'duplicado');
  assert.equal(chamou(/UPDATE painel\.op_caixa_registro/i).length, 0);

  zerar(null, { id: 7, status: 'concluida', fim_em: antes(600) });
  const ja = await api.post(`${B}/bip`, { codigo: 'AC-000123' });
  assert.equal(ja.json.data.acao, 'ja_concluida');
  assert.equal(chamou(/UPDATE painel\.op_caixa_registro/i).length, 0);
});

test('CA5: GET /estado lista as caixas abertas do turno (vários operadores) com nome e início, e a hora do servidor', async () => {
  zerar();
  const r = await api.get(`${B}/estado`);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.data.agora, AGORA.toISOString());
  assert.equal(r.json.data.abertas.length, 2);
  assert.deepEqual(r.json.data.abertas.map((c) => [c.codigo, c.colaboradorNome]), [['AC-000200', 'Bruno'], ['AC-000201', 'Ana']]);
  assert.equal(r.json.data.abertas[0].inicioEm, antes(60));
  const q = chamou(/JOIN painel\.op_colaborador/i)[0];
  assert.ok(q.params.includes(8), 'filtra pelo turno');
});
