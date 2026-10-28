// @ts-check
import { $, prenderFoco, uid } from '../core/dom.js';
import { html, seguro } from '../core/html.js';
import { empilhar, desempilhar } from '../core/camadas.js';
import { ic } from './icons.js';

/**
 * Gaveta lateral (USR-04 — Configurações). Direita, entra por translateX (560 ms), foco preso,
 * Esc e clique no fundo fecham, devolve o foco ao gatilho. Textos escapados, salvo `Html`.
 *
 * @typedef {string|import('../core/html.js').Html} Conteudo
 * @param {{ titulo: Conteudo, eyebrow?: Conteudo, corpo?: Conteudo, rodape?: Conteudo, aoFechar?: () => void }} o
 */
export function abrirGaveta(o) {
  const raiz = $('#modais');
  if (!raiz) throw new Error('Contêiner #modais ausente na casca.');
  const anterior = /** @type {HTMLElement|null} */ (document.activeElement);
  const idT = uid('dt');
  const wrap = document.createElement('div');
  wrap.className = 'drawer-wrap';
  wrap.innerHTML = html`<div class="modal-backdrop" data-fechar></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="${idT}" tabindex="-1">
      <div class="modal-h"><div class="ttl">${o.eyebrow ? html`<span class="eyebrow">${o.eyebrow}</span>` : ''}<h2 id="${idT}">${o.titulo}</h2></div><button class="icon-btn" data-fechar aria-label="Fechar">${ic('x')}</button></div>
      <div class="drawer-b"></div>
      <div class="drawer-f" hidden></div>
    </aside>`.toString();
  raiz.appendChild(wrap);
  const caixa = /** @type {HTMLElement} */ ($('.drawer', wrap));
  const corpo = /** @type {HTMLElement} */ ($('.drawer-b', wrap));
  const rodape = /** @type {HTMLElement} */ ($('.drawer-f', wrap));
  corpo.innerHTML = seguro(o.corpo ?? '');
  if (o.rodape) { rodape.innerHTML = seguro(o.rodape); rodape.hidden = false; }

  const api = {
    el: wrap, corpo, rodape,
    /** @param {Conteudo} c */
    definirCorpo(c) { corpo.innerHTML = seguro(c); },
    fechar() {
      if (wrap.classList.contains('closing')) return;
      wrap.classList.add('closing');
      wrap.classList.remove('open');
      desempilhar(camada);
      o.aoFechar?.();
      setTimeout(() => wrap.remove(), 580);
      if (anterior && document.contains(anterior)) anterior.focus({ preventScroll: true });
    },
  };
  const camada = empilhar(() => api.fechar(), wrap, 'drawer');
  wrap.addEventListener('click', (e) => { if (/** @type {HTMLElement} */ (e.target).closest('[data-fechar]')) api.fechar(); });
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Tab') prenderFoco(e, caixa); });
  requestAnimationFrame(() => wrap.classList.add('open'));
  setTimeout(() => (/** @type {HTMLElement|null} */ ($('button, input, select', corpo)) || caixa).focus({ preventScroll: true }), 60);
  return api;
}
