// @ts-check
import { $, $$ } from './dom.js';
import { clamp, fmt, fmtDec } from './format.js';

/** Respeita `prefers-reduced-motion` (design_system.md §5.4). */
export const reduzido = () => { try { return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

/** @param {number} ms */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ease-out exponencial: 1 − 2^(−10p). @param {number} p 0..1 */
export const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

/** Duração da contagem animada: 650 + log10(valor+1)·170 ms, entre 650 e 1500. @param {number} alvo */
export const duracaoContagem = (alvo) => clamp(650 + Math.log10(Math.abs(alvo) + 1) * 170, 650, 1500);

/**
 * Anima um número até `alvo`. Usa `data-dec`, `data-pre` e `data-suf` do elemento.
 * @param {HTMLElement & { _raf?: number }} el @param {number} alvo @param {number} [de]
 */
export function animarNumero(el, alvo, de = 0) {
  const dec = Number(el.dataset.dec || 0);
  const suf = el.dataset.suf || '';
  const pre = el.dataset.pre || '';
  const f = (/** @type {number} */ v) => pre + (dec ? fmtDec(v, dec) : fmt(Math.round(v))) + suf;
  if (reduzido() || alvo === de) { el.textContent = f(alvo); return; }
  const dur = duracaoContagem(alvo);
  const t0 = performance.now();
  cancelAnimationFrame(/** @type {number} */ (el._raf));
  const passo = (/** @type {number} */ t) => {
    const p = clamp((t - t0) / dur, 0, 1);
    el.textContent = f(de + (alvo - de) * easeOutExpo(p));
    if (p < 1) el._raf = requestAnimationFrame(passo);
  };
  el._raf = requestAnimationFrame(passo);
}

/** Anima todos os `[data-count]` da raiz. @param {ParentNode} [raiz] */
export function contar(raiz = document) {
  $$('[data-count]', raiz).forEach((el) => animarNumero(el, Number(el.dataset.count), 0));
}

/** Preenche medidores (`[data-w]` em %) e anéis (`[data-ring]` = dashoffset). @param {ParentNode} raiz */
export function animarBarras(raiz) {
  setTimeout(() => {
    $$('[data-w]', raiz).forEach((i) => { i.style.width = `${i.dataset.w}%`; });
    $$('[data-ring]', raiz).forEach((c) => { c.style.strokeDashoffset = /** @type {string} */ (c.dataset.ring); });
  }, 60);
}

/** Barra de progresso do topo (2 px): avança assintoticamente até ~88 % e completa ao concluir. */
export const progresso = {
  v: 0,
  /** @type {any} */ t: null,
  /** @param {number} v */
  set(v) { this.v = v; const i = $('#topbar-progress i'); if (i) i.style.width = `${v}%`; },
  iniciar() {
    const b = $('#topbar-progress'); if (!b) return;
    b.classList.add('on'); this.set(6);
    clearInterval(this.t);
    this.t = setInterval(() => { if (this.v < 88) this.set(this.v + (90 - this.v) * 0.09); }, 180);
  },
  /** Define um percentual real (ex.: etapas do login) sem animação assintótica. @param {number} v */
  etapa(v) {
    const b = $('#topbar-progress'); if (!b) return;
    clearInterval(this.t); b.classList.add('on'); this.set(v);
  },
  concluir() {
    clearInterval(this.t); this.set(100);
    setTimeout(() => {
      $('#topbar-progress')?.classList.remove('on');
      setTimeout(() => { if (!$('#topbar-progress')?.classList.contains('on')) this.set(0); }, 320);
    }, 260);
  },
};

/**
 * Varredura com gradiente entre camadas (login → painel, logout). A troca de camada
 * (`meio`) acontece atrás do painel. Sem movimento: só executa `meio`.
 * @param {() => Promise<void>|void} meio
 */
export async function wipe(meio) {
  const w = $('#wipe');
  if (!w || reduzido()) { await meio(); return; }
  w.className = 'in';
  await sleep(470);
  await meio();
  await sleep(40);
  w.className = 'out';
  await sleep(640);
  w.className = '';
}
