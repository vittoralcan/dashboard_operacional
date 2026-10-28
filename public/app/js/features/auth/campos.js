// @ts-check
import { $, $$ } from '../../core/dom.js';
import { html, raw } from '../../core/html.js';
import { ic } from '../../ui/icons.js';

/** Peças de formulário compartilhadas por login, primeiro acesso, criar usuário e perfil. */

/**
 * Campo de texto com rótulo, ícone e mensagem de erro por campo (`role="alert"`).
 * @param {{ id: string, rotulo: string, icone: string, tipo?: string, autocomplete?: string, valor?: string,
 *           somenteLeitura?: boolean, placeholder?: string, ajuda?: string, inputmode?: string, autofocus?: boolean }} o
 */
export function campoTexto(o) {
  return html`<div class="field"><label class="lbl" for="${o.id}">${o.rotulo}</label>
    <div class="input">${ic(o.icone)}<input id="${o.id}" name="${o.id}" type="${o.tipo || 'text'}" ${o.autocomplete ? raw(`autocomplete="${o.autocomplete}"`) : ''} value="${o.valor || ''}" ${o.placeholder ? raw(`placeholder="${o.placeholder.replace(/"/g, '&quot;')}"`) : ''} ${o.somenteLeitura ? raw('readonly aria-readonly="true"') : ''} ${o.inputmode ? raw(`inputmode="${o.inputmode}"`) : ''} autocapitalize="none" spellcheck="false" aria-describedby="${`${o.id}-msg`}"></div>
    ${o.ajuda ? html`<span class="field-hint">${o.ajuda}</span>` : ''}<span class="field-msg" id="${`${o.id}-msg`}" role="alert" hidden></span></div>`;
}

/**
 * Campo de senha com botão de olho; `extra` aparece à direita do rótulo (ex.: selo de Caps Lock).
 * @param {{ id: string, rotulo: string, autocomplete: string, extra?: import('../../core/html.js').Html }} o
 */
export function campoSenha(o) {
  return html`<div class="field"><label class="lbl" for="${o.id}"><span>${o.rotulo}</span>${o.extra || ''}</label>
    <div class="input">${ic('lock-simple')}<input id="${o.id}" name="${o.id}" type="password" autocomplete="${o.autocomplete}" autocapitalize="none" spellcheck="false" aria-describedby="${`${o.id}-msg`}">
      <button class="reveal" type="button" data-olho="${o.id}" aria-label="Mostrar senha" aria-pressed="false">${ic('eye')}</button></div>
    <span class="field-msg" id="${`${o.id}-msg`}" role="alert" hidden></span></div>`;
}

/** Selo "Caps Lock ativado" (AUT-04) — escondido até `ligarCapsLock` detectar. */
export const seloCaps = () => html`<span class="caps" data-caps hidden>${ic('arrow-fat-line-up')}Caps Lock ativado</span>`;

/** Liga os botões de olho (AUT-03) dentro de `raiz`. @param {HTMLElement} raiz */
export function ligarOlhos(raiz) {
  const aoClicar = (/** @type {Event} */ e) => {
    const b = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest('[data-olho]'));
    if (!b) return;
    const inp = /** @type {HTMLInputElement|null} */ ($(`#${b.dataset.olho}`, raiz));
    if (!inp) return;
    const ver = inp.type === 'password';
    inp.type = ver ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(ver));
    b.setAttribute('aria-label', ver ? 'Ocultar senha' : 'Mostrar senha');
    const use = b.querySelector('use');
    if (use) use.setAttribute('href', `assets/icons.svg#i-${ver ? 'eye-slash' : 'eye'}`);
    inp.focus();
  };
  raiz.addEventListener('click', aoClicar);
  return () => raiz.removeEventListener('click', aoClicar);
}

/** Aviso de Caps Lock via `getModifierState('CapsLock')` (AUT-04). @param {HTMLInputElement} input @param {HTMLElement|null} selo */
export function ligarCapsLock(input, selo) {
  if (!selo) return () => {};
  const f = (/** @type {KeyboardEvent} */ e) => { selo.hidden = !(e.getModifierState && e.getModifierState('CapsLock')); };
  const sair = () => { selo.hidden = true; };
  input.addEventListener('keydown', f);
  input.addEventListener('keyup', f);
  input.addEventListener('blur', sair);
  return () => { input.removeEventListener('keydown', f); input.removeEventListener('keyup', f); input.removeEventListener('blur', sair); };
}

/** Mostra a mensagem de erro de um campo. @param {HTMLElement} raiz @param {string} id @param {string} mensagem */
export function erroCampo(raiz, id, mensagem) {
  const inp = $(`#${id}`, raiz);
  const msg = $(`#${id}-msg`, raiz);
  inp?.closest('.input')?.classList.add('invalid');
  inp?.setAttribute('aria-invalid', 'true');
  if (msg) { msg.hidden = false; msg.innerHTML = html`${ic('warning-circle')}${mensagem}`.toString(); }
}

/** Limpa o erro de um campo (ou de todos). @param {HTMLElement} raiz @param {string} [id] */
export function limparErros(raiz, id) {
  const ids = id ? [id] : $$('.input input', raiz).map((i) => i.id);
  for (const i of ids) {
    const inp = $(`#${i}`, raiz);
    inp?.closest('.input')?.classList.remove('invalid');
    inp?.removeAttribute('aria-invalid');
    const msg = $(`#${i}-msg`, raiz);
    if (msg) { msg.hidden = true; msg.textContent = ''; }
  }
}

/** Balança o cartão (erro de formulário). @param {HTMLElement} el */
export function tremer(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

