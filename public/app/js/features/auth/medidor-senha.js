// @ts-check
import { $ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { forcaSenha } from '../../core/senha.js';
import { ic } from '../../ui/icons.js';

// Fora de campos.js (casca + login) para a regra de senha só carregar nas telas de troca/criação de senha.
/** Medidor de força + checklist (AUT-08) — só markup. */
export function medidorSenha() {
  return html`<div class="pw" data-pw><div class="pw-meter" data-n="0" role="meter" aria-label="Força da senha" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0"><i></i><i></i><i></i><i></i></div>
    <div class="pw-rotulo" data-pw-rotulo aria-live="polite"></div>
    <div class="pw-checks" data-pw-checks></div></div>`;
}

/** Atualiza o medidor e o checklist. @param {HTMLElement} raiz @param {string} senha */
export function atualizarMedidor(raiz, senha) {
  const f = forcaSenha(senha);
  const m = $('.pw-meter', raiz);
  if (m) { m.dataset.n = String(f.nivel); m.setAttribute('aria-valuenow', String(f.nivel)); }
  const r = $('[data-pw-rotulo]', raiz);
  if (r) r.textContent = f.rotulo ? `Força: ${f.rotulo}` : '';
  const c = $('[data-pw-checks]', raiz);
  if (c) c.innerHTML = html`${f.requisitos.map((q) => html`<span class="${q.ok ? 'ok' : ''}">${ic(q.ok ? 'check-circle' : 'x-circle')}${q.rotulo}</span>`)}`.toString();
}

/** Indicador inline "✓ As senhas coincidem". @param {HTMLElement} alvo @param {string} senha @param {string} repita */
export function atualizarIgualdade(alvo, senha, repita) {
  if (!repita) { alvo.className = 'pw-igual'; alvo.textContent = ''; return; }
  const ok = senha === repita;
  alvo.className = `pw-igual ${ok ? 'ok' : 'nao'}`;
  alvo.textContent = ok ? '✓ As senhas coincidem' : '✕ Não coincidem';
}
