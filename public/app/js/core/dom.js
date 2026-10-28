// @ts-check
/** Atalhos de DOM, foco e delegação de eventos. Sem handler inline em lugar nenhum (CSP). */

/** @param {string} s @param {ParentNode} [r] @returns {HTMLElement|null} */
export const $ = (s, r = document) => /** @type {HTMLElement|null} */ (r.querySelector(s));

/** @param {string} s @param {ParentNode} [r] @returns {HTMLElement[]} */
export const $$ = (s, r = document) => /** @type {HTMLElement[]} */ (Array.from(r.querySelectorAll(s)));

let _uid = 0;
/** Id único para ligar rótulo/descrição (aria-labelledby). @param {string} [p] */
export const uid = (p = 'u') => `${p}${++_uid}`;

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

/** Elementos focáveis visíveis dentro de uma raiz. @param {ParentNode} raiz */
export const focaveis = (raiz) => $$(FOCAVEIS, raiz).filter((e) => e.offsetParent !== null || e === document.activeElement);

/** Mantém o Tab circular dentro de uma camada (modal/gaveta/paleta). @param {KeyboardEvent} e @param {ParentNode} raiz */
export function prenderFoco(e, raiz) {
  const f = focaveis(raiz);
  if (!f.length) return;
  const primeiro = f[0];
  const ultimo = f[f.length - 1];
  if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
}

/**
 * Delegação de eventos por `data-*`: chama `fn(alvo, evento)` quando o clique atinge um
 * elemento que casa com `seletor` dentro de `raiz`.
 * @param {HTMLElement} raiz @param {string} evento @param {string} seletor
 * @param {(alvo: HTMLElement, e: Event) => void} fn
 */
export function delegar(raiz, evento, seletor, fn) {
  const h = (/** @type {Event} */ e) => {
    const alvo = /** @type {HTMLElement|null} */ ((/** @type {any} */ (e.target))?.closest?.(seletor));
    if (alvo && raiz.contains(alvo)) fn(alvo, e);
  };
  raiz.addEventListener(evento, h);
  return () => raiz.removeEventListener(evento, h);
}

/** O foco está num campo de texto (atalhos de uma tecla ficam desligados)? @param {EventTarget|null} alvo */
export function emCampoDeTexto(alvo) {
  const el = /** @type {HTMLElement|null} */ (alvo);
  if (!el || !el.tagName) return false;
  const t = el.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable === true;
}

/** Sistema Apple? (⌘ em vez de Ctrl nos rótulos) */
export const ehMac = /Mac|iPhone|iPad/.test((typeof navigator !== 'undefined' && (navigator.platform || navigator.userAgent)) || '');
export const MOD = ehMac ? '⌘' : 'Ctrl';
