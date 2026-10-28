// @ts-check
import { $ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { marcarAtualizado } from '../../core/vivo.js';
import { fmt } from '../../core/format.js';
import { ehAdmin } from '../../core/acesso.js';
import { projetoPorId } from '../../core/catalogo.js';
import { ic } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { criarDadosPainel } from '../painel/dados.js';
import { cartaoFluxo, pintarNumero, pintarSerie, pintarMeta, pintarVariacao, pintarTexto } from './cartoes.js';
import { ligarAtualizacao, ligarCartoes } from './ao-vivo.js';

/** Os dois grupos do hub (a divisão de `prj-atlas-fluxos.html`): ícone e frase de cada um. */
const GRUPOS = /** @type {Record<string, { icone: string, sub: string }>} */ ({
  'Negativos': { icone: 'film-reel', sub: 'Digitalização a partir de rolos de negativo' },
  Papel: { icone: 'files', sub: 'Digitalização a partir de documentos em papel' },
});

/**
 * Hub ATLAS (HUB-03) — `#/atlas`: unifica as três páginas antigas. Quatro cartões de fluxo (Negativos; Papel: Certidões,
 * Inventários e Cartografia) com "Em digitalização" × "Finalizados" e a sparkline de 7 dias. Cada cartão carrega e falha sozinho.
 *
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, sinal: AbortSignal, catalogo: import('../../core/catalogo.js').Catalogo, usuario: any,
 *           irPara: (c: string) => void }} ctx
 */
export function montar(view, ctx) {
  const dados = criarDadosPainel(ctx.api);
  const admin = ehAdmin(ctx.usuario);
  const atlas = projetoPorId(ctx.catalogo, 'atlas');
  const fluxos = atlas ? atlas.fluxos : [];
  const grupos = [...new Set(fluxos.map((f) => f.grupo || 'Papel'))];
  let ordem = 0;

  const secao = (/** @type {string} */ g) => {
    const lista = fluxos.filter((f) => (f.grupo || 'Papel') === g);
    const meta = GRUPOS[g] || GRUPOS.Papel;
    return html`<div class="sec-h"><div><h2>${ic(meta.icone)}${g} <span class="selo nodot">${`${lista.length} ${lista.length === 1 ? 'fluxo' : 'fluxos'}`}</span></h2><p>${meta.sub}</p></div></div>
      <div class="bento spot-group">${lista.map((f) => cartaoFluxo({ id: f.id, rota: f.rota, icone: f.icone, nome: f.nome, sub: f.sub || '', aValidar: !!f.aValidar, indice: ++ordem }))}
        ${g === grupos[0] ? explicacao() : ''}</div>`;
  };

  view.innerHTML = html`
    <div class="page-h rise"><div class="ttl"><span class="eyebrow">${ic('flow-arrow')}Fluxo de Produção</span><h1>ATLAS</h1>
        <p class="sub">Arquivo Estadual de Atlântida — selecione o fluxo de digitalização que deseja visualizar.</p></div>
      <div class="acts"><a class="btn" href="#/macro-view" aria-keyshortcuts="G M">${ic('play')}Macro View</a></div></div>
    ${grupos.map(secao)}`.toString();

  const card = (/** @type {string} */ id) => /** @type {HTMLElement|null} */ ($(`[data-mod="${id}"]`, view));
  let avisou = false;

  /** @param {HTMLElement} c @param {import('../../core/painel.js').ResumoInstancia|null} r */
  function pintarFluxo(c, r) {
    pintarNumero(c, 'em', r ? r.emAndamento : null); pintarNumero(c, 'fin', r ? r.finalizados : null); pintarSerie(c, 'spark', r ? r.serie : null);
    pintarMeta(c, { valor: r && r.mes ? r.mes.pastas : null, meta: r ? r.meta : null, admin });
    pintarVariacao(c, r ? r.variacaoPct : null, 'vs. mês anterior');
    pintarTexto(c, 'andamento', r && r.emAndamento !== null ? `${fmt(r.emAndamento)} na digitalização agora` : '');
  }

  async function carregar() {
    const s = ctx.sinal;
    let r;
    try { r = await dados.atlas(s); } catch (e) {
      if (s.aborted) return;
      console.error(e);
      for (const f of fluxos) { const c = card(f.id); if (c) pintarFluxo(c, null); }
      if (!avisou) { avisou = true; toast('erro', 'Não foi possível atualizar', 'Verifique a conexão. Tentaremos de novo em instantes.'); }
      return;
    }
    if (s.aborted) return;
    for (const f of fluxos) { const c = card(f.id); if (c) pintarFluxo(c, r[f.id] || null); }
    avisou = false;
    if (fluxos.some((f) => r[f.id])) marcarAtualizado();
  }

  const soltar = ligarCartoes(view, (rota) => ctx.irPara(rota));
  const vivo = ligarAtualizacao(carregar);
  carregar();
  return { destruir() { vivo.destruir(); soltar(); } };
}

/** Cartão "Como funciona o fluxo ATLAS" ao lado do primeiro fluxo (Negativos). */
function explicacao() {
  return html`<section class="card spot c-8 rise" aria-labelledby="atlas-como"><div class="card-h"><span class="card-t" id="atlas-como">${ic('flow-arrow')}Como funciona o fluxo ATLAS</span></div>
    <p class="como-tx">Cada fluxo percorre as fases do Captura — digitalização, controle de qualidade, indexação, validação, exportação — até <b>FINALIZADO</b>. Pastas com problema entram em fases de <span class="err-t">suspensão</span>; pastas que aguardam liberação ficam em <span class="warn-t">espera</span>.</p>
    <div class="chips"><span class="chip">${ic('chart-line-up')}Análise de Produção</span><span class="chip">${ic('flow-arrow')}Fluxograma com gargalos</span><span class="chip">${ic('file-arrow-down')}Relatórios por período</span></div>
    <div class="card-f"><span class="unit">Inventários e Cartografia exibem o selo <span class="selo warn como-selo">Grafo a validar</span></span>
      <a class="btn sm" href="#/atlas/negativos/fluxograma">${ic('flow-arrow')}Abrir fluxograma de exemplo</a></div></section>`;
}
