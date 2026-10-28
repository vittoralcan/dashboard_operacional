// @ts-check
import { $, $$, prenderFoco, uid, MOD } from '../core/dom.js';
import { html, raw, esc } from '../core/html.js';
import { realcar } from '../core/fuzzy.js';
import { empilhar, desempilhar } from '../core/camadas.js';
import { filtrarItens, achatar, moverSelecao } from '../core/paleta.js';
import { ativo } from '../config/recursos.js';
import { ic } from './icons.js';
import { seloEmBreve } from './embreve.js';
import { toast } from './toast.js';

/**
 * Paleta de comandos `Ctrl/⌘ + K` (PRD-01). ↑↓ navegam, Enter executa, Esc fecha, realce dos
 * caracteres casados, contexto atual no canto. Itens "Em breve" aparecem esmaecidos e não executam.
 * ARIA: combobox + listbox/option + aria-activedescendant. Chamar `abrirPaleta(provider)`;
 * `provider()` devolve os itens atuais (assim a paleta sempre reflete o catálogo vigente).
 *
 * @param {() => import('../core/paleta.js').ItemPaleta[]} provider
 * @param {{ contexto?: string }} [o]
 */
export function abrirPaleta(provider, o = {}) {
  const raiz = $('#modais');
  if (!raiz || $('.cmdk-wrap', raiz)) return null;
  const anterior = /** @type {HTMLElement|null} */ (document.activeElement);
  const idLista = uid('cmdk');
  const wrap = document.createElement('div');
  wrap.className = 'cmdk-wrap';
  wrap.innerHTML = html`<div class="modal-backdrop" data-fechar></div>
    <div class="cmdk" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
      <div class="cmdk-in">${ic('magnifying-glass')}<input type="text" role="combobox" aria-expanded="true" aria-controls="${idLista}" aria-autocomplete="list" placeholder="Buscar páginas, módulos, fases e ações…" autocomplete="off" spellcheck="false" aria-label="Buscar comandos">${o.contexto ? html`<span class="cmdk-ctx">${o.contexto}</span>` : ''}</div>
      <div class="cmdk-list" id="${idLista}" role="listbox" aria-label="Resultados"></div>
      <div class="cmdk-f"><span class="grow"></span><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>↵</kbd> abrir</span><span><kbd>esc</kbd> fechar</span></div>
    </div>`.toString();
  raiz.appendChild(wrap);
  const input = /** @type {HTMLInputElement} */ ($('input', wrap));
  const lista = /** @type {HTMLElement} */ ($('.cmdk-list', wrap));
  const caixa = /** @type {HTMLElement} */ ($('.cmdk', wrap));

  /** @type {import('../core/paleta.js').Resultado[]} */
  let planos = [];
  let sel = 0;

  const marcar = () => {
    $$('.cmdk-i', lista).forEach((b, i) => b.setAttribute('aria-selected', String(i === sel)));
    const atual = $$('.cmdk-i', lista)[sel];
    if (atual) { input.setAttribute('aria-activedescendant', atual.id); atual.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  };

  const desenhar = () => {
    const q = input.value;
    const grupos = filtrarItens(provider(), q);
    planos = achatar(grupos);
    sel = Math.max(0, planos.findIndex((r) => !r.item.emBreve));
    if (!planos.length) {
      lista.innerHTML = html`<div class="cmdk-empty">${ic('magnifying-glass')}<span>${q ? `Nada encontrado para “${q}”` : 'Nenhum comando disponível'}</span></div>`.toString();
      marcar(); return;
    }
    let n = 0;
    lista.innerHTML = html`${grupos.map((g) => html`<div class="cmdk-g" role="presentation">${g.grupo}${q ? ` · ${g.itens.length}` : ''}</div>${g.itens.map((r) => {
      const i = n++;
      const it = r.item;
      const titulo = raw(realcar(it.titulo, r.posicoes, esc));
      return html`<button type="button" class="${`cmdk-i${it.emBreve && !ativo(it.emBreve) ? ' dis' : ''}`}" role="option" id="${`${idLista}-${i}`}" data-i="${i}" aria-selected="false" ${it.emBreve && !ativo(it.emBreve) ? raw('aria-disabled="true"') : ''}>
        <span class="ic-t">${ic(it.icone || 'arrow-up-right')}</span>
        <span class="tx"><span class="tt">${titulo}</span>${it.sub ? html`<span class="sb">${it.sub}</span>` : ''}</span>
        ${it.emBreve ? seloEmBreve(it.emBreve, { semIcone: true }) : html`${it.metrica ? html`<span class="tp mono">${it.metrica}</span>` : ''}${it.atalho ? html`<span class="kbds">${it.atalho.split(' ').map((k) => html`<kbd>${k === 'Mod' ? MOD : k}</kbd>`)}</span>` : ''}`}
      </button>`;
    })}`)}`.toString();
    marcar();
  };

  const fechar = () => {
    if (wrap.classList.contains('closing')) return;
    wrap.classList.remove('open');
    desempilhar(camada);
    setTimeout(() => wrap.remove(), 200);
    if (anterior && document.contains(anterior)) anterior.focus({ preventScroll: true });
  };

  const executar = (/** @type {number} */ i) => {
    const r = planos[i];
    if (!r) return;
    if (r.item.emBreve && !ativo(r.item.emBreve)) { toast('info', 'Em breve', r.item.titulo); return; }
    fechar();
    try { r.item.aoExecutar?.(); } catch (e) { console.error(e); }
  };

  const camada = empilhar(fechar, wrap, 'cmdk');
  input.addEventListener('input', desenhar);
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { prenderFoco(e, caixa); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = moverSelecao(planos, sel, e.key === 'ArrowDown' ? 1 : -1); marcar(); }
    else if (e.key === 'Enter') { e.preventDefault(); executar(sel); }
  });
  wrap.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-fechar]')) { fechar(); return; }
    const b = /** @type {HTMLElement|null} */ (t.closest('.cmdk-i'));
    if (b) executar(Number(b.dataset.i));
  });
  wrap.addEventListener('pointermove', (e) => {
    const b = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest('.cmdk-i:not(.dis)'));
    if (b && Number(b.dataset.i) !== sel) { sel = Number(b.dataset.i); marcar(); }
  });

  desenhar();
  requestAnimationFrame(() => wrap.classList.add('open'));
  setTimeout(() => input.focus({ preventScroll: true }), 30);
  return { fechar };
}
