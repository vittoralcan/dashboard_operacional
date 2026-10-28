// @ts-check
import { $, $$ } from '../core/dom.js';
import { html } from '../core/html.js';
import { MESES, DIAS_SEMANA, semanasDoMes, navegarMes, clicarDia, estadoDoDia, mesmoDia, inicioDoDia, dataCurta, iso, diasNoIntervalo, atalhosDeIntervalo } from '../core/calendario.js';
import { ic } from './icons.js';

/**
 * Calendário de intervalo (CMP-07) — substitui o Flatpickr. Mês navegável, sem datas futuras,
 * seleção início → fim e atalhos. Devolve `{ obter, definir, destruir }`; `aoMudar` recebe
 * `{ ini, fim, completo }` a cada seleção.
 *
 * @param {HTMLElement} el
 * @param {{ hoje?: Date, ini?: Date|null, fim?: Date|null, atalhos?: boolean,
 *           aoMudar?: (s: { ini: Date|null, fim: Date|null, completo: boolean }) => void }} [cfg]
 */
export function montarCalendario(el, cfg = {}) {
  const hoje = inicioDoDia(cfg.hoje || new Date());
  /** @type {{ ini: Date|null, fim: Date|null }} */
  let sel = { ini: cfg.ini || null, fim: cfg.fim || null };
  let vista = { ano: (sel.ini || hoje).getFullYear(), mes: (sel.ini || hoje).getMonth() };

  const emitir = () => cfg.aoMudar?.({ ini: sel.ini, fim: sel.fim, completo: !!(sel.ini && sel.fim) });

  const desenhar = () => {
    const semanas = semanasDoMes(vista.ano, vista.mes);
    const podeAvancar = new Date(vista.ano, vista.mes + 1, 1) <= hoje;
    const resumo = sel.ini && sel.fim ? `${dataCurta(sel.ini)} → ${dataCurta(sel.fim)} · ${diasNoIntervalo(sel.ini, sel.fim)} dia(s)` : sel.ini ? `Início: ${dataCurta(sel.ini)} — escolha o fim` : 'Escolha a data inicial';
    el.innerHTML = html`<div class="cal" role="group" aria-label="Calendário de intervalo">
      <div class="cal-h">
        <button class="icon-btn sm" type="button" data-nav="-1" aria-label="Mês anterior">${ic('caret-left')}</button>
        <b aria-live="polite">${`${MESES[vista.mes][0].toUpperCase()}${MESES[vista.mes].slice(1)} de ${vista.ano}`}</b>
        <button class="icon-btn sm" type="button" data-nav="1" aria-label="Próximo mês" ${podeAvancar ? '' : 'disabled'}>${ic('caret-right')}</button>
      </div>
      <div class="cal-g">${DIAS_SEMANA.map((d) => html`<span class="wd" aria-hidden="true">${d}</span>`)}
        ${semanas.flat().map((d) => {
    if (!d) return html`<span></span>`;
    const futuro = d > hoje;
    const est = estadoDoDia(d, sel);
    const cls = [est, mesmoDia(d, hoje) ? 'hoje' : ''].join(' ').trim();
    return html`<button type="button" class="${cls}" data-dia="${iso(d)}" ${futuro ? 'disabled' : ''} aria-pressed="${est !== '' && est !== 'in' ? 'true' : 'false'}" aria-label="${dataCurta(d)}">${d.getDate()}</button>`;
  })}
      </div>
      <div class="cal-f"><span class="mono" data-resumo>${resumo}</span></div>
      ${cfg.atalhos ? html`<div class="pills" role="group" aria-label="Atalhos de período">${atalhosDeIntervalo(hoje).map((a) => html`<button class="pill" type="button" data-atalho="${a.id}">${a.rotulo}</button>`)}</div>` : ''}
    </div>`.toString();
  };

  const aoClicar = (/** @type {Event} */ e) => {
    const alvo = /** @type {HTMLElement} */ (e.target);
    const nav = /** @type {HTMLElement|null} */ (alvo.closest('[data-nav]'));
    if (nav) { vista = navegarMes(vista, Number(nav.dataset.nav)); desenhar(); $('[data-nav="' + nav.dataset.nav + '"]', el)?.focus(); return; }
    const dia = /** @type {HTMLElement|null} */ (alvo.closest('[data-dia]'));
    if (dia) {
      const [a, m, d] = /** @type {string} */ (dia.dataset.dia).split('-').map(Number);
      sel = clicarDia(sel, new Date(a, m - 1, d), hoje);
      desenhar(); emitir();
      $$('[data-dia]', el).find((b) => b.dataset.dia === dia.dataset.dia)?.focus();
      return;
    }
    const at = /** @type {HTMLElement|null} */ (alvo.closest('[data-atalho]'));
    if (at) {
      const a = atalhosDeIntervalo(hoje).find((x) => x.id === at.dataset.atalho);
      if (a) { sel = { ini: a.ini, fim: a.fim }; vista = { ano: a.fim.getFullYear(), mes: a.fim.getMonth() }; desenhar(); emitir(); }
    }
  };
  el.addEventListener('click', aoClicar);
  desenhar();

  return {
    obter: () => ({ ini: sel.ini, fim: sel.fim }),
    /** @param {Date|null} ini @param {Date|null} fim */
    definir(ini, fim) { sel = { ini, fim }; if (ini) vista = { ano: ini.getFullYear(), mes: ini.getMonth() }; desenhar(); },
    destruir() { el.removeEventListener('click', aoClicar); },
  };
}
