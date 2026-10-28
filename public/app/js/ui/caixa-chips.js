// @ts-check
import { html } from '../core/html.js';
import { ic } from './icons.js';
import { chipsDaCaixa } from '../core/caixas-op.js';

/** Selos de uma caixa (situação, imagens, grampo, papel deteriorado) para as telas da gestão. @param {import('../core/caixas-op.js').CaixaOp} caixa */
export function chipsHtml(caixa) {
  return html`${chipsDaCaixa(caixa).map((c) => html`<span class="op-chip${c.tipo ? ` ${c.tipo}` : ''}">${ic(c.icone)}${c.texto}</span>`)}`;
}
