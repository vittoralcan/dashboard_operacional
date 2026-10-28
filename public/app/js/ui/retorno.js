// @ts-check
import { html } from '../core/html.js';
import { ic } from './icons.js';

/**
 * Painel de retorno do operador: confirma na hora o que acabou de acontecer (caixa iniciada, pausada, concluída…).
 * Sempre ícone + título + linhas, nunca só cor. `texto` simples vira o título.
 * @typedef {{ tipo: 'ok'|'warn'|'err'|'info', titulo?: string, linhas?: string[], texto?: string }} Retorno
 */
const ICONE = { ok: 'check-circle', warn: 'warning', err: 'warning-octagon', info: 'info' };

/** @param {Retorno} r @param {import('../core/html.js').Html|string} [extra] ex.: botão "Tentar de novo" */
export function retornoHtml(r, extra = '') {
  const titulo = r.titulo || r.texto || '';
  const linhas = r.linhas || [];
  return html`${ic(ICONE[r.tipo] || 'info')}<div class="op-retorno-txt"><span class="op-retorno-tit">${titulo}</span>${linhas.map((l) => html`<span class="op-retorno-lin">${l}</span>`)}</div>${extra}`;
}

/** Texto curto de acessibilidade para a região viva. @param {Retorno} r */
export function retornoTexto(r) {
  return [r.titulo || r.texto || '', ...(r.linhas || [])].filter(Boolean).join('. ');
}
