// @ts-check
/** Geometria pura dos gráficos (sem DOM — testável): escala, curva monótona, rótulos do eixo. */

/**
 * Teto "bonito" do eixo Y: 1, 2, 2.5, 5 ou 10 × potência de 10.
 * @param {number} v
 */
export function tetoBonito(v) {
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/**
 * Curva monótona (Fritsch–Carlson): suave, sem "overshoot" abaixo de zero em fins de semana.
 * @param {[number, number][]} pts pontos [x, y] com x crescente
 * @returns {string} atributo `d` de um <path>
 */
export function curvaMonotona(pts) {
  const n = pts.length;
  if (n === 0) return '';
  const r = (/** @type {number} */ v) => v.toFixed(1);
  if (n === 1) return `M${r(pts[0][0])},${r(pts[0][1])}`;
  const dx = [];
  const m = [];
  const t = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1);
  }
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else t[i] = (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  }
  let d = `M${r(pts[0][0])},${r(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${r(pts[i][0] + h)},${r(pts[i][1] + h * t[i])} ${r(pts[i + 1][0] - h)},${r(pts[i + 1][1] - h * t[i + 1])} ${r(pts[i + 1][0])},${r(pts[i + 1][1])}`;
  }
  return d;
}

/**
 * Quais rótulos do eixo X mostrar: passo que dá ≥ `minPx` entre rótulos; o último sempre aparece.
 * @param {number} total @param {number} larguraUtil @param {number} [minPx]
 * @returns {number[]} índices
 */
export function indicesRotulos(total, larguraUtil, minPx = 42) {
  if (total <= 0) return [];
  const passo = Math.max(1, Math.ceil(total / Math.max(2, Math.floor(larguraUtil / minPx))));
  const out = [];
  for (let i = 0; i < total; i++) if (i % passo === 0 || i === total - 1) out.push(i);
  // evita dois rótulos colados no fim: o penúltimo some se estiver a menos de UM passo do último (com passo/2, "18:26 18:27" se sobrepunha)
  if (out.length > 2 && total - 1 - out[out.length - 2] < passo) out.splice(out.length - 2, 1);
  return out;
}

/**
 * Perímetro do anel e deslocamento do traço para um percentual 0..1.
 * @param {number} pct @param {number} tamanho @param {number} espessura
 */
export function geometriaAnel(pct, tamanho, espessura) {
  const r = (tamanho - espessura) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  return { r, circunferencia: c, deslocamento: c * (1 - p) };
}

/**
 * Índice do ponto mais próximo de um x (crosshair do gráfico de linha).
 * @param {number} x @param {number} xInicio @param {number} larguraUtil @param {number} total
 */
export function indiceMaisProximo(x, xInicio, larguraUtil, total) {
  if (total <= 1) return 0;
  const i = Math.round(((x - xInicio) / larguraUtil) * (total - 1));
  return Math.max(0, Math.min(total - 1, i));
}
