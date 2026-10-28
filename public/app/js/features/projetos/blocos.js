// @ts-check
import { html } from '../../core/html.js';
import { fmt, fmtDec, tempoRelativo } from '../../core/format.js';
import { ESTADO } from '../../core/store.js';
import { delegar } from '../../core/dom.js';
import { gargaloParaCartao } from '../../core/gargalos.js';
import { progressoDaMeta } from '../../core/metas.js';
import { ic } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { anelSVG } from '../../ui/charts.js';
import { animarBarras } from '../../core/motion.js';

/**
 * Pintura dos blocos que a seleção de projetos e os hubs dividem com o backend novo: "Gargalos agora" (B5), "Atividade recente"
 * (B8) e "Metas do mês" (B7). Cada um é um cartão independente: falha ou 404 só afeta ele (RNB-008), e o 404 troca o cartão
 * pelo "Em breve" (RNB-007). O markup do cartão (esqueleto) e `trocarPorEmBreve` vivem em `cartoes.js`; este módulo, mais pesado,
 * é carregado sob demanda pela Home (os cartões ficam abaixo da dobra — RNB-015).
 */

const lugar = (/** @type {ParentNode} */ raiz, /** @type {string} */ k) => /** @type {HTMLElement|null} */ (raiz.querySelector(`[data-k="${k}"]`));

// ---------------------------------------------------------------- Gargalos agora

/** @param {ParentNode} raiz @param {import('../../core/gargalos.js').Gargalo[]} lista @param {import('../../core/catalogo.js').Catalogo} cat */
export function pintarGargalos(raiz, lista, cat) {
  const n = lugar(raiz, 'gar-n'); const l = lugar(raiz, 'gar-lista');
  if (!n || !l) return;
  n.textContent = String(lista.length);
  n.className = `selo ${lista.length ? 'warn' : 'ok'} nodot`;
  l.innerHTML = (lista.length ? html`${lista.map((g) => {
    const c = gargaloParaCartao(g, cat);
    const corpo = html`<div class="nm">${c.titulo}</div><div class="v">${fmt(c.pastas)}<small>pastas</small></div>
      <div class="wh">${c.onde}${c.pct !== null ? html` · <span class="warn-t">${`${fmtDec(c.pct)}% das pastas paradas`}</span>` : ''}</div>`;
    // sem rota no catálogo (instância que o front ainda não conhece) mostra, mas não navega; tudo que vem do servidor é escapado
    return c.rota ? html`<div class="gargalo-i" role="link" tabindex="0" data-gar-rota="${c.rota}" data-gar-inst="${c.foco.instancia}" data-gar-fas="${c.foco.fasId}">${corpo}</div>` : html`<div class="gargalo-i">${corpo}</div>`;
  })}`
    : html`<div class="bloco-ok">${ic('check-circle')}<span>Nenhum gargalo agora.</span></div>`).toString();
}

/** Clique/Enter num gargalo: leva ao fluxograma da instância JÁ com o nó em foco (FLX-14). @param {HTMLElement} raiz @param {(rota: string) => void} ir */
export function ligarGargalos(raiz, ir) {
  const abrir = (/** @type {HTMLElement} */ el) => {
    ESTADO.focoNo = { instancia: /** @type {string} */ (el.dataset.garInst), fasId: Number(el.dataset.garFas) };
    ir(/** @type {string} */ (el.dataset.garRota));
  };
  const soltar = delegar(raiz, 'click', '[data-gar-rota]', abrir);
  const tecla = (/** @type {KeyboardEvent} */ e) => {
    const el = /** @type {HTMLElement|null} */ ((/** @type {any} */ (e.target)).closest?.('[data-gar-rota]'));
    if (el && e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(el); }
  };
  raiz.addEventListener('keydown', /** @type {any} */ (tecla));
  return () => { soltar(); raiz.removeEventListener('keydown', /** @type {any} */ (tecla)); };
}

// ---------------------------------------------------------------- Atividade recente

/** @param {ParentNode} raiz @param {ReturnType<typeof import('../../core/servicos.js').normalizarAtividades>} lista @param {number} [agora] */
export function pintarAtividades(raiz, lista, agora = Date.now()) {
  const l = lugar(raiz, 'ativ-lista');
  if (!l) return;
  l.innerHTML = (lista.length ? html`<div class="feed">${lista.map((a) => html`<div class="feed-i">${a.sistema ? html`<span class="sys">${ic('robot')}</span>` : avatar({ nome: a.quem, tamanho: 26 })}
      <div><p><b>${a.quem}</b> ${a.acao} ${a.alvo ? html`<span class="mono">${a.alvo}</span>` : ''}</p>${a.onde ? html`<small>${a.onde}</small>` : ''}</div>
      <time>${a.ts ? tempoRelativo((agora - a.ts) / 1000) : ''}</time></div>`)}</div>`
    : html`<div class="bloco-ok">${ic('pulse')}<span>Sem atividade recente.</span></div>`).toString();
}

// ---------------------------------------------------------------- Metas do mês (hub BOREAL)

/**
 * Três anéis (um por módulo com meta cadastrada). Sem meta o item some (F3); sem nenhuma, uma frase e — para admin — o atalho.
 * @param {HTMLElement} el @param {{ nome: string, valor: number|null, meta: number|null, unidade: string }[]} itens @param {boolean} admin
 */
export function pintarMetasDoMes(el, itens, admin) {
  const com = itens.filter((i) => i.meta && i.valor !== null);
  el.innerHTML = (com.length ? html`${com.map((i) => {
    const p = /** @type {NonNullable<ReturnType<typeof progressoDaMeta>>} */ (progressoDaMeta(/** @type {number} */ (i.valor), i.meta));
    return html`<div class="meta-anel"><div class="anel-w">${anelSVG(Math.min(1, p.pct / 100), 54, 5)}<span class="mono">${fmtDec(p.pct, 0)}%</span></div>
      <div class="anel-tx"><b>${i.nome}</b><div class="unit"><span class="mono">${fmt(/** @type {number} */ (i.valor))}</span> de <span class="mono">${fmt(/** @type {number} */ (i.meta))}</span> ${i.unidade}</div></div></div>`;
  })}`
    : html`<div class="bloco-ok">${ic('target')}<span>Nenhuma meta definida para este mês.</span>${admin ? html`<a class="meta-def" href="#/metas">Definir metas</a>` : ''}</div>`).toString();
  animarBarras(el);
}
