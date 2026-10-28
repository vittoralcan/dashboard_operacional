// @ts-check
import { esc, raw } from '../core/html.js';

/**
 * Ícone do sprite `assets/icons.svg` (Phosphor, MIT). Decorativo (`aria-hidden`); botão só-ícone
 * leva `aria-label` no próprio botão. Para acrescentar ícone: scripts/app-assets/ (README).
 * @param {string} nome ex.: 'bell', 'check-circle'
 * @param {string} [extra] classes adicionais
 */
export const ic = (nome, extra = '') => raw(`<svg class="ic${extra ? ` ${esc(extra)}` : ''}" aria-hidden="true" focusable="false"><use href="assets/icons.svg#i-${esc(nome)}"/></svg>`);

/** Ícone preenchido (só status/toast/avatares de modal). @param {string} nome */
export const icf = (nome) => raw(`<svg class="ic" aria-hidden="true" focusable="false"><use href="assets/icons.svg#i-${esc(nome)}-fill"/></svg>`);
