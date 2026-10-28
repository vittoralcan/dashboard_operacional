import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizarMetas, metaDoEscopo, escoposDeMeta, validarValorMeta, progressoDaMeta } from '../../public/app/js/core/metas.js';
import { normalizarGargalos, normalizarGargaloInstancia, gargaloParaCartao, fluxoDoCatalogo } from '../../public/app/js/core/gargalos.js';
import { textoDaAcao, normalizarAtividades, normalizarNotificacoes, resolverDestino } from '../../public/app/js/core/servicos.js';

const CAT = JSON.parse(fs.readFileSync(new URL('../../public/app/config/projetos.json', import.meta.url), 'utf8'));
const ROTAS_OK = (r) => ['/projetos', '/atlas', '/boreal/monitoramento', '/macro-view'].includes(r);

test('metas: normaliza, ignora lixo e acha por (projeto, escopo)', () => {
  const m = normalizarMetas([{ projeto: 'atlas', escopo: 'negativos', ano: 2026, mes: 10, valor: 750, unidade: 'pastas' }, null, { projeto: 'x' }, { projeto: 'boreal', escopo: 'higienizacao', ano: 2026, mes: 10, valor: '450', unidade: 'caixas' }]);
  assert.equal(m.length, 2);
  assert.equal(metaDoEscopo(m, 'boreal', 'higienizacao').valor, 450);
  assert.equal(metaDoEscopo(m, 'atlas', 'inventarios'), null);
  assert.deepEqual(normalizarMetas(undefined), []);
});

test('escoposDeMeta: os 4 fluxos do ATLAS, com o escopo e a unidade que o servidor grava', () => {
  const e = escoposDeMeta(CAT).map((x) => `${x.projeto}/${x.escopo}:${x.unidade}`);
  assert.deepEqual(e.sort(), ['atlas/cartografia:pastas', 'atlas/certidoes:pastas', 'atlas/inventarios:pastas', 'atlas/negativos:pastas']);
});

test('validarValorMeta: inteiro de 1 a 10.000.000 (como o servidor); aceita ponto de milhar', () => {
  assert.deepEqual(validarValorMeta('1.200'), { ok: true, valor: 1200 });
  assert.deepEqual(validarValorMeta(' 750 '), { ok: true, valor: 750 });
  for (const t of ['', 'abc', '0', '-5', '1,5', '10000001', '12.5e3']) assert.equal(validarValorMeta(t).ok, false, t);
  assert.equal(validarValorMeta('10000000').ok, true);
});

test('progressoDaMeta: % sem teto, quanto falta, "no verde" a partir de 90 %; sem meta → null', () => {
  assert.deepEqual(progressoDaMeta(948, 1200), { pct: 79, faltam: 252, ok: false });
  assert.equal(progressoDaMeta(1080, 1200).ok, true);
  assert.deepEqual(progressoDaMeta(1300, 1200), { pct: (1300 / 1200) * 100, faltam: 0, ok: true });
  assert.equal(progressoDaMeta(10, null), null);
  assert.equal(progressoDaMeta(10, 0), null);
});

test('gargalos: ordenados por pastas; só os que têm fase; cartão com a rota do FRONT (id da instância ≠ rota)', () => {
  const g = normalizarGargalos([{ projeto: 'atlas', instancia: 'certidoes', fasId: 7, nome: 'Controle de Qualidade', pastas: 40, pctParadas: 30.5 },
    { projeto: 'atlas', instancia: 'negativos', fasId: 1, nome: 'Validação', pastas: 76, pctParadas: 27.1 }, { instancia: 'x' }, null]);
  assert.deepEqual(g.map((x) => x.instancia), ['negativos', 'certidoes']);
  const c = gargaloParaCartao(g[1], CAT);
  assert.deepEqual([c.titulo, c.onde, c.rota, c.pct], ['Controle de Qualidade', 'ATLAS · Certidões', '/atlas/certidoes/fluxograma', 30.5]);
  assert.deepEqual(c.foco, { instancia: 'certidoes', fasId: 7 });
  const desconhecido = gargaloParaCartao({ projeto: 'atlas', instancia: 'novo-fluxo', fasId: 1, nome: 'X', pastas: 1, pctParadas: null }, CAT);
  assert.equal(desconhecido.rota, null, 'instância que o front não conhece: mostra, não navega');
  assert.equal(desconhecido.onde, 'ATLAS · novo-fluxo');
});

test('gargalo da instância: null quando nenhuma fase satisfaz a RN-009', () => {
  assert.equal(normalizarGargaloInstancia({ regra: {}, paradas: { pastas: 5, imagens: 9 }, gargalo: null }).gargalo, null);
  const g = normalizarGargaloInstancia({ paradas: { pastas: 582, imagens: 85530 }, gargalo: { fasId: 1, nome: 'Validação', pastas: 118, imagens: 17346, pctParadas: 20.3, razaoMediana: 2.8 } });
  assert.deepEqual([g.gargalo.fasId, g.gargalo.pastas, g.paradas.pastas], [1, 118, 582]);
  assert.deepEqual(normalizarGargaloInstancia(null), { gargalo: null, altoVolume: null, paradas: { pastas: 0, imagens: 0 } });
});

test('gargalo da instância: altoVolume vem como fase ou null (fase inválida não quebra)', () => {
  const a = normalizarGargaloInstancia({ paradas: { pastas: 9, imagens: 90 }, gargalo: null, altoVolume: { fasId: 2, nome: 'Validação', pastas: 7, imagens: 70, pctParadas: 60 } });
  assert.deepEqual([a.altoVolume.fasId, a.altoVolume.nome, a.altoVolume.pastas, a.altoVolume.pctParadas], [2, 'Validação', 7, 60]);
  assert.equal(normalizarGargaloInstancia({ altoVolume: { fasId: 'x' } }).altoVolume, null);
});

test('atividades: o servidor manda o CÓDIGO da ação; a frase em português é do front', () => {
  assert.equal(textoDaAcao('meta.definida'), 'definiu a meta');
  assert.equal(textoDaAcao('relatorio.gerado'), 'gerou um relatório');
  assert.equal(textoDaAcao('algo.novo_do_backend'), 'algo novo do backend', 'ação desconhecida não quebra');
  const a = normalizarAtividades([{ id: '9', em: '2026-10-02T09:36:00-03:00', quem: 'rafael', sistema: false, acao: 'meta.definida', alvo: 'Meta de 10/2026', onde: 'atlas · negativos' }, { id: 1, acao: '' }, null]);
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].id, a[0].quem, a[0].acao, a[0].sistema], [9, 'rafael', 'definiu a meta', false]);
  assert.ok(a[0].ts > 0);
  assert.equal(normalizarAtividades([{ acao: 'x', quem: null, sistema: true }])[0].quem, 'Sistema');
});

test('notificações: conta as não lidas, tipo desconhecido vira info, destino opcional', () => {
  const n = normalizarNotificacoes({ naoLidas: 99, itens: [
    { id: 412, tipo: 'erro', titulo: 'API fora do ar', texto: 'x', criadoEm: '2026-10-02T09:32:00-03:00', lida: false, destino: { rota: '/boreal/monitoramento' } },
    { id: 409, tipo: 'alerta', titulo: 'Gargalo', texto: 'y', criadoEm: '2026-10-02T09:15:00-03:00', lida: true, destino: { rota: '/atlas/inventarios/fluxograma', foco: { instancia: 'inventarios', fasId: 1 } } },
    { id: 1, tipo: 'novo-tipo', titulo: 't', texto: '', criadoEm: null, lida: false }, { semId: true }, null] });
  assert.equal(n.itens.length, 3);
  assert.equal(n.naoLidas, 2, 'conta o que veio, não confia no número do servidor');
  assert.deepEqual(n.itens[1].destino, { rota: '/atlas/inventarios/fluxograma', foco: { instancia: 'inventarios', fasId: 1 } });
  assert.equal(n.itens[2].tipo, 'info');
  assert.equal(n.itens[2].destino, null);
  assert.deepEqual(normalizarNotificacoes(null), { naoLidas: 0, itens: [] });
});

test('resolverDestino: converte o ID da instância (servidor) na ROTA do front e recusa o que não conhece', () => {
  assert.equal(resolverDestino({ rota: '/atlas/certidoes/fluxograma' }, CAT, ROTAS_OK), '/atlas/certidoes/fluxograma');
  assert.equal(resolverDestino({ rota: '/atlas/cartografia' }, CAT, ROTAS_OK), '/atlas/cartografia');
  assert.equal(resolverDestino({ rota: '/atlas/negativos/fluxograma' }, CAT, ROTAS_OK), '/atlas/negativos/fluxograma');
  assert.equal(resolverDestino({ rota: '/boreal/monitoramento' }, CAT, ROTAS_OK), '/boreal/monitoramento');
  assert.equal(resolverDestino({ rota: '/atlas' }, CAT, ROTAS_OK), '/atlas');
  for (const ruim of ['//evil.com/x', 'https://evil.com', 'javascript:alert(1)', '/nao/existe/mesmo', '']) {
    assert.equal(resolverDestino({ rota: ruim }, CAT, ROTAS_OK), null, ruim);
  }
  assert.equal(resolverDestino(null, CAT, ROTAS_OK), null);
  assert.equal(fluxoDoCatalogo(CAT, 'atlas', 'inventarios').rota, '/atlas/inventarios');
});
