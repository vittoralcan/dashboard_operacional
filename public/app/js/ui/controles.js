// @ts-check
import { html, raw } from '../core/html.js';
import { fmt, fmtDec, fmtVariacao, clamp } from '../core/format.js';
import { ic } from './icons.js';

/** Pequenos componentes de dado (CMP-06 e §7.3/7.5/7.6 do design system). Devolvem `Html`. */

/** Variação "+12,4% vs. mês anterior". `null`/`undefined` → vazio (nunca inventar valor). @param {number|null|undefined} v @param {string|false} [nota] */
export function delta(v, nota) {
  if (v === null || v === undefined || !Number.isFinite(v)) return raw('');
  const sobe = v >= 0;
  return html`<span class="${`delta ${sobe ? 'up' : 'down'}`}">${ic(sobe ? 'trend-up' : 'trend-down')}${fmtVariacao(v)}</span>${nota === false ? '' : html`<span class="delta-note">${nota || 'vs. mês anterior'}</span>`}`;
}

/** Número com contagem animada (`data-count`; animado por `contar()` em core/motion.js). @param {number} v @param {string} [cls] */
export const numeroContado = (v, cls = '') => html`<span class="${cls}" data-count="${v}">${fmt(v)}</span>`;

/**
 * Medidor fino de meta. Verde a partir de `limiarOk` (padrão 90 %). Sem meta → vazio.
 * @param {{ valor: number, meta: number, rotulo?: string, limiarOk?: number }} o
 */
export function medidor(o) {
  if (!o.meta || o.meta <= 0) return raw('');
  const pct = clamp((o.valor / o.meta) * 100, 0, 100);
  const cls = pct >= (o.limiarOk ?? 90) ? 'ok' : '';
  const rotulo = o.rotulo || 'Meta mensal';
  return html`<div class="meter-row"><span>${rotulo}</span><span><b>${fmt(o.valor)}</b> / ${fmt(o.meta)} · ${fmtDec((o.valor / o.meta) * 100, 0)}%</span></div>
    <div class="${`meter ${cls}`}" role="progressbar" aria-valuemin="0" aria-valuemax="${o.meta}" aria-valuenow="${o.valor}" aria-label="${`Progresso: ${rotulo.toLowerCase()}`}"><i data-w="${pct}"></i></div>`;
}

/**
 * Controle segmentado acessível (abas): setas ←/→ movem e selecionam; Home/End vão às pontas.
 * @param {HTMLElement} el contêiner `.seg` com botões `role="tab"`
 * @param {(indice: number, botao: HTMLElement) => void} aoMudar
 */
export function ligarSegmentado(el, aoMudar) {
  const abas = () => /** @type {HTMLElement[]} */ (Array.from(el.querySelectorAll('[role="tab"]')));
  const selecionar = (/** @type {number} */ i) => {
    abas().forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; });
    aoMudar(i, abas()[i]);
  };
  const aoClicar = (/** @type {Event} */ e) => {
    const b = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest('[role="tab"]'));
    if (b) selecionar(abas().indexOf(b));
  };
  const aoTeclar = (/** @type {KeyboardEvent} */ e) => {
    const lista = abas(); const atual = lista.findIndex((b) => b === document.activeElement);
    if (atual < 0) return;
    let i = atual;
    if (e.key === 'ArrowRight') i = (atual + 1) % lista.length;
    else if (e.key === 'ArrowLeft') i = (atual - 1 + lista.length) % lista.length;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = lista.length - 1;
    else return;
    e.preventDefault(); selecionar(i); lista[i].focus();
  };
  el.addEventListener('click', aoClicar);
  el.addEventListener('keydown', aoTeclar);
  const ini = abas().findIndex((b) => b.getAttribute('aria-selected') === 'true');
  abas().forEach((b, j) => { b.tabIndex = j === Math.max(0, ini) ? 0 : -1; });
  return { destruir() { el.removeEventListener('click', aoClicar); el.removeEventListener('keydown', aoTeclar); } };
}

/** Liga um `.switch` (`role="switch"`): clique/Enter/Espaço alternam. @param {HTMLElement} el @param {(ligado: boolean) => void} aoMudar */
export function ligarSwitch(el, aoMudar) {
  const alternar = () => { const v = el.getAttribute('aria-checked') !== 'true'; el.setAttribute('aria-checked', String(v)); aoMudar(v); };
  el.addEventListener('click', alternar);
  return { destruir() { el.removeEventListener('click', alternar); } };
}
