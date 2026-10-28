// @ts-check
import { $ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { fmt } from '../../core/format.js';

const num = (/** @type {unknown} */ v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

/**
 * `porTipo` do /gestao (cru, vindo de `normalizarGestao`) → [{ tipo, pastas, imagens }]. Descarta lixo; sem `tipo` (rótulo é do servidor)
 * monta "Projeto · Lote". Ordem do servidor (pastas desc) preservada.
 * @param {any[]} arr
 */
export function normalizarPorTipo(arr) {
  return (Array.isArray(arr) ? arr : []).filter((x) => x && typeof x === 'object')
    .map((x) => ({ tipo: String(x.tipo || [x.projeto, x.lote].filter(Boolean).join(' · ') || 'Sem tipo'), pastas: num(x.pastas), imagens: num(x.imagens) }));
}

/**
 * Tipologia da produção do mês (projeto + lote do Captura) dentro do cartão de cada fase da Análise. Os fluxos misturam tipos de papel,
 * então o KPI da fase é mostrado também dividido: com mais de um tipo, lista compacta (tipo · pastas · imagens, a soma bate com o KPI);
 * com um só, o nome do tipo discreto. Sem `porTipo` (backend antigo) ou sem produção no mês, não desenha nada. Carregado sob demanda
 * (import dinâmico em analise.js) para não pesar no pacote da tela. Texto, não só cor (acessível); cores vêm dos tokens do tema.
 * @param {HTMLElement} raiz @param {ReturnType<typeof import('../../core/fluxo-prod.js').normalizarGestao>} gestao
 */
export default function pintarTipologia(raiz, gestao) {
  for (const g of gestao) {
    const col = $(`[data-col="${g.fasId}"]`, raiz);
    const ref = col && $('[data-estados]', col);
    if (!col || !ref) continue;
    const alvo = $('[data-tipos]', col) || ref.insertAdjacentElement('beforebegin', document.createElement('div'));
    if (!alvo) continue;
    alvo.dataset.tipos = '';
    const tipos = normalizarPorTipo(g.porTipo);
    alvo.innerHTML = !tipos.length ? '' : tipos.length === 1
      ? html`<p class="tipo-unico"><span class="eyebrow">Tipo</span> ${tipos[0].tipo}</p>`.toString()
      : html`<div class="tipo-bloco"><span class="eyebrow">Por tipo</span>
          <ul class="tipo-lista" aria-label="${`Produção por tipo — ${g.titulo}`}">${tipos.map((t) => html`<li class="tipo-i"><span class="tipo-n" title="${t.tipo}">${t.tipo}</span><span class="mono">${`${fmt(t.pastas)} pastas`}</span><span class="mono dim">${`${fmt(t.imagens)} imagens`}</span></li>`)}</ul></div>`.toString();
  }
}
