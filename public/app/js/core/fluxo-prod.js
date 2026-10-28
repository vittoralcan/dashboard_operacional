// @ts-check
import { instanteDe, horaBR, tempoRelativo } from './format.js';
import { DIAS_SEMANA, somarDias, inicioDoDia } from './calendario.js';

/**
 * Lógica pura dos fluxos Captura (Digitalização BOREAL e os 4 fluxos ATLAS).
 * Um único módulo serve as 5 instâncias (RNB-003); cada uma é só uma configuração (`config/fluxos/*.json`,
 * mesmo schema de `GET …/config`).
 *
 * @typedef {'entrada'|'processo'|'erro'|'reprocessamento'|'espera'|'terminal'} TipoFase
 * @typedef {{ fasId: number, nome: string, tipo: TipoFase }} Fase
 * @typedef {{ fasId: number, titulo: string }} ColunaGestao
 * @typedef {{ de: string|number, para: string|number, bidirecional?: boolean, erro?: boolean }} ArestaCfg
 * @typedef {{ instancia: string, projeto: string, nome: string, sub: string, rota: string, fonte: 'atlas'|'boreal', aValidar: boolean,
 *             faseFinal: number, passo: { cw: number, ch: number, nw: number, nh: number }, gestaoColunas: ColunaGestao[], fases: Fase[],
 *             grafo: { nos: { fasId: number, x: number, y: number }[], juncoes: { id: string, x: number, y: number }[], arestas: ArestaCfg[] } }} ConfigFluxo
 * @typedef {Map<number, { pastas: number, imagens: number }>} StatusFases
 */

const num = (/** @type {unknown} */ v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

/** @param {ConfigFluxo} cfg @param {number} fasId */
export const faseDe = (cfg, fasId) => cfg.fases.find((f) => f.fasId === fasId) || null;

/** Classe visual do nó e cor no minimapa. `reprocessamento` (CQ 2) usa o mesmo vermelho das suspensões. @param {TipoFase} tipo */
export function estiloDaFase(tipo) {
  if (tipo === 'erro' || tipo === 'reprocessamento') return { cls: 'err', mm: 'err' };
  if (tipo === 'espera') return { cls: 'wait', mm: 'wait' };
  if (tipo === 'terminal') return { cls: 'final', mm: 'f' };
  return { cls: '', mm: '' };
}

/** `GET /status-fases` → mapa fasId → { pastas, imagens }. Fase ausente conta 0 (nunca inventa valor). @param {any} data */
export function normalizarStatus(data) {
  /** @type {StatusFases} */
  const m = new Map();
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      const id = Number(k);
      if (Number.isInteger(id) && v && typeof v === 'object') m.set(id, { pastas: num(/** @type {any} */ (v).pastas), imagens: num(/** @type {any} */ (v).imagens) });
    }
  }
  return m;
}

/** @param {StatusFases} st @param {number} id */
export const valoresDe = (st, id) => st.get(id) || { pastas: 0, imagens: 0 };

/**
 * RN-008: "paradas no fluxo" = TODAS as fases exceto a final e as de espera. A espera tem bloco próprio
 * ("Aguardando"); fases fora do manifesto (resíduos) nunca entram.
 * @param {ConfigFluxo} cfg @param {StatusFases} st
 */
export function contadoresParados(cfg, st) {
  let pastas = 0; let imagens = 0; let ep = 0; let ei = 0; let temEspera = false;
  for (const f of cfg.fases) {
    const v = valoresDe(st, f.fasId);
    if (f.tipo === 'terminal') continue;
    if (f.tipo === 'espera') { temEspera = true; ep += v.pastas; ei += v.imagens; continue; }
    pastas += v.pastas; imagens += v.imagens;
  }
  return { pastas, imagens, espera: temEspera ? { pastas: ep, imagens: ei } : null };
}

/** Mini-indicadores do cabeçalho (estoque de agora): entrada e final. @param {ConfigFluxo} cfg @param {StatusFases} st */
export function miniIndicadores(cfg, st) {
  const entrada = cfg.fases.find((f) => f.tipo === 'entrada');
  return { emAndamento: entrada ? valoresDe(st, entrada.fasId).pastas : 0, finalizados: valoresDe(st, cfg.faseFinal).pastas };
}

/** Maior carga em pastas entre as fases de percurso (sem a final, sempre cheia, nem a espera) — base da barra de carga. @param {ConfigFluxo} cfg @param {StatusFases} st */
export function maiorCarga(cfg, st) {
  return Math.max(0, ...cfg.fases.filter((f) => f.tipo !== 'terminal' && f.tipo !== 'espera').map((f) => valoresDe(st, f.fasId).pastas));
}

/**
 * `GET /gestao` → uma entrada por coluna configurada: totais do mês, série de 7 dias e (só BOREAL) estados.
 * @param {ConfigFluxo} cfg @param {any} data
 */
export function normalizarGestao(cfg, data) {
  return cfg.gestaoColunas.map((c) => {
    const d = data && data[`fase${c.fasId}`];
    const mensal = Array.isArray(d && d.graficoMes) ? d.graficoMes.filter((x) => x && typeof x === 'object') : null;
    const serie = mensal ? mensal.map((x) => num(x.imagens)) : Array.isArray(d && d.grafico7Dias) ? d.grafico7Dias.map(num) : [];
    const dias = mensal ? mensal.map((x) => String(x.dia ?? '').slice(8, 10).replace(/^0/, '')) : [];
    const lista = d && d.estados && Array.isArray(d.estados.lista)
      ? d.estados.lista.filter((/** @type {any} */ e) => e && e.nome).map((/** @type {any} */ e) => ({ nome: String(e.nome), total: num(e.total) })) : null;
    return {
      fasId: c.fasId, titulo: c.titulo, ausente: !d, dias, porTipo: d && d.porTipo,
      pastas: num(d && d.totaisMes && d.totaisMes.TotalPastas), imagens: num(d && d.totaisMes && d.totaisMes.TotalImagens),
      serie, estados: lista ? { lista, total: num(d.estados.total) || lista.reduce((s, e) => s + e.total, 0) } : null,
    };
  });
}

/**
 * Número que pode ser negativo ou ausente (variação, projeção): `null` quando não vem — nunca vira 0.
 * @param {unknown} v
 */
const numOuNulo = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * `resumo` ao lado das chaves `fase<N>` do `/gestao`: total finalizado no mês, meta, variação (RN-010), projeção
 * (RN-011) e o mês anterior. `null` quando o servidor não manda (versão antiga ou falha só do resumo — RNB-007): a tela esconde o bloco.
 * @param {any} r
 * @returns {{ finalizadasMes: { pastas: number, imagens: number }, metaPastas: number|null, variacaoPct: number|null, projecaoMes: number|null,
 *             mesAnterior: { pastas: number, imagens: number, ateDia: number|null }|null }|null}
 */
export function normalizarResumoMes(r) {
  if (!r || typeof r !== 'object' || !r.finalizadasMes) return null;
  const meta = numOuNulo(r.metaPastas);
  const ma = r.mesAnterior && typeof r.mesAnterior === 'object' ? r.mesAnterior : null;
  return {
    finalizadasMes: { pastas: num(r.finalizadasMes.pastas), imagens: num(r.finalizadasMes.imagens) },
    metaPastas: meta !== null && meta > 0 ? meta : null,
    variacaoPct: numOuNulo(r.variacaoPct),
    projecaoMes: numOuNulo(r.projecaoMes),
    mesAnterior: ma ? { pastas: num(ma.pastas), imagens: num(ma.imagens), ateDia: numOuNulo(ma.ateDia) } : null,
  };
}

/** Rótulos reais dos últimos 7 dias (Seg, Ter…), do mais antigo ao de hoje. @param {Date} [hoje] */
export function rotulosUltimos7Dias(hoje = new Date()) {
  const h = inicioDoDia(hoje);
  return Array.from({ length: 7 }, (_, i) => { const d = DIAS_SEMANA[somarDias(h, i - 6).getDay()]; return d[0].toUpperCase() + d.slice(1); });
}

/**
 * FLX-13: "Dados de HH:MM · há N min"; âmbar quando `atrasado`. `ultimaSincronizacao: null` = nunca sincronizou.
 * @param {any} data `{ ultimaSincronizacao, atrasado }` @param {Date} [agora]
 */
export function indicadorSincronizacao(data, agora = new Date()) {
  const ts = data && data.ultimaSincronizacao ? new Date(data.ultimaSincronizacao) : null;
  if (!ts || Number.isNaN(ts.getTime())) return { texto: 'Sem sincronização registrada', atrasado: true };
  const seg = Math.max(0, (agora.getTime() - ts.getTime()) / 1000);
  return { texto: `Dados de ${horaBR(ts)} · ${tempoRelativo(seg)}`, atrasado: !!(data && data.atrasado) };
}

/** Linhas de `/fase/:id/pastas`. @param {any} arr */
export function normalizarPastas(arr) {
  return (Array.isArray(arr) ? arr : []).filter((l) => l && typeof l === 'object').map((/** @type {any} */ l) => ({
    fase: String(l.Fase ?? ''), projeto: String(l.Projeto ?? ''), lote: String(l.Lote ?? ''), pasta: String(l.Pasta ?? ''),
    documentos: num(l.Documentos), imagens: num(l.Imagens),
  }));
}

/** Linhas de `/fase/:id/pastas-por-lote` (fases de espera). @param {any} arr */
export function normalizarPorLote(arr) {
  return (Array.isArray(arr) ? arr : []).filter((l) => l && typeof l === 'object').map((/** @type {any} */ l) => ({
    lote: String(l.Lote ?? ''), pastas: num(l.Pastas), imagens: num(l.Imagens),
  }));
}

/** `GET /relatorio` → `{ totais:{pastas,imagens}, lista:[…] }`. @param {any} data */
export function normalizarRelatorioFase(data) {
  const brutas = (Array.isArray(data && data.lista) ? data.lista : []).filter((/** @type {unknown} */ l) => l && typeof l === 'object');
  const linhas = brutas.map((/** @type {any} */ b) => ({
    ...normalizarPastas([b])[0], dataFinalizado: String(b.DataFinalizado ?? ''), _ts: instanteDe(b.DataFinalizado),
  }));
  const t = data && data.totais;
  return { totais: { pastas: num(t && t.pastas) || linhas.length, imagens: num(t && t.imagens) || linhas.reduce((s, l) => s + l.imagens, 0) }, linhas };
}
