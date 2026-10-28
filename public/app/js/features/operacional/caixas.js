// @ts-check
import { $ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { API } from '../../config.js';
import { vazio, erroBloco } from '../../ui/empty.js';
import { duracaoCurta } from '../../core/relatorio-op.js';
import { ic } from '../../ui/icons.js';
import { chipsHtml } from '../../ui/caixa-chips.js';
import { FILTROS_ETAPA, filtrarCaixas, horaCurta, instanteCongelado, normalizarCaixas, ordenarAoVivo, resumoAoVivo, rotuloEtapa, tempoDecorrido, urlCaixas } from '../../core/caixas-op.js';

/** Caixas ao vivo (gestão): abertas e últimas concluídas, com dados recarregados por polling e tempo das abertas andando a cada segundo. */

export const INTERVALO_MS = 10000;
const LIMITE_CONCLUIDAS = 50;

/**
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, sinal: AbortSignal }} ctx
 */
export async function montar(view, ctx) {
  let vivo = true;
  let versao = 0;
  /** @type {import('../../core/caixas-op.js').CaixaOp[]|null} */
  let caixas = null;
  let falhou = false;
  let busca = '';
  let etapa = '';

  view.innerHTML = html`
    <div class="page-h rise"><div class="ttl"><h1>Caixas ao vivo</h1>
      <p class="sub">Caixas em andamento e as últimas concluídas. Atualiza sozinha.</p></div></div>
    <div class="cxop-aviso" data-aviso role="status" hidden>Sem conexão: mostrando a última lista carregada.</div>
    <div class="cxop-resumo" data-resumo></div>
    <div class="cxop-filtros" role="search">
      <input class="input" type="search" placeholder="Buscar por caixa ou colaborador" aria-label="Buscar por caixa ou colaborador" data-busca>
      <div class="op-seg" role="group" aria-label="Etapa">${FILTROS_ETAPA.map((f) => html`<button type="button" class="btn sm ghost" data-etapa="${f.id}" aria-pressed="${String(f.id === '')}">${f.rotulo}</button>`)}</div>
    </div>
    <div data-corpo class="cxop-corpo" aria-busy="true" aria-live="polite"></div>`.toString();
  const corpo = /** @type {HTMLElement} */ ($('[data-corpo]', view));
  const aviso = /** @type {HTMLElement} */ ($('[data-aviso]', view));

  /** @param {string} status @param {number} [limite] */
  async function buscar(status, limite) {
    const r = await ctx.api.get(`${API.painel}${urlCaixas({ status, limite })}`, { sinal: ctx.sinal, etag: false });
    const j = r.dados;
    if (!j || j.success === false) throw new Error((j && (j.message || j.error)) || 'O servidor não devolveu os dados.');
    return normalizarCaixas(j.data);
  }

  function cartao(/** @type {import('../../core/caixas-op.js').CaixaOp} */ c, /** @type {number} */ agora) {
    const pausada = c.pausaInicioMs !== null;
    return html`<li class="cxop-card${pausada ? ' pausada' : ''}${c.pausaAutomatica ? ' pendente' : ''}">
      <div class="cxop-topo"><span class="cxop-cod">${c.codigo}</span><span class="cxop-etapa">${rotuloEtapa(c.etapa)}</span></div>
      <div class="cxop-quem">${c.colaboradorNome}</div>
      <div class="cxop-topo"><span class="cxop-tempo" data-inicio="${String(c.inicioMs)}" data-pausado="${String(c.pausadoS)}" data-pausa="${instanteCongelado(c) === null ? '' : String(instanteCongelado(c))}">${duracaoCurta(tempoDecorrido(c, agora))}</span><span class="cxop-etapa">desde ${horaCurta(c.inicioMs)}</span></div>
      <div class="cxop-selos">${chipsHtml(c)}</div></li>`;
  }

  function linha(/** @type {import('../../core/caixas-op.js').CaixaOp} */ c, /** @type {number} */ agora) {
    return html`<li class="cxop-linha"><span class="cxop-cod">${c.codigo}</span><span class="cxop-quem">${c.colaboradorNome}</span><span class="cxop-etapa">${rotuloEtapa(c.etapa)}</span>
      <span class="cxop-selos">${chipsHtml(c)}</span><span class="cxop-hora">${duracaoCurta(tempoDecorrido(c, agora))}</span></li>`;
  }

  function pintarResumo() {
    const r = resumoAoVivo(caixas || []);
    const el = /** @type {HTMLElement} */ ($('[data-resumo]', view));
    el.innerHTML = html`
      <div class="cxop-num"><b>${String(r.abertas)}</b><span>${ic('play')}Em andamento</span></div>
      <div class="cxop-num"><b>${String(r.pausadas)}</b><span>${ic('pause')}Pausadas</span></div>
      <div class="cxop-num${r.pendentes ? ' err' : ''}"><b>${String(r.pendentes)}</b><span>${ic('warning')}Para corrigir</span></div>
      <div class="cxop-num"><b>${String(r.concluidas)}</b><span>${ic('check-circle')}Concluídas (recentes)</span></div>`.toString();
  }

  function pintar() {
    if (!vivo || !caixas) return;
    corpo.setAttribute('aria-busy', 'false');
    aviso.hidden = !falhou;
    pintarResumo();
    if (!caixas.length) {
      corpo.innerHTML = vazio({ titulo: 'Nenhuma caixa por enquanto', texto: 'Quando alguém iniciar uma caixa, ela aparece aqui.', tipo: 'ampulheta' }).toString();
      return;
    }
    const lista = ordenarAoVivo(filtrarCaixas(caixas, { busca, etapa }));
    if (!lista.length) {
      corpo.innerHTML = vazio({ titulo: 'Nada com esse filtro', texto: 'Limpe a busca ou escolha outra etapa.' }).toString();
      return;
    }
    const agora = Date.now();
    const abertas = lista.filter((c) => c.status === 'aberta');
    const outras = lista.filter((c) => c.status !== 'aberta');
    corpo.innerHTML = html`
      ${abertas.length ? html`<section class="cxop-bloco" aria-label="Em andamento"><h2>${ic('hourglass-medium')}Em andamento</h2><ul class="cxop-grade" id="tabela-caixas">${abertas.map((c) => cartao(c, agora))}</ul></section>` : ''}
      ${outras.length ? html`<section class="cxop-bloco" aria-label="Concluídas recentemente"><h2>${ic('check-circle')}Concluídas recentemente</h2><ul class="cxop-lista">${outras.map((c) => linha(c, agora))}</ul></section>` : ''}`.toString();
  }

  function tocarRelogio() {
    if (!vivo) return;
    const agora = Date.now();
    for (const el of corpo.querySelectorAll('[data-inicio]')) {
      const inicio = Number(el.getAttribute('data-inicio'));
      const pausado = Number(el.getAttribute('data-pausado')) || 0;
      const pausa = el.getAttribute('data-pausa');
      const ate = pausa ? Number(pausa) : agora;
      el.textContent = duracaoCurta(Math.max(0, Math.floor((ate - inicio) / 1000) - pausado));
    }
  }

  async function carregar() {
    const meu = ++versao;
    try {
      const [abertas, concluidas] = await Promise.all([buscar('aberta'), buscar('concluida', LIMITE_CONCLUIDAS)]);
      if (!vivo || meu !== versao || ctx.sinal.aborted) return;
      caixas = [...abertas, ...concluidas];
      falhou = false;
      pintar();
    } catch (e) {
      if (!vivo || meu !== versao || ctx.sinal.aborted) return;
      falhou = true;
      if (caixas) { pintar(); return; }
      corpo.setAttribute('aria-busy', 'false');
      corpo.innerHTML = erroBloco({ texto: e instanceof Error ? e.message : undefined }).toString();
    }
  }

  corpo.addEventListener('click', (ev) => {
    if (ev.target instanceof Element && ev.target.closest('[data-acao="tentar"]')) carregar();
  }, { signal: ctx.sinal });
  $('[data-busca]', view)?.addEventListener('input', (ev) => { busca = /** @type {HTMLInputElement} */ (ev.target).value; pintar(); }, { signal: ctx.sinal });
  view.addEventListener('click', (ev) => {
    const b = ev.target instanceof Element ? /** @type {HTMLElement|null} */ (ev.target.closest('[data-etapa]')) : null;
    if (!b) return;
    etapa = b.dataset.etapa || '';
    view.querySelectorAll('[data-etapa]').forEach((x) => x.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (x).dataset.etapa === etapa)));
    pintar();
  }, { signal: ctx.sinal });

  await carregar();
  const relogio = setInterval(tocarRelogio, 1000);
  const sondagem = setInterval(carregar, INTERVALO_MS);
  const destruir = () => { vivo = false; clearInterval(relogio); clearInterval(sondagem); };
  ctx.sinal.addEventListener('abort', destruir, { once: true });

  return { destruir };
}
