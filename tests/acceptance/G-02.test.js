const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BACK = path.resolve(__dirname, '../../services/back_dashboard');
const job = () => require(path.join(BACK, 'jobs/snapshot'));
const CONFIG = {
  schema: 'captura_atlas', fluId: 4, lotesIgnorados: [], fasIds: [50, 68, 12],
  fasesPorId: new Map([[50, { nome: 'Importação', tipo: 'entrada' }], [68, { nome: 'Suspenso Importação', tipo: 'erro' }], [12, { nome: 'Finalizado', tipo: 'terminal' }]]),
};
// 1ª consulta = estoque por fase (fas_id, pastas, imagens); 2ª = finalizadas por fase (fas_id, finalizadas).
const dbEspelho = () => {
  const respostas = [
    { rows: [{ fas_id: 50, pastas: 10, imagens: 1000 }, { fas_id: 68, pastas: 3, imagens: 30 }] },
    { rows: [{ fas_id: 50, finalizadas: 700 }, { fas_id: 12, finalizadas: 650 }] },
  ];
  const chamadas = [];
  return { chamadas, async query(sql, params) { chamadas.push({ sql, params }); return respostas[chamadas.length - 1] ?? { rows: [] }; } };
};

test('CA1: momentoDaVirada devolve a última virada (07h ou 19h de São Paulo) já ocorrida', () => {
  const { momentoDaVirada } = job();
  const iso = (s) => momentoDaVirada(new Date(s)).toISOString();
  assert.equal(iso('2026-10-20T13:00:00.000Z'), '2026-10-20T10:00:00.000Z'); // 10h BRT -> 07h BRT
  assert.equal(iso('2026-10-20T10:00:00.000Z'), '2026-10-20T10:00:00.000Z'); // 07h em ponto
  assert.equal(iso('2026-10-20T23:30:00.000Z'), '2026-10-20T22:00:00.000Z'); // 20h30 BRT -> 19h BRT
  assert.equal(iso('2026-10-20T03:00:00.000Z'), '2026-10-19T22:00:00.000Z'); // 00h BRT -> 19h do dia anterior
});

test('CA2: coletarRetrato junta estoque e finalizadas por fase, com zeros nas fases sem linha', async () => {
  const { coletarRetrato } = job();
  const db = dbEspelho();
  const r = await coletarRetrato(db, CONFIG);
  assert.deepEqual(db.chamadas.map((c) => c.params[0]), [4, 4]);
  assert.deepEqual(db.chamadas.map((c) => c.params[1]), [[50, 68, 12], [50, 68, 12]]);
  assert.deepEqual(r, [
    { fasId: 50, tipo: 'entrada', estoquePastas: 10, estoqueImagens: 1000, finalizadasTotal: 700, suspensas: 0 },
    { fasId: 68, tipo: 'erro', estoquePastas: 3, estoqueImagens: 30, finalizadasTotal: 0, suspensas: 3 },
    { fasId: 12, tipo: 'terminal', estoquePastas: 0, estoqueImagens: 0, finalizadasTotal: 650, suspensas: 0 },
  ]);
});

test('CA3: gravarRetrato é idempotente (ON CONFLICT DO NOTHING) e parametrizado; limparAntigos apaga acima de 180 dias', async () => {
  const { gravarRetrato, limparAntigos } = job();
  const chamadas = [];
  const dbPainel = { async query(sql, params) { chamadas.push({ sql, params }); return { rows: [], rowCount: 1 }; } };
  const momento = new Date('2026-10-20T10:00:00.000Z');
  const n = await gravarRetrato(dbPainel, { projeto: 'atlas', instancia: 'negativos', momento, fases: [
    { fasId: 50, tipo: 'entrada', estoquePastas: 10, estoqueImagens: 1000, finalizadasTotal: 700, suspensas: 0 },
    { fasId: 12, tipo: 'terminal', estoquePastas: 0, estoqueImagens: 0, finalizadasTotal: 650, suspensas: 0 },
  ] });
  assert.ok(n >= 1);
  const ins = chamadas.filter((c) => /INSERT INTO painel\.snapshot_fase/i.test(c.sql));
  assert.ok(ins.length >= 1);
  for (const c of ins) {
    assert.match(c.sql, /ON CONFLICT[^)]*\)\s*DO NOTHING/i);
    assert.ok(!/negativos|atlas/.test(c.sql), 'valores devem ir por parâmetro');
  }
  assert.ok(ins.some((c) => c.params.includes('negativos') && c.params.includes(50)));
  chamadas.length = 0;
  await limparAntigos(dbPainel);
  assert.match(chamadas[0].sql, /DELETE FROM painel\.snapshot_fase/i);
  assert.match(chamadas[0].sql, /momento/);
  assert.ok(chamadas[0].params.map(String).includes('180'));
});

test('CA4: executar grava o retrato de cada instância flow-viewer, tolera falha de uma e limpa os antigos', async () => {
  const { executar } = job();
  const gravados = [];
  const dbPainel = { async query(sql, params) { gravados.push({ sql, params }); return { rows: [], rowCount: 1 }; } };
  const fluxo = (id, fluId) => ({ moduleId: 'base/flow-viewer', instanceId: id, config: { fonte: 'atlas', fluId, faseFinal: 12, kpiFases: [12],
    fases: [{ fasId: 50, nome: 'Importação', tipo: 'entrada' }, { fasId: 12, nome: 'Finalizado', tipo: 'terminal' }],
    apresentacao: { nome: id, sub: id, grupo: { id, nome: id } }, grafo: { nos: [{ fasId: 50, x: 0, y: 0 }, { fasId: 12, x: 1, y: 0 }], juncoes: [], arestas: [] } } });
  const manifestos = [{ projectId: 'atlas', modules: [fluxo('quebrada', 1), fluxo('boa', 2)] }];
  let n = 0; // 1ª consulta de cada instância = estoque, 2ª = finalizadas
  const db = { async query(sql, params) {
    if (params[0] === 1) throw new Error('espelho fora');
    return n++ % 2 === 0 ? { rows: [{ fas_id: 50, pastas: 2, imagens: 20 }] } : { rows: [{ fas_id: 12, finalizadas: 5 }] };
  } };
  const log = { info() {}, erro() {} };
  const r = await executar({ db, dbPainel, manifestos, agora: new Date('2026-10-20T13:00:00.000Z'), log });
  assert.equal(r.falhas, 1);
  assert.ok(r.gravadas >= 1);
  assert.ok(gravados.some((c) => /INSERT INTO painel\.snapshot_fase/i.test(c.sql) && c.params.includes('boa')));
  assert.ok(!gravados.some((c) => /INSERT INTO painel\.snapshot_fase/i.test(c.sql) && c.params.includes('quebrada')));
  assert.ok(gravados.some((c) => /DELETE FROM painel\.snapshot_fase/i.test(c.sql)));
});

test('CA5: units systemd rodam o job oneshot às 07h e 19h de São Paulo', () => {
  const dir = path.join(BACK, 'systemd');
  const timer = fs.readFileSync(path.join(dir, 'back-dashboard-snapshot.timer'), 'utf8');
  const servico = fs.readFileSync(path.join(dir, 'back-dashboard-snapshot.service'), 'utf8');
  assert.match(timer, /^OnCalendar=\*-\*-\* 07,19:00:00 America\/Sao_Paulo$/m);
  assert.match(timer, /^Persistent=true$/m);
  assert.match(servico, /^Type=oneshot$/m);
  assert.match(servico, /^ExecStart=\/usr\/bin\/node jobs\/snapshot\.js$/m);
  assert.match(servico, /^EnvironmentFile=\/etc\/dashboard\/back-dashboard\.env$/m);
});
