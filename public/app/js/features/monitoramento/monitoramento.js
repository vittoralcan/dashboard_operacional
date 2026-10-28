// @ts-check
import { $, delegar } from '../../core/dom.js';
import { html, raw } from '../../core/html.js';
import { definirContadores, contadorApis } from '../../core/contadores.js';
import { horaCurta, resumir, contarPorSistema, filtrarPorSistema, INTERVALOS_TESTE, ROTULO_INTERVALO } from '../../core/monitor.js';
import { marcarAtualizado } from '../../core/vivo.js';
import { reduzido } from '../../core/motion.js';
import { ic } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { erroBloco, vazio } from '../../ui/empty.js';
import { ativo, ausenteSe404 } from '../../config/recursos.js';
import { ehAdmin } from '../../core/acesso.js';
import { fmt, fmtDec } from '../../core/format.js';
import { criarAdaptadorGas } from './adaptador-gas.js';
import { criarAdaptadorNativo } from './adaptador-nativo.js';

/**
 * Monitoramento de APIs (MON-01…04). Fonte preferida: o **monitor nativo** do `back_dashboard` (histórico de uptime, latência, disponibilidade);
 * enquanto ele não tiver APIs cadastradas (ou estiver fora), a **reserva** é o Apps Script, sem histórico. Resumo, lista com filtro por
 * sistema, detalhes expansíveis (log + endpoint com copiar + barras de uptime), **Fazer Teste** sequencial (sair da tela interrompe) e
 * intervalo da automação (no monitor nativo, só admin). Todo texto vindo do servidor/GAS é escapado.
 *
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, sinal: AbortSignal, usuario: any }} ctx
 */
export async function montar(view, ctx) {
  const gas = criarAdaptadorGas(ctx.api);
  const nativo = criarAdaptadorNativo(ctx.api);
  const admin = ehAdmin(ctx.usuario);
  /** De onde vêm os dados agora. @type {'nativo'|'gas'} */
  let fonte = 'gas';
  /** Latência média, disponibilidade e próxima verificação (só monitor nativo). @type {{ latenciaMediaMs: number|null, disponibilidadePct: number|null, proxima: string|null }|null} */
  let extra = null;
  /** @type {import('../../core/monitor.js').Api[]} */
  let apis = [];
  let sistema = 'todos';
  let intervalo = /** @type {number|null} */ (null);
  let testando = false;
  let vivo = true;
  /** @type {Map<number, 'testando'|'erro'>} */
  const estados = new Map();
  /** @type {Set<number>} */
  const abertas = new Set();
  /** @type {any} */ let agenda = null;
  /** @type {(() => void)[]} */ const desligar = [];

  view.innerHTML = html`
    <div class="mod-h rise"><a class="icon-btn bordered" href="#/projetos" aria-label="Voltar para Projetos">${ic('arrow-left')}</a>
      <span class="ico-tile lg">${ic('pulse')}</span>
      <div class="ttl"><span class="eyebrow">BOREAL · Inscrição Online</span><h1>Monitoramento de APIs</h1></div>
      <div class="right"><span class="unit" id="ultima-cab">Última verificação: <b class="mono" id="ultima-txt">—</b></span>
        <button class="btn primary" id="teste" data-acao="teste">${ic('lightning')}<span class="spin" aria-hidden="true"></span><span class="rot">Fazer Teste</span></button></div></div>
    <div id="conteudo"></div>`.toString();
  const conteudo = /** @type {HTMLElement} */ ($('#conteudo', view));

  const sistemaSelo = (/** @type {string} */ s) => html`<span class="selo nodot sis">${s}</span>`;
  const seloEstado = (/** @type {import('../../core/monitor.js').Api} */ a) => {
    const e = estados.get(a.indice);
    if (e === 'testando') return html`<span class="selo info testing"><span class="spin" aria-hidden="true"></span>Testando…</span>`;
    if (e === 'erro') return html`<span class="selo err">${fonte === 'nativo' ? 'Erro no teste' : 'Erro de Script'}</span>`;
    if (a.estado === null) return html`<span class="selo nodot">Sem verificação</span>`;
    if (a.estado === 'lenta') return html`<span class="selo warn">Lenta</span>`;
    return a.online ? html`<span class="selo ok">Online</span>` : html`<span class="selo err pulse">Fora do Ar</span>`;
  };

  const NOME_ESTADO = /** @type {Record<string, string>} */ ({ o: 'online', l: 'lenta', f: 'falha' });
  /** Barras de uptime (até 30 verificações, da mais antiga à mais recente) + latência da última. @param {import('../../core/monitor.js').Api} a */
  const uptime = (a) => {
    const h = /** @type {import('../../core/monitor.js').Verificacao[]} */ (a.historico);
    return html`<div class="uptime-w"><div class="uptime" role="img" aria-label="${`Últimas ${h.length} verificações de ${a.nome}: ${h.filter((v) => v.s !== 'f').length} sem falha`}">${h.map((v) => html`<i class="${v.s === 'o' ? '' : v.s}" data-tip="${`${NOME_ESTADO[v.s]}${v.ms !== null ? ` · ${v.ms} ms` : ''} · ${horaCurta(new Date(v.em).toISOString())}`}"></i>`)}</div>
      <div class="uptime-cap"><span>${`${h.length} verificações`}</span><span>${a.latenciaMs !== null && a.latenciaMs !== undefined ? `última: ${fmt(a.latenciaMs)} ms` : 'agora'}</span></div></div>`;
  };

  /** @param {import('../../core/monitor.js').Api} a */
  function linha(a) {
    const aberta = abertas.has(a.indice);
    return html`<div class="${`api-row${estados.get(a.indice) === 'testando' ? ' testing' : ''}${aberta ? ' aberta' : ''}`}" id="${`api-${a.indice}`}" data-i="${a.indice}">
      ${sistemaSelo(a.sistema)}
      <div class="nm"><b>${a.nome}</b><span>${a.host || 'sem endereço'} · verificado ${horaCurta(a.hora)}</span></div>
      <span class="estado">${seloEstado(a)}</span>
      <button class="icon-btn sm" data-acao="expandir" aria-expanded="${aberta}" aria-controls="${`api-x-${a.indice}`}" aria-label="${`Detalhes de ${a.nome}`}">${ic(aberta ? 'caret-up' : 'caret-down')}</button>
      <div class="api-x" id="${`api-x-${a.indice}`}" role="group" aria-label="${`Detalhes de ${a.nome}`}">
        ${!a.online && a.log ? html`<div class="api-log">${ic('warning')}<span>${a.log}</span></div>` : ''}
        ${a.historico && a.historico.length ? uptime(a) : ''}
        <div class="api-url"><span class="m">GET</span><span class="grow" title="${a.link}">${a.link || 'sem endereço'}</span><button class="btn sm" data-acao="copiar" ${a.link ? '' : raw('disabled')}>${ic('copy')}Copiar</button></div>
      </div></div>`;
  }

  function desenharResumo() {
    const r = resumir(apis);
    definirContadores({ monitoramento: contadorApis(r) }); // NAV-10: a barra lateral mostra o mesmo online/total
    const blocos = apis.map((a) => `<i class="${a.online ? '' : 'f'}"></i>`).join('');
    return html`<div class="bento spot-group">
      <section class="card c-3 spot rise" style="--i:1" aria-labelledby="r-on"><div class="card-h"><span class="card-t" id="r-on">${ic('pulse')}APIs online</span></div>
        <div class="api-resumo-val"><div class="num-xl">${`${r.online}/${r.total}`}</div><div class="api-online-blocks" aria-hidden="true">${raw(blocos)}</div></div></section>
      <section class="card c-3 spot rise" style="--i:2" aria-labelledby="r-ul"><div class="card-h"><span class="card-t" id="r-ul">${ic('clock')}Última verificação</span></div>
        <div class="num-md mono" style="line-height:1.3">${r.ultima || '—'}</div><span class="unit">${intervalo ? `Automação a cada ${intervalo} min` : 'Automação não informada'}</span></section>
      ${fonte === 'nativo' && extra ? html`<section class="card c-3 spot rise" style="--i:3" aria-labelledby="r-lat"><div class="card-h"><span class="card-t" id="r-lat">${ic('timer')}Latência média</span></div>
        <div class="num-md mono" style="line-height:1.3">${extra.latenciaMediaMs !== null ? `${fmt(extra.latenciaMediaMs)} ms` : '—'}</div><span class="unit">Tempo de resposta das APIs</span></section>
      <section class="card c-3 spot rise" style="--i:4" aria-labelledby="r-disp"><div class="card-h"><span class="card-t" id="r-disp">${ic('heartbeat')}Disponibilidade</span></div>
        <div class="num-md mono" style="line-height:1.3">${extra.disponibilidadePct !== null ? `${fmtDec(extra.disponibilidadePct, 1)}%` : '—'}</div><span class="unit">Últimas verificações sem falha</span></section>` : ''}
    </div>`;
  }

  function desenharLista() {
    const lista = filtrarPorSistema(apis, sistema);
    const cont = contarPorSistema(apis);
    const sistemas = Object.keys(cont).sort();
    const el = /** @type {HTMLElement} */ ($('#lista', view));
    el.innerHTML = lista.length ? html`${lista.map(linha)}`.toString() : vazio({ titulo: 'Nenhuma API encontrada', texto: 'Nenhuma integração neste sistema.' }).toString();
    const pil = $('#pilulas', view);
    if (pil) pil.innerHTML = sistemas.length > 1 ? html`<button class="pill" aria-pressed="${sistema === 'todos'}" data-sis="todos">Todos <span class="n">${apis.length}</span></button>${sistemas.map((s) => html`<button class="pill" aria-pressed="${sistema === s}" data-sis="${s}">${s} <span class="n">${cont[s]}</span></button>`)}`.toString() : '';
    atualizarBarra();
  }

  function atualizarBarra() {
    const r = resumir(apis);
    const on = $('#fb-online', view); if (on) on.textContent = `${r.online}/${r.total}`;
    const ul = $('#ultima-txt', view); if (ul) ul.textContent = r.ultima || '—';
    const cards = $('#resumo', view); if (cards) { cards.innerHTML = desenharResumo().toString(); }
  }

  function desenhar() {
    conteudo.innerHTML = html`<div id="resumo"></div>
      <div class="sec-h"><div><h2>${ic('list-checks')}Status de Integração</h2><p>APIs BOREAL × PortalDoc × Lumen — Inscrição Online</p></div>
        <div class="sec-tools" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div class="pills" id="pilulas" role="group" aria-label="Filtrar por sistema"></div><span class="chip-mono" data-tip="${fonte === 'nativo' ? 'Verificações feitas pelo próprio painel, com histórico.' : 'Apps Script (reserva): sem histórico de uptime nem latência.'}">${fonte === 'nativo' ? 'Monitor nativo' : 'Apps Script · reserva'}</span></div></div>
      <div class="card api-lista" id="lista" aria-live="polite"></div>
      <div class="float-bar" role="group" aria-label="Automação dos testes">
        <div class="fb-stat"><span class="k">APIs Online</span><span class="v" id="fb-online">—</span></div>
        <label class="fb-btn" for="intervalo"><span>Intervalo de teste</span>
          <select class="native" id="intervalo" aria-label="Intervalo de teste">${INTERVALOS_TESTE.map((m) => html`<option value="${m}">${ROTULO_INTERVALO[m]}</option>`)}</select></label></div>`.toString();
    desenharLista();
    const sel = /** @type {HTMLSelectElement} */ ($('#intervalo', view));
    if (intervalo) sel.value = String(intervalo);
    else sel.selectedIndex = -1;
    if (fonte === 'nativo' && !admin) { sel.disabled = true; sel.setAttribute('data-tip', 'Só administradores alteram o intervalo'); }
  }

  /** Monitor nativo primeiro; se estiver desligado, fora do ar ou ainda SEM APIs cadastradas, a reserva (Apps Script). */
  async function lerFonte() {
    if (ativo('monitor.nativo')) {
      try {
        const d = await nativo.listar(ctx.sinal);
        if (d.apis.length) { fonte = 'nativo'; extra = { latenciaMediaMs: d.latenciaMediaMs, disponibilidadePct: d.disponibilidadePct, proxima: d.proxima }; return d; }
        console.warn('Monitor nativo sem APIs cadastradas; usando o Apps Script.');
      } catch (e) {
        if (ctx.sinal.aborted) throw e;
        ausenteSe404('monitor.nativo', e);
        console.warn('Monitor nativo indisponível; usando o Apps Script.', e);
      }
    }
    fonte = 'gas'; extra = null;
    return gas.listar(ctx.sinal);
  }
  const provedor = () => (fonte === 'nativo' ? nativo : gas);

  async function carregar() {
    try {
      const d = await lerFonte();
      if (!vivo) return;
      apis = d.apis; intervalo = d.intervalo;
      apis.filter((a) => !a.online).forEach((a) => abertas.add(a.indice)); // fora do ar abre expandida
      desenhar();
      agendarAutomacao();
      marcarAtualizado();
    } catch (e) {
      if (!vivo) return;
      console.error(e);
      conteudo.innerHTML = erroBloco({ titulo: 'Não foi possível carregar o monitoramento', texto: /** @type {any} */ (e).message || 'Erro de conexão.' }).toString();
    }
  }

  async function fazerTeste() {
    if (testando || !apis.length) return;
    testando = true;
    const b = /** @type {HTMLButtonElement} */ ($('#teste', view));
    b.disabled = true; b.classList.add('loading'); b.querySelector('.rot')?.replaceChildren(document.createTextNode('Testando servidores…'));
    let falhas = 0;
    try {
      for (let i = 0; i < apis.length && vivo; i++) {
        estados.set(i, 'testando');
        trocarLinha(i);
        $(`#api-${i}`, view)?.scrollIntoView({ behavior: reduzido() ? 'auto' : 'smooth', block: 'center' });
        try {
          const nova = fonte === 'nativo' ? await nativo.testar(i, ctx.sinal, apis[i]) : await gas.testar(i, ctx.sinal);
          if (!vivo) return;
          apis[i] = nova; estados.delete(i);
          if (nova.online) abertas.delete(i); else abertas.add(i);
        } catch (e) {
          if (!vivo) return;
          falhas++; estados.set(i, 'erro');
        }
        trocarLinha(i);
        atualizarBarra();
      }
      if (vivo) {
        const r = resumir(apis);
        if (falhas) toast('erro', 'Teste concluído com falhas', `${falhas} de ${apis.length} APIs não responderam ao teste. ${r.online} de ${r.total} online.`);
        else toast('sucesso', 'Testes concluídos com sucesso!', `${r.online} de ${r.total} APIs online.`);
        marcarAtualizado();
      }
    } finally {
      testando = false;
      if (vivo) { b.disabled = false; b.classList.remove('loading'); b.querySelector('.rot')?.replaceChildren(document.createTextNode('Fazer Teste')); }
    }
  }

  /** Redesenha só uma linha (mantém a rolagem). @param {number} i */
  function trocarLinha(i) {
    const a = apis[i]; const atual = $(`#api-${i}`, view);
    if (!a || !atual) return;
    const t = document.createElement('div');
    t.innerHTML = linha(a).toString();
    atual.replaceWith(/** @type {Node} */ (t.firstElementChild));
  }

  function agendarAutomacao() {
    clearInterval(agenda);
    if (!intervalo) return;
    agenda = setInterval(() => { if (!document.hidden) fazerTeste(); }, intervalo * 60 * 1000);
  }

  async function mudarIntervalo(/** @type {number} */ min) {
    const sel = /** @type {HTMLSelectElement} */ ($('#intervalo', view));
    sel.disabled = true;
    try {
      await provedor().definirIntervalo(min, ctx.sinal);
      intervalo = min; agendarAutomacao(); atualizarBarra();
      toast('sucesso', 'Automação configurada', `A cada ${min} min!`);
    } catch (e) {
      toast('erro', 'Não foi possível alterar o intervalo', /** @type {any} */ (e).message);
      if (intervalo) sel.value = String(intervalo);
    } finally { sel.disabled = false; }
  }

  desligar.push(delegar(view, 'click', '[data-acao],[data-sis]', (el) => {
    if (el.dataset.sis) { sistema = el.dataset.sis; desenharLista(); return; }
    const a = el.dataset.acao;
    if (a === 'teste') fazerTeste();
    else if (a === 'tentar') carregar();
    else if (a === 'expandir' || a === 'copiar') {
      const i = Number(el.closest('.api-row')?.getAttribute('data-i'));
      if (a === 'expandir') { if (abertas.has(i)) abertas.delete(i); else abertas.add(i); trocarLinha(i); $(`#api-${i} [data-acao=expandir]`, view)?.focus(); }
      else navigator.clipboard?.writeText(apis[i]?.link || '').then(() => toast('sucesso', 'Endpoint copiado'), () => toast('erro', 'Não foi possível copiar', 'Selecione e copie manualmente.'));
    }
  }));
  const aoMudar = (/** @type {Event} */ e) => { const t = /** @type {HTMLSelectElement} */ (e.target); if (t.id === 'intervalo') mudarIntervalo(Number(t.value)); };
  view.addEventListener('change', aoMudar);
  const aoAtualizar = (/** @type {Event} */ e) => { /** @type {any} */ (e).detail.tratar(); if (!testando) carregar(); };
  document.addEventListener('noir:atualizar', aoAtualizar);

  await carregar();
  const relogio = setInterval(() => { if (fonte === 'nativo' && !testando && !document.hidden) carregar(); }, 60000);
  return {
    destruir() {
      vivo = false; clearInterval(relogio);                       // sair da tela interrompe o teste sequencial
      clearInterval(agenda);
      desligar.forEach((f) => f());
      view.removeEventListener('change', aoMudar);
      document.removeEventListener('noir:atualizar', aoAtualizar);
    },
  };
}
