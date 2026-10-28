// @ts-check
import { $, $$, uid } from '../core/dom.js';
import { esc, raw, html } from '../core/html.js';
import { fmt, fmtCompacto, clamp } from '../core/format.js';
import { reduzido } from '../core/motion.js';
import { tetoBonito, curvaMonotona, indicesRotulos, geometriaAnel, indiceMaisProximo } from '../core/geometria.js';

/**
 * Gráficos SVG próprios (CMP-03, design_system.md §10) — substituem Chart.js e ApexCharts.
 * Redesenham via ResizeObserver só se a largura mudar > 6 px. Cores só por token (CSS).
 * Todos os textos de dado passam por `esc`. Os gráficos de elemento devolvem `{ destruir }`.
 */

/** @param {HTMLElement} el @param {() => void} desenhar @param {() => number} largura */
function observar(el, desenhar, largura) {
  if (!globalThis.ResizeObserver) return () => {};
  let ultima = largura();
  const ro = new ResizeObserver(() => {
    if (Math.abs((el.clientWidth || 0) - ultima) > 6) { ultima = el.clientWidth || 0; desenhar(); }
  });
  ro.observe(el);
  return () => ro.disconnect();
}

/** Linhas de grade (0, 50 %, 100 %) com rótulos do eixo Y. */
function grade(/** @type {number} */ W, /** @type {number} */ pl, /** @type {number} */ pr, /** @type {number} */ pt, /** @type {number} */ ih, /** @type {number} */ max, /** @type {boolean} */ eixo) {
  return [0, 0.5, 1].map((f) => {
    const y = Math.round(pt + ih - f * ih) + 0.5;
    return `<line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/>${eixo ? `<text class="axis-t" x="${pl - 8}" y="${y + 3}" text-anchor="end">${esc(fmtCompacto(max * f))}</text>` : ''}`;
  }).join('');
}

/** @param {string[]} rotulos @param {(i: number) => number} x @param {number} H @param {number} iw */
function rotulosX(rotulos, x, H, iw) {
  return indicesRotulos(rotulos.length, iw).map((i) => `<text class="axis-t" x="${x(i).toFixed(1)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === rotulos.length - 1 ? 'end' : 'middle'}">${esc(rotulos[i])}</text>`).join('');
}

/** Estado vazio do gráfico (RNB-008): nunca desenhar eixo sem dado. */
const semDados = (/** @type {number} */ H, /** @type {string|undefined} */ nome) => html`<div class="dim" role="img" aria-label="${`${nome || 'Gráfico'}: sem dados`}" style="${`height:${H}px;display:grid;place-items:center;font-size:12.5px`}">Sem dados no período</div>`.toString();

/** Texto de acessibilidade com TODOS os valores ("Seg 168, Ter 192…"). */
const descricao = (/** @type {string} */ nome, /** @type {number[]} */ valores, /** @type {string[]} */ rotulos) => `${nome}: ${valores.map((v, i) => `${rotulos[i]} ${fmt(v)}`).join(', ')}`;

/**
 * Gráfico de linha com área em gradiente, crosshair e tooltip.
 * @param {HTMLElement} el
 * @param {{ valores: number[], rotulos: string[], altura?: number, unidade?: string, nome?: string, eixoY?: boolean,
 *           animar?: boolean, rotuloTip?: (i: number) => string }} cfg
 */
export function graficoLinha(el, cfg) {
  const { valores, rotulos } = cfg;
  const H = cfg.altura || 150;
  let animar = cfg.animar !== false && !reduzido();
  let largura = 0;
  el.classList.add('chart');

  const desenhar = () => {
    const W = Math.max(180, el.clientWidth || 300);
    largura = W;
    if (!valores.length) { el.innerHTML = semDados(H, cfg.nome); return; }
    const eixo = cfg.eixoY !== false;
    const pl = eixo ? 36 : 6; const pr = 10; const pt = 12; const pb = 22;
    const max = tetoBonito(Math.max(1, ...valores));
    const iw = W - pl - pr; const ih = H - pt - pb;
    const x = (/** @type {number} */ i) => pl + (valores.length === 1 ? iw / 2 : (i * iw) / (valores.length - 1));
    const y = (/** @type {number} */ v) => pt + ih - (v / max) * ih;
    /** @type {[number, number][]} */
    const pts = valores.map((v, i) => [x(i), y(v)]);
    const linha = curvaMonotona(pts);
    const area = `${linha}L${x(valores.length - 1).toFixed(1)},${pt + ih}L${x(0).toFixed(1)},${pt + ih}Z`;
    const gid = uid('lg');
    const ult = pts[pts.length - 1] || [0, 0];
    el.innerHTML = html`<svg viewBox="${`0 0 ${W} ${H}`}" height="${H}" role="img" aria-label="${descricao(cfg.nome || 'Gráfico', valores, rotulos)}">
      <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="ar-stop-a"/><stop offset="1" class="ar-stop-b"/></linearGradient></defs>
      ${raw(grade(W, pl, pr, pt, ih, max, eixo))}${raw(rotulosX(rotulos, x, H, iw))}
      <path class="ar" d="${area}" fill="${`url(#${gid})`}"/>
      <path class="${`ln${animar ? ' draw' : ''}`}" d="${linha}"/>
      <circle class="pt-last" cx="${ult[0].toFixed(1)}" cy="${ult[1].toFixed(1)}" r="2.6"/>
      <line class="xh" x1="0" x2="0" y1="${pt}" y2="${pt + ih}"/>
      <circle class="xh-dot" r="4" cx="0" cy="0"/>
      <rect class="hit" x="${pl - 6}" y="0" width="${iw + 12}" height="${H}" fill="transparent"/>
    </svg><div class="chart-tip"><div class="k"></div><div class="v"></div></div>`.toString();
    if (animar) { const p = /** @type {any} */ ($('.ln', el)); try { p.style.setProperty('--len', Math.ceil(p.getTotalLength())); } catch (e) { p.classList.remove('draw'); } }
    animar = false;

    const svg = /** @type {any} */ ($('svg', el)); const xh = $('.xh', el); const dot = $('.xh-dot', el); const tip = $('.chart-tip', el);
    if (!svg || !xh || !dot || !tip || !valores.length) return;
    const mover = (/** @type {PointerEvent} */ ev) => {
      const rr = svg.getBoundingClientRect();
      const i = indiceMaisProximo((ev.clientX - rr.left) * (W / rr.width), pl, iw, valores.length);
      const cx = x(i); const cy = y(valores[i]);
      xh.setAttribute('x1', String(cx)); xh.setAttribute('x2', String(cx));
      dot.setAttribute('cx', String(cx)); dot.setAttribute('cy', String(cy));
      const k = $('.k', tip); const v = $('.v', tip);
      if (k) k.textContent = cfg.rotuloTip ? cfg.rotuloTip(i) : rotulos[i];
      if (v) v.textContent = fmt(valores[i]) + (cfg.unidade ? ` ${cfg.unidade}` : '');
      tip.style.left = `${clamp(cx * (rr.width / W), 50, rr.width - 50)}px`;
      tip.style.top = `${cy * (rr.height / H)}px`;
      el.classList.add('hover');
    };
    const hit = $('.hit', el);
    hit?.addEventListener('pointermove', /** @type {any} */ (mover));
    hit?.addEventListener('pointerdown', /** @type {any} */ (mover));
    hit?.addEventListener('pointerleave', () => el.classList.remove('hover'));
  };

  desenhar();
  const parar = observar(el, desenhar, () => largura);
  return { destruir: parar };
}

/**
 * Gráfico de barras (volume diário): última barra e hover em acento, cantos de dado arredondados.
 * @param {HTMLElement} el
 * @param {{ valores: number[], rotulos: string[], altura?: number, unidade?: string, nome?: string }} cfg
 */
export function graficoBarras(el, cfg) {
  const { valores, rotulos } = cfg;
  const H = cfg.altura || 160;
  let largura = 0;
  el.classList.add('chart');

  const desenhar = () => {
    const W = Math.max(200, el.clientWidth || 300);
    largura = W;
    if (!valores.length) { el.innerHTML = semDados(H, cfg.nome); return; }
    const pl = 34; const pr = 6; const pt = 10; const pb = 22;
    const max = tetoBonito(Math.max(1, ...valores));
    const iw = W - pl - pr; const ih = H - pt - pb;
    const bw = iw / Math.max(1, valores.length);
    const gap = Math.min(6, bw * 0.28);
    const barras = valores.map((v, i) => {
      const h = Math.max(v ? 2 : 0, (v / max) * ih);
      return `<rect class="bar${i === valores.length - 1 ? ' last' : ''}" data-i="${i}" x="${(pl + i * bw + gap / 2).toFixed(1)}" y="${(pt + ih - h).toFixed(1)}" width="${Math.max(1, bw - gap).toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>`;
    }).join('');
    el.innerHTML = html`<svg viewBox="${`0 0 ${W} ${H}`}" height="${H}" role="img" aria-label="${descricao(cfg.nome || 'Volume diário', valores, rotulos)}">${raw(grade(W, pl, pr, pt, ih, max, true))}${raw(barras)}${raw(rotulosX(rotulos, (i) => pl + i * bw + bw / 2, H, iw))}</svg><div class="chart-tip"><div class="k"></div><div class="v"></div></div>`.toString();
    const svg = /** @type {any} */ ($('svg', el)); const tip = $('.chart-tip', el);
    if (!svg || !tip) return;
    $$('.bar', el).forEach((b) => {
      b.addEventListener('pointerenter', () => {
        const i = Number(b.dataset.i);
        const rr = svg.getBoundingClientRect();
        $$('.bar.on', el).forEach((o) => o.classList.remove('on'));
        b.classList.add('on');
        const k = $('.k', tip); const v = $('.v', tip);
        if (k) k.textContent = rotulos[i];
        if (v) v.textContent = fmt(valores[i]) + (cfg.unidade ? ` ${cfg.unidade}` : '');
        tip.style.left = `${clamp((pl + i * bw + bw / 2) * (rr.width / W), 50, rr.width - 50)}px`;
        tip.style.top = `${Number(b.getAttribute('y')) * (rr.height / H)}px`;
        el.classList.add('hover');
      });
      b.addEventListener('pointerleave', () => { b.classList.remove('on'); el.classList.remove('hover'); });
    });
  };

  desenhar();
  const parar = observar(el, desenhar, () => largura);
  return { destruir: parar };
}

/**
 * Sparkline estática (cartões de módulo). Devolve markup (`Html`) — sem interação.
 * @param {number[]} vals @param {number} [h]
 */
export function sparkSVG(vals, h = 36) {
  const w = 200; const pad = 3;
  if (!vals.length) return raw('');
  const max = Math.max(...vals); const min = Math.min(...vals);
  const x = (/** @type {number} */ i) => (vals.length === 1 ? w / 2 : i * (w / (vals.length - 1)));
  const y = (/** @type {number} */ v) => pad + (h - pad * 2) * (1 - (v - min) / ((max - min) || 1));
  const d = curvaMonotona(vals.map((v, i) => [x(i), y(v)]));
  const gid = uid('sp');
  return raw(`<svg class="spark" style="height:${Number(h)}px" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="ar-stop-a"/><stop offset="1" class="ar-stop-b"/></linearGradient></defs><path d="${d}L${w},${h}L0,${h}Z" fill="url(#${gid})"/><path class="ln" d="${d}" vector-effect="non-scaling-stroke"/></svg>`);
}

/**
 * Anel de progresso. O preenchimento anima quando `animarBarras()` lê `data-ring`.
 * @param {number} pct 0..1 @param {number} [tamanho] @param {number} [esp]
 */
export function anelSVG(pct, tamanho = 64, esp = 5) {
  const g = geometriaAnel(pct, tamanho, esp);
  const c = tamanho / 2;
  return raw(`<svg class="ring" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}" aria-hidden="true"><circle class="tr" cx="${c}" cy="${c}" r="${g.r}" stroke-width="${esp}"/><circle class="fl" cx="${c}" cy="${c}" r="${g.r}" stroke-width="${esp}" stroke-dasharray="${g.circunferencia.toFixed(2)}" stroke-dashoffset="${g.circunferencia.toFixed(2)}" data-ring="${g.deslocamento.toFixed(2)}"/></svg>`);
}
