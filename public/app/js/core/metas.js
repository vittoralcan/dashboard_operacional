// @ts-check

/**
 * Metas mensais (api_noir.md B7): normalização da resposta de `GET /metas`, escopos que aceitam meta, validação do valor digitado
 * e cálculo do progresso. Módulo pequeno e separado de propósito: quase toda tela com medidor de meta o importa (orçamento RNB-015).
 */

const num = (/** @type {unknown} */ v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const txt = (/** @type {unknown} */ v) => String(v ?? '');
const lista = (/** @type {any} */ d) => (Array.isArray(d) ? d : []);

// ---------------------------------------------------------------- metas (B7)

export const VALOR_META_MAX = 10000000;

/** @typedef {{ projeto: string, escopo: string, ano: number, mes: number, valor: number, unidade: 'pastas'|'caixas'|'documentos' }} Meta */

/** `GET /metas` → lista de metas do mês. @param {any} data @returns {Meta[]} */
export function normalizarMetas(data) {
  return lista(data).filter((m) => m && m.projeto && m.escopo && Number(m.valor) > 0).map((m) => ({
    projeto: txt(m.projeto), escopo: txt(m.escopo), ano: num(m.ano), mes: num(m.mes), valor: num(m.valor),
    unidade: /** @type {Meta['unidade']} */ (['pastas', 'caixas', 'documentos'].includes(m.unidade) ? m.unidade : 'pastas'),
  }));
}

/** @param {Meta[]} metas @param {string} projeto @param {string} escopo */
export const metaDoEscopo = (metas, projeto, escopo) => metas.find((m) => m.projeto === projeto && m.escopo === escopo) || null;

/**
 * O que pode ter meta (a tela de metas): os 4 fluxos do ATLAS (pastas).
 * `escopo` é o que o servidor grava: id da instância (`certidoes`).
 * @param {import('./catalogo.js').Catalogo} cat
 * @returns {{ projeto: string, projetoNome: string, escopo: string, nome: string, unidade: Meta['unidade'], icone: string }[]}
 */
export function escoposDeMeta(cat) {
  /** @type {ReturnType<typeof escoposDeMeta>} */
  const out = [];
  for (const p of cat.projetos) {
    if (p.status !== 'ativo') continue;
    for (const f of p.fluxos) out.push({ projeto: p.id, projetoNome: p.sigla, escopo: f.id, nome: f.nome, unidade: 'pastas', icone: f.icone });
  }
  return out;
}

/** Valor digitado na tela de metas: inteiro de 1 a 10.000.000 (mesma regra do servidor). @param {string} texto */
export function validarValorMeta(texto) {
  const t = String(texto ?? '').trim().replace(/\./g, '');
  if (!/^\d+$/.test(t)) return /** @type {const} */ ({ ok: false, erro: 'Informe um número inteiro maior que zero.' });
  const v = Number(t);
  if (v < 1 || v > VALOR_META_MAX) return /** @type {const} */ ({ ok: false, erro: 'A meta deve estar entre 1 e 10.000.000.' });
  return /** @type {const} */ ({ ok: true, valor: v });
}

/**
 * Progresso de uma meta: % (sem teto — passar de 100 % é informação), quanto falta e se está "no verde" (≥ 90 %, design system §7.5).
 * @param {number} valor @param {number|null} meta
 */
export function progressoDaMeta(valor, meta) {
  if (!meta || meta <= 0) return null;
  return { pct: (valor / meta) * 100, faltam: Math.max(0, meta - valor), ok: valor / meta >= 0.9 };
}
