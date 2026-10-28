// @ts-check
import { html } from '../../core/html.js';
import { animarNumero, animarBarras } from '../../core/motion.js';
import { ic } from '../../ui/icons.js';
import { sparkSVG } from '../../ui/charts.js';
import { valorEmBreve, blocoEmBreve } from '../../ui/embreve.js';
import { delta, medidor } from '../../ui/controles.js';

/**
 * Cartões compartilhados pela seleção de projetos e pelos hubs. Só markup e pintura dos "slots"
 * (`data-k`): o nome do cartão-link é o próprio conteúdo (título + número), então um valor novo nunca fica fora do que o leitor de tela lê.
 * Todo cartão é `role="link"` com `data-nav`; o clique/Enter/Espaço é ligado por delegação na tela.
 */

/** Slot da meta do mês (medidor, ou "Sem meta definida"), preenchido por `pintarMeta`. */
const slotMeta = () => html`<div class="meta-slot" data-k="meta"></div>`;

/** Variação vs. mês anterior: no BOREAL o back_boreal não calcula → "Em breve"; no ATLAS chega com o dado (slot `var`). @param {boolean} boreal */
export const slotVariacao = (boreal) => html`<span class="var-slot" data-k="var">${boreal ? valorEmBreve('boreal.resumo') : ''}</span>`;

/** Chip de módulo/fluxo. @param {string} icone @param {string} rotulo @param {string} [nota] */
export const chip = (icone, rotulo, nota = '') => html`<span class="chip">${ic(icone)}${rotulo}${nota ? html`<span class="mono">${nota}</span>` : ''}</span>`;

/**
 * Cartão de projeto da seleção (BOREAL, ATLAS): KPI "imagens finalizadas no mês" + sparkline do mês + chips + rodapé.
 * `separado` (ATLAS): papel e negativo em totais distintos (`kpi` = papel, `kpi2` = negativo).
 * @param {{ id: string, rota: string, icone: string, sigla: string, nome: string, chips: import('../../core/html.js').Html[], resumo: string, direita: import('../../core/html.js').Html|string, classe?: string, separado?: boolean }} o
 */
export function cartaoProjeto(o) {
  const boreal = o.id === 'boreal';
  return html`<div class="${`card link spot proj-card ${o.classe || 'c-6'} rise`}" data-proj="${o.id}" data-nav="${o.rota}" role="link" tabindex="0">
    <div class="proj-top"><span class="ico-tile lg">${ic(o.icone)}</span><div class="nm"><h2>${o.sigla} <span class="selo ok">Ativo</span></h2><p>${o.nome}</p></div><span class="proj-go">${ic('arrow-up-right')}</span></div>
    <div class="proj-kpi"><div class="l"><span class="eyebrow">${o.separado ? 'Papel · imagens finalizadas no mês' : 'Imagens finalizadas no mês'}</span><span class="num-xxl" data-k="kpi">—</span>
        ${o.separado ? html`<span class="eyebrow">Negativos · imagens finalizadas no mês</span><span class="num-md" data-k="kpi2">—</span>` : ''}
        <div class="proj-var" data-k="aviso">${boreal ? html`<span class="delta-note">Variação vs. mês anterior</span>${valorEmBreve('boreal.resumo')}` : ''}</div></div>
      <div class="proj-spark"><div data-k="spark"></div><span class="eyebrow">${o.separado ? 'Papel · imagens finalizadas · mês até hoje' : 'Imagens finalizadas · mês até hoje'}</span></div></div>
    <div class="card-f proj-f"><div class="chips">${o.chips}</div>
      <div class="meter-row"><span>${o.resumo}</span><span class="mono" data-k="direita">${o.direita}</span></div></div></div>`;
}

/** COBALTO: cartão desabilitado ("Projeto ainda não iniciado"). @param {{ sigla: string, nome: string }} o */
export function cartaoProjetoEmBreve(o) {
  return html`<div class="card spot soon-card disabled c-3 rise" aria-disabled="true"><div class="card-h"><span class="ico-tile">${ic('lock-simple')}</span><span class="selo nodot">Em breve</span></div>
    <div><h2 class="soon-nm">${o.sigla}</h2><p class="dim soon-tx">${o.nome}</p></div><div class="card-f"><span class="unit">Projeto ainda não iniciado</span></div></div>`;
}

/**
 * Tile "hoje": número do dia + unidade. Sem sparkline: o resumo de hoje não traz série diária (a do /gestao é de PASTAS, não de imagens).
 * @param {{ rota: string, icone: string, rotulo: string, unidade: string, indice?: number }} o
 */
export function tileHoje(o) {
  return html`<div class="card link spot c-3 rise" style="${`--i:${o.indice || 0}`}" data-nav="${o.rota}" role="link" tabindex="0">
    <div class="card-h"><span class="card-t">${ic(o.icone)}${o.rotulo}</span></div>
    <div><span class="num-lg" data-k="n">—</span><div class="unit tile-un">${o.unidade}</div></div>
  </div>`;
}

/**
 * Cartão de módulo do hub BOREAL: ícone + selo, nome + sub, KPI do mês, corpo (sparkline ou uptime) e rodapé.
 * @param {{ id: string, rota: string, icone: string, nome: string, sub: string, unidade: string, corpo?: 'spark'|'uptime'|'', legenda?: string, rodape?: import('../../core/html.js').Html|null, semVar?: boolean, classe?: string, indice?: number }} o
 */
export function cartaoModulo(o) {
  return html`<div class="${`card link spot ${o.classe || 'c-4'} rise`}" data-mod="${o.id}" style="${`--i:${o.indice || 0}`}" data-nav="${o.rota}" role="link" tabindex="0">
    <div class="card-h"><span class="ico-tile">${ic(o.icone)}</span><span class="selo ok" data-k="selo">Ativo</span></div>
    <div><h2 class="mod-nm">${o.nome}</h2><p class="dim mod-sub">${o.sub}</p></div>
    <div><span class="num-xl" data-k="kpi">—</span><div class="kpi-un"><span class="unit">${o.unidade}</span>${o.semVar ? '' : slotVariacao(true)}</div></div>
    ${o.corpo === 'spark' ? html`<div class="mod-spark"><div data-k="spark"></div>${o.legenda ? html`<span class="eyebrow">${o.legenda}</span>` : ''}</div>` : o.corpo === 'uptime' ? html`<div class="uptime-mini" data-k="uptime" aria-hidden="true"></div>` : ''}
    <div class="card-f">${o.rodape || slotMeta()}</div></div>`;
}

/**
 * Cartão de fluxo do hub ATLAS: selos (Ativo / Grafo a validar), "Na digitalização (agora)" × "Finalizados no mês", sparkline e rodapé.
 * @param {{ id: string, rota: string, icone: string, nome: string, sub: string, aValidar: boolean, classe?: string, indice?: number }} o
 */
export function cartaoFluxo(o) {
  return html`<div class="${`card link spot ${o.classe || 'c-4'} rise`}" data-mod="${o.id}" style="${`--i:${o.indice || 0}`}" data-nav="${o.rota}" role="link" tabindex="0">
    <div class="card-h"><span class="ico-tile">${ic(o.icone)}</span><div class="selos"><span class="selo ok">Ativo</span>${o.aValidar ? html`<span class="selo warn" data-tip="O grafo deste fluxo ainda está em validação">Grafo a validar</span>` : ''}</div></div>
    <div><h2 class="mod-nm">${o.nome}</h2><p class="dim mod-sub">${o.sub}</p></div>
    <div class="stat-pair"><div><span class="eyebrow">Na digitalização (agora)</span><span class="num-md" data-k="em">—</span></div><div><span class="eyebrow">Finalizados no mês</span><span class="num-md" data-k="fin">—</span></div></div>
    <div class="mod-spark"><div data-k="spark"></div><span class="eyebrow">Imagens finalizadas · mês até hoje</span></div>
    <div class="card-f fluxo-f">${slotMeta()}<div class="meta-lin"><span data-k="var"></span><span class="unit mono" data-k="andamento"></span></div></div></div>`;
}

// ---------------------------------------------------------------- pintura dos slots

/** @param {ParentNode} raiz @param {string} k */
const slots = (raiz, k) => /** @type {HTMLElement[]} */ (Array.from(raiz.querySelectorAll(`[data-k="${k}"]`)));

/** Número com contagem animada a partir do valor anterior; `null` → "—". @param {ParentNode} raiz @param {string} k @param {number|null} n */
export function pintarNumero(raiz, k, n) {
  for (const el of slots(raiz, k)) {
    if (n === null || n === undefined) { el.textContent = '—'; delete el.dataset.v; continue; }
    animarNumero(el, n, Number(el.dataset.v || 0));
    el.dataset.v = String(n);
  }
}

/** Sparkline de 7 dias; sem série, o slot fica vazio (nada inventado). @param {ParentNode} raiz @param {string} k @param {number[]|null} serie @param {number} [h] */
export function pintarSerie(raiz, k, serie, h = 40) {
  for (const el of slots(raiz, k)) el.innerHTML = serie && serie.length ? sparkSVG(serie, h).toString() : '';
}

/** Conteúdo de um slot: `Html` entra como markup; string vira TEXTO (nunca markup). @param {ParentNode} raiz @param {string} k @param {import('../../core/html.js').Html|string} conteudo */
export function pintarTexto(raiz, k, conteudo) {
  for (const el of slots(raiz, k)) {
    if (typeof conteudo === 'string') el.textContent = conteudo; else el.innerHTML = conteudo.toString();
  }
}

/**
 * Meta do mês no cartão: medidor "<valor> / <meta> · NN%" quando há meta; senão "Sem meta definida" (e, para admin, o atalho
 * para a tela de metas). `valor` nulo (sem dado) também cai em "Sem meta definida" — nunca desenha % de um dado que não veio.
 * @param {ParentNode} raiz @param {{ valor: number|null, meta: number|null, admin?: boolean }} o
 */
export function pintarMeta(raiz, o) {
  for (const el of slots(raiz, 'meta')) {
    el.innerHTML = o.meta && o.valor !== null
      ? medidor({ valor: o.valor, meta: o.meta }).toString()
      : html`<div class="meta-lin"><span class="unit">Sem meta definida</span>${o.admin ? html`<a class="meta-def" href="#/metas">Definir meta</a>` : ''}</div>`.toString();
    animarBarras(el);
  }
}

/** Variação (%) em pastas ou imagens; `null` → vazio. @param {ParentNode} raiz @param {number|null} v @param {string} [nota] */
export function pintarVariacao(raiz, v, nota) {
  for (const el of slots(raiz, 'var')) el.innerHTML = v === null ? '' : delta(v, nota || false).toString();
}

// ---------------------------------------------------------------- blocos do backend novo (esqueleto e "Em breve")

/** Troca um bloco pelo cartão "Em breve" equivalente (servidor respondeu 404). @param {HTMLElement|null} el @param {Parameters<typeof blocoEmBreve>[0]} o */
export function trocarPorEmBreve(el, o) {
  if (!el) return;
  const t = document.createElement('template');
  t.innerHTML = blocoEmBreve(o).toString();
  el.replaceWith(t.content);
}

/** @param {string} classes */
export const cartaoGargalos = (classes) => html`<section class="${`card spot ${classes} rise`}" data-bloco="gargalos" aria-labelledby="gar-t">
  <div class="card-h"><span class="card-t" id="gar-t">${ic('warning-diamond')}Gargalos agora</span><span class="selo warn nodot" data-k="gar-n">—</span></div>
  <div data-k="gar-lista" aria-live="polite"><p class="dim bloco-txt">Carregando…</p></div></section>`;

/** @param {string} classes */
export const cartaoAtividades = (classes) => html`<section class="${`card spot ${classes} rise`}" data-bloco="atividades" aria-labelledby="ativ-t">
  <div class="card-h"><span class="card-t" id="ativ-t">${ic('pulse')}Atividade recente</span></div>
  <div data-k="ativ-lista" aria-live="polite"><p class="dim bloco-txt">Carregando…</p></div></section>`;
