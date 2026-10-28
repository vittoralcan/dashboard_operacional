// @ts-check
import { $ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { fmt, fmtDec } from '../../core/format.js';
import { progressoDaMeta } from '../../core/metas.js';
import { MESES } from '../../core/calendario.js';
import { rotulosUltimos7Dias } from '../../core/fluxo-prod.js';
import { animarNumero, animarBarras } from '../../core/motion.js';
import { ic } from '../../ui/icons.js';
import { valorEmBreve } from '../../ui/embreve.js';
import { delta, medidor } from '../../ui/controles.js';
import { graficoLinha, anelSVG } from '../../ui/charts.js';

/**
 * Aba "Análise de Produção" (FLX-03): uma coluna por fase de referência — Pastas e Imagens do mês (primeira passagem; na entrada,
 * "imagens digitalizadas"), estados (só BOREAL), "Imagens por dia" e **Gerar Relatório**. Meta mensal (FLX-02): `resumo` do /gestao (ATLAS)
 * ou `GET /metas` (BOREAL, projeção e variação "Em breve").
 *
 * @param {import('../../core/fluxo-prod.js').ConfigFluxo} cfg @param {Date} [agora]
 */
export function analiseHtml(cfg, agora = new Date()) {
  const mes = MESES[agora.getMonth()];
  const n = cfg.gestaoColunas.length;
  const entrada = cfg.fases.find((f) => f.tipo === 'entrada')?.fasId;
  return html`<div class="sec-h"><div><h2>Histórico de lotes e metas de exportação</h2><p>Produção acumulada do mês corrente por fase do Captura.</p></div>
      <span class="chip-mono">${ic('calendar-blank')}${`${mes.toUpperCase()} DE ${agora.getFullYear()}`}</span></div>
    <div class="bento spot-group">
      <section class="card c-12 spot rise meta-mensal" data-bloco="meta-mensal" aria-labelledby="mm-t" hidden></section>
      ${cfg.gestaoColunas.map((c, i) => html`<section class="card c-4 spot rise" style="${`--i:${i + 2}`}" data-col="${c.fasId}" aria-labelledby="${`col-${c.fasId}`}">
        <div class="card-h"><span class="card-t" id="${`col-${c.fasId}`}">${ic('stack')}${`${c.titulo} — ${mes.toUpperCase()}`}</span><span class="chip-mono">${`${i + 1}/${n}`}</span></div>
        <div class="stat-pair"><div><span class="eyebrow">Pastas</span><span class="num-lg" data-k="pastas">—</span></div><div><span class="eyebrow">${c.fasId === entrada ? 'Imagens digitalizadas' : 'Imagens'}</span><span class="num-lg" data-k="imagens">—</span></div></div>
        <div data-estados></div>
        <div><span class="eyebrow">Imagens por dia (mês até hoje)</span><div data-grafico style="margin-top:8px;min-height:130px"></div></div>
        <div class="card-f"><button type="button" class="btn" data-acao="relatorio" data-fas="${c.fasId}">${ic('file-text')}Gerar Relatório</button></div>
      </section>`)}
    </div>`;
}

/**
 * Preenche as colunas com os dados do mês. Devolve o que precisa ser destruído (gráficos).
 * @param {HTMLElement} raiz @param {ReturnType<typeof import('../../core/fluxo-prod.js').normalizarGestao>} gestao
 */
export function pintarAnalise(raiz, gestao) {
  /** @type {{ destruir: () => void }[]} */
  const graficos = [];
  const rotulos = rotulosUltimos7Dias();
  for (const g of gestao) {
    const col = $(`[data-col="${g.fasId}"]`, raiz);
    if (!col) continue;
    for (const k of /** @type {const} */ (['pastas', 'imagens'])) {
      const el = $(`[data-k="${k}"]`, col);
      if (el) { animarNumero(el, g[k], Number(el.dataset.v || 0)); el.dataset.v = String(g[k]); }
    }
    const est = $('[data-estados]', col);
    if (est) {
      est.innerHTML = g.estados ? html`<div class="est-bloco"><span class="eyebrow">${`Estados atualmente em ${g.titulo}`}</span>
        ${g.estados.lista.length ? html`<div class="est-lista" tabindex="0" role="group" aria-label="${`Estados atualmente em ${g.titulo}`}">${g.estados.lista.map((e) => html`<div class="est-i"><span class="mono">${e.nome}</span><span class="tr"><i style="${`width:${(e.total / Math.max(1, ...g.estados.lista.map((x) => x.total))) * 100}%`}"></i></span><span class="r">${fmt(e.total)}</span></div>`)}</div>`
          : html`<p class="dim" style="font-size:12.5px">Nenhuma pasta.</p>`}
        <div class="est-total"><span class="eyebrow">Total</span><b class="mono">${fmt(g.estados.total)}</b></div></div>`.toString() : '';
    }
    const alvo = $('[data-grafico]', col);
    if (alvo) {
      alvo.replaceChildren();
      graficos.push(graficoLinha(alvo, { valores: g.serie, rotulos: g.dias && g.dias.length === g.serie.length ? g.dias : g.serie.length === 7 ? rotulos : g.serie.map((_, i) => String(i + 1)), altura: 130, nome: `Volume de trabalho — ${g.titulo}`, unidade: 'imagens', animar: false }));
    }
  }
  import('./tipologia.js').then((m) => m.default(raiz, gestao));
  return graficos;
}

/**
 * Cartão "Meta mensal de pastas finalizadas": anel + medidor "948 / 1.200 · 79%" + variação, "Projeção do mês" e "Faltam para a meta".
 * Sem `resumo` do servidor (versão antiga ou falha só dele) e sem dado do BOREAL, o cartão **não aparece** (RNB-007). Com resumo mas sem
 * meta, mostra projeção e variação e convida o admin a definir a meta.
 * @param {HTMLElement} raiz
 * @param {{ resumo: ReturnType<typeof import('../../core/fluxo-prod.js').normalizarResumoMes>, pastasMes: number|null, metaBoreal: number|null, boreal: boolean, admin: boolean }} o
 */
export function pintarMetaMensal(raiz, o) {
  const el = $('[data-bloco="meta-mensal"]', raiz);
  if (!el) return;
  const r = o.resumo;
  const temDado = o.boreal ? o.pastasMes !== null : !!r;
  if (!temDado) { el.hidden = true; return; }
  const pastas = o.boreal ? /** @type {number} */ (o.pastasMes) : /** @type {NonNullable<typeof r>} */ (r).finalizadasMes.pastas;
  const meta = o.boreal ? o.metaBoreal : /** @type {NonNullable<typeof r>} */ (r).metaPastas;
  const p = progressoDaMeta(pastas, meta);
  const proj = !o.boreal && r ? r.projecaoMes : null;
  const variacao = !o.boreal && r ? r.variacaoPct : null;
  el.hidden = false;
  el.innerHTML = html`<div class="mm-anel">${p ? html`${anelSVG(Math.min(1, p.pct / 100), 76, 6)}<span class="mono">${`${fmtDec(p.pct, 0)}%`}</span>` : html`<span class="ico-tile lg">${ic('target')}</span>`}</div>
    <div class="mm-corpo"><span class="card-t" id="mm-t">${ic('target')}Meta mensal de pastas finalizadas</span>
      ${p ? medidor({ valor: pastas, meta: /** @type {number} */ (meta), rotulo: 'Pastas finalizadas no mês' })
        : html`<div class="meta-lin"><span class="unit">${`Sem meta definida este mês · ${fmt(pastas)} pastas finalizadas`}</span>${o.admin ? html`<a class="meta-def" href="#/metas">Definir meta</a>` : ''}</div>`}
      <div class="mm-var">${o.boreal ? html`<span class="delta-note">Variação vs. mês anterior</span>${valorEmBreve('boreal.resumo')}` : variacao !== null ? delta(variacao, 'em pastas vs. mês anterior') : ''}</div></div>
    <div class="mm-stat"><span class="eyebrow">Projeção do mês</span>${proj !== null ? html`<span class="num-md">${fmt(proj)}</span><span class="unit">pastas no ritmo atual</span>` : o.boreal ? valorEmBreve('boreal.resumo') : html`<span class="num-md">—</span>`}</div>
    <div class="mm-stat"><span class="eyebrow">Faltam para a meta</span>${p ? html`<span class="num-md">${fmt(p.faltam)}</span><span class="unit">pastas</span>` : html`<span class="num-md">—</span>`}</div>`.toString();
  animarBarras(el);
}
