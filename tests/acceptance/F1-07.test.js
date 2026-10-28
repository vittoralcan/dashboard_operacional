// Relatório hora a hora na gestão: funções puras (core/relatorio-op.js) e contrato da tela.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.resolve(__dirname, '../..');
const APP = path.join(RAIZ, 'public/app');
const mod = () => import(pathToFileURL(path.join(APP, 'js/core/relatorio-op.js')).href);
const zeros = (o = {}) => Array.from({ length: 24 }, (_, h) => o[h] || 0);

test('CA1: normalizarHoraAHora garante 24 posições, acha o pico e a faixa com produção, e ordena as pessoas A-Z', async () => {
  const { normalizarHoraAHora } = await mod();
  const r = normalizarHoraAHora({
    data: '2026-10-20', total: 6,
    horas: [{ hora: 8, caixas: 3 }, { hora: 10, caixas: 3 }],
    colaboradores: [
      { colaboradorId: 2, nome: 'Érica', total: 1, horas: zeros({ 8: 1 }) },
      { colaboradorId: 1, nome: 'ana', total: 5, horas: zeros({ 8: 2, 10: 3 }) },
    ],
  });
  assert.equal(r.horas.length, 24);
  assert.equal(r.horas[8], 3);
  assert.equal(r.horas[9], 0);
  assert.equal(r.total, 6);
  assert.deepEqual(r.pico, { hora: 8, caixas: 3 });
  assert.deepEqual(r.faixa, { de: 8, ate: 10 });
  assert.deepEqual(r.colaboradores.map((c) => c.nome), ['ana', 'Érica']);
  assert.equal(r.colaboradores[0].horas.length, 24);
});

test('CA2: sem produção (ou dado ruim) o relatório vem zerado, sem pico nem faixa', async () => {
  const { normalizarHoraAHora } = await mod();
  for (const entrada of [null, undefined, {}, { horas: 'x', colaboradores: 3 }]) {
    const r = normalizarHoraAHora(entrada);
    assert.equal(r.total, 0);
    assert.equal(r.horas.length, 24);
    assert.equal(r.pico, null);
    assert.equal(r.faixa, null);
    assert.deepEqual(r.colaboradores, []);
  }
});

test('CA3: normalizarProjetos e normalizarTempoMedio ignoram entradas inválidas e ordenam por nome', async () => {
  const { normalizarProjetos, normalizarTempoMedio } = await mod();
  const p = normalizarProjetos({ projetos: [
    { id: 6, slug: 'b', nome: 'Beta', turnos: [{ id: 9, nome: 'Vespertino' }, { id: 8, nome: 'Matutino' }, { id: 'x', nome: 'Lixo' }] },
    { id: 'z', nome: 'Sem id' },
    { id: 5, slug: 'a', nome: 'Alfa', turnos: [] },
  ] });
  assert.deepEqual(p.map((x) => x.id), [5, 6]);
  assert.deepEqual(p[1].turnos, [{ id: 8, nome: 'Matutino' }, { id: 9, nome: 'Vespertino' }]);
  assert.deepEqual(normalizarProjetos(null), []);
  const t = normalizarTempoMedio({ caixas: 6, mediaGeralS: 650, colaboradores: [
    { colaboradorId: 2, nome: 'Beto', caixas: 1, totalS: 900, mediaS: 900 },
    { colaboradorId: 1, nome: 'Ana', caixas: 5, totalS: 3000, mediaS: 600 },
  ] });
  assert.equal(t.mediaGeralS, 650);
  assert.deepEqual(t.colaboradores.map((c) => c.nome), ['Ana', 'Beto']);
  const { etapa, ...vazio } = normalizarTempoMedio(undefined);
  assert.ok(etapa === undefined || typeof etapa === 'string');
  assert.deepEqual(vazio, { caixas: 0, mediaGeralS: 0, colaboradores: [] });
});

test('CA4: duracaoCurta, dataHojeSP e as URLs dos relatórios', async () => {
  const { duracaoCurta, dataHojeSP, urlHoraAHora, urlTempoMedio } = await mod();
  assert.equal(duracaoCurta(0), '0 s');
  assert.equal(duracaoCurta(45), '45 s');
  assert.equal(duracaoCurta(600), '10 min');
  assert.equal(duracaoCurta(650), '10 min 50 s');
  assert.equal(duracaoCurta(3900), '1 h 05 min');
  assert.equal(duracaoCurta(Number.NaN), '0 s');
  // 23h30 em São Paulo ainda é o dia 20, embora em UTC já seja dia 21
  assert.equal(dataHojeSP(Date.parse('2026-10-21T02:30:00Z')), '2026-10-20');
  assert.equal(dataHojeSP(Date.parse('2026-10-20T15:00:00Z')), '2026-10-20');
  assert.equal(urlHoraAHora({ projetoId: 5, data: '2026-10-20' }), '/operacional/relatorios/hora-a-hora?projetoId=5&data=2026-10-20');
  assert.equal(urlHoraAHora({ projetoId: 5, data: '2026-10-20', turnoId: 8 }), '/operacional/relatorios/hora-a-hora?projetoId=5&data=2026-10-20&turnoId=8');
  assert.equal(urlTempoMedio({ projetoId: 5, de: '2026-10-20', ate: '2026-10-20' }), '/operacional/relatorios/tempo-medio?projetoId=5&de=2026-10-20&ate=2026-10-20');
});

test('CA5: a tela exporta montar(), chama as três rotas do relatório pelo servidor do painel e não monta HTML por concatenação', async () => {
  const fonte = fs.readFileSync(path.join(APP, 'js/features/operacional/relatorio.js'), 'utf8');
  assert.match(fonte, /export\s+(async\s+)?function\s+montar\b/);
  assert.match(fonte, /API\.painel/);
  assert.match(fonte, /urlHoraAHora/);
  assert.match(fonte, /urlTempoMedio/);
  assert.match(fonte, /\/operacional\/relatorios\/projetos/);
  assert.doesNotMatch(fonte, /innerHTML\s*[+]?=\s*`[^`]*\$\{/);
  assert.ok(fs.existsSync(path.join(APP, 'css/screens/relatorio-op.css')));
});

test('CA6: existe o E2E do relatório com capturas em computador e celular', () => {
  const spec = fs.readFileSync(path.join(RAIZ, 'tests/e2e/relatorio-operacional.spec.mjs'), 'utf8');
  assert.match(spec, /page\.screenshot/);
  assert.match(spec, /width:\s*390/);
  assert.match(spec, /#\/operacional\/relatorios/);
});
