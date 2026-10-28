// Caixas ao vivo: funções puras e tela.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const APP = path.resolve(__dirname, "../..", "public/app");
const ler = (p) => fs.readFileSync(path.join(APP, p), "utf8");
const mod = (p) => import(pathToFileURL(path.join(APP, p)).href);

const BRUTO = [
  { id: 1, codigo: 'A', colaboradorId: 1, colaboradorNome: 'Ana', etapa: 'higienizacao', status: 'aberta', projetoId: 5, inicioEm: '2026-10-20T10:00:00.000Z', fimEm: null, duracaoS: null },
  { id: 2, codigo: 'B', colaboradorId: 2, colaboradorNome: 'Bia', etapa: 'remontagem', status: 'concluida', projetoId: 5, inicioEm: '2026-10-20T09:00:00.000Z', fimEm: '2026-10-20T09:10:00.000Z', duracaoS: 600 },
  { id: 3, codigo: 'C', colaboradorId: 3, colaboradorNome: 'Caio', etapa: 'higienizacao', status: 'aberta', projetoId: 5, inicioEm: '2026-10-20T09:30:00.000Z', fimEm: null, duracaoS: null },
  { id: 4, codigo: 'D', colaboradorId: 1, colaboradorNome: 'Ana', etapa: 'higienizacao', status: 'concluida', projetoId: 5, inicioEm: '2026-10-20T09:50:00.000Z', fimEm: '2026-10-20T09:55:00.000Z', duracaoS: 300 },
];
test('CA1: normalizarCaixas descarta inválidos e converte datas', async () => {
  const { normalizarCaixas } = await mod('js/core/caixas-op.js');
  const r = normalizarCaixas([...BRUTO, null, 'x', { id: 'z' }, { id: 9, inicioEm: 'lixo' }]);
  assert.equal(r.length, 4);
  assert.equal(r[0].inicioMs, Date.parse('2026-10-20T10:00:00.000Z'));
  assert.equal(r[0].fimMs, null);
  assert.equal(r[1].fimMs, Date.parse('2026-10-20T09:10:00.000Z'));
  assert.deepEqual(Object.keys(r[0]).sort(), ['codigo', 'colaboradorId', 'colaboradorNome', 'deteriorado', 'duracaoS', 'etapa', 'fimMs', 'fimSolicitadoMs', 'grampo', 'id', 'imagens', 'inicioMs', 'pausaAutomatica', 'pausaInicioMs', 'pausadoS', 'projetoId', 'status']);
  assert.deepEqual(normalizarCaixas(undefined), []);
});

test('CA2: rotuloEtapa e tempoDecorrido', async () => {
  const m = await mod('js/core/caixas-op.js');
  assert.equal(m.rotuloEtapa('higienizacao'), 'Higienização');
  assert.equal(m.rotuloEtapa('remontagem'), 'Remontagem');
  assert.equal(m.rotuloEtapa('cq'), 'cq');
  const [aberta, concluida] = m.normalizarCaixas(BRUTO);
  assert.equal(m.tempoDecorrido(aberta, Date.parse('2026-10-20T10:02:05.000Z')), 125);
  assert.equal(m.tempoDecorrido(concluida, Date.parse('2026-10-20T12:00:00.000Z')), 600);
  assert.equal(m.tempoDecorrido(aberta, Date.parse('2026-10-20T09:00:00.000Z')), 0, 'relógio atrasado não dá negativo');
});

test('CA3: ordenarAoVivo põe abertas primeiro (mais antigas no topo) e depois as demais, da mais recente', async () => {
  const m = await mod('js/core/caixas-op.js');
  const entrada = m.normalizarCaixas(BRUTO);
  const copia = JSON.stringify(entrada);
  assert.deepEqual(m.ordenarAoVivo(entrada).map((c) => c.id), [3, 1, 4, 2]);
  assert.equal(JSON.stringify(entrada), copia, 'não altera a entrada');
});

test('CA4: urlCaixas monta a consulta só com os campos informados', async () => {
  const { urlCaixas } = await mod('js/core/caixas-op.js');
  assert.equal(urlCaixas({ status: 'aberta' }), '/operacional/correcoes/caixas?status=aberta');
  const u = urlCaixas({ status: 'concluida', limite: 50, projetoId: 5 });
  assert.match(u, /^\/operacional\/correcoes\/caixas\?/);
  for (const p of ['status=concluida', 'limite=50', 'projetoId=5']) assert.ok(u.includes(p), p);
  assert.equal(urlCaixas({}), '/operacional/correcoes/caixas');
});

test('CA5: a tela exporta montar e INTERVALO_MS, usa polling com limpeza e escapa texto', async () => {
  const t = await mod('js/features/operacional/caixas.js');
  assert.equal(typeof t.montar, 'function');
  assert.ok(Number.isInteger(t.INTERVALO_MS) && t.INTERVALO_MS >= 3000 && t.INTERVALO_MS <= 60000);
  const s = ler('js/features/operacional/caixas.js');
  assert.match(s, /setInterval/);
  assert.match(s, /clearInterval/);
  assert.match(s, /destruir/);
  assert.doesNotMatch(s, /innerHTML\s*=\s*`/, 'sem template literal cru em innerHTML (use html``)');
  assert.doesNotMatch(s, /\bstyle\s*=\s*["']/);
});
