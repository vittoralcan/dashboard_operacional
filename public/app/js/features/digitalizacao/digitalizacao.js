// @ts-check
import { html } from '../../core/html.js';
import { API } from '../../config.js';
import { ic } from '../../ui/icons.js';
import { retornoHtml, retornoTexto } from '../../ui/retorno.js';
import { classificarFalha, codigoAposFalhaEscolher } from '../tablet/tablet.js';
import {
  normalizarCodigoBip, normalizarColaboradores, normalizarEstado, mensagemBip, cartaoDeRetorno,
  caixaPorColaborador, textoOcupado, avisoOutraTela, lerImagens,
  ETAPA_DIGITALIZACAO, rotuloEtapa,
} from '../../core/operacional.js';

/**
 * Digitalização (computador): "Nova caixa" → bip → toque no nome; novo bip (ou o botão Concluir)
 * pede o nº de imagens e as marcas da caixa (muito grampo, papel deteriorado) antes de concluir.
 * Mesma conta de turno do tablet; a lista de nomes é a do turno.
 */

const ESTADO_A_CADA_MS = 30000;
const RETORNO_VISIVEL_MS = 12000;

/**
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, usuario: any, acesso: { sair: () => any } }} ctx
 */
export async function montar(view, ctx) {
  const base = `${API.painel}/operacional/terminal`;
  /** @type {'espera'|'nova'|'nomes'|'concluir'} */
  let modo = 'espera';
  let codigo = '';
  /** @type {import('../../core/operacional.js').Colaborador[]} */
  let colaboradores = [];
  /** @type {import('../../core/operacional.js').CaixaAberta[]} */
  let abertas = [];
  /** @type {import('../../core/operacional.js').CaixaAberta|null} */
  let alvo = null;
  let grampo = false;
  let deteriorado = false;
  let imagensTexto = '';
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

  view.innerHTML = html`<div class="dig-tela op-tela">
    <header class="op-topo">
      <div class="op-marca"><h1 class="op-turno" data-turno>${ctx.usuario?.nome || 'Turno'}</h1></div>
      <nav class="op-nav" aria-label="Tela">
        <a class="op-link" href="#/tablet">${ic('package')}Higienização e remontagem</a>
        <a class="op-link" href="#/digitalizacao" aria-current="page">${ic('scan')}Digitalização</a>
      </nav>
      <button type="button" class="op-btn quiet" data-sair>${ic('sign-out')}Sair</button>
    </header>
    <div class="op-retorno" data-faixa role="status" aria-live="polite" hidden></div>
    <div class="dig-grade">
      <section class="op-card dig-acao" aria-label="Nova caixa">
        <button type="button" class="op-btn primary dig-nova" data-nova>${ic('plus-circle')}Nova caixa</button>
        <form class="op-bip" data-form novalidate autocomplete="off">
          <label class="op-rot" for="dig-codigo">${ic('barcode')}<span data-dica-txt>Bipe a caixa</span></label>
          <input id="dig-codigo" class="op-campo" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" data-codigo>
        </form>
        <section class="dig-nomes" data-nomes hidden></section>
        <section class="dig-concluir" data-concluir hidden></section>
      </section>
      <section class="op-card" data-abertas aria-label="Caixas em andamento"></section>
    </div>
  </div>`.toString();

  const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (view.querySelector(s));
  const campo = /** @type {HTMLInputElement} */ (q('[data-codigo]'));
  const foco = () => { if (vivo && (modo === 'espera' || modo === 'nova')) campo.focus({ preventScroll: true }); };
  const nomeDe = (/** @type {number} */ id) => colaboradores.find((c) => c.id === id)?.nome || '';

  /** @param {import('../../ui/retorno.js').Retorno | null} f */
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

  function pintarNomes() {
    const el = q('[data-nomes]');
    el.hidden = modo !== 'nomes';
    const ocupados = caixaPorColaborador(abertas);
    el.innerHTML = modo !== 'nomes' ? '' : html`<h2 class="op-sub">${ic('users')}Quem vai digitalizar a caixa ${codigo}?</h2>
      <div class="op-nomes">${colaboradores.map((c) => ocupados.has(c.id)
        ? html`<button type="button" class="op-btn op-nome" disabled data-inicial="${c.nome.charAt(0).toUpperCase()}"><span class="op-nome-txt">${c.nome}</span><span class="op-chip warn">${ic('hourglass-medium')}${textoOcupado(ocupados.get(c.id))}</span></button>`
        : html`<button type="button" class="op-btn op-nome" data-colab="${c.id}" data-inicial="${c.nome.charAt(0).toUpperCase()}"><span class="op-nome-txt">${c.nome}</span></button>`)}</div>
      <button type="button" class="op-btn quiet" data-cancelar>${ic('x')}Cancelar</button>`.toString();
  }

  function pintarConcluir() {
    const el = q('[data-concluir]');
    el.hidden = modo !== 'concluir' || !alvo;
    if (el.hidden || !alvo) { el.innerHTML = ''; return; }
    el.innerHTML = html`<h2 class="op-sub">${ic('check-circle')}Concluir caixa</h2>
      <div class="dig-resumo"><span class="op-cod">${alvo.codigo}</span><span class="op-quem">${alvo.colaboradorNome}</span></div>
      <div class="dig-imagens">
        <label class="op-rot" for="dig-imagens">${ic('images')}Quantas imagens a caixa teve?</label>
        <input id="dig-imagens" class="op-campo" type="text" inputmode="numeric" autocomplete="off" value="${imagensTexto}" data-imagens>
      </div>
      <div class="op-marcas">
        <button type="button" class="op-toggle" data-marca="grampo" aria-pressed="${String(grampo)}">${ic('paperclip')}Muito grampo<span class="op-toggle-est">${grampo ? 'Marcado' : 'Toque para marcar'}</span></button>
        <button type="button" class="op-toggle" data-marca="deteriorado" aria-pressed="${String(deteriorado)}">${ic('file-dashed')}Papel deteriorado<span class="op-toggle-est">${deteriorado ? 'Marcado' : 'Toque para marcar'}</span></button>
      </div>
      <div class="dig-botoes">
        <button type="button" class="op-btn primary" data-confirmar>${ic('check-circle')}Concluir caixa</button>
        <button type="button" class="op-btn quiet" data-cancelar>${ic('x')}Cancelar</button>
      </div>`.toString();
    const entrada = /** @type {HTMLInputElement} */ (q('[data-imagens]'));
    entrada.addEventListener('input', () => { imagensTexto = entrada.value; });
    entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); concluir(); } });
    if (!imagensTexto) entrada.focus({ preventScroll: true });
  }

  /** @param {import('../../core/operacional.js').CaixaAberta} c */
  function cartaoCaixa(c) {
    const pausada = c.pausaInicioMs !== null;
    const selo = c.fimSolicitadoMs !== null ? html`<span class="op-chip warn">${ic('hourglass-medium')}Aguardando imagens</span>`
      : pausada ? html`<span class="op-chip warn">${ic('pause')}Pausada</span>`
      : c.pausaAutomatica ? html`<span class="op-chip err">${ic('warning')}Pausa encerrada na troca de turno: avise o supervisor</span>`
        : html`<span class="op-chip ok">${ic('play')}Em andamento</span>`;
    return html`<li class="op-caixa dig-caixa${pausada ? ' pausada' : ''}${c.pausaAutomatica ? ' pendente' : ''}">
      <div class="op-caixa-topo"><span class="op-cod">${c.codigo}</span><span class="op-chip accent">${rotuloEtapa(c.etapa)}</span></div>
      <div class="op-quem"><span class="op-inicial" aria-hidden="true">${(c.colaboradorNome || '?').charAt(0).toUpperCase()}</span>${c.colaboradorNome}</div>
      <div class="op-caixa-base"><div>${selo}</div></div>
      <div class="op-caixa-topo">
        <button type="button" class="op-btn ${pausada ? 'ok' : ''} sm" data-pausa="${c.id}" data-acao="${pausada ? 'retomar' : 'pausar'}">${pausada ? html`${ic('play')}Retomar` : html`${ic('pause')}Pausar`}</button>
        <button type="button" class="op-btn primary sm" data-fim="${c.id}">${ic('check')}Concluir</button>
      </div>
    </li>`;
  }

  function pintarAbertas() {
    const daTela = (/** @type {import('../../core/operacional.js').CaixaAberta} */ c) => c.etapa === ETAPA_DIGITALIZACAO;
    const minhas = abertas.filter(daTela);
    const outra = avisoOutraTela(abertas, daTela, 'Higienização ou Remontagem');
    q('[data-abertas]').innerHTML = html`<h2 class="op-sub">${ic('hourglass-medium')}Em andamento</h2>
      ${estadoFalhou ? html`<p class="op-chip warn" role="status">${ic('warning')}Não consegui atualizar a lista agora. Tentando de novo.</p>` : ''}
      ${minhas.length === 0
        ? html`<p class="op-vazio">${estadoFalhou ? 'Lista indisponível no momento.' : 'Nenhuma caixa em digitalização. Toque em “Nova caixa” para começar.'}</p>`
        : html`<ul class="op-lista">${minhas.map(cartaoCaixa)}</ul>`}
      ${outra ? html`<p class="op-chip accent">${ic('package')}${outra} <a href="#/tablet">Abrir o tablet</a></p>` : ''}`.toString();
  }

  function pintarModo() {
    q('[data-dica-txt]').textContent = modo === 'nova' ? 'Bipe a caixa que vai começar' : 'Bipe a caixa para concluir';
    q('[data-nova]').classList.toggle('ativo', modo === 'nova');
    q('.dig-acao').dataset.modo = modo;
    pintarNomes();
    pintarConcluir();
    campo.disabled = modo === 'nomes' || modo === 'concluir';
    foco();
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

  /**
   * Abre o painel de conclusão. O relógio da caixa para agora (no 2º bip o servidor já parou; pelo botão Concluir
   * paramos aqui) e só volta a contar se o operador cancelar. Devolve false se não deu para parar o relógio.
   * @param {import('../../core/operacional.js').CaixaAberta} caixa
   * @param {boolean} [jaParou]
   */
  async function abrirConclusao(caixa, jaParou = false) {
    if (!jaParou) {
      try { await ctx.api.post(`${base}/caixas/${caixa.id}/encerrando`, {}); } catch (e) { falha(e); return false; }
    }
    alvo = caixa; modo = 'concluir'; grampo = false; deteriorado = false; imagensTexto = '';
    mostrar(null); tentarDeNovo = false;
    return true;
  }

  /** Desistiu de concluir: o relógio da caixa volta a contar. */
  async function cancelarConclusao() {
    const caixa = alvo;
    if (modo === 'concluir' && caixa) {
      try { await ctx.api.delete(`${base}/caixas/${caixa.id}/encerrando`); await carregarEstado(); } catch (e) { falha(e); }
    }
    voltar();
  }

  function voltar() { modo = 'espera'; codigo = ''; alvo = null; campo.value = ''; }

  async function bipar() {
    if (ocupado) return;
    const lido = normalizarCodigoBip(campo.value) || codigo;
    if (!lido) return;
    codigo = lido;
    ocupado = true; tentarDeNovo = false;
    try {
      const r = await ctx.api.post(`${base}/bip`, { codigo: lido, etapa: ETAPA_DIGITALIZACAO });
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
      } else if (d.acao === 'finalizar_pendente') {
        const caixa = abertas.find((c) => c.id === d.registroId) || abertas.find((c) => c.codigo === d.codigo);
        if (caixa) await abrirConclusao(caixa, true);
        else { mostrar({ tipo: 'warn', texto: 'Caixa em andamento não encontrada. Atualize a tela.' }); await carregarEstado(); }
        codigo = '';
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
      await ctx.api.post(`${base}/caixas`, { codigo, colaboradorId, etapa: ETAPA_DIGITALIZACAO });
      mostrar({ tipo: 'ok', ...cartaoDeRetorno('iniciada', { codigo: iniciada, nome: nomeDe(colaboradorId) }) });
      voltar();
      await carregarEstado();
    } catch (e) {
      const f = falha(e);
      if (e?.corpo?.motivo === 'colaborador_ocupado') { codigo = iniciada; await carregarEstado(); } // continua na lista, já sem essa pessoa
      else if (!tentarDeNovo) { modo = 'espera'; codigo = codigoAposFalhaEscolher(f, codigo); campo.value = ''; }
    } finally { ocupado = false; }
    if (!vivo) return;
    pintarFaixa(); pintarModo();
  }

  async function concluir() {
    if (ocupado || !alvo) return;
    const imagens = lerImagens(imagensTexto);
    if (imagens === null) {
      mostrar({ tipo: 'warn', texto: 'Digite o número de imagens da caixa (1 ou mais).' });
      pintarFaixa();
      /** @type {HTMLInputElement|null} */ (view.querySelector('[data-imagens]'))?.focus();
      return;
    }
    ocupado = true; tentarDeNovo = false;
    const caixa = alvo;
    try {
      const r = await ctx.api.post(`${base}/caixas/${caixa.id}/concluir`, { imagens, grampo, deteriorado });
      const d = r.dados?.data || {};
      mostrar({ tipo: 'ok', ...cartaoDeRetorno('concluida', { codigo: caixa.codigo, nome: caixa.colaboradorNome, imagens }) });
      voltar();
      await carregarEstado();
    } catch (e) { falha(e); } finally { ocupado = false; }
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
  q('[data-nova]').addEventListener('click', async () => { await cancelarConclusao(); modo = 'nova'; mostrar(null); tentarDeNovo = false; pintarFaixa(); pintarModo(); });
  q('[data-form]').addEventListener('submit', (ev) => { ev.preventDefault(); bipar(); });
  campo.addEventListener('blur', () => { setTimeout(foco, 50); });
  view.addEventListener('click', (ev) => {
    if (!vivo) return;
    const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (ev.target).closest('[data-colab],[data-cancelar],[data-retentar],[data-pausa],[data-fim],[data-marca],[data-confirmar]'));
    if (!el) return;
    if (el.dataset.colab) escolher(Number(el.dataset.colab));
    else if (el.dataset.pausa) pausar(Number(el.dataset.pausa), el.dataset.acao === 'retomar' ? 'retomar' : 'pausar');
    else if (el.dataset.fim) {
      const caixa = abertas.find((c) => c.id === Number(el.dataset.fim));
      if (caixa) abrirConclusao(caixa).then(() => { if (vivo) { pintarFaixa(); pintarModo(); } });
    } else if (el.dataset.marca) {
      if (el.dataset.marca === 'grampo') grampo = !grampo; else deteriorado = !deteriorado;
      pintarConcluir();
    } else if (el.hasAttribute('data-confirmar')) concluir();
    else if (el.hasAttribute('data-cancelar')) cancelarConclusao().then(() => { if (vivo) { mostrar(null); pintarFaixa(); pintarModo(); } });
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
