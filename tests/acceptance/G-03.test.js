// Gargalo por vazão entre retratos (RF-51, RF-53 a RF-55): função pura, validação do manifesto e ligação com o banco.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const FV = path.resolve(__dirname, '../../services/back_dashboard/src/modules/base/flow-viewer');
const { calcularGargalo, montarRetratos } = require(path.join(FV, 'gargalo'));
const { validarConfig } = require(path.join(FV, 'config'));
const { criarFlowViewer } = require(path.join(FV, 'index'));

const ANTES = '2026-10-20T10:00:00.000Z';
const DEPOIS = '2026-10-20T22:00:00.000Z';
const FASES = [
  { fasId: 1, nome: 'Importação', tipo: 'entrada', pastas: 50, imagens: 5000 },
  { fasId: 2, nome: 'Validação', tipo: 'processo', pastas: 120, imagens: 12000 },
  { fasId: 3, nome: 'Indexação', tipo: 'processo', pastas: 30, imagens: 3000 },
  { fasId: 4, nome: 'Suspenso', tipo: 'erro', pastas: 5, imagens: 500 },
  { fasId: 5, nome: 'Finalizado', tipo: 'terminal', pastas: 0, imagens: 0 },
];
const linha = (fasId, estoquePastas, finalizadasTotal, suspensas = 0) => ({ fasId, estoquePastas, estoqueImagens: estoquePastas * 100, finalizadasTotal, suspensas });
// retratos: { anteriorEm, atualEm, anterior: [...], atual: [...] }
const retratos = ({ f2 = [100, 100], f2susp = 0, f2estoque = 120, f3 = [200, 260], f1 = [10, 10] } = {}) => ({
  anteriorEm: ANTES,
  atualEm: DEPOIS,
  anterior: [linha(1, 40, f1[0]), linha(2, 100, f2[0]), linha(3, 40, f3[0]), linha(4, 5, 0, 5), linha(5, 0, 900)],
  atual: [linha(1, 50, f1[1]), linha(2, f2estoque, f2[1], f2susp), linha(3, 30, f3[1]), linha(4, 5, 0, 5), linha(5, 0, 960)],
});

test('CA1: com volume e vazão nula entre os retratos a fase é o gargalo; fase de entrada só vale se nenhuma de processo valer', () => {
  const r = calcularGargalo(FASES, {}, retratos());
  assert.equal(r.gargalo.fasId, 2);
  assert.equal(r.gargalo.nome, 'Validação');
  assert.equal(r.gargalo.pastas, 120);
  assert.equal(r.gargalo.vazao, 0);
  assert.equal(typeof r.gargalo.pctParadas, 'number');
  assert.deepEqual(r.vazao, { disponivel: true, anteriorEm: ANTES, atualEm: DEPOIS });
  // a entrada (fase 1) também está sem vazão, mas a fase de processo tem prioridade
  const soEntrada = calcularGargalo(FASES, {}, retratos({ f2: [100, 160], f1: [10, 10] }));
  assert.equal(soEntrada.gargalo.fasId, 1, 'sem candidata de processo, a entrada parada é o gargalo');
  const fluindo = calcularGargalo(FASES, {}, retratos({ f2: [100, 160], f1: [10, 40] }));
  assert.equal(fluindo.gargalo, null, 'todas as fases com saída entre os turnos: sem gargalo');
});

test('CA2: vazão muito baixa (até vazaoMinPct do estoque) também é gargalo; acima disso não; parâmetros do manifesto sobrescrevem', () => {
  assert.equal(calcularGargalo(FASES, {}, retratos({ f2: [100, 106], f1: [10, 40] })).gargalo.fasId, 2, '6 de 120 = 5%: no limite');
  assert.equal(calcularGargalo(FASES, {}, retratos({ f2: [100, 107], f1: [10, 40] })).gargalo, null, '7 de 120 passa de 5%');
  assert.equal(calcularGargalo(FASES, { vazaoMinPct: 0.1 }, retratos({ f2: [100, 107], f1: [10, 40] })).gargalo.fasId, 2);
  assert.equal(calcularGargalo(FASES, { minEstoque: 200 }, retratos()).gargalo, null, 'estoque abaixo do mínimo não é volume');
  assert.equal(calcularGargalo(FASES, {}, retratos()).regra.vazaoMinPct, 0.05, 'padrão provisório do critério (suposição 7)');
  assert.equal(calcularGargalo(FASES, {}, retratos()).regra.minEstoque, 5);
});

test('CA3: pastas suspensas não contam como volume parado (RF-55); sem dois retratos não há gargalo por vazão', () => {
  assert.equal(calcularGargalo(FASES, {}, retratos({ f2susp: 118, f1: [10, 40] })).gargalo, null, '120 - 118 = 2 pastas efetivas, abaixo do mínimo');
  for (const sem of [null, undefined]) {
    const r = calcularGargalo(FASES, {}, sem);
    assert.equal(r.gargalo, null);
    assert.equal(r.vazao.disponivel, false);
  }
  const fasePresenteSoNoAtual = retratos();
  fasePresenteSoNoAtual.anterior = fasePresenteSoNoAtual.anterior.filter((l) => l.fasId !== 2);
  assert.notEqual(calcularGargalo(FASES, {}, fasePresenteSoNoAtual).gargalo?.fasId, 2, 'fase sem retrato anterior não tem vazão calculável');
});

test('CA4: o critério antigo por volume continua calculado, em separado, como "altoVolume"', () => {
  const r = calcularGargalo(FASES, {}, retratos({ f2: [100, 160], f1: [10, 40] }));
  assert.equal(r.gargalo, null);
  assert.equal(r.altoVolume.fasId, 2);
  assert.equal(r.altoVolume.pastas, 120);
  assert.equal(calcularGargalo(FASES, {}, null).altoVolume.fasId, 2, 'não depende dos retratos');
  const calmo = calcularGargalo(FASES.map((f) => ({ ...f, pastas: Math.min(f.pastas, 10) })), {}, null);
  assert.equal(calmo.altoVolume, null);
});

test('CA5: montarRetratos usa os dois momentos mais recentes; os parâmetros novos do manifesto são validados', () => {
  const rows = [
    { fas_id: 2, momento: '2026-10-20T22:00:00.000Z', estoque_pastas: 120, estoque_imagens: 12000, finalizadas_total: 100, suspensas: 0 },
    { fas_id: 2, momento: '2026-10-20T10:00:00.000Z', estoque_pastas: 100, estoque_imagens: 10000, finalizadas_total: 100, suspensas: 0 },
    { fas_id: 3, momento: new Date('2026-10-20T22:00:00.000Z'), estoque_pastas: 30, estoque_imagens: 3000, finalizadas_total: 260, suspensas: 0 },
  ];
  const r = montarRetratos(rows);
  assert.equal(new Date(r.anteriorEm).toISOString(), ANTES);
  assert.equal(new Date(r.atualEm).toISOString(), DEPOIS);
  assert.deepEqual(r.anterior, [linha(2, 100, 100)]);
  assert.deepEqual(r.atual.map((l) => l.fasId).sort(), [2, 3]);
  assert.equal(montarRetratos([rows[0]]), null, 'um só momento: sem comparação');
  assert.equal(montarRetratos([]), null);

  const cfg = (gargalo) => ({ fonte: 'atlas', fluId: 4, fases: FASES.map(({ fasId, nome, tipo }) => ({ fasId, nome, tipo })), faseFinal: 5, kpiFases: [5], gargalo });
  assert.equal(validarConfig(cfg({ vazaoMinPct: 0.1, minEstoque: 10 }), 'x').gargalo.vazaoMinPct, 0.1);
  assert.throws(() => validarConfig(cfg({ vazaoMinPct: 'muito' }), 'x'), /vazaoMinPct/);
  assert.throws(() => validarConfig(cfg({ vazaoMinPct: 1.5 }), 'x'), /vazaoMinPct/);
  assert.throws(() => validarConfig(cfg({ minEstoque: 'x' }), 'x'), /minEstoque/);
});

test('CA6: buscarGargaloAtual cruza o estoque do espelho com os retratos de painel.snapshot_fase da instância; sem painel ou com falha, só não há vazão', async () => {
  const config = { fonte: 'atlas', fluId: 4, fases: FASES.map(({ fasId, nome, tipo }) => ({ fasId, nome, tipo })), faseFinal: 5, kpiFases: [5] };
  const db = { async query() { return { rows: FASES.map((f) => ({ fas_id: f.fasId, pastas: f.pastas, imagens: f.imagens })) }; } };
  const r0 = retratos();
  const paraLinhas = (momento, lista) => lista.map((l) => ({ fas_id: l.fasId, momento, estoque_pastas: l.estoquePastas, estoque_imagens: l.estoqueImagens, finalizadas_total: l.finalizadasTotal, suspensas: l.suspensas }));
  const chamadas = [];
  const dbPainel = { async query(sql, params) { chamadas.push({ sql, params }); return { rows: [...paraLinhas(DEPOIS, r0.atual), ...paraLinhas(ANTES, r0.anterior)] }; } };

  const com = await criarFlowViewer(config, { db, dbPainel, instanceId: 'negativos', projectId: 'atlas' }).buscarGargaloAtual();
  assert.equal(com.gargalo.fasId, 2);
  assert.equal(com.altoVolume.fasId, 2);
  const q = chamadas.find((c) => /snapshot_fase/i.test(c.sql));
  assert.ok(q, 'consulta a painel.snapshot_fase');
  assert.deepEqual(q.params.slice(0, 2), ['atlas', 'negativos'], 'projeto e instância como parâmetros');

  const sem = await criarFlowViewer(config, { db, instanceId: 'negativos', projectId: 'atlas' }).buscarGargaloAtual();
  assert.equal(sem.gargalo, null);
  assert.equal(sem.vazao.disponivel, false);
  assert.equal(sem.altoVolume.fasId, 2);

  const quebrado = { async query() { throw new Error('banco fora'); } };
  const log = console.error; console.error = () => {};
  try {
    const falha = await criarFlowViewer(config, { db, dbPainel: quebrado, instanceId: 'negativos', projectId: 'atlas' }).buscarGargaloAtual();
    assert.equal(falha.gargalo, null);
    assert.equal(falha.vazao.disponivel, false);
  } finally { console.error = log; }
});
