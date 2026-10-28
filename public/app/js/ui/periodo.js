// @ts-check
import { $, $$, delegar } from '../core/dom.js';
import { html } from '../core/html.js';
import { dataBR } from '../core/format.js';
import { periodoDoRelatorio } from '../core/calendario.js';
import { ic } from './icons.js';
import { abrirModal } from './modal.js';
import { montarCalendario } from './calendar.js';

/**
 * Modal "período do relatório" (FLX-04, IDX-04): duas opções-cartão — **Hoje** e **Por Período** (calendário de
 * intervalo com atalhos; datas futuras desabilitadas). "Gerar" fica desabilitado até haver início e fim.
 * Quem usa decide o que fazer com o período em `gerar`: pode fechar este modal e abrir o resultado, ou — se o
 * servidor recusar (ex.: `400` "O período máximo é de 92 dias.") — mostrar o erro AQUI, sem fechar (`ctrl.erro`).
 *
 * @param {{ eyebrow: import('../core/html.js').Html|string, titulo: string, sub: string, rotuloBotao?: string, icone?: string,
 *           gerar: (periodo: { dataInicio: string, dataFim: string }, ctrl: { erro: (msg: string) => void, fechar: () => void, modal: ReturnType<typeof abrirModal> }) => void }} o
 */
export function abrirModalPeriodo(o) {
  /** @type {'hoje'|'periodo'} */
  let modo = 'hoje';
  /** @type {{ ini: Date|null, fim: Date|null }} */
  let sel = { ini: null, fim: null };
  /** @type {ReturnType<typeof montarCalendario>|null} */
  let cal = null;
  const m = abrirModal({
    eyebrow: o.eyebrow, titulo: o.titulo, sub: o.sub,
    corpo: html`<div class="doc-corpo"><div class="opts" role="radiogroup" aria-label="Período">
        <button type="button" class="opt" role="radio" aria-checked="true" data-modo="hoje">${ic('calendar-check')}<b>Gerar do Dia (Hoje)</b><span>${dataBR()} · até agora</span><i class="chk"></i></button>
        <button type="button" class="opt" role="radio" aria-checked="false" data-modo="periodo">${ic('calendar-dots')}<b>Por Período</b><span>Escolha um intervalo de datas</span><i class="chk"></i></button></div>
      <div class="doc-cal" data-cal hidden></div>
      <div class="form-err" role="alert" data-erro hidden></div></div>`,
    rodape: html`<button type="button" class="btn ghost" data-fechar>Cancelar</button><button type="button" class="btn primary" data-gerar>${ic(o.icone || 'file-text')}${o.rotuloBotao || 'Gerar relatório'}</button>`,
  });
  const gerar = /** @type {HTMLButtonElement} */ ($('[data-gerar]', m.el));
  const caixa = /** @type {HTMLElement} */ ($('[data-cal]', m.el));
  const erro = /** @type {HTMLElement} */ ($('[data-erro]', m.el));
  const sincronizar = () => { gerar.disabled = modo === 'periodo' && !(sel.ini && sel.fim); };
  const limparErro = () => { erro.hidden = true; erro.textContent = ''; };

  const escolher = (/** @type {HTMLElement} */ opt) => {
    modo = /** @type {'hoje'|'periodo'} */ (opt.dataset.modo);
    $$('.opt', m.el).forEach((x) => { x.setAttribute('aria-checked', String(x === opt)); x.tabIndex = x === opt ? 0 : -1; });
    caixa.hidden = modo !== 'periodo';
    limparErro();
    if (modo === 'periodo' && !cal) cal = montarCalendario(caixa, { atalhos: true, aoMudar: (s) => { sel = { ini: s.ini, fim: s.fim }; limparErro(); sincronizar(); } });
    sincronizar();
  };
  $$('.opt', m.el).forEach((x, i) => { x.tabIndex = i === 0 ? 0 : -1; });
  delegar(m.el, 'click', '.opt', escolher);
  delegar(m.el, 'keydown', '.opt', (opt, e) => {
    const k = /** @type {KeyboardEvent} */ (e).key;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(k)) return;
    e.preventDefault();
    const outros = $$('.opt', m.el);
    const prox = outros[(outros.indexOf(opt) + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1) + outros.length) % outros.length];
    escolher(prox); prox.focus();
  });
  gerar.addEventListener('click', () => {
    const periodo = periodoDoRelatorio(modo, sel.ini, sel.fim);
    if (!periodo) return;
    limparErro();
    o.gerar(periodo, {
      modal: m,
      fechar: () => m.fechar(),
      erro: (msg) => { erro.innerHTML = html`${ic('warning')}<span>${msg}</span>`.toString(); erro.hidden = false; m.tremer(); },
    });
  });
  sincronizar();
  return m;
}
