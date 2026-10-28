// @ts-check

/**
 * Gargalos: normalização de `GET /gargalos` e de `GET /atlas/:instancia/gargalos`, e a linha do cartão
 * "Gargalos agora". Funções puras: o que o servidor não manda vira `null`, nunca um valor inventado.
 */

const num = (/** @type {unknown} */ v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const txt = (/** @type {unknown} */ v) => String(v ?? '');
const lista = (/** @type {any} */ d) => (Array.isArray(d) ? d : []);

// ---------------------------------------------------------------- gargalos (B4/B5)

/** @typedef {{ projeto: string, instancia: string, fasId: number, nome: string, pastas: number, pctParadas: number|null }} Gargalo */

/** `GET /gargalos` (agregado; já vem ordenado por pastas, mas garantimos). @param {any} data @returns {Gargalo[]} */
export function normalizarGargalos(data) {
  return lista(data).filter((g) => g && g.instancia && Number.isInteger(Number(g.fasId))).map((g) => ({
    projeto: txt(g.projeto), instancia: txt(g.instancia), fasId: Number(g.fasId), nome: txt(g.nome), pastas: num(g.pastas),
    pctParadas: g.pctParadas === null || g.pctParadas === undefined ? null : num(g.pctParadas),
  })).sort((a, b) => b.pastas - a.pastas);
}

/** Uma fase de gargalo (de vazão ou de volume) ou `null` quando ausente/inválida. */
const faseDeGargalo = (/** @type {any} */ g) => (g && Number.isInteger(Number(g.fasId)) ? { fasId: Number(g.fasId), nome: txt(g.nome), pastas: num(g.pastas), imagens: num(g.imagens), pctParadas: g.pctParadas === null || g.pctParadas === undefined ? null : num(g.pctParadas) } : null);

/** `GET /:projeto/:instancia/gargalos` → o gargalo de vazão, o de alto volume (ou `null`) e a base "paradas". @param {any} data */
export function normalizarGargaloInstancia(data) {
  return {
    gargalo: faseDeGargalo(data && data.gargalo),
    altoVolume: faseDeGargalo(data && data.altoVolume),
    paradas: { pastas: num(data && data.paradas && data.paradas.pastas), imagens: num(data && data.paradas && data.paradas.imagens) },
  };
}

/** Fluxo do catálogo por id de instância (o servidor manda `instancia`, o front manda a rota). @param {import('./catalogo.js').Catalogo} cat @param {string} projeto @param {string} instancia */
export function fluxoDoCatalogo(cat, projeto, instancia) {
  const p = cat.projetos.find((x) => x.id === projeto);
  return (p && p.fluxos.find((f) => f.id === instancia)) || null;
}

/**
 * Linha do cartão "Gargalos agora": nome da fase, "Projeto · Fluxo", % das paradas e a rota do fluxograma (com foco no nó).
 * Instância desconhecida no catálogo (backend mais novo que o front) mostra o id e **não navega**.
 * @param {Gargalo} g @param {import('./catalogo.js').Catalogo} cat
 */
export function gargaloParaCartao(g, cat) {
  const p = cat.projetos.find((x) => x.id === g.projeto);
  const f = fluxoDoCatalogo(cat, g.projeto, g.instancia);
  return {
    titulo: g.nome, pastas: g.pastas, pct: g.pctParadas,
    onde: `${(p && p.sigla) || g.projeto} · ${(f && f.nome) || g.instancia}`,
    rota: f ? `${f.rota}/fluxograma` : null,
    foco: { instancia: g.instancia, fasId: g.fasId },
  };
}
