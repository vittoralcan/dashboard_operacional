// Correções do supervisor: router isolado, banco simulado, conta de turno (com turno resolvido) e admin.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { BACK, requireBack, subir, bancoSimulado } = require('./_helpers/http');

const express = requireBack('express');
const { criarCorrecoesRouter } = require(path.join(BACK, 'src/operacional/correcoes'));

const AGORA = new Date('2026-10-20T13:00:00.000Z');
const antes = (s) => new Date(AGORA.getTime() - s * 1000).toISOString();
const base = { turno_id: 8, mesa_id: null, etapa: 'higienizacao', criado_por: 30, atualizado_por: null, atualizado_em: null };
const REG = {
  7: { ...base, id: 7, projeto_id: 5, colaborador_id: 1, codigo: 'AC-000123', status: 'concluida', inicio_em: antes(900), fim_em: antes(600), duracao_s: 300 },
  8: { ...base, id: 8, projeto_id: 5, colaborador_id: 1, codigo: 'AC-000124', status: 'aberta', inicio_em: antes(600), fim_em: null, duracao_s: null },
  9: { ...base, id: 9, projeto_id: 6, colaborador_id: 9, codigo: 'XX-000001', status: 'concluida', inicio_em: antes(900), fim_em: antes(600), duracao_s: 300 },
};
const COLAB = { 1: 5, 2: 5, 3: 6 }; // colaborador -> projeto

const db = bancoSimulado([
  [/^\s*(UPDATE painel\.op_pausa|SELECT\s+COALESCE\(SUM)/i, () => ({ rows: [{ pausado_s: 0 }] })],
  [/INSERT INTO painel\.auditoria/i, () => ({ rows: [] })],
  [/UPDATE painel\.op_caixa_registro/i, () => ({ rows: [{ ...REG[7], colaborador_id: 2 }] })],
  [/DELETE FROM painel\.op_caixa_registro/i, () => ({ rows: [REG[7]], rowCount: 1 })],
  [/FROM painel\.op_colaborador/i, (p) => ({ rows: COLAB[p[0]] === p[1] ? [{ id: p[0], projeto_id: p[1] }] : [] })],
  [/FROM painel\.op_caixa_registro/i, (p, sql) => {
    if (/ORDER BY/i.test(sql)) return { rows: [{ ...REG[8], colaborador_nome: 'Bruno' }] };
    const r = REG[p[0]];
    return { rows: r && (p.length < 2 || r.projeto_id === p[1]) ? [r] : [] };
  }],
]);

let turno; let admin;
before(async () => {
  turno = await subir((app) => {
    app.use('/api/operacional/correcoes', express.json(), (req, _res, next) => { req.turno = { id: 8, projetoId: 5, nome: 'Matutino 1' }; next(); }, criarCorrecoesRouter({ dbPainel: db, agora: () => AGORA }));
  }, { id: 30, login: 'turno-a', tipo: 'turno' });
  admin = await subir((app) => {
    app.use('/api/operacional/correcoes', express.json(), criarCorrecoesRouter({ dbPainel: db, agora: () => AGORA }));
  }, { id: 1, login: 'chefe', tipo: 'admin' });
});
after(async () => { await turno.fechar(); await admin.fechar(); });
const B = '/operacional/correcoes';
const chamou = (re) => db.chamadas.filter((c) => re.test(c.sql));
const audit = () => chamou(/INSERT INTO painel\.auditoria/i).map((c) => ({ acao: c.params[2], alvo: c.params[3], detalhe: JSON.parse(c.params[5] ?? 'null') }));
const zerar = () => { db.chamadas.length = 0; };

test('CA1: PATCH /caixas/:id/colaborador troca o colaborador, grava quem corrigiu e audita antes/depois', async () => {
  zerar();
  const r = await turno.patch(`${B}/caixas/7/colaborador`, { colaboradorId: 2 });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.success, true);
  assert.equal(r.json.data.colaboradorId, 2);
  const up = chamou(/UPDATE painel\.op_caixa_registro/i)[0];
  assert.ok(up, 'nenhum UPDATE');
  for (const v of [2, 7, 30]) assert.ok(up.params.includes(v), `parâmetro ${v} ausente (atualizado_por = 30)`);
  const a = audit();
  assert.equal(a.length, 1);
  assert.equal(a[0].acao, 'caixa.trocar_colaborador');
  assert.equal(a[0].alvo, 'op_caixa_registro:7');
  assert.ok(a[0].detalhe.antes && a[0].detalhe.depois, 'detalhe com antes e depois');

  zerar();
  const outro = await turno.patch(`${B}/caixas/7/colaborador`, { colaboradorId: 3 });
  assert.equal(outro.status, 400, 'colaborador de outro projeto');
  assert.equal((await turno.patch(`${B}/caixas/7/colaborador`, {})).status, 400);
  assert.equal(chamou(/UPDATE painel\.op_caixa_registro/i).length, 0);
});

test('CA2: PATCH /caixas/:id/horario ajusta início e fim, recalcula a duração e recusa horários impossíveis', async () => {
  zerar();
  const ok = await turno.patch(`${B}/caixas/7/horario`, { inicioEm: '2026-10-20T09:00:00.000Z', fimEm: '2026-10-20T09:05:00.000Z' });
  assert.equal(ok.status, 200, ok.texto);
  const up = chamou(/UPDATE painel\.op_caixa_registro/i)[0];
  assert.ok(up, 'nenhum UPDATE');
  for (const v of [300, 7]) assert.ok(up.params.includes(v), `parâmetro ${v} ausente`);
  assert.ok(up.params.some((p) => new Date(p).getTime() === Date.parse('2026-10-20T09:00:00.000Z')), 'início como parâmetro');
  assert.equal(audit()[0].acao, 'caixa.ajustar_horario');

  for (const corpo of [
    { inicioEm: '2026-10-20T09:05:00.000Z', fimEm: '2026-10-20T09:00:00.000Z' },
    { inicioEm: 'ontem', fimEm: '2026-10-20T09:00:00.000Z' },
    { inicioEm: '2026-10-21T09:00:00.000Z', fimEm: '2026-10-21T09:05:00.000Z' },
    {},
  ]) {
    zerar();
    const r = await turno.patch(`${B}/caixas/7/horario`, corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.equal(chamou(/UPDATE painel\.op_caixa_registro/i).length, 0);
  }
  zerar();
  const aberta = await turno.patch(`${B}/caixas/8/horario`, { inicioEm: '2026-10-20T09:00:00.000Z', fimEm: '2026-10-20T09:05:00.000Z' });
  assert.equal(aberta.status, 400, 'caixa aberta não tem fim: use fechar');
});

test('CA3: POST /caixas/:id/fechar conclui (com duração) ou cancela uma caixa aberta; fechada não fecha de novo', async () => {
  zerar();
  const c = await turno.post(`${B}/caixas/8/fechar`, { resultado: 'concluida' });
  assert.equal(c.status, 200, c.texto);
  const up = chamou(/UPDATE painel\.op_caixa_registro/i)[0];
  for (const v of ['concluida', 600, 8]) assert.ok(up.params.includes(v), `parâmetro ${v} ausente`);
  assert.equal(audit()[0].acao, 'caixa.fechar');

  zerar();
  const x = await turno.post(`${B}/caixas/8/fechar`, { resultado: 'cancelada' });
  assert.equal(x.status, 200, x.texto);
  assert.ok(chamou(/UPDATE painel\.op_caixa_registro/i)[0].params.includes('cancelada'));

  zerar();
  assert.equal((await turno.post(`${B}/caixas/7/fechar`, { resultado: 'concluida' })).status, 409);
  assert.equal((await turno.post(`${B}/caixas/8/fechar`, { resultado: 'talvez' })).status, 400);
  assert.equal(chamou(/UPDATE painel\.op_caixa_registro/i).length, 0);
});

test('CA4: DELETE /caixas/:id exclui o lançamento e guarda o registro apagado na auditoria', async () => {
  zerar();
  const r = await turno.delete(`${B}/caixas/7`);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.success, true);
  const del = chamou(/DELETE FROM painel\.op_caixa_registro/i)[0];
  assert.ok(del && del.params.includes(7));
  const a = audit();
  assert.equal(a.length, 1);
  assert.equal(a[0].acao, 'caixa.excluir');
  assert.equal(a[0].alvo, 'op_caixa_registro:7');
  assert.equal(a[0].detalhe.antes.codigo, 'AC-000123');
  assert.equal((await turno.delete(`${B}/caixas/abc`)).status, 400);
});

test('CA5: conta de turno só enxerga e corrige caixas do próprio projeto; admin corrige qualquer uma; GET /caixas filtra', async () => {
  zerar();
  const alheia = await turno.delete(`${B}/caixas/9`);
  assert.equal(alheia.status, 404);
  assert.equal(chamou(/DELETE FROM painel\.op_caixa_registro/i).length, 0);

  zerar();
  const adm = await admin.delete(`${B}/caixas/9`);
  assert.equal(adm.status, 200, adm.texto);
  assert.equal(chamou(/DELETE FROM painel\.op_caixa_registro/i).length, 1);

  zerar();
  const lista = await turno.get(`${B}/caixas?status=aberta`);
  assert.equal(lista.status, 200, lista.texto);
  assert.equal(lista.json.data[0].colaboradorNome, 'Bruno');
  assert.equal(lista.json.data[0].inicioEm, REG[8].inicio_em);
  const q = chamou(/FROM painel\.op_caixa_registro/i)[0];
  assert.ok(q.params.includes(5) && q.params.includes('aberta'), 'filtra por projeto do turno e por status, como parâmetros');
  assert.equal((await turno.get(`${B}/caixas?status=qualquer`)).status, 400);
});
