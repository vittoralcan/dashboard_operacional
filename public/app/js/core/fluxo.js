// @ts-check
/**
 * Geometria, vista (pan/zoom) e validação do fluxograma. Pura — sem DOM.
 * Posição dos nós em unidades de grade (`x`, `y`); o passo `cw × ch` e o tamanho do nó `nw × nh`
 * vêm do grafo (Captura 200 × 130 / 164 × 92; Lumen 270 × 150 / 196 × 92).
 *
 * @typedef {{ id: string|number, x: number, y: number }} NoGrafo
 * @typedef {{ from: string|number, to: string|number, bidirectional?: boolean, suspensao?: boolean }} ArestaGrafo
 * @typedef {{ cw: number, ch: number, nw: number, nh: number, nos: NoGrafo[], juncoes?: NoGrafo[], arestas: ArestaGrafo[] }} GrafoFluxo
 * @typedef {{ cx: number, cy: number, hw: number, hh: number }} Posicao  centro e meias-medidas, em px do "mundo"
 * @typedef {{ x: number, y: number, k: number }} Vista  deslocamento (px da tela) e escala
 */

export const MARGEM = 70;
export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 2.2;
/** Deslocamento (px) a partir do qual um gesto vira "arrastar" e deixa de ser clique. */
export const LIMIAR_ARRASTO = 4;
/** Meia-aresta do losango (22 px, girado 45°) usada para o cálculo do caminho. */
const MEIO_LOSANGO = 15;

const num = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => Math.max(a, Math.min(b, v));

/**
 * Confere o grafo ANTES de desenhar: erro de configuração vira mensagem legível, não desenho quebrado.
 * @param {any} g
 * @returns {{ ok: boolean, erros: string[] }}
 */
export function validarGrafo(g) {
  /** @type {string[]} */
  const erros = [];
  if (!g || typeof g !== 'object') return { ok: false, erros: ['Configuração do fluxo ausente.'] };
  for (const k of ['cw', 'ch', 'nw', 'nh']) if (!num(g[k]) || g[k] <= 0) erros.push(`Medida "${k}" deve ser um número positivo.`);
  if (!Array.isArray(g.nos) || !g.nos.length) erros.push('O fluxo precisa de pelo menos uma fase.');
  if (!Array.isArray(g.arestas)) erros.push('Lista de setas ausente.');
  if (erros.length) return { ok: false, erros };

  const ids = new Set();
  for (const n of [...g.nos, ...(g.juncoes || [])]) {
    if (!n || n.id === undefined || n.id === null || n.id === '') { erros.push('Há uma fase sem identificador.'); continue; }
    const id = String(n.id);
    if (ids.has(id)) erros.push(`Identificador repetido: ${id}.`);
    ids.add(id);
    if (!num(n.x) || !num(n.y)) erros.push(`A fase ${id} precisa de posição x/y numérica.`);
  }
  for (const a of g.arestas) {
    if (!a) { erros.push('Há uma seta inválida.'); continue; }
    const de = String(a.from); const para = String(a.to);
    if (!ids.has(de)) erros.push(`A seta ${de} → ${para} parte de uma fase que não existe.`);
    if (!ids.has(para)) erros.push(`A seta ${de} → ${para} chega a uma fase que não existe.`);
    if (de === para) erros.push(`A seta ${de} → ${para} aponta para si mesma.`);
  }
  return { ok: !erros.length, erros };
}

/**
 * Posição de cada nó no "mundo" e tamanho dele. O centro é `(x·cw + cw/2, y·ch + ch/2)`, deslocado
 * para que o conjunto comece a `MARGEM` px do canto; o mundo cobre o retângulo envolvente + margem.
 * @param {GrafoFluxo} g
 * @returns {{ W: number, H: number, pos: Record<string, Posicao> }}
 */
export function calcularLayout(g) {
  /** @type {Record<string, Posicao>} */
  const pos = {};
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  /** @param {NoGrafo} n @param {number} hw @param {number} hh */
  const registrar = (n, hw, hh) => {
    const cx = n.x * g.cw + g.cw / 2; const cy = n.y * g.ch + g.ch / 2;
    pos[String(n.id)] = { cx, cy, hw, hh };
    minX = Math.min(minX, cx - hw); maxX = Math.max(maxX, cx + hw);
    minY = Math.min(minY, cy - hh); maxY = Math.max(maxY, cy + hh);
  };
  g.nos.forEach((n) => registrar(n, g.nw / 2, g.nh / 2));
  (g.juncoes || []).forEach((j) => registrar(j, MEIO_LOSANGO, MEIO_LOSANGO));
  const ox = MARGEM - minX; const oy = MARGEM - minY;
  for (const p of Object.values(pos)) { p.cx += ox; p.cy += oy; }
  return { W: maxX - minX + MARGEM * 2, H: maxY - minY + MARGEM * 2, pos };
}

/**
 * Caminho ortogonal entre dois nós: reta se estiverem na mesma linha/coluna; senão UM cotovelo
 * (sai na horizontal do nó de origem e desce/sobe na vertical até o destino).
 * @param {Posicao} a @param {Posicao} b
 * @returns {[number, number][]}
 */
export function caminhoOrtogonal(a, b) {
  const dx = b.cx - a.cx; const dy = b.cy - a.cy;
  if (Math.abs(dy) < 1) { const s = Math.sign(dx); return [[a.cx + s * a.hw, a.cy], [b.cx - s * b.hw, b.cy]]; }
  if (Math.abs(dx) < 1) { const s = Math.sign(dy); return [[a.cx, a.cy + s * a.hh], [b.cx, b.cy - s * b.hh]]; }
  const sx = Math.sign(dx); const sy = Math.sign(dy);
  return [[a.cx + sx * a.hw, a.cy], [b.cx, a.cy], [b.cx, b.cy - sy * b.hh]];
}

/** Atributo `d` de um <path> a partir dos pontos. @param {[number, number][]} pts */
export const dePontos = (pts) => `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}`;

/**
 * Largura (%) da barra de carga: relativa ao maior nó, com mínimo de 4 % (sempre há um traço visível);
 * fase final fica cheia.
 * @param {number} valor @param {number} maximo @param {boolean} [final]
 */
export function cargaRelativa(valor, maximo, final = false) {
  if (final) return 100;
  if (!(maximo > 0) || !(valor > 0)) return 4;
  return Math.max(4, Math.min(100, (valor / maximo) * 100));
}

// ---------------------------------------------------------------- vista (pan / zoom)

/** Zoom em torno de um ponto da tela (cursor, centro ou ponto médio da pinça). @param {Vista} v @param {number} fator @param {number} px @param {number} py @returns {Vista} */
export function zoomEm(v, fator, px, py) {
  const k = clamp(v.k * fator, ZOOM_MIN, ZOOM_MAX);
  if (k === v.k) return v;
  return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
}

/** "Ajustar à tela": tudo visível, centralizado. @param {number} W @param {number} H @param {number} vw @param {number} vh @returns {Vista} */
export function vistaAjustada(W, H, vw, vh) {
  const k = clamp(Math.min((vw - 80) / W, (vh - 80) / H), ZOOM_MIN, 1.3);
  return { k, x: (vw - W * k) / 2, y: (vh - H * k) / 2 };
}

/** Vista ao abrir: 80–100 %, centralizada se couber. @param {number} W @param {number} H @param {number} vw @param {number} vh @returns {Vista} */
export function vistaInicial(W, H, vw, vh) {
  const k = clamp(Math.min((vw - 60) / W, (vh - 60) / H), 0.8, 1);
  return { k, x: W * k < vw ? (vw - W * k) / 2 : 18 - MARGEM * k, y: (vh - H * k) / 2 };
}

/** Centraliza um ponto do mundo (e, opcionalmente, troca a escala). @param {Vista} v @param {number} wx @param {number} wy @param {number} vw @param {number} vh @param {number} [k] @returns {Vista} */
export function vistaCentrada(v, wx, wy, vw, vh, k) {
  const e = k ? clamp(k, ZOOM_MIN, ZOOM_MAX) : v.k;
  return { k: e, x: vw / 2 - wx * e, y: vh / 2 - wy * e };
}

/** Retângulo do mundo que está visível (desenhado no minimapa). @param {Vista} v @param {number} vw @param {number} vh */
export const retanguloVisivel = (v, vw, vh) => ({ x: -v.x / v.k, y: -v.y / v.k, w: vw / v.k, h: vh / v.k });

/**
 * Ponto do mundo sob um clique no minimapa (SVG `viewBox` = mundo, `preserveAspectRatio="xMidYMid meet"`).
 * @param {number} clienteX @param {number} clienteY @param {{ left: number, top: number, width: number, height: number }} caixa @param {number} W @param {number} H
 */
export function pontoDoMinimapa(clienteX, clienteY, caixa, W, H) {
  const esc = Math.min(caixa.width / W, caixa.height / H) || 1;
  const dx = (caixa.width - W * esc) / 2; const dy = (caixa.height - H * esc) / 2;
  return { x: clamp((clienteX - caixa.left - dx) / esc, 0, W), y: clamp((clienteY - caixa.top - dy) / esc, 0, H) };
}

/** O gesto já andou o bastante para ser "arrastar" (e não um clique)? @param {number} dx @param {number} dy */
export const ehArrasto = (dx, dy) => Math.hypot(dx, dy) > LIMIAR_ARRASTO;

/** Fator do zoom por roda: `exp(−deltaY × 0,0022)`. @param {number} deltaY */
export const fatorDaRoda = (deltaY) => Math.exp(-deltaY * 0.0022);
