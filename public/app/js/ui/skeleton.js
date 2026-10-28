// @ts-check
import { html, raw } from '../core/html.js';

/**
 * Skeletons (CMP-04): cinco layouts que ESPELHAM a grade da tela real, para não saltar o layout
 * quando o dado chega (CLS ≤ 0,05). Só markup — o `aria-busy` fica no contêiner.
 */

const cartao = (/** @type {string} */ cls, /** @type {number} */ min = 150) => raw(`<div class="sk-card ${cls}" style="min-height:${min}px"><div class="sk sk-line" style="width:38%"></div><div class="sk" style="height:34px;width:56%"></div><div class="sk sk-line" style="width:80%"></div></div>`);
const cabPagina = () => raw('<div class="page-h"><div class="ttl"><div class="sk sk-line" style="width:90px"></div><div class="sk" style="height:30px;width:260px"></div><div class="sk sk-line" style="width:340px"></div></div></div>');
const cabModulo = () => raw('<div class="mod-h"><div class="sk" style="width:32px;height:32px"></div><div class="sk" style="width:44px;height:44px"></div><div class="ttl"><div class="sk sk-line" style="width:110px"></div><div class="sk" style="height:26px;width:240px"></div></div></div>');
const repetir = (/** @type {number} */ n, /** @type {() => any} */ f) => Array.from({ length: n }, f);

/** @type {Record<string, () => import('../core/html.js').Html>} */
const LAYOUTS = {
  home: () => html`${cabPagina()}<div class="bento">${repetir(3, () => cartao('c-4', 190))}${cartao('c-8', 220)}${cartao('c-4', 220)}</div>`,
  hub: () => html`${cabPagina()}<div class="bento">${repetir(5, () => cartao('c-4', 190))}${cartao('c-12', 120)}</div>`,
  modulo: () => html`${cabModulo()}<div class="bento">${repetir(3, () => cartao('c-4', 260))}</div>`,
  canvas: () => html`${cabModulo()}<div class="sk" style="height:clamp(460px, calc(100vh - 300px), 860px);border-radius:var(--r-xl)"></div>`,
  lista: () => html`${cabModulo()}<div class="bento">${repetir(4, () => cartao('c-3', 110))}</div><div style="margin-top:16px;display:flex;flex-direction:column;gap:8px">${repetir(6, () => raw('<div class="sk" style="height:44px;border-radius:var(--r-md)"></div>'))}</div>`,
};

/** @param {string} tipo 'home' | 'hub' | 'modulo' | 'canvas' | 'lista' */
export function skeleton(tipo) {
  const f = LAYOUTS[tipo] || LAYOUTS.modulo;
  return html`<div class="sk-label">${raw('<span class="spin" aria-hidden="true"></span>')}Carregando dados…</div>${f()}`;
}

/** Tipos disponíveis (usado pelo catálogo `#/_ui`). */
export const TIPOS_SKELETON = Object.keys(LAYOUTS);

/**
 * Gancho do roteador: esconde a `view`, mostra o skeleton ao lado e devolve quem o remove.
 * @param {string} tipo @param {HTMLElement} view
 */
export function mostrarSkeleton(tipo, view) {
  const sk = document.createElement('div');
  sk.className = 'view sk-view';
  sk.setAttribute('aria-busy', 'true');
  sk.innerHTML = skeleton(tipo).toString();
  view.hidden = true;
  view.insertAdjacentElement('beforebegin', sk);
  return () => { sk.remove(); view.hidden = false; };
}

