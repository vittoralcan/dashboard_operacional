// Casos extras de core/caixas-op.js e checagem por texto da tela (os de aceite estão em tests/acceptance/R-09.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP = path.resolve(__dirname, '../../public/app');
const mod = () => import(pathToFileURL(path.join(APP, 'js/core/caixas-op.js')).href);

test('normalizarCaixas aceita campos ausentes com padrões seguros', async () => {
  const { normalizarCaixas } = await mod();
  const [c] = normalizarCaixas([{ id: 1, inicioEm: '2026-10-20T10:00:00.000Z' }]);
  assert.equal(c.codigo, '');
  assert.equal(c.fimMs, null);
  assert.equal(c.duracaoS, null);
});

test('tempoDecorrido de concluída sem duração usa fim menos início', async () => {
  const { normalizarCaixas, tempoDecorrido } = await mod();
  const [c] = normalizarCaixas([{ id: 1, status: 'concluida', inicioEm: '2026-10-20T10:00:00.000Z', fimEm: '2026-10-20T10:01:00.000Z' }]);
  assert.equal(tempoDecorrido(c, Date.now()), 60);
});

test('rotuloEtapa não confunde propriedades herdadas', async () => {
  const { rotuloEtapa } = await mod();
  assert.equal(rotuloEtapa('constructor'), 'constructor');
});

test('a tela limpa os timers, para ao abortar o sinal e consulta as duas situações', () => {
  const s = fs.readFileSync(path.join(APP, 'js/features/operacional/caixas.js'), 'utf8');
  assert.match(s, /clearInterval\(relogio\)/);
  assert.match(s, /clearInterval\(sondagem\)/);
  assert.match(s, /sinal\.addEventListener\('abort'/);
  assert.match(s, /buscar\('aberta'\)/);
  assert.match(s, /buscar\('concluida'/);
  assert.match(s, /export const INTERVALO_MS = 10000/);
});

test('filtrarCaixas, resumoAoVivo e chipsDaCaixa', async () => {
  const m = await mod();
  const lista = m.normalizarCaixas([
    { id: 1, codigo: 'AB-1', colaboradorNome: 'Érica Dias', etapa: 'digitalizacao', status: 'aberta', inicioEm: '2026-10-20T10:00:00Z', pausaInicioEm: '2026-10-20T10:30:00Z', pausaAutomatica: true },
    { id: 2, codigo: 'AB-2', colaboradorNome: 'Ana', etapa: 'higienizacao', status: 'concluida', inicioEm: '2026-10-20T09:00:00Z', fimEm: '2026-10-20T09:10:00Z', duracaoS: 600, imagens: 1200, grampo: true, deteriorado: true },
    { id: 3, codigo: 'ZZ-3', colaboradorNome: 'Bruno', etapa: 'remontagem', status: 'aberta', inicioEm: '2026-10-20T08:00:00Z' },
  ]);
  assert.deepEqual(m.filtrarCaixas(lista, { busca: 'erica' }).map((c) => c.id), [1], 'sem acento nem caixa');
  assert.deepEqual(m.filtrarCaixas(lista, { busca: 'ab-' }).map((c) => c.id), [1, 2]);
  assert.deepEqual(m.filtrarCaixas(lista, { etapa: 'remontagem', status: 'aberta' }).map((c) => c.id), [3]);
  assert.equal(m.filtrarCaixas(lista).length, 3);
  assert.deepEqual(m.resumoAoVivo(lista), { abertas: 2, pausadas: 1, pendentes: 1, concluidas: 1 });
  assert.deepEqual(m.chipsDaCaixa(lista[0]).map((c) => c.texto), ['Pausada', 'Pausa automática: corrigir']);
  const textos = m.chipsDaCaixa(lista[1]).map((c) => c.texto);
  assert.ok(textos.includes('Concluída') && textos.includes('Muito grampo') && textos.includes('Papel deteriorado') && textos.some((t) => /imagens/.test(t)));
  for (const c of lista) for (const chip of m.chipsDaCaixa(c)) assert.ok(chip.icone && chip.texto, 'cor nunca sozinha');
  assert.equal(m.tempoDecorrido(lista[0], Date.parse('2026-10-20T12:00:00Z')), 1800, 'em pausa, o tempo para no início da pausa');
  assert.match(m.horaCurta(Date.now()), /^\d{2}:\d{2}$/);
});

test('relógio congela na pausa e no pedido de conclusão (digitalização aguardando imagens)', async () => {
  const m = await mod();
  const [c] = m.normalizarCaixas([{ id: 1, codigo: 'D', colaboradorNome: 'A', etapa: 'digitalizacao', status: 'aberta', inicioEm: '2026-10-20T10:00:00Z', fimSolicitadoEm: '2026-10-20T10:20:00Z' }]);
  assert.equal(m.instanteCongelado(c), Date.parse('2026-10-20T10:20:00Z'));
  assert.equal(m.tempoDecorrido(c, Date.parse('2026-10-20T12:00:00Z')), 1200, 'parou no pedido de conclusão, não conta o tempo digitando as imagens');
  assert.ok(m.chipsDaCaixa(c).some((x) => x.texto === 'Aguardando imagens'));
  const [livre] = m.normalizarCaixas([{ id: 2, codigo: 'E', colaboradorNome: 'A', etapa: 'digitalizacao', status: 'aberta', inicioEm: '2026-10-20T10:00:00Z' }]);
  assert.equal(m.instanteCongelado(livre), null);
});
