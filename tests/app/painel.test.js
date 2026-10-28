import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  numeroOuNulo, somarSeries, resumoDaInstancia, kpiDoProjeto,normalizarHojeAtlas, mesclarValores,
  seloMonitoramento, modulosDoHub, blocosDeUptime, mesMaiusculo, INSTANCIAS_ATLAS, resumoDoPainel, kpiAtlasPorTipo,
} from '../../public/app/js/core/painel.js';
import { normalizarStatus, normalizarGestao, normalizarResumoMes } from '../../public/app/js/core/fluxo-prod.js';

const CFG = {
  instancia: 'negativos', projeto: 'ATLAS', nome: 'Negativos', rota: '/atlas/negativos', fonte: 'atlas', aValidar: false, faseFinal: 12,
  gestaoColunas: [{ fasId: 7, titulo: 'CQ' }, { fasId: 12, titulo: 'Finalizados' }],
  fases: [{ fasId: 50, nome: 'Importação', tipo: 'entrada' }, { fasId: 7, nome: 'CQ', tipo: 'processo' }, { fasId: 12, nome: 'Finalizado', tipo: 'terminal' }],
};
const STATUS = normalizarStatus({ 50: { pastas: 58, imagens: 900 }, 7: { pastas: 10, imagens: 1 }, 12: { pastas: 612, imagens: 99999 } });
const GESTAO = normalizarGestao(CFG, {
  fase7: { totaisMes: { TotalPastas: 400, TotalImagens: 5 }, grafico7Dias: [1, 2, 3, 4, 5, 6, 7] },
  fase12: { totaisMes: { TotalPastas: 330, TotalImagens: 72600 }, grafico7Dias: [86, 97, 92, 106, 101, 0, 52] },
});

test('numeroOuNulo: vazio, texto e negativo NÃO viram 0 (a tela mostra "—")', () => {
  assert.equal(numeroOuNulo(0), 0);
  assert.equal(numeroOuNulo('12'), 12);
  for (const v of [null, undefined, '', 'abc', -1, NaN, Infinity]) assert.equal(numeroOuNulo(v), null, String(v));
});

test('somarSeries: alinha pelo FIM (o último é sempre hoje)', () => {
  assert.deepEqual(somarSeries([[1, 2, 3], [10, 20, 30]]), [11, 22, 33]);
  assert.deepEqual(somarSeries([[1, 2, 3], [10]]), [1, 2, 13]);
  assert.deepEqual(somarSeries([]), []);
});

test('resumoDaInstancia: em andamento = fase de entrada, finalizados = fase final, mês = coluna final do /gestao', () => {
  const r = resumoDaInstancia({ cfg: CFG, status: STATUS, gestao: GESTAO });
  assert.deepEqual([r.projeto, r.emAndamento, r.finalizados], ['atlas', 58, 330]);
  assert.deepEqual(r.mes, { pastas: 330, imagens: 72600 });
  assert.deepEqual(r.serie, [86, 97, 92, 106, 101, 0, 52]);
  assert.deepEqual([r.meta, r.variacaoPct, r.projecaoMes, r.mesAnterior], [null, null, null, null], 'sem `resumo` do servidor: nada de meta/variação inventados');
});

test('resumoDaInstancia: meta, variação (pode ser negativa), projeção e mês anterior vêm do `resumo` do /gestao', () => {
  const resumoMes = normalizarResumoMes({ faseFinal: 12, finalizadasMes: { pastas: 330, imagens: 72600 }, metaPastas: 750, variacaoPct: -4.1, projecaoMes: 682, mesAnterior: { pastas: 317, imagens: 69740, ateDia: 15 } });
  const r = resumoDaInstancia({ cfg: CFG, status: STATUS, gestao: GESTAO, resumoMes });
  assert.deepEqual([r.meta, r.variacaoPct, r.projecaoMes], [750, -4.1, 682]);
  assert.deepEqual(r.mesAnterior, { pastas: 317, imagens: 69740, ateDia: 15 });
});

test('normalizarResumoMes: ausente → null; meta 0/ausente → null; variação null continua null', () => {
  assert.equal(normalizarResumoMes(undefined), null);
  assert.equal(normalizarResumoMes({}), null);
  const r = normalizarResumoMes({ finalizadasMes: { pastas: 5, imagens: 9 }, metaPastas: 0, variacaoPct: null, projecaoMes: 10, mesAnterior: null });
  assert.deepEqual([r.metaPastas, r.variacaoPct, r.projecaoMes, r.mesAnterior], [null, null, 10, null]);
});

test('resumoDoPainel: instância do /painel/resumo no MESMO formato interno; null continua null', () => {
  const d = { projeto: 'atlas', emAndamento: 58, finalizadosTotal: 612, finalizadasMes: { pastas: 330, imagens: 72600 }, metaPastas: 750, variacaoPct: -4.1, projecaoMes: 682,
    serie7Dias: [86, 97, 92, 106, 101, 0, 52], mesAnterior: { pastas: 317, imagens: 69740, ateDia: 15 }, sincronizacao: { ultimaSincronizacao: null, atrasado: true } };
  const r = resumoDoPainel('negativos', d);
  assert.deepEqual([r.instancia, r.projeto, r.emAndamento, r.finalizados, r.meta, r.variacaoPct, r.projecaoMes], ['negativos', 'atlas', 58, 330, 750, -4.1, 682]);
  assert.deepEqual(r.mes, { pastas: 330, imagens: 72600 });
  assert.deepEqual(r.serie, [86, 97, 92, 106, 101, 0, 52]);
  assert.equal(resumoDoPainel('inventarios', null), null, 'instância que falhou no servidor');
  const sem = resumoDoPainel('x', { projeto: 'atlas', emAndamento: 1, finalizadosTotal: 2, metaPastas: null, variacaoPct: null, serie7Dias: [] });
  assert.deepEqual([sem.mes, sem.meta, sem.variacaoPct, sem.serie, sem.mesAnterior], [null, null, null, null, null]);
});

test('resumoDaInstancia: cada metade pode faltar sozinha (null, nunca 0 inventado)', () => {
  const semGestao = resumoDaInstancia({ cfg: CFG, status: STATUS, gestao: null });
  assert.deepEqual([semGestao.emAndamento, semGestao.mes, semGestao.serie], [58, null, null]);
  const semStatus = resumoDaInstancia({ cfg: CFG, status: null, gestao: GESTAO });
  assert.deepEqual([semStatus.emAndamento, semStatus.finalizados, semStatus.mes.pastas], [null, 330, 330]);
  const ausente = resumoDaInstancia({ cfg: CFG, status: STATUS, gestao: normalizarGestao(CFG, { fase7: { totaisMes: { TotalPastas: 1, TotalImagens: 1 }, grafico7Dias: [] } }) });
  assert.equal(ausente.mes, null, 'a coluna da fase final não veio no /gestao');
  assert.equal(resumoDaInstancia({ cfg: { ...CFG, fonte: 'boreal' }, status: null, gestao: null }).projeto, 'boreal');
});

test('kpiDoProjeto: soma imagens/pastas/série, calcula a variação das IMAGENS e avisa quando é parcial', () => {
  const a = { instancia: 'a', projeto: 'atlas', emAndamento: 1, finalizados: 1, mes: { pastas: 10, imagens: 100 }, serie: [1, 2, 3], meta: null, variacaoPct: null, projecaoMes: null, mesAnterior: { pastas: 8, imagens: 80, ateDia: 4 } };
  const b = { instancia: 'b', projeto: 'atlas', emAndamento: 1, finalizados: 1, mes: { pastas: 5, imagens: 50 }, serie: [10, 20, 30], meta: null, variacaoPct: null, projecaoMes: null, mesAnterior: { pastas: 5, imagens: 70, ateDia: 4 } };
  assert.deepEqual(kpiDoProjeto([a, b]), { imagens: 150, pastas: 15, serie: [11, 22, 33], variacaoPct: 0, parcial: false, faltam: 0 });
  assert.equal(kpiDoProjeto([a, { ...b, mes: { pastas: 5, imagens: 80 } }]).variacaoPct, 20, '(180 − 150) / 150');
  const p = kpiDoProjeto([a, null, b, null]);
  assert.deepEqual([p.imagens, p.parcial, p.faltam], [150, true, 2]);
  const nada = kpiDoProjeto([null, null]);
  assert.deepEqual([nada.imagens, nada.pastas, nada.serie, nada.variacaoPct, nada.faltam], [null, null, null, null, 2], 'tudo falhou: KPI "—", não 0');
  assert.equal(kpiDoProjeto([{ ...a, serie: null }]).serie, null);
  assert.equal(kpiDoProjeto([a, { ...b, mesAnterior: null }]).variacaoPct, null, 'uma instância sem mês anterior: não compara coisas diferentes');
  assert.equal(kpiDoProjeto([{ ...a, mesAnterior: { pastas: 0, imagens: 0, ateDia: 4 } }]).variacaoPct, null, 'mês anterior zerado: sem variação');
});

test('normalizarHojeAtlas: uma chave por instância; cada uma pode vir null sozinha', () => {
  const r = normalizarHojeAtlas({ success: true, data: { negativos: { imagensHoje: 100 }, 'cartografia': null, inventarios: { imagensHoje: 'x' } } });
  assert.deepEqual(Object.keys(r), [...INSTANCIAS_ATLAS]);
  assert.deepEqual(r, { negativos: 100, 'certidoes': null, inventarios: null, 'cartografia': null });
});

test('mesclarValores: bloco que falhou (null) mantém o ÚLTIMO valor bom (RA-015)', () => {
  const antes = { caixas: 10, imagens: 500, documentos: 7 };
  assert.deepEqual(mesclarValores(antes, { caixas: null, imagens: 520, documentos: null }), { caixas: 10, imagens: 520, documentos: 7 });
  assert.deepEqual(mesclarValores(antes, { caixas: 0, imagens: 0, documentos: 0 }), { caixas: 0, imagens: 0, documentos: 0 }, 'zero é valor, não falha');
  assert.deepEqual(antes, { caixas: 10, imagens: 500, documentos: 7 }, 'não altera o original');
});

test('seloMonitoramento: "N fora do ar" pulsando ou "Ativo"', () => {
  assert.deepEqual(seloMonitoramento({ online: 5, total: 6 }), { cls: 'err pulse', texto: '1 fora do ar' });
  assert.deepEqual(seloMonitoramento({ online: 6, total: 6 }), { cls: 'ok', texto: 'Ativo' });
  assert.equal(seloMonitoramento(null).texto, '—');
});

test('modulosDoHub tira o Registro de Caixas; blocosDeUptime: uma barra por API', () => {
  const p = { modulos: [{ id: 'higienizacao' }, { id: 'registro-caixas' }, { id: 'aips' }] };
  assert.deepEqual(modulosDoHub(p).map((m) => m.id), ['higienizacao', 'aips']);
  assert.deepEqual(blocosDeUptime([{ online: true }, { online: false }]), ['ok', 'f']);
});

test('mesMaiusculo', () => {
  assert.equal(mesMaiusculo(new Date(2026, 9, 4)), 'OUTUBRO');
  assert.equal(mesMaiusculo(new Date(2026, 2, 1)), 'MARÇO');
});

test('resumoDoPainel / normalizarGestao: serieMes (imagens por dia, mês até hoje) tem prioridade sobre os 7 dias antigos', () => {
  const serieMes = [{ dia: '2026-10-01', pastas: 1, imagens: 10 }, { dia: '2026-10-02', pastas: 0, imagens: 0 }, { dia: '2026-10-03', pastas: 2, imagens: 25 }];
  const r = resumoDoPainel('negativos', { projeto: 'atlas', finalizadasMes: { pastas: 3, imagens: 35 }, serieMes, serie7Dias: [9, 9, 9] });
  assert.deepEqual(r.serie, [10, 0, 25]);
  assert.equal(r.serie.reduce((s, v) => s + v, 0), r.mes.imagens, 'a soma da série bate com o KPI do mês');
  const g = normalizarGestao(CFG, { fase12: { totaisMes: { TotalPastas: 3, TotalImagens: 35 }, graficoMes: serieMes, grafico7Dias: [9, 9, 9] } });
  const f = g.find((c) => c.fasId === 12);
  assert.deepEqual([f.serie, f.dias], [[10, 0, 25], ['1', '2', '3']]);
});

test('kpiAtlasPorTipo: papel (certidoes, inventários, cartografia) e negativo em totais SEPARADOS, nunca somados', () => {
  const r = (id, pastas, imagens, ant) => ({ instancia: id, projeto: 'atlas', emAndamento: 1, finalizados: pastas, mes: { pastas, imagens }, serie: [pastas], meta: null, variacaoPct: null, projecaoMes: null, mesAnterior: { pastas: 1, imagens: ant, ateDia: 4 } });
  const k = kpiAtlasPorTipo({ negativos: r('negativos', 4, 400, 200), 'certidoes': r('certidoes', 10, 100, 100), inventarios: r('inventarios', 5, 50, 50), 'cartografia': null });
  assert.deepEqual([k.negativo.imagens, k.negativo.pastas, k.negativo.variacaoPct], [400, 4, 100]);
  assert.deepEqual([k.papel.imagens, k.papel.pastas, k.papel.parcial, k.papel.faltam], [150, 15, true, 1]);
  assert.equal(kpiAtlasPorTipo({}).papel.imagens, null, 'sem dado: null, nunca 0');
});
