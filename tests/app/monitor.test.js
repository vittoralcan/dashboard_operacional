import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostDe, sistemaDe, instanteDe, formatarHora, horaCurta, normalizarApis, resumir, contarPorSistema, filtrarPorSistema, intervaloValido, INTERVALOS_TESTE } from '../../public/app/js/core/monitor.js';

const GAS = [
  { funcao_api: 'PortalDoc · Consulta', status_api: 'Online', log_api: '', link_api: 'https://portaldoc.boreal.example/api/v1/x', hora_disparo: '2026-10-03T14:05:00-03:00' },
  { funcao_api: 'Lumen · Upload', status_api: 'offline', log_api: 'HTTP 502 <b>Bad</b>', link_api: 'https://lumen.exemplo.com/up', hora_disparo: '2026-10-03T14:10:00-03:00' },
  { funcao_api: 'Inscrição Online', status_api: 'ONLINE', log_api: '', link_api: 'não é url', hora_disparo: '' },
];

test('hostDe', () => {
  assert.equal(hostDe('https://portaldoc.boreal.example/api/v1/x'), 'portaldoc.boreal.example');
  assert.equal(hostDe('http://localhost:3002/api'), 'localhost:3002');
  assert.equal(hostDe(' não é url '), 'não é url');
  assert.equal(hostDe(undefined), '');
});

test('sistemaDe (inferido do nome)', () => {
  assert.equal(sistemaDe('PortalDoc · Consulta'), 'PortalDoc');
  assert.equal(sistemaDe('LUMEN upload'), 'Lumen');
  assert.equal(sistemaDe('Inscricao Online'), 'Inscrição Online');
  assert.equal(sistemaDe('API BOREAL Nacional'), 'BOREAL');
  assert.equal(sistemaDe('Qualquer'), 'Outras');
});

test('formatarHora: ISO em Brasília, texto livre como veio, vazio = Pendente', () => {
  assert.equal(formatarHora('2026-10-03T14:05:00-03:00'), '03/10/2026 14:05');
  assert.equal(formatarHora('2026-10-03T17:05:00Z'), '03/10/2026 14:05', 'UTC convertido para Brasília');
  assert.equal(formatarHora('ontem às 10h'), 'ontem às 10h');
  assert.equal(formatarHora(''), 'Pendente');
  assert.equal(formatarHora('2026-99-99T00:00:00'), '2026-99-99T00:00:00');
});

test('horaCurta e instanteDe', () => {
  assert.equal(horaCurta('2026-10-03T14:05:00-03:00'), '14:05');
  assert.equal(horaCurta(''), 'Pendente');
  assert.equal(instanteDe('2026-10-03T14:05:00-03:00'), Date.parse('2026-10-03T14:05:00-03:00'));
  assert.equal(instanteDe('texto'), null);
  assert.equal(instanteDe(''), null);
});

test('normalizarApis: status sem diferenciar caixa, host, sistema, índice', () => {
  const a = normalizarApis(GAS);
  assert.deepEqual(a.map((x) => x.online), [true, false, true]);
  assert.deepEqual(a.map((x) => x.indice), [0, 1, 2]);
  assert.equal(a[0].host, 'portaldoc.boreal.example');
  assert.equal(a[1].log, 'HTTP 502 <b>Bad</b>', 'o texto NÃO é alterado aqui — escapar é papel da renderização');
  assert.equal(a[2].horaTxt, 'Pendente');
  assert.equal(a[2].ts, null);
});

test('normalizarApis tolera lixo', () => {
  assert.deepEqual(normalizarApis(undefined), []);
  assert.deepEqual(normalizarApis('x'), []);
  const r = normalizarApis([null, 5, {}]);
  assert.equal(r.length, 1);
  assert.equal(r[0].nome, 'API 1');
  assert.equal(r[0].online, false);
});

test('resumir: online/total e a verificação mais recente', () => {
  const r = resumir(normalizarApis(GAS));
  assert.deepEqual([r.online, r.total, r.offline], [2, 3, 1]);
  assert.equal(r.ultima, '03/10/2026 14:10');
  assert.equal(resumir([]).ultima, null);
  assert.equal(resumir(normalizarApis([{ funcao_api: 'x', status_api: 'online' }])).ultima, null, 'sem data legível, sem "última verificação"');
});

test('pílulas por sistema', () => {
  const a = normalizarApis(GAS);
  assert.deepEqual(contarPorSistema(a), { PortalDoc: 1, Lumen: 1, 'Inscrição Online': 1 });
  assert.equal(filtrarPorSistema(a, 'todos').length, 3);
  assert.deepEqual(filtrarPorSistema(a, 'Lumen').map((x) => x.nome), ['Lumen · Upload']);
});

test('intervalos permitidos', () => {
  assert.deepEqual(INTERVALOS_TESTE, [5, 10, 15, 30, 60]);
  assert.equal(intervaloValido('15'), true);
  assert.equal(intervaloValido(7), false);
  assert.equal(intervaloValido('abc'), false);
});

// ---------------------------------------------------------------- monitor nativo (B10)
import { normalizarApiNativa, normalizarMonitorNativo, juntarTeste } from '../../public/app/js/core/monitor.js';
import { blocosDeUptime } from '../../public/app/js/core/painel.js';

const NATIVA = { id: 5, sistema: 'Lumen', nome: 'Lumen — Indexação de Documentos', host: 'lumen.exemplo', url: 'https://lumen.exemplo/api/indexacao/lote', estado: 'falha', latenciaMs: null,
  verificadoEm: '2026-10-02T09:40:00-03:00', log: 'HTTP 503', historico: [{ s: 'o', ms: 182, em: '2026-10-02T01:55:00-03:00' }, { s: 'f', ms: null, em: '2026-10-02T09:40:00-03:00' }, { s: 'x', ms: 1, em: 'q' }, null] };

test('monitor nativo: entrada no formato Api da tela (online/lenta/falha/sem verificação)', () => {
  const a = normalizarApiNativa(NATIVA, 2);
  assert.deepEqual([a.indice, a.id, a.nome, a.sistema, a.estado, a.online, a.latenciaMs, a.host], [2, 5, 'Lumen — Indexação de Documentos', 'Lumen', 'falha', false, null, 'lumen.exemplo']);
  assert.equal(a.historico.length, 2, 'verificação com sigla desconhecida e lixo são descartados');
  assert.deepEqual(a.historico.map((h) => [h.s, h.ms]), [['o', 182], ['f', null]]);
  assert.ok(a.ts > 0);
  assert.equal(normalizarApiNativa({ ...NATIVA, estado: 'lenta', latenciaMs: 1800 }, 0).online, true, 'lenta responde: conta como online');
  const nova = normalizarApiNativa({ id: 9, nome: 'Nova', url: 'https://x.com', estado: null, historico: [] }, 0);
  assert.deepEqual([nova.estado, nova.online, nova.horaTxt, nova.sistema], [null, false, 'Pendente', 'Outras']);
});

test('monitor nativo: lista, intervalo, latência média e disponibilidade; lista vazia é válida (usa a reserva)', () => {
  const d = normalizarMonitorNativo({ intervaloMin: 15, proximaVerificacao: '2026-10-02T09:55:00-03:00', resumo: { online: 7, total: 8, latenciaMediaMs: 218, disponibilidadePct: 95.4 }, apis: [NATIVA, null, 'x'] });
  assert.deepEqual([d.apis.length, d.intervalo, d.latenciaMediaMs, d.disponibilidadePct], [1, 15, 218, 95.4]);
  const vazio = normalizarMonitorNativo({ intervaloMin: 7, resumo: {}, apis: [] });
  assert.deepEqual([vazio.apis.length, vazio.intervalo, vazio.latenciaMediaMs, vazio.disponibilidadePct], [0, null, null, null]);
  assert.equal(normalizarMonitorNativo(null).apis.length, 0);
});

test('monitor nativo: teste manual soma ao histórico (no máximo 30) e mantém o índice da linha', () => {
  const atual = normalizarApiNativa({ ...NATIVA, historico: Array.from({ length: 30 }, (_, i) => ({ s: 'o', ms: i, em: '2026-10-02T01:55:00-03:00' })) }, 3);
  const nova = normalizarApiNativa({ ...NATIVA, estado: 'online', historico: [{ s: 'o', ms: 999, em: '2026-10-02T09:50:00-03:00' }] }, 0);
  const j = juntarTeste(atual, nova);
  assert.equal(j.indice, 3);
  assert.equal(j.historico.length, 30);
  assert.equal(j.historico[29].ms, 999, 'o mais novo no fim');
  assert.equal(j.historico[0].ms, 1, 'o mais antigo saiu');
});

test('uptime-mini: verde, âmbar (lenta) e vermelho', () => {
  assert.deepEqual(blocosDeUptime([{ online: true, estado: 'online' }, { online: true, estado: 'lenta' }, { online: false, estado: 'falha' }, { online: true }]), ['ok', 'l', 'f', 'ok']);
});
