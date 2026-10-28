// @ts-check
import { html } from '../../core/html.js';
import { API } from '../../config.js';
import { ic } from '../../ui/icons.js';
import { retornoHtml, retornoTexto } from '../../ui/retorno.js';
import {
  normalizarCodigoBip, normalizarColaboradores, normalizarEstado, mensagemBip, cartaoDeRetorno,
  caixaPorColaborador, textoOcupado, avisoOutraTela,
  ETAPAS, ETAPA_DIGITALIZACAO, normalizarEtapa, rotuloEtapa,
} from '../../core/operacional.js';

/**
 * Tablet do turno (RF-13 a RF-19): "Nova caixa" → bip → toque no nome; novo bip da mesma caixa a conclui.
 * O operador não vê tempo (nem o próprio nem o dos outros) e só tem uma caixa por vez: quem já tem caixa aberta não aparece como escolha.
 * O campo de bip fica sempre focado (o leitor "digita" e manda Enter). Várias caixas podem ficar abertas ao mesmo tempo.
 */

const ESTADO_A_CADA_MS = 30000;
const RETORNO_VISIVEL_MS = 12000;
const CHAVE_ETAPA = 'tablet.etapa';
const MSG_REDE = 'Sem conexão com o servidor. O código foi mantido: toque em “Tentar de novo”.';
const MSG_GENERICA = 'Não foi possível concluir. Tente novamente.';

/**
 * Classifica uma falha da API. Só status 0 (ErroApi de rede/timeout) é tratado como "sem conexão".
 * @param {any} e
 * @returns {{ rede: boolean, tipo: 'err'|'warn', texto: string }}
 */
export function classificarFalha(e) {
  if (e?.status === 0) return { rede: true, tipo: 'err', texto: MSG_REDE };
  const acao = e?.corpo?.acao;
  if (acao) return { rede: false, tipo: 'warn', texto: mensagemBip({ acao }) || MSG_GENERICA };
  const texto = typeof e?.status === 'number' && e.message ? e.message : MSG_GENERICA;
  return { rede: false, tipo: 'err', texto };
}

/**
 * Após falha de escolha: o código só é mantido quando a falha é de rede (para "Tentar de novo").
 * @param {{ rede: boolean }} falha
 * @param {string} codigo
 */
export function codigoAposFalhaEscolher(falha, codigo) {
  return falha.rede ? codigo : '';
}

/**
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, usuario: any, acesso: { sair: () => any } }} ctx
 */
export async function montar(view, ctx) {
  const base = `${API.painel}/operacional/terminal`;
  /** @type {'espera'|'nova'|'nomes'} */
  let modo = 'espera';
  let codigo = '';
  /** @type {import('../../core/operacional.js').Colaborador[]} */
  let colaboradores = [];
  /** @type {import('../../core/operacional.js').CaixaAberta[]} */
  let abertas = [];
  /** @type {import('../../ui/retorno.js').Retorno | null} */
  let faixa = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let esconder = null;
  let ocupado = false;
  let tentarDeNovo = false;
  let vivo = true;
  // A lista de caixas não atualizou: a tela avisa em vez de parecer vazia.
  let estadoFalhou = false;
  // `view` (#tablet) é o mesmo elemento nas duas telas: o que se pendura nele sai junto com a tela.
  const escuta = new AbortController();
  let ultimoColab = 0;
  let etapa = 'higienizacao';
  try { etapa = normalizarEtapa(localStorage.getItem(CHAVE_ETAPA)); } catch (e) { /* armazenamento indisponível: fica no padrão */ }

  view.innerHTML = html`<div class="tab-tela op-tela">
    <header class="op-topo">
      <div class="op-marca"><h1 class="op-turno" data-turno>${ctx.usuario?.nome || 'Turno'}</h1></div>
      <nav class="op-nav" aria-label="Tela">
        <a class="op-link" href="#/tablet" aria-current="page">${ic('package')}Higienização e remontagem</a>
        <a class="op-link" href="#/digitalizacao">${ic('scan')}Digitalização</a>
      </nav>
      <button type="button" class="op-btn quiet" data-sair>${ic('sign-out')}Sair</button>
    </header>
    <div class="op-retorno" data-faixa role="status" aria-live="polite" hidden></div>
    <div class="tab-grade">
      <section class="op-card tab-acao" aria-label="Nova caixa">
        <div class="op-seg" data-etapas role="group" aria-label="Etapa"></div>
        <button type="button" class="op-btn primary tab-nova" data-nova>${ic('plus-circle')}Nova caixa</button>
        <form class="op-bip" data-form novalidate autocomplete="off">
          <label class="op-rot" for="tab-codigo" data-dica>${ic('barcode')}<span data-dica-txt>Bipe a caixa</span></label>
          <input id="tab-codigo" class="op-campo" type="text" inputmode="none" autocomplete="off" autocapitalize="off" spellcheck="false" data-codigo>
        </form>
        <section class="tab-nomes" data-nomes hidden></section>
      </section>
      <section class="op-card tab-abertas" data-abertas aria-label="Caixas em andamento"></section>
    </div>
  </div>`.toString();

  const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (view.querySelector(s));
  const campo = /** @type {HTMLInputElement} */ (q('[data-codigo]'));
  const foco = () => { if (vivo && modo !== 'nomes') campo.focus({ preventScroll: true }); };
  const nomeDe = (/** @type {number} */ id) => colaboradores.find((c) => c.id === id)?.nome || abertas.find((c) => c.colaboradorId === id)?.colaboradorNome || '';

  /** Mostra o retorno e o esconde sozinho (erros ficam até a próxima ação). @param {import('../../ui/retorno.js').Retorno | null} f */
  function mostrar(f) {
    faixa = f;
    if (esconder) clearTimeout(esconder);
    esconder = null;
    if (f && f.tipo !== 'err' && f.tipo !== 'warn') esconder = setTimeout(() => { faixa = null; pintarFaixa(); }, RETORNO_VISIVEL_MS);
  }

  function pintarFaixa() {
    const el = q('[data-faixa]');
    el.hidden = !faixa;
    el.className = `op-retorno${faixa ? ` ${faixa.tipo}` : ''}`;
    el.innerHTML = faixa ? retornoHtml(faixa, tentarDeNovo ? html`<button type="button" class="op-btn sm" data-retentar>${ic('arrow-clockwise')}Tentar de novo</button>` : '').toString() : '';
    el.setAttribute('aria-label', faixa ? retornoTexto(faixa) : '');
  }

  function pintarEtapas() {
    q('[data-etapas]').innerHTML = ETAPAS.map((e) => html`<button type="button" class="op-btn" data-etapa="${e.id}" aria-pressed="${String(e.id === etapa)}" ${modo === 'espera' ? '' : 'disabled'}>${rotuloEtapa(e.id)}</button>`.toString()).join('');
  }

  function pintarNomes() {
    const el = q('[data-nomes]');
    el.hidden = modo !== 'nomes';
    const ocupados = caixaPorColaborador(abertas);
    el.innerHTML = modo !== 'nomes' ? '' : html`<h2 class="op-sub">${ic('users')}Quem vai fazer a caixa ${codigo}?</h2>
      <div class="op-nomes">${colaboradores.map((c) => ocupados.has(c.id)
        ? html`<button type="button" class="op-btn op-nome" disabled data-inicial="${c.nome.charAt(0).toUpperCase()}"><span class="op-nome-txt">${c.nome}</span><span class="op-chip warn">${ic('hourglass-medium')}${textoOcupado(ocupados.get(c.id))}</span></button>`
        : html`<button type="button" class="op-btn op-nome" data-colab="${c.id}" data-inicial="${c.nome.charAt(0).toUpperCase()}"><span class="op-nome-txt">${c.nome}</span></button>`)}</div>
      <button type="button" class="op-btn quiet tab-cancelar" data-cancelar>${ic('x')}Cancelar</button>`.toString();
  }

  function cartaoCaixa(/** @type {import('../../core/operacional.js').CaixaAberta} */ c) {
    const pausada = c.pausaInicioMs !== null;
    const classe = `op-caixa tab-caixa${pausada ? ' pausada' : ''}${c.pausaAutomatica ? ' pendente' : ''}`;
    const selo = pausada ? html`<span class="op-chip warn">${ic('pause')}Pausada</span>`
      : c.pausaAutomatica ? html`<span class="op-chip err">${ic('warning')}Pausa encerrada na troca de turno: avise o supervisor</span>`
        : html`<span class="op-chip ok">${ic('play')}Em andamento</span>`;
    return html`<li class="${classe}">
      <div class="op-caixa-topo"><span class="op-cod tab-cod">${c.codigo}</span><span class="op-chip accent tab-etapa-caixa">${rotuloEtapa(c.etapa)}</span></div>
      <div class="op-quem tab-quem"><span class="op-inicial" aria-hidden="true">${(c.colaboradorNome || '?').charAt(0).toUpperCase()}</span>${c.colaboradorNome}</div>
      <div class="op-caixa-base">
        <div>${selo}</div></div>
      <button type="button" class="op-btn ${pausada ? 'ok' : ''} sm" data-pausa="${c.id}" data-acao="${pausada ? 'retomar' : 'pausar'}">${pausada ? html`${ic('play')}Retomar` : html`${ic('pause')}Pausar`}</button>
    </li>`;
  }

  function pintarAbertas() {
    const el = q('[data-abertas]');
    const daTela = (/** @type {import('../../core/operacional.js').CaixaAberta} */ c) => c.etapa !== ETAPA_DIGITALIZACAO;
    const minhas = abertas.filter(daTela);
    const outra = avisoOutraTela(abertas, daTela, 'Digitalização');
    el.innerHTML = html`<h2 class="op-sub">${ic('hourglass-medium')}Em andamento</h2>
      ${estadoFalhou ? html`<p class="op-chip warn" role="status">${ic('warning')}Não consegui atualizar a lista agora. Tentando de novo.</p>` : ''}
      ${minhas.length === 0
        ? html`<p class="op-vazio">${estadoFalhou ? 'Lista indisponível no momento.' : 'Nenhuma caixa em andamento nesta tela. Toque em “Nova caixa” para começar.'}</p>`
        : html`<ul class="op-lista">${minhas.map(cartaoCaixa)}</ul>`}
      ${outra ? html`<p class="op-chip accent">${ic('scan')}${outra} <a href="#/digitalizacao">Abrir Digitalização</a></p>` : ''}`.toString();
  }

  function pintarModo() {
    q('[data-dica-txt]').textContent = modo === 'nova' ? 'Bipe a caixa que vai começar' : 'Bipe a caixa para concluir';
    q('[data-nova]').classList.toggle('ativo', modo === 'nova');
    q('.tab-acao').dataset.modo = modo;
    pintarEtapas();
    pintarNomes();
    campo.disabled = modo === 'nomes';
    if (modo !== 'nomes') foco();
  }

  async function carregarEstado() {
    try {
      const r = await ctx.api.get(`${base}/estado`, { etag: false });
      if (!vivo) return;
      const e = normalizarEstado(r.dados?.data);
      abertas = e.abertas;
      estadoFalhou = false;
      pintarAbertas();
    } catch (e) {
      // Mantém a lista que já estava na tela e avisa; a próxima rodada tenta de novo.
      if (!vivo) return;
      estadoFalhou = true;
      pintarAbertas();
    }
  }

  /** @param {any} e */
  function falha(e) {
    const f = classificarFalha(e);
    mostrar({ tipo: f.tipo, texto: f.texto });
    tentarDeNovo = f.rede;
    if (e?.corpo?.acao) codigo = '';
    return f;
  }

  async function bipar() {
    if (ocupado) return;
    const lido = normalizarCodigoBip(campo.value) || codigo;
    if (!lido) return;
    codigo = lido;
    ocupado = true; tentarDeNovo = false;
    try {
      const r = await ctx.api.post(`${base}/bip`, { codigo: lido, etapa });
      const d = r.dados?.data || {};
      campo.value = ''; mostrar(null);
      if (d.acao === 'iniciar') {
        if (modo === 'nova') {
          await carregarEstado();
          const lista = await ctx.api.get(`${base}/colaboradores`, { etag: false });
          colaboradores = normalizarColaboradores(lista.dados?.data);
          modo = 'nomes';
        } else {
          mostrar({ tipo: 'warn', texto: 'Toque em “Nova caixa” antes de bipar uma caixa nova.' });
          codigo = '';
        }
      } else if (d.acao === 'finalizar') {
        const nome = abertas.find((c) => c.codigo === d.codigo)?.colaboradorNome;
        mostrar({ tipo: 'ok', ...cartaoDeRetorno('concluida', { codigo: d.codigo || lido, nome, }) });
        modo = 'espera'; codigo = '';
        await carregarEstado();
      } else {
        mostrar({ tipo: 'warn', texto: mensagemBip(d) || 'Bip não reconhecido.' });
        codigo = '';
      }
    } catch (e) { falha(e); } finally { ocupado = false; }
    if (!vivo) return;
    pintarFaixa(); pintarModo();
  }

  /** @param {number} colaboradorId */
  async function escolher(colaboradorId) {
    if (ocupado) return;
    ocupado = true; tentarDeNovo = false; ultimoColab = colaboradorId;
    const iniciada = codigo;
    try {
      await ctx.api.post(`${base}/caixas`, { codigo, colaboradorId, etapa });
      mostrar({ tipo: 'ok', ...cartaoDeRetorno('iniciada', { codigo: iniciada, nome: nomeDe(colaboradorId) }) });
      modo = 'espera'; codigo = ''; campo.value = '';
      await carregarEstado();
    } catch (e) {
      const f = falha(e);
      if (e?.corpo?.motivo === 'colaborador_ocupado') { codigo = iniciada; await carregarEstado(); } // continua na lista, já sem essa pessoa
      else if (!tentarDeNovo) { modo = 'espera'; codigo = codigoAposFalhaEscolher(f, codigo); campo.value = ''; }
    } finally { ocupado = false; }
    if (!vivo) return;
    pintarFaixa(); pintarModo();
  }

  /** @param {number} id @param {'pausar'|'retomar'} acao */
  async function pausar(id, acao) {
    if (ocupado) return;
    ocupado = true; tentarDeNovo = false;
    const caixa = abertas.find((c) => c.id === id);
    try {
      await ctx.api.post(`${base}/caixas/${id}/${acao}`, {});
      mostrar({ tipo: acao === 'pausar' ? 'info' : 'ok', ...cartaoDeRetorno(acao === 'pausar' ? 'pausada' : 'retomada', { codigo: caixa?.codigo || '' }) });
      await carregarEstado();
    } catch (e) {
      falha(e);
      await carregarEstado();
    } finally { ocupado = false; }
    if (!vivo) return;
    pintarFaixa(); foco();
  }

  q('[data-sair]').addEventListener('click', () => { ctx.acesso.sair(); });
  q('[data-nova]').addEventListener('click', () => { modo = 'nova'; mostrar(null); tentarDeNovo = false; pintarFaixa(); pintarModo(); });
  q('[data-form]').addEventListener('submit', (ev) => { ev.preventDefault(); bipar(); });
  campo.addEventListener('blur', () => { setTimeout(foco, 50); });
  view.addEventListener('click', (ev) => {
    if (!vivo) return;
    const botaoEtapa = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (ev.target).closest('[data-etapa]'));
    if (botaoEtapa) {
      if (modo !== 'espera') return;
      etapa = normalizarEtapa(botaoEtapa.dataset.etapa);
      try { localStorage.setItem(CHAVE_ETAPA, etapa); } catch (e) { /* não lembrar a escolha não impede o uso */ }
      pintarEtapas(); foco();
      return;
    }
    const alvo = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (ev.target).closest('[data-colab],[data-cancelar],[data-retentar],[data-pausa]'));
    if (!alvo) return;
    if (alvo.dataset.colab) escolher(Number(alvo.dataset.colab));
    else if (alvo.dataset.pausa) pausar(Number(alvo.dataset.pausa), alvo.dataset.acao === 'retomar' ? 'retomar' : 'pausar');
    else if (alvo.hasAttribute('data-cancelar')) { modo = 'espera'; codigo = ''; campo.value = ''; mostrar(null); pintarFaixa(); pintarModo(); }
    else if (modo === 'nomes') escolher(ultimoColab);
    else bipar();
  }, { signal: escuta.signal });

  pintarModo(); pintarAbertas();
  await carregarEstado();
  const sondagem = setInterval(carregarEstado, ESTADO_A_CADA_MS);

  return {
    destruir() { vivo = false; escuta.abort(); clearInterval(sondagem); if (esconder) clearTimeout(esconder); },
  };
}
