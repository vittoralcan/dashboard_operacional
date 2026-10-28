// @ts-check
import { miniIndicadores } from './fluxo-prod.js';

/**
 * Lógica pura da seleção de projetos, dos hubs e dos números "de hoje".
 * Enquanto `GET /painel/resumo` (recurso `painel.resumo`) não existe, o front monta o MESMO formato interno chamando as
 * rotas de cada módulo: quando o endpoint chegar, troca-se só a camada de dados — estas funções ficam.
 *
 * Nada aqui inventa valor: dado ausente é `null` (a tela mostra "—"), nunca 0.
 *
 * @typedef {{ instancia: string, projeto: 'boreal'|'atlas', emAndamento: number|null, finalizados: number|null,
 *             mes: { pastas: number, imagens: number }|null, serie: number[]|null,
 *             meta: number|null, variacaoPct: number|null, projecaoMes: number|null, mesAnterior: MesAnterior|null }} ResumoInstancia
 * @typedef {{ online: number, total: number }} ApisOnline
 */

/** Número ≥ 0 ou `null` (vazio, texto ou negativo não viram 0). @param {unknown} x */
export function numeroOuNulo(x) {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Soma séries alinhadas pelo FIM (o último valor é sempre "hoje"). @param {number[][]} series */
export function somarSeries(series) {
  const n = Math.max(0, ...series.map((s) => s.length));
  const out = new Array(n).fill(0);
  for (const s of series) s.forEach((v, i) => { out[n - s.length + i] += v; });
  return out;
}

/** @typedef {{ pastas: number, imagens: number, ateDia: number|null }} MesAnterior */

/**
 * Resumo de UMA instância Captura a partir do que a tela de fluxo já normaliza (status das fases + coluna "Finalizados"
 * do /gestao + o `resumo` de meta/variação). Cada metade pode faltar sozinha (`null`) — uma rota fora do ar não derruba a outra.
 * @param {{ cfg: import('./fluxo-prod.js').ConfigFluxo, status: import('./fluxo-prod.js').StatusFases|null,
 *           gestao: ReturnType<typeof import('./fluxo-prod.js').normalizarGestao>|null,
 *           resumoMes?: ReturnType<typeof import('./fluxo-prod.js').normalizarResumoMes>|null }} p
 * @returns {ResumoInstancia}
 */
export function resumoDaInstancia(p) {
  const m = p.status ? miniIndicadores(p.cfg, p.status) : null;
  const col = p.gestao ? p.gestao.find((c) => c.fasId === p.cfg.faseFinal && !c.ausente) : null;
  const r = p.resumoMes || null;
  return {
    instancia: p.cfg.instancia,
    projeto: p.cfg.fonte === 'atlas' ? 'atlas' : 'boreal',
    emAndamento: m ? m.emAndamento : null,
    finalizados: col ? col.pastas : m ? m.finalizados : null,
    mes: col ? { pastas: col.pastas, imagens: col.imagens } : null,
    serie: col && col.serie.length ? col.serie : null,
    meta: r ? r.metaPastas : null,
    variacaoPct: r ? r.variacaoPct : null,
    projecaoMes: r ? r.projecaoMes : null,
    mesAnterior: r ? r.mesAnterior : null,
  };
}

/**
 * Uma instância do `GET /painel/resumo` (B6) no MESMO formato de `resumoDaInstancia` — as telas não sabem de onde veio.
 * `null` (instância que falhou no servidor) continua `null`.
 * @param {string} id @param {any} d @returns {ResumoInstancia|null}
 */
export function resumoDoPainel(id, d) {
  if (!d || typeof d !== 'object') return null;
  const fm = d.finalizadasMes && typeof d.finalizadasMes === 'object' ? d.finalizadasMes : null;
  const ma = d.mesAnterior && typeof d.mesAnterior === 'object' ? d.mesAnterior : null;
  const meta = Number(d.metaPastas);
  const vp = d.variacaoPct === null || d.variacaoPct === undefined || !Number.isFinite(Number(d.variacaoPct)) ? null : Number(d.variacaoPct); // pode ser negativo
  const serie = Array.isArray(d.serieMes) ? d.serieMes.map((x) => numeroOuNulo(x && x.imagens) ?? 0) : Array.isArray(d.serie7Dias) ? d.serie7Dias.map((v) => numeroOuNulo(v) ?? 0) : [];
  return {
    instancia: id, projeto: d.projeto === 'boreal' ? 'boreal' : 'atlas',
    emAndamento: numeroOuNulo(d.emAndamento), finalizados: fm ? numeroOuNulo(fm.pastas) : numeroOuNulo(d.finalizadosTotal),
    mes: fm ? { pastas: numeroOuNulo(fm.pastas) ?? 0, imagens: numeroOuNulo(fm.imagens) ?? 0 } : null,
    serie: serie.length ? serie : null,
    meta: Number.isFinite(meta) && meta > 0 ? meta : null,
    variacaoPct: vp,
    projecaoMes: numeroOuNulo(d.projecaoMes),
    mesAnterior: ma ? { pastas: numeroOuNulo(ma.pastas) ?? 0, imagens: numeroOuNulo(ma.imagens) ?? 0, ateDia: numeroOuNulo(ma.ateDia) } : null,
  };
}

/**
 * KPI do cartão de projeto: imagens e pastas finalizadas no mês (soma das instâncias) + série de 7 dias + variação das IMAGENS
 * (ΣA − ΣB) / ΣB. `parcial` avisa que alguma instância não respondeu — o total não pode parecer completo.
 * A variação só existe se TODAS as instâncias que contam trouxeram o mês anterior (senão compararia coisas diferentes).
 * @param {(ResumoInstancia|null)[]} resumos
 */
export function kpiDoProjeto(resumos) {
  const com = /** @type {ResumoInstancia[]} */ (resumos.filter((r) => r && r.mes));
  if (!com.length) return { imagens: /** @type {number|null} */ (null), pastas: /** @type {number|null} */ (null), serie: /** @type {number[]|null} */ (null), variacaoPct: /** @type {number|null} */ (null), parcial: false, faltam: resumos.length };
  const series = /** @type {number[][]} */ (com.map((r) => r.serie).filter((s) => s && s.length));
  const imagens = com.reduce((t, r) => t + /** @type {NonNullable<ResumoInstancia['mes']>} */ (r.mes).imagens, 0);
  const todasComAnterior = com.every((r) => r.mesAnterior);
  const anterior = todasComAnterior ? com.reduce((t, r) => t + /** @type {MesAnterior} */ (r.mesAnterior).imagens, 0) : 0;
  return {
    imagens,
    pastas: com.reduce((t, r) => t + /** @type {NonNullable<ResumoInstancia['mes']>} */ (r.mes).pastas, 0),
    serie: series.length ? somarSeries(series) : null,
    variacaoPct: todasComAnterior && anterior > 0 ? Number((((imagens - anterior) / anterior) * 100).toFixed(1)) : null,
    parcial: com.length < resumos.length,
    faltam: resumos.length - com.length,
  };
}

/** Instâncias do ATLAS na ordem em que aparecem (Macro View, hub). */
export const INSTANCIAS_ATLAS = /** @type {const} */ (['negativos', 'certidoes', 'inventarios', 'cartografia']);

/** Tipo de acervo de cada instância do ATLAS (o mesmo agrupamento de `apresentacao.grupo` do manifesto). */
export const TIPO_ATLAS = /** @type {Record<string, 'papel'|'negativo'>} */ ({ negativos: 'negativo', 'certidoes': 'papel', inventarios: 'papel', 'cartografia': 'papel' });

/** `GET /atlas/macro-view/summary` → imagens de hoje por instância (cada uma pode vir `null` sozinha). @param {any} j @returns {Record<string, number|null>} */
export function normalizarHojeAtlas(j) {
  const d = (j && typeof j === 'object' && (j.data || j)) || {};
  return Object.fromEntries(INSTANCIAS_ATLAS.map((id) => [id, numeroOuNulo(d[id] && d[id].imagensHoje)]));
}

/**
 * Mantém o ÚLTIMO valor bom: o que veio `null` (bloco que falhou) não apaga o que já se sabia (RA-015).
 * @template {Record<string, any>} T
 * @param {T} anterior @param {T} novo @returns {T}
 */
export function mesclarValores(anterior, novo) {
  /** @type {any} */
  const out = { ...anterior };
  for (const k of Object.keys(novo)) if (novo[k] !== null && novo[k] !== undefined) out[k] = novo[k];
  return out;
}

/** Selo do cartão de Monitoramento: "N fora do ar" pulsando ou "Ativo". @param {ApisOnline|null} a */
export function seloMonitoramento(a) {
  if (!a) return { cls: 'nodot', texto: '—' };
  const fora = a.total - a.online;
  return fora > 0 ? { cls: 'err pulse', texto: `${fora} fora do ar` } : { cls: 'ok', texto: 'Ativo' };
}

/** Unidade do KPI de cada módulo do BOREAL. */
export const UNIDADE_MODULO = /** @type {Record<string, string>} */ ({
  higienizacao: 'caixas finalizadas no mês',
  digitalizacao: 'pastas finalizadas no mês',
  indexacao: 'documentos incluídos no mês',
  aips: 'AIPs gerados no total',
  monitoramento: 'APIs online agora',
});

/** Papel e negativo não se somam: um total de `kpiDoProjeto` por tipo. @param {Record<string, ResumoInstancia|null|undefined>} porInstancia
 */
export function kpiAtlasPorTipo(porInstancia) {
  const de = (/** @type {'papel'|'negativo'} */ tipo) => kpiDoProjeto(INSTANCIAS_ATLAS.filter((id) => TIPO_ATLAS[id] === tipo).map((id) => porInstancia[id] || null));
  return { papel: de('papel'), negativo: de('negativo') };
}

/** Módulos que aparecem como cartão no hub (o Registro de Caixas é app do operador: tem botão próprio). @param {import('./catalogo.js').Projeto} projeto */
export const modulosDoHub = (projeto) => projeto.modulos.filter((m) => m.id !== 'registro-caixas');

/** Barras do "uptime-mini" do Monitoramento: uma por API — verde (online), âmbar (lenta, só no monitor nativo) ou vermelha. @param {{ online: boolean, estado?: string|null }[]} apis */
export const blocosDeUptime = (apis) => apis.map((a) => (a.estado === 'lenta' ? 'l' : a.online ? 'ok' : 'f'));

/** Mês por extenso em maiúsculas ("OUTUBRO"). @param {Date} [d] */
export const mesMaiusculo = (d = new Date()) => ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'][d.getMonth()];
