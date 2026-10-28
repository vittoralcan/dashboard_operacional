// @ts-check
import { $ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { ESTADO } from '../../core/store.js';
import { alternarTema, sincronizarTemaUI } from '../../core/tema.js';
import { LOGO } from '../../ui/logo.js';
import { ic } from '../../ui/icons.js';

/**
 * Moldura da camada `#auth` (login e primeiro acesso): fundo, topo com a marca e o botão de tema, título
 * "Painel Operacional" à esquerda e coluna do formulário à direita (telas largas; no celular só a coluna) e rodapé
 * mono. `conteudo` vai dentro da coluna.
 * @param {HTMLElement} raiz @param {import('../../core/html.js').Html} conteudo
 */
export function montarMoldura(raiz, conteudo) {
  raiz.innerHTML = html`<div class="auth">
    <div class="auth-top"><div class="brand">${LOGO}<span>Painel Operacional</span></div>
      <button class="icon-btn bordered" data-acao="tema" aria-label="Alternar tema" data-tip="Alternar tema">${ic(ESTADO.tema === 'dark' ? 'sun' : 'moon')}</button></div>
    <div class="auth-hero"><p class="titulo">Painel Operacional</p><p class="sub">Acompanhamento da produção em tempo real.</p></div>
    <div class="auth-col">${conteudo}</div>
    <div class="auth-foot"><span>Gestão documental · Demo</span></div></div>`.toString();
  const btn = /** @type {HTMLElement} */ ($('[data-acao="tema"]', raiz));
  const aoTema = (/** @type {MouseEvent} */ e) => { alternarTema(e); setTimeout(() => { btn.querySelector('use')?.setAttribute('href', `assets/icons.svg#i-${ESTADO.tema === 'dark' ? 'sun' : 'moon'}`); }, 80); };
  btn.addEventListener('click', aoTema);
  sincronizarTemaUI();
  return { destruir() { btn.removeEventListener('click', aoTema); raiz.replaceChildren(); } };
}
