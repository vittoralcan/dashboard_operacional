// @ts-check
import { $$ } from '../core/dom.js';
import { seguro } from '../core/html.js';
import { clamp } from '../core/format.js';
import { empilhar, desempilhar } from '../core/camadas.js';

/**
 * Popover ancorado a um gatilho (menu do usuário, notificações, filtros).
 * Alinha à direita do gatilho (ou à esquerda com `alinhar:'start'`), prende às bordas da janela
 * e inverte para cima se não couber. Fecha com Esc, clique fora e redimensionamento; clicar de
 * novo no gatilho também fecha. Setas ↑↓ navegam entre `.menu-i`.
 *
 * @param {HTMLElement & { _pop?: any }} gatilho
 * @param {string|import('../core/html.js').Html} conteudo texto escapado, ou `Html`
 * @param {{ classe?: string, papel?: string, rotulo?: string, alinhar?: 'start'|'end', lado?: 'top'|'bottom',
 *           aoAbrir?: (el: HTMLElement, fechar: () => void) => void, aoFechar?: () => void, focar?: false|string }} [opts]
 */
export function abrirPopover(gatilho, conteudo, opts = {}) {
  if (gatilho._pop && gatilho._pop.el.isConnected) { gatilho._pop.fechar(); return null; }

  const el = document.createElement('div');
  el.className = `pop ${opts.classe || ''}`;
  el.setAttribute('role', opts.papel || 'dialog');
  if (opts.rotulo) el.setAttribute('aria-label', opts.rotulo);
  el.innerHTML = seguro(conteudo);
  document.body.appendChild(el);

  const posicionar = () => {
    const r = gatilho.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = opts.alinhar === 'start' ? r.left : r.right - w;
    left = clamp(left, 8, window.innerWidth - w - 8);
    let top = opts.lado === 'top' ? r.top - h - 8 : r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    if (top < 8) top = 8;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };
  posicionar();
  if (opts.alinhar === 'start') el.classList.add('from-left');
  requestAnimationFrame(() => el.classList.add('open'));
  gatilho.setAttribute('aria-expanded', 'true');

  /** @type {ReturnType<typeof empilhar>|null} */
  let camada = null;
  const fora = (/** @type {PointerEvent} */ e) => { const t = /** @type {Node} */ (e.target); if (!el.contains(t) && !gatilho.contains(t)) fechar(); };
  const aoRedimensionar = () => fechar();
  /** @type {any} */ const estado = { fechando: false };

  function fechar() {
    if (!el.isConnected || estado.fechando) return;
    estado.fechando = true;
    const comFoco = el.contains(document.activeElement); // foco estava no menu → devolve ao botão que o abriu (WAI-ARIA)
    el.classList.remove('open');
    gatilho.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', fora, true);
    window.removeEventListener('resize', aoRedimensionar);
    desempilhar(camada);
    gatilho._pop = null;
    if (comFoco && gatilho.isConnected) gatilho.focus({ preventScroll: true });
    opts.aoFechar?.();
    setTimeout(() => el.remove(), 200);
  }

  setTimeout(() => document.addEventListener('pointerdown', fora, true), 0);
  window.addEventListener('resize', aoRedimensionar);
  camada = empilhar(fechar, el, 'pop');

  el.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const itens = $$('.menu-i:not(.dis), .notif', el);
    if (!itens.length) return;
    e.preventDefault();
    let i = itens.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    i = e.key === 'ArrowDown' ? (i + 1) % itens.length : (i - 1 + itens.length) % itens.length;
    itens[i].focus();
  });

  const api = { el, fechar, reposicionar: posicionar };
  gatilho._pop = api;
  opts.aoAbrir?.(el, fechar);
  if (opts.focar !== false) {
    const f = /** @type {HTMLElement|null} */ (el.querySelector(opts.focar || 'input, .menu-i:not(.dis), button'));
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 20);
  }
  return api;
}
