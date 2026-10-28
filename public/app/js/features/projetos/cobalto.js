// @ts-check
import { html } from '../../core/html.js';
import { projetoPorId } from '../../core/catalogo.js';
import { ilustracao } from '../../ui/empty.js';
import { ic } from '../../ui/icons.js';

/**
 * COBALTO (NAV-09): projeto ainda não iniciado — selo "Em breve" e estado vazio.
 * @param {HTMLElement} view @param {{ catalogo: import('../../core/catalogo.js').Catalogo }} ctx
 */
export function montar(view, ctx) {
  const p = projetoPorId(ctx.catalogo, 'cobalto');
  const nome = (p && p.nome) || 'O COBALTO';
  view.innerHTML = html`<div class="page-h rise"><div class="ttl"><span class="eyebrow">${ic('lock-simple')} Projeto</span>
      <h1 style="display:flex;align-items:center;gap:12px">COBALTO <span class="selo accent nodot">Em breve</span></h1></div></div>
    <div class="card rise" style="--i:1"><div class="empty">${ilustracao('ampulheta')}<h3>Projeto ainda não iniciado</h3>
      <p>${nome} ainda não possui módulos ativos. Assim que a operação começar, os indicadores aparecerão aqui.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><a class="btn" href="#/projetos">${ic('arrow-left')}Voltar aos projetos</a></div></div></div>`.toString();
  return { destruir() {} };
}
