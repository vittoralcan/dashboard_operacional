// @ts-check
import { $, delegar } from '../../core/dom.js';
import { html, raw } from '../../core/html.js';
import { ESTADO } from '../../core/store.js';
import { miniIndicadores, indicadorSincronizacao } from '../../core/fluxo-prod.js';
import { definirContadores, contadorEmAndamento } from '../../core/contadores.js';
import { validarConfigFluxo } from '../../core/fluxo-config.js';
import { marcarAtualizado } from '../../core/vivo.js';
import { animarNumero } from '../../core/motion.js';
import { ic } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { erroBloco } from '../../ui/empty.js';
import { criarDadosFluxo } from './dados.js';
import { carregarConfigFluxo } from './config-fluxo.js';
import { resolverConfigFluxo } from './config-servidor.js';
import { analiseHtml, pintarAnalise, pintarMetaMensal } from './analise.js';
import { ehAdmin } from '../../core/acesso.js';
import { ativo, ausenteSe404 } from '../../config/recursos.js';
import { metaDoEscopo } from '../../core/metas.js';
import { criarServicosPainel } from '../painel/servicos.js';

/** Atualização automática dos números (a tela atual faz o mesmo a cada 30 s). */
const INTERVALO_MS = 30000;

/**
 * Módulo de fluxo Captura — UMA tela para as 5 instâncias (RNB-003): Digitalização BOREAL e Negativos, Certidões
 * Financeiras, Inventários e Cartografia do ATLAS (`#/<projeto>/<instância>[/fluxograma]`). Cada instância é só uma configuração
 * (`config/fluxos/<instância>.json`, mesmo schema de `GET …/config`). Abas: Análise de Produção | Fluxograma.
 *
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, sinal: AbortSignal, aoSair: (f: () => void) => void, usuario: any,
 *           params: Record<string,string>, rota: { instancia?: string }, catalogo: import('../../core/catalogo.js').Catalogo,
 *           irPara: (c: string, o?: { substituir?: boolean }) => void, atalhos: ReturnType<typeof import('../../core/keys.js').criarAtalhos> }} ctx
 */
export async function montar(view, ctx) {
  const instancia = ctx.rota.instancia || '';
  const local = await carregarConfigFluxo(instancia, ctx.sinal);
  if (ctx.sinal.aborted) return null;
  const valida = local ? validarConfigFluxo(local) : { ok: false, erros: [`Não foi possível ler config/fluxos/${instancia}.json.`] };
  if (!local || !valida.ok) {
    view.innerHTML = html`<div class="empty" role="alert"><h3>Configuração do fluxo inválida</h3><p>${valida.erros.join(' ')}</p></div>`.toString();
    return null;
  }
  // o backend é a fonte do grafo (ATLAS); a local é só a reserva
  const { cfg } = await resolverConfigFluxo(ctx.api, local, ctx.sinal);
  if (ctx.sinal.aborted) return null;
  if (ctx.params.vista && ctx.params.vista !== 'fluxograma') { ctx.irPara(cfg.rota, { substituir: true }); return null; }
  const vista = ctx.params.vista === 'fluxograma' ? 'fluxograma' : 'analise';
  const dados = criarDadosFluxo(ctx.api, cfg);
  const serv = criarServicosPainel(ctx.api);
  const admin = ehAdmin(ctx.usuario);
  const hoje = new Date();

  const item = ctx.catalogo.projetos.flatMap((p) => [...p.modulos, ...p.fluxos]).find((i) => i.rota === cfg.rota);
  const hub = '#/atlas';
  const aba = (/** @type {string} */ href, /** @type {string} */ rotulo, /** @type {boolean} */ atual) => html`<a href="${href}" ${atual ? raw('aria-current="page"') : ''}>${rotulo}</a>`;
  view.innerHTML = html`
    <div class="mod-h rise"><a class="icon-btn bordered" href="${hub}" aria-label="${`Voltar para ${cfg.projeto}`}">${ic('arrow-left')}</a>
      <span class="ico-tile lg">${ic((item && item.icone) || 'stack')}</span>
      <div class="ttl"><span class="eyebrow">${cfg.sub}</span><h1>${cfg.nome}
        ${cfg.aValidar ? html`<span class="selo warn" data-tip="O grafo deste fluxo ainda não foi conferido com o Captura: as setas podem mudar.">Grafo a validar</span>` : html`<span class="selo ok">Ativo</span>`}</h1></div>
      <div class="right"><span class="sync" data-sync hidden></span>
        <div class="mod-stats"><div><span class="k">Na digitalização (agora)</span><span class="v" data-mini="emAndamento">—</span></div><div><span class="k">Finalizados (total)</span><span class="v" data-mini="finalizados">—</span></div></div>
        <nav class="seg" aria-label="Visualização">${aba(`#${cfg.rota}`, 'Análise de Produção', vista === 'analise')}${aba(`#${cfg.rota}/fluxograma`, 'Fluxograma', vista === 'fluxograma')}</nav></div></div>
    <div data-conteudo></div>`.toString();
  const conteudo = /** @type {HTMLElement} */ ($('[data-conteudo]', view));

  /** @type {import('../../core/fluxo-prod.js').StatusFases|null} */
  let status = null;
  /** @type {{ colunas: ReturnType<typeof import('../../core/fluxo-prod.js').normalizarGestao>, resumo: ReturnType<typeof import('../../core/fluxo-prod.js').normalizarResumoMes> }|null} */
  let gestao = null;
  /** Meta do BOREAL (o back_boreal não manda `resumo`): vem de `GET /metas`. @type {number|null} */
  let metaBoreal = null;
  /** Fase-gargalo da instância (ATLAS) ou `null`. @type {number|null} */
  let gargaloFas = null;
  /** Fase de alto volume (RF-54) ou `null`; backend antigo não manda o campo. @type {number|null} */
  let altoVolumeFas = null;
  /** @type {{ destruir: () => void }[]} */
  let graficos = [];
  /** @type {ReturnType<typeof import('./grafo-prod.js').montarFluxoProd>|null} */
  let fluxo = null;
  let avisou = false;
  /** @type {any[]} */
  const timers = [];

  // ---------------------------------------------------------------- pintar
  function pintar() {
    if (status) {
      const m = miniIndicadores(cfg, status);
      definirContadores({ [cfg.instancia]: contadorEmAndamento(m.emAndamento) }); // NAV-10
      for (const k of /** @type {const} */ (['emAndamento', 'finalizados'])) {
        const el = $(`[data-mini="${k}"]`, view);
        if (el) { animarNumero(el, m[k], Number(el.dataset.v || 0)); el.dataset.v = String(m[k]); }
      }
      fluxo?.atualizar(status);
    }
    if (gestao && vista === 'analise') {
      graficos.forEach((g) => g.destruir()); graficos = pintarAnalise(conteudo, gestao.colunas);
      const fin = gestao.colunas.find((c) => c.fasId === cfg.faseFinal && !c.ausente);
      pintarMetaMensal(conteudo, { resumo: gestao.resumo, pastasMes: fin ? fin.pastas : null, metaBoreal, boreal: cfg.fonte === 'boreal', admin });
    }
    fluxo?.marcarGargalo(gargaloFas);
    fluxo?.marcarAltoVolume(altoVolumeFas);
  }

  async function desenharAba() {
    graficos.forEach((g) => g.destruir()); graficos = [];
    fluxo?.flow.destruir(); fluxo = null;
    if (vista === 'analise') { conteudo.innerHTML = analiseHtml(cfg).toString(); return; }
    const grafo = await import('./grafo-prod.js'); // o fluxograma (grafo, layout, SVG) só carrega na aba que o usa
    if (ctx.sinal.aborted) return;
    conteudo.innerHTML = grafo.fluxoProdHtml(cfg).toString();
    fluxo = grafo.montarFluxoProd(conteudo, { cfg, atalhos: ctx.atalhos, aoFase: async (f) => (await import('./fase-modal.js')).abrirModalFase(cfg, f, dados) });
    if (status) fluxo.atualizar(status); // os dados podem ter chegado antes do módulo
    fluxo.marcarGargalo(gargaloFas);
    fluxo.marcarAltoVolume(altoVolumeFas);
    const foco = ESTADO.focoNo; // FLX-14: vindo da paleta/notificação, abre centralizado na fase com realce por 3 s
    if (foco && foco.instancia === cfg.instancia) { ESTADO.focoNo = null; timers.push(setTimeout(() => fluxo?.flow.focar(foco.fasId), 520)); }
  }

  // ---------------------------------------------------------------- dados
  async function sincronizar() {
    const s = await dados.sincronizacao(ctx.sinal);
    const el = $('[data-sync]', view);
    if (!el || ctx.sinal.aborted) return;
    if (!s) { el.hidden = true; return; }
    const ind = indicadorSincronizacao(s);
    el.hidden = false;
    el.textContent = ind.texto;
    el.classList.toggle('atrasado', ind.atrasado);
    if (ind.atrasado) el.setAttribute('data-tip', 'A sincronização está atrasada — o painel mostra o último retrato disponível.'); else el.removeAttribute('data-tip');
  }

  /** Meta do BOREAL e gargalo do ATLAS: blocos à parte — se falham (ou o servidor responde 404), só o próprio realce some. */
  async function carregarExtras() {
    if (cfg.fonte === 'boreal' && vista === 'analise' && ativo('metas')) {
      try { metaBoreal = (metaDoEscopo(await serv.metas({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 }, ctx.sinal), 'boreal', 'digitalizacao') || { valor: null }).valor; if (!ctx.sinal.aborted) pintar(); } catch (e) { ausenteSe404('metas', e); }
    }
    if (cfg.fonte === 'atlas' && vista === 'fluxograma' && ativo('gargalos')) {
      try { const g = await dados.gargalo(ctx.sinal); gargaloFas = g && g.gargalo ? g.gargalo.fasId : null; altoVolumeFas = g && g.altoVolume ? g.altoVolume.fasId : null; if (!ctx.sinal.aborted) { fluxo?.marcarGargalo(gargaloFas); fluxo?.marcarAltoVolume(altoVolumeFas); } } catch (e) { ausenteSe404('gargalos', e); }
    }
  }

  async function carregar() {
    const tarefas = [dados.statusFases(ctx.sinal), vista === 'analise' ? dados.gestao(ctx.sinal) : Promise.resolve(gestao)];
    sincronizar();
    carregarExtras();
    const [s, g] = await Promise.allSettled(tarefas);
    if (ctx.sinal.aborted) return;
    if (s.status === 'fulfilled') status = s.value;
    if (g.status === 'fulfilled') gestao = /** @type {any} */ (g.value);
    const falha = [s, g].find((r) => r.status === 'rejected');
    if (!falha) { avisou = false; pintar(); marcarAtualizado(); return; }
    console.error(/** @type {PromiseRejectedResult} */ (falha).reason);
    const msg = /** @type {any} */ (/** @type {PromiseRejectedResult} */ (falha).reason).message || 'Erro ao consultar o servidor.';
    if (!status || (vista === 'analise' && !gestao)) conteudo.innerHTML = erroBloco({ titulo: 'Não foi possível carregar os dados do fluxo', texto: msg }).toString();
    else { pintar(); if (!avisou) { avisou = true; toast('erro', 'Não foi possível atualizar', msg); } } // falha na atualização automática: avisa uma vez, mantém o último retrato
  }

  const parar = delegar(view, 'click', '[data-acao]', (b) => {
    if (b.dataset.acao === 'relatorio') {
      const c = cfg.gestaoColunas.find((x) => String(x.fasId) === b.dataset.fas);
      if (c) import('./relatorio-fase.js').then((m) => m.abrirRelatorioFase(cfg, c, dados)); // modais pesados só ao clicar
    } else if (b.dataset.acao === 'tentar') { desenharAba().then(carregar); }
  });
  const aoAtualizar = (/** @type {Event} */ e) => { /** @type {any} */ (e).detail.tratar(); carregar(); };
  document.addEventListener('noir:atualizar', aoAtualizar);
  const loop = setInterval(() => { if (!document.hidden) carregar(); }, INTERVALO_MS);

  const desenhada = desenharAba();
  await carregar();
  await desenhada;
  return {
    destruir() {
      parar(); clearInterval(loop); timers.forEach(clearTimeout);
      document.removeEventListener('noir:atualizar', aoAtualizar);
      graficos.forEach((g) => g.destruir()); fluxo?.flow.destruir();
    },
  };
}
