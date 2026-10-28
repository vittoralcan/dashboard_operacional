// @ts-check
import { html, raw, esc } from '../core/html.js';
import { ic } from './icons.js';
import { recurso, ativo } from '../config/recursos.js';

/**
 * "Em breve" (RNB-007 revisada): marca, no lugar certo da tela, o que depende do backend novo.
 * Tudo aqui devolve `Html` pronto para interpolar em `html`…``. Nada faz requisição.
 * Se o recurso já está 'ativo', as funções devolvem vazio — a tela deve usar o dado real.
 */

/** Texto do tooltip: o que é e o que falta (não um "chega em breve" genérico). @param {string} id */
export function dicaEmBreve(id) {
  const r = recurso(id);
  return `Em breve: ${r.nome}. Depende do backend (${r.api}).`;
}

/** Atributos para desabilitar um botão/item sem sumir com ele. @param {string} id */
export function atributosEmBreve(id) {
  return raw(`aria-disabled="true" data-embreve="${esc(id)}" data-tip="${esc(dicaEmBreve(id))}"`);
}

/**
 * Selo "Em breve".
 * @param {string} id recurso de config/recursos.js
 * @param {{ semIcone?: boolean }} [o]
 */
export function seloEmBreve(id, o = {}) {
  if (ativo(id)) return raw('');
  const r = recurso(id);
  // O nome do recurso vai em texto visualmente oculto: `aria-label` em <span> sem papel não é lido de forma confiável.
  return html`<span class="selo embreve" data-tip="${dicaEmBreve(id)}">${o.semIcone ? '' : ic('hourglass-medium')}Em breve<span class="sr-only">: ${r.nome}</span></span>`;
}

/**
 * Valor dentro de um KPI que JÁ tem número real (variação, meta, projeção): `—` + selo discreto.
 * @param {string} id
 */
export function valorEmBreve(id) {
  if (ativo(id)) return raw('');
  return html`<span class="embreve-valor" data-tip="${dicaEmBreve(id)}">—${seloEmBreve(id, { semIcone: true })}</span>`;
}

/**
 * Cartão inteiro marcado "Em breve", com a MESMA moldura do bloco real.
 * @param {{ recurso: string, titulo: string, icone?: string, texto?: string, classes?: string }} o
 */
export function blocoEmBreve(o) {
  if (ativo(o.recurso)) return raw('');
  const r = recurso(o.recurso);
  const texto = o.texto || `${r.nome} chega em breve a esta tela.`;
  return html`<section class="card embreve ${o.classes || ''}">
    <div class="card-h"><span class="card-t">${ic(o.icone || 'hourglass-medium')}${o.titulo}</span>${seloEmBreve(o.recurso)}</div>
    <div class="embreve-corpo"><p class="embreve-txt">${texto}</p></div>
  </section>`;
}

/**
 * Página inteira "Em breve" (estado vazio ilustrado).
 * @param {{ recurso: string, titulo: string, texto?: string }} o
 */
export function paginaEmBreve(o) {
  const r = recurso(o.recurso);
  return html`<div class="empty embreve-pag">
    <div class="ico-tile lg accent">${ic('hourglass-medium')}</div>
    <h3>${o.titulo}</h3>
    <p>${o.texto || `${r.nome} ainda não está disponível.`}</p>
    ${seloEmBreve(o.recurso)}
  </div>`;
}

/**
 * Escolhe entre o conteúdo real e o "Em breve" conforme o estado do recurso.
 * @template T
 * @param {string} id @param {() => T} real @param {() => T} fallback
 */
export const seAtivo = (id, real, fallback) => (ativo(id) ? real() : fallback());
