// @ts-check
import { $ } from '../core/dom.js';
import { esc } from '../core/html.js';
import { clamp } from '../core/format.js';

/**
 * Tooltip global (PRD-05): `data-tip="texto"` (sempre escapado). Aparece acima (ou abaixo se não
 * couber), à direita com `data-tip-side="right"`; também no foco por teclado. Um único elemento
 * `#tip` e delegação no documento. Chamar `iniciarTooltip()` uma vez.
 * Obs.: não há `data-tip-html` — HTML em tooltip não é permitido (RNB-004).
 */
export function iniciarTooltip() {
  const tip = $('#tip');
  if (!tip) return;
  /** @type {HTMLElement|null} */
  let atual = null;
  const esconder = () => { tip.classList.remove('on'); atual?.removeAttribute('aria-describedby'); };

  const mostrar = (/** @type {HTMLElement} */ el) => {
    const lateral = el.closest('.sidebar');
    if (lateral && !$('#shell')?.classList.contains('collapsed') && !el.closest('.uptime')) return; // barra expandida já tem rótulo
    tip.innerHTML = esc(el.dataset.tip);
    el.setAttribute('aria-describedby', 'tip');
    const r = el.getBoundingClientRect();
    tip.classList.add('on');
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left;
    let top;
    if (el.dataset.tipSide === 'right') { left = r.right + 10; top = r.top + r.height / 2 - h / 2; }
    else { left = r.left + r.width / 2 - w / 2; top = r.top - h - 8; if (top < 6) top = r.bottom + 8; }
    tip.style.left = `${clamp(left, 6, window.innerWidth - w - 6)}px`;
    tip.style.top = `${clamp(top, 6, window.innerHeight - h - 6)}px`;
  };

  document.addEventListener('pointerover', (e) => {
    const el = /** @type {HTMLElement|null} */ ((/** @type {any} */ (e.target))?.closest?.('[data-tip]'));
    if (el === atual) return;
    esconder();
    atual = el;
    if (!el) return;
    mostrar(el);
  });
  document.addEventListener('focusin', (e) => {
    const el = /** @type {HTMLElement|null} */ ((/** @type {any} */ (e.target))?.closest?.('[data-tip]'));
    if (el && el.matches(':focus-visible')) { atual = el; mostrar(el); }
  });
  document.addEventListener('focusout', () => { esconder(); atual = null; });
  document.addEventListener('pointerdown', esconder);
  window.addEventListener('scroll', () => { esconder(); atual = null; }, true);
}
