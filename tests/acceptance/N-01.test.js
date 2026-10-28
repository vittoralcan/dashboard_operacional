// Pausa, digitalização e edição do código da caixa. Routers isolados com banco simulado.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { BACK, requireBack, subir, bancoSimulado } = require('./_helpers/http');

const express = requireBack('express');
const { criarTerminalRouter } = require(path.join(BACK, 'src/operacional/terminal'));
const { criarCorrecoesRouter } = require(path.join(BACK, 'src/operacional/correcoes'));
const { momentoDaVirada } = require(path.join(BACK, 'src/operacional/pausa'));

const AGORA = new Date('2026-10-20T15:00:00.000Z'); // 12h em São Paulo
const TURNO = { id: 8, projetoId: 5, nome: 'Equipe 1' };
const antes = (s) => new Date(AGORA.getTime() - s * 1000).toISOString();
const REG = { id: 11, projeto_id: 5, turno_id: 8, colaborador_id: 1, mesa_id: null, etapa: 'digitalizacao', codigo: 'CX-1', status: 'aberta', inicio_em: antes(600), fim_em: null, duracao_s: null };
const e = { ocupado: [], reg: REG, pausado: 0, pausaAberta: false, projeto: { id: 5, codigo_regex: null }, dupe: [], estado: [], ocupadoReabrir: [] };

const db = bancoSimulado([
  // /estado e a conferência de colaborador ocupado da reabertura: SELECTs com JOIN em op_colaborador.
  [/JOIN painel\.op_colaborador c ON c\.id = r\.colaborador_id\s+WHERE r\.turno_id/i, () => ({ rows: e.estado })],
  [/JOIN painel\.op_colaborador c ON c\.id = r\.colaborador_id\s+WHERE r\.colaborador_id/i, () => ({ rows: e.ocupadoReabrir })],
  [/WITH reaberta AS/i, () => ({ rows: [{ ...e.reg, status: 'aberta', fim_em: null, duracao_s: null, fim_solicitado_em: null }] })],
  [/^\s*UPDATE painel\.op_pausa SET fim_em = \$1, auto_encerrada/i, () => ({ rows: [] })],
  [/^\s*UPDATE painel\.op_pausa SET fim_em = \$2/i, () => ({ rows: e.pausaAberta ? [{ id: 1 }] : [], rowCount: e.pausaAberta ? 1 : 0 })],
  [/^\s*SELECT\s+COALESCE\(SUM/i, () => ({ rows: [{ pausado_s: e.pausado }] })],
  [/INSERT INTO painel\.op_pausa/i, () => {
    if (e.pausaAberta) { const x = new Error('dup'); x.code = '23505'; throw x; }
    return { rows: [{ id: 1, inicio_em: AGORA.toISOString() }] };
  }],
  [/INSERT INTO painel\.auditoria/i, () => ({ rows: [] })],
  [/UPDATE painel\.op_caixa_registro SET fim_solicitado_em = COALESCE/i, (p) => ({ rows: [{ fim_solicitado_em: e.reg.fim_solicitado_em ?? p[1] }] })],
  [/UPDATE painel\.op_caixa_registro SET fim_solicitado_em = NULL/i, () => ({ rows: [] })],
  [/UPDATE painel\.op_caixa_registro SET codigo/i, (p) => ({ rows: [{ ...e.reg, codigo: p[0] }] })],
  [/UPDATE painel\.op_caixa_registro/i, (p) => ({ rows: [{ ...e.reg, status: 'concluida', duracao_s: p[1], imagens: p[4], grampo: p[5], deteriorado: p[6] }] })],
  [/WHERE colaborador_id = \$1 AND status = 'aberta'/i, () => ({ rows: e.ocupado })],
  [/FROM painel\.op_colaborador/i, () => ({ rows: [{ id: 1 }] })],
  [/FROM painel\.op_projeto/i, () => ({ rows: [e.projeto] })],
  [/id <> \$3/i, () => ({ rows: e.dupe })],
  [/FROM painel\.op_caixa_registro/i, (_p, sql) => ({ rows: /status\s*=\s*'aberta'/i.test(sql) && e.reg.status !== 'aberta' ? [] : [e.reg] })],
]);

let api;
before(async () => {
  api = await subir((app) => {
    app.use('/api/operacional/terminal', express.json(), (req, _res, next) => { req.turno = TURNO; next(); }, criarTerminalRouter({ dbPainel: db, agora: () => AGORA }));
    app.use('/api/operacional/correcoes', express.json(), criarCorrecoesRouter({ dbPainel: db, agora: () => AGORA }));
  }, { id: 30, login: 'equipe-1', tipo: 'turno' });
});
after(() => api.fechar());
const T = '/operacional/terminal';
const C = '/operacional/correcoes';
const zerar = (extra = {}) => { db.chamadas.length = 0; Object.assign(e, { ocupado: [], reg: REG, pausado: 0, pausaAberta: false, projeto: { id: 5, codigo_regex: null }, dupe: [], estado: [], ocupadoReabrir: [] }, extra); };

test('CA1: pausar cria a pausa; pausar de novo dá 409; retomar sem pausa dá 409', async () => {
  zerar();
  const p = await api.post(`${T}/caixas/11/pausar`);
  assert.equal(p.status, 201, p.texto);
  assert.equal(p.json.data.pausada, true);
  zerar({ pausaAberta: true });
  assert.equal((await api.post(`${T}/caixas/11/pausar`)).status, 409);
  const r = await api.post(`${T}/caixas/11/retomar`);
  assert.equal(r.status, 200, r.texto);
  zerar({ pausaAberta: false });
  assert.equal((await api.post(`${T}/caixas/11/retomar`)).status, 409);
});

test('CA2: o tempo pausado sai da duração ao concluir (higienização)', async () => {
  zerar({ reg: { ...REG, etapa: 'higienizacao' }, pausado: 3600 });
  const r = await api.post(`${T}/bip`, { codigo: 'CX-1', etapa: 'higienizacao' });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.data.acao, 'finalizar');
  assert.equal(r.json.data.duracaoS, 0, 'bruta 600 s menos 3600 s pausados, mínimo 0');
  zerar({ reg: { ...REG, etapa: 'higienizacao', inicio_em: antes(5400) }, pausado: 3600 });
  const r2 = await api.post(`${T}/bip`, { codigo: 'CX-1', etapa: 'higienizacao' });
  assert.equal(r2.json.data.duracaoS, 1800);
});

test('CA3: na digitalização o segundo bip só avisa; concluir exige imagens e grava as ocorrências', async () => {
  zerar();
  const bip = await api.post(`${T}/bip`, { codigo: 'CX-1', etapa: 'digitalizacao' });
  assert.equal(bip.json.data.acao, 'finalizar_pendente');
  assert.equal(db.chamadas.filter((c) => /^\s*UPDATE painel\.op_caixa_registro/i.test(c.sql) && !/fim_solicitado_em/.test(c.sql)).length, 0, 'o bip só para o relógio, não conclui');
  assert.equal((await api.post(`${T}/caixas/11/concluir`, { grampo: true })).status, 400);
  assert.equal((await api.post(`${T}/caixas/11/concluir`, { imagens: 0 })).status, 400);
  assert.equal((await api.post(`${T}/caixas/11/concluir`, { imagens: 10, grampo: 'sim' })).status, 400);
  const ok = await api.post(`${T}/caixas/11/concluir`, { imagens: 480, grampo: true, deteriorado: false });
  assert.equal(ok.status, 200, ok.texto);
  assert.equal(ok.json.data.registro.imagens, 480);
  assert.equal(ok.json.data.registro.grampo, true);
  assert.equal(ok.json.data.registro.deteriorado, false);
  zerar({ reg: { ...REG, etapa: 'higienizacao' } });
  assert.equal((await api.post(`${T}/caixas/11/concluir`, { imagens: 5 })).status, 400, 'só digitalização');
});

test('CA4: momentoDaVirada devolve 07h ou 19h de São Paulo já ocorridas', () => {
  assert.equal(momentoDaVirada(new Date('2026-10-20T15:00:00Z')).toISOString(), '2026-10-20T10:00:00.000Z');
  assert.equal(momentoDaVirada(new Date('2026-10-20T23:00:00Z')).toISOString(), '2026-10-20T22:00:00.000Z');
  assert.equal(momentoDaVirada(new Date('2026-10-20T05:00:00Z')).toISOString(), '2026-10-19T22:00:00.000Z');
  assert.notEqual(momentoDaVirada(new Date('2026-10-20T09:00:00Z')).toISOString(), '2026-10-20T10:00:00.000Z');
});

test('CA5: editar o código valida o formato, bloqueia duplicata aberta (em qualquer etapa) e audita', async () => {
  zerar({ projeto: { id: 5, codigo_regex: '[A-Z]{2}-\\d{3}' } });
  assert.equal((await api.patch(`${C}/caixas/11/codigo`, { codigo: 'zzz' })).status, 400);
  assert.equal((await api.patch(`${C}/caixas/11/codigo`, { codigo: 'CX-1' })).status, 400, 'igual ao atual');
  zerar({ dupe: [{ id: 99 }] });
  assert.equal((await api.patch(`${C}/caixas/11/codigo`, { codigo: 'CX-2' })).status, 409);
  zerar();
  const ok = await api.patch(`${C}/caixas/11/codigo`, { codigo: '  CX-2 ' });
  assert.equal(ok.status, 200, ok.texto);
  assert.equal(ok.json.data.codigo, 'CX-2');
  const aud = db.chamadas.find((c) => /INSERT INTO painel\.auditoria/i.test(c.sql));
  assert.ok(aud && aud.params.includes('caixa.editar_codigo'));
});

test('CA6: colaborador com caixa em andamento não inicia outra (terminal e troca em correções)', async () => {
  zerar({ ocupado: [{ codigo: 'CX-9' }], reg: { ...REG, status: 'cancelada' } });
  const r = await api.post(`${T}/caixas`, { codigo: 'CX-NOVA', colaboradorId: 1, etapa: 'higienizacao' });
  assert.equal(r.status, 409, r.texto);
  assert.match(r.json.message, /CX-9/);
  assert.equal(db.chamadas.filter((c) => /INSERT INTO painel\.op_caixa_registro/i.test(c.sql)).length, 0);
  zerar({ ocupado: [{ codigo: 'CX-9' }] });
  const t = await api.patch(`${C}/caixas/11/colaborador`, { colaboradorId: 2 });
  assert.equal(t.status, 409, t.texto);
});

test('CA7: o bip acha a caixa aberta em qualquer etapa; não conclui a de outro grupo de telas', async () => {
  // Tela de higienização/remontagem com seletor em "remontagem" e a caixa aberta em "higienizacao": conclui a aberta.
  zerar({ reg: { ...REG, etapa: 'higienizacao', inicio_em: antes(900) } });
  const a = await api.post(`${T}/bip`, { codigo: 'CX-1', etapa: 'remontagem' });
  assert.equal(a.json.data.acao, 'finalizar', a.texto);
  // Tela de higienização bipando caixa aberta em digitalização: avisa, não conclui nem inicia.
  zerar({ reg: { ...REG, etapa: 'digitalizacao', inicio_em: antes(900) } });
  const b = await api.post(`${T}/bip`, { codigo: 'CX-1', etapa: 'higienizacao' });
  assert.equal(b.json.data.acao, 'outra_etapa');
  assert.equal(b.json.data.etapa, 'digitalizacao');
  assert.equal(db.chamadas.filter((c) => /UPDATE painel\.op_caixa_registro/i.test(c.sql)).length, 0);
  // E o contrário: digitalização bipando caixa aberta em higienização.
  zerar({ reg: { ...REG, etapa: 'higienizacao', inicio_em: antes(900) } });
  const c = await api.post(`${T}/bip`, { codigo: 'CX-1', etapa: 'digitalizacao' });
  assert.equal(c.json.data.acao, 'outra_etapa');
  // Iniciar caixa que está aberta em outra etapa também é recusado.
  zerar({ reg: { ...REG, etapa: 'higienizacao', inicio_em: antes(900) } });
  const d = await api.post(`${T}/caixas`, { codigo: 'CX-1', colaboradorId: 1, etapa: 'remontagem' });
  assert.equal(d.status, 409, d.texto);
});

test('CA8: o relógio da digitalização para no bip/Concluir e a duração usa esse instante, não o da confirmação', async () => {
  // 2º bip às 15:00 (AGORA): fica gravado; o painel de imagens demora, mas o fim gravado continua sendo o do bip.
  zerar({ reg: { ...REG, inicio_em: antes(1800) } });
  const bip = await api.post(`${T}/bip`, { codigo: 'CX-1', etapa: 'digitalizacao' });
  assert.equal(bip.json.data.acao, 'finalizar_pendente');
  assert.equal(bip.json.data.fimSolicitadoEm, AGORA.toISOString());
  const parada = db.chamadas.find((c) => /fim_solicitado_em = COALESCE/i.test(c.sql));
  assert.ok(parada, 'o bip grava o instante em que parou');
  // Concluir 10 minutos depois (relógio do servidor mais tarde), mas com o fim já solicitado há 600 s.
  zerar({ reg: { ...REG, inicio_em: antes(1800), fim_solicitado_em: antes(600) } });
  const ok = await api.post(`${T}/caixas/11/concluir`, { imagens: 100 });
  assert.equal(ok.status, 200, ok.texto);
  const up = db.chamadas.find((c) => /status = \$8/.test(c.sql));
  assert.equal(new Date(up.params[0]).toISOString(), antes(600), 'fim_em = instante em que parou');
  assert.equal(up.params[1], 1200, 'duração = 1800 s - 600 s = 1200 s (sem o tempo digitando as imagens)');
  // O botão Concluir (sem bip) também para o relógio; cancelar o painel o liga de novo.
  zerar();
  assert.equal((await api.post(`${T}/caixas/11/encerrando`)).status, 200);
  assert.ok(db.chamadas.some((c) => /fim_solicitado_em = COALESCE/i.test(c.sql)));
  zerar();
  assert.equal((await api.delete(`${T}/caixas/11/encerrando`)).status, 200);
  assert.ok(db.chamadas.some((c) => /fim_solicitado_em = NULL/i.test(c.sql)));
});

// --- Onda 14: D1 (id bigint chega como texto do driver `pg`) e D2 (reabrir caixa) ---

test('CA9 (D1): o id vem do banco como texto ("42") e o terminal devolve número', async () => {
  const aberta = { id: '42', codigo: 'CX-1', colaborador_id: 1, colaborador_nome: 'Ana', mesa_id: null, etapa: 'higienizacao', inicio_em: antes(300), fim_solicitado_em: null, pausado_s: 0, pausa_inicio_em: null, pausa_automatica: false };
  zerar({ estado: [aberta] });
  const r = await api.get(`${T}/estado`);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.data.abertas[0].id, 42);
  assert.equal(typeof r.json.data.abertas[0].id, 'number');
  // concluir também devolve o registro com id numérico
  zerar({ reg: { ...REG, id: '11', etapa: 'higienizacao', inicio_em: antes(900) } });
  const b = await api.post(`${T}/bip`, { codigo: 'CX-1', etapa: 'higienizacao' });
  assert.equal(b.json.data.acao, 'finalizar', b.texto);
  assert.equal(b.json.data.registro.id, 11);
});

test('CA10 (D1): colaborador ocupado diz qual caixa, em que etapa e desde quando', async () => {
  const inicio = antes(1800);
  zerar({ ocupado: [{ codigo: 'CX-9', etapa: 'digitalizacao', inicio_em: inicio }], reg: { ...REG, status: 'cancelada' } });
  const r = await api.post(`${T}/caixas`, { codigo: 'CX-NOVA', colaboradorId: 1, etapa: 'higienizacao' });
  assert.equal(r.status, 409, r.texto);
  assert.equal(r.json.motivo, 'colaborador_ocupado');
  assert.deepEqual(r.json.ocupadoCom, { codigo: 'CX-9', etapa: 'digitalizacao', inicioEm: inicio });
});

test('CA11 (D2): reabrir devolve a caixa a "aberta" e o intervalo vira pausa; auditoria registrada', async () => {
  const fim = antes(120);
  zerar({ reg: { ...REG, status: 'concluida', fim_em: fim, duracao_s: 480 } });
  const r = await api.post(`${C}/caixas/11/reabrir`);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.data.status, 'aberta');
  assert.equal(r.json.data.fimEm, null);
  assert.equal(r.json.data.duracaoS, null);
  const cte = db.chamadas.find((c) => /WITH reaberta AS/i.test(c.sql));
  assert.equal(new Date(cte.params[0]).toISOString(), fim, 'a pausa começa no fechamento errado');
  assert.equal(cte.params[1], AGORA.toISOString(), 'e termina agora');
  assert.match(cte.sql, /INSERT INTO painel\.op_pausa/);
  const aud = db.chamadas.find((c) => /INSERT INTO painel\.auditoria/i.test(c.sql));
  assert.ok(aud && aud.params.includes('caixa.reabrir'));
});

test('CA12 (D2): reabrir recusa caixa já aberta, caixa bipada de novo e colaborador ocupado', async () => {
  zerar(); // REG está aberta
  assert.equal((await api.post(`${C}/caixas/11/reabrir`)).status, 409);
  assert.equal(db.chamadas.filter((c) => /WITH reaberta AS/i.test(c.sql)).length, 0);
  zerar({ reg: { ...REG, status: 'concluida', fim_em: antes(60), duracao_s: 540 }, dupe: [{ id: 99 }] });
  const dup = await api.post(`${C}/caixas/11/reabrir`);
  assert.equal(dup.status, 409);
  assert.match(dup.json.message, /bipada de novo/);
  zerar({ reg: { ...REG, status: 'concluida', fim_em: antes(60), duracao_s: 540 }, ocupadoReabrir: [{ codigo: 'CX-9', nome: 'Ana' }] });
  const oc = await api.post(`${C}/caixas/11/reabrir`);
  assert.equal(oc.status, 409);
  assert.match(oc.json.message, /Ana.*CX-9/);
  assert.equal(db.chamadas.filter((c) => /WITH reaberta AS/i.test(c.sql)).length, 0, 'nada é gravado quando há bloqueio');
});
