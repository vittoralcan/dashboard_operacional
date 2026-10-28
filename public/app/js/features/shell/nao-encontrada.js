// @ts-check
import { html } from '../../core/html.js';
import { MOD } from '../../core/dom.js';
import { ilustracao } from '../../ui/empty.js';
import { ic } from '../../ui/icons.js';

/** Página 404 (NAV-08): código da rota, atalho para a paleta e botão para Projetos. @param {string} hash */
export function conteudo404(hash) {
  const rota = String(hash || '').replace(/^#/, '') || '/';
  return html`<div class="page-h rise"><div class="ttl"><span class="eyebrow">${ic('warning-circle')} Erro 404</span></div></div>
    <div class="card rise" style="--i:1"><div class="empty">${ilustracao('busca')}<span class="chip-mono">404</span><h3>Página não encontrada</h3>
      <p>Não existe uma tela para <code>#${rota}</code>. Use a paleta de comandos (<kbd>${MOD}</kbd> <kbd>K</kbd>) para ir direto ao que procura.</p>
      <a class="btn primary" href="#/projetos">${ic('squares-four')}Ir para Projetos</a></div></div>`;
}

/** @param {HTMLElement} view */
export function montar(view) {
  view.innerHTML = conteudo404(location.hash).toString();
  return { destruir() {} };
}
