// @ts-check
/** Contraste WCAG entre cores (usado pelo catálogo `#/_ui` para provar os tokens AA). Funções puras. */

/**
 * Converte "rgb(r, g, b)", "rgba(r, g, b, a)" ou "#rrggbb" em [r,g,b]; `null` se não reconhecer.
 * @param {string} css @returns {[number, number, number] | null}
 */
export function paraRgb(css) {
  const s = String(css).trim();
  let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) { const [r, g, b] = [...m[1]].map((c) => parseInt(c + c, 16)); return [r, g, b]; }
  return null;
}

/** Luminância relativa (WCAG 2). @param {[number, number, number]} rgb */
export function luminancia([r, g, b]) {
  const c = [r, g, b].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Razão de contraste (1–21). @param {[number, number, number]} a @param {[number, number, number]} b */
export function razaoContraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mistura `frente` (com alpha) sobre `fundo`. @param {[number, number, number]} frente @param {number} alpha @param {[number, number, number]} fundo @returns {[number, number, number]} */
export const sobre = (frente, alpha, fundo) => /** @type {[number, number, number]} */ ([0, 1, 2].map((i) => Math.round(frente[i] * alpha + fundo[i] * (1 - alpha))));
