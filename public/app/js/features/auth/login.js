// @ts-check
import { $ } from '../../core/dom.js';
import { html, raw } from '../../core/html.js';
import { reduzido, progresso } from '../../core/motion.js';
import { consumirAviso } from '../../core/auth.js';
import { executarLogin, carimbo } from '../../core/login-etapas.js';
import { DURACAO_MIN_LOGIN_MS } from '../../config.js';
import { ic } from '../../ui/icons.js';
import { LOGO } from '../../ui/logo.js';
import { campoTexto, campoSenha, seloCaps, ligarOlhos, ligarCapsLock, erroCampo, limparErros, tremer } from './campos.js';
import { montarMoldura } from './layout.js';

/**
 * Login (AUT-01…06, 11 na saída): formulário + animação de carregamento REAL — barra no topo, log
 * de etapas cronometrado e transição "wipe". As etapas e os tempos vêm de `core/login-etapas.js`.
 *
 * @param {HTMLElement} raiz
 * @param {{ acesso: { autenticar: (login: string, senha: string) => Promise<{ token: string, usuario: any }>,
 *           carregarProjetos: () => Promise<{ total: number }>, prepararPainel: (s: any) => Promise<void>,
 *           concluir: (s: any) => Promise<void> } }} ctx
 */
export function montar(raiz, ctx) {
  const aviso = consumirAviso();
  const moldura = montarMoldura(raiz, html`
    <div class="auth-card" id="cartao">
      <div class="auth-logo">${LOGO}</div>
      <div class="auth-hd"><span class="eyebrow">Dashboard de Acompanhamento de Produção</span>
        <h1>Entrar no Painel Operacional</h1>
        <p>Use suas credenciais para acompanhar a produção em tempo real.</p></div>
      <form class="auth-form" id="form" novalidate>
        ${aviso ? html`<div class="${aviso.tipo === 'erro' ? 'form-err' : 'form-info'}" role="status">${ic(aviso.tipo === 'erro' ? 'warning-circle' : 'info')}<span>${aviso.texto}</span></div>` : ''}
        <div class="form-err" id="erro-geral" role="alert" hidden></div>
        ${campoTexto({ id: 'login', rotulo: 'Login', icone: 'user', autocomplete: 'username' })}
        ${campoSenha({ id: 'senha', rotulo: 'Senha', autocomplete: 'current-password', extra: seloCaps() })}
        <button class="btn primary lg block login-btn" type="submit" id="entrar"><span class="spin" aria-hidden="true"></span><span class="rot">Entrar</span> <kbd>↵</kbd></button>
      </form>
      <div id="log-area"></div>
    </div>`);

  const form = /** @type {HTMLFormElement} */ ($('#form', raiz));
  const cartao = /** @type {HTMLElement} */ ($('#cartao', raiz));
  const inLogin = /** @type {HTMLInputElement} */ ($('#login', raiz));
  const inSenha = /** @type {HTMLInputElement} */ ($('#senha', raiz));
  const botao = /** @type {HTMLButtonElement} */ ($('#entrar', raiz));
  const erroGeral = /** @type {HTMLElement} */ ($('#erro-geral', raiz));
  const logArea = /** @type {HTMLElement} */ ($('#log-area', raiz));
  const desligar = [ligarOlhos(raiz), ligarCapsLock(inSenha, $('[data-caps]', raiz))];
  /** @type {any} */ let contagem = null;
  let ocupado = false;

  const rotuloBotao = (/** @type {string} */ t, /** @type {boolean} */ carregando) => {
    botao.classList.toggle('loading', carregando);
    botao.querySelector('.rot')?.replaceChildren(document.createTextNode(t));
    botao.querySelector('kbd')?.toggleAttribute('hidden', carregando || t === 'Pronto');
  };
  const travar = (/** @type {boolean} */ on) => { ocupado = on; inLogin.disabled = on; inSenha.disabled = on; botao.disabled = on; };

  /** @param {string} msg */
  function falhar(msg) {
    erroGeral.hidden = false;
    erroGeral.innerHTML = html`${ic('warning-circle')}<span>${msg}</span>`.toString();
    tremer(cartao);
  }

  // ---- log de etapas ----
  /** @type {{ el: HTMLElement | null, t0: number, buffer: any[] }} */
  const log = { el: null, t0: 0, buffer: [] };
  const linha = (/** @type {any} */ e) => {
    const icone = e.estado === 'rodando' ? raw('<span class="spin" aria-hidden="true"></span>') : e.estado === 'ok' ? ic('check') : e.estado === 'aviso' ? ic('warning') : ic('x');
    return html`<div class="${`dl ${e.estado}`}" data-id="${e.id}"><span class="ts">${carimbo(Date.now() - log.t0)}</span><span class="tx">${e.rotulo}</span><span class="ms">${e.ms !== undefined ? `${e.ms} ms` : ''}</span><span class="ic-s" aria-hidden="true">${icone}</span></div>`;
  };
  function iniciarLog(/** @type {string} */ login) {
    log.t0 = Date.now(); log.buffer = [];
    logArea.innerHTML = html`<div class="dlog"><div class="dlog-h"><span>${`deploy · sessão de ${login}`}</span><span class="st" id="log-st"><i></i><span>em andamento</span></span></div><div class="dlog-b" id="log-b" role="log" aria-live="polite" aria-label="Etapas do login"></div></div>`.toString();
    log.el = /** @type {HTMLElement} */ ($('#log-b', raiz));
  }
  function estadoLog(/** @type {'ok'|'err'|''} */ cls, /** @type {string} */ texto) {
    const st = $('#log-st', raiz);
    if (!st) return;
    st.className = `st ${cls}`;
    st.querySelector('span')?.replaceChildren(document.createTextNode(texto));
  }
  function aoEvento(/** @type {any} */ e) {
    progresso.etapa(e.progresso);
    if (reduzido()) { log.buffer.push(e); return; }       // sem movimento: o log aparece completo ao final
    pintar(e);
  }
  function pintar(/** @type {any} */ e) {
    if (!log.el) return;
    if (e.estado === 'rodando' && e.nota) {            // aviso de lentidão (AUT-06): uma linha só
      if (!$('.dl.nota', log.el)) {
        const nota = document.createElement('div');
        nota.innerHTML = html`<div class="dl nota"><span class="ts">${carimbo(Date.now() - log.t0)}</span><span class="tx">${e.nota}</span><span class="ms"></span><span class="ic-s"></span></div>`.toString();
        log.el.appendChild(/** @type {Node} */ (nota.firstElementChild));
      }
      return;
    }
    const caixa = document.createElement('div');
    caixa.innerHTML = linha(e).toString();
    const n = /** @type {HTMLElement} */ (caixa.firstElementChild);
    if (e.nota) $('.tx', n)?.append(` — ${e.nota}`);   // "indisponível — continuando"
    const existente = $(`.dl[data-id="${e.id}"]`, log.el);
    if (existente) existente.replaceWith(n); else log.el.appendChild(n);
  }

  // ---- 429: bloqueio com contagem regressiva ----
  function bloquear(/** @type {number} */ seg) {
    let resta = Math.max(1, Math.round(seg));
    botao.disabled = true; inLogin.disabled = true; inSenha.disabled = true;
    const atualizar = () => { rotuloBotao(`Tente novamente em ${resta} s`, false); };
    atualizar();
    contagem = setInterval(() => {
      resta--;
      if (resta <= 0) { clearInterval(contagem); contagem = null; travar(false); rotuloBotao('Tentar novamente', false); inSenha.focus(); } else atualizar();
    }, 1000);
  }

  async function enviar(/** @type {Event} */ ev) {
    ev.preventDefault();
    if (ocupado || contagem) return;
    limparErros(raiz); erroGeral.hidden = true; logArea.replaceChildren();
    const login = inLogin.value.trim();
    const senha = inSenha.value;
    if (!login) { erroCampo(raiz, 'login', 'Informe seu login para continuar.'); tremer(cartao); inLogin.focus(); return; }
    if (!senha) { erroCampo(raiz, 'senha', 'Informe sua senha para continuar.'); tremer(cartao); inSenha.focus(); return; }

    travar(true);
    rotuloBotao('Entrando…', true);
    iniciarLog(login);
    progresso.etapa(8);
    /** @type {any} */ let autenticado = null;
    try {
      const sessao = await executarLogin({
        autenticar: async () => { autenticado = await ctx.acesso.autenticar(login, senha); return autenticado; },
        carregarProjetos: () => ctx.acesso.carregarProjetos(),
        montarPainel: () => ctx.acesso.prepararPainel(autenticado),
        aoEvento,
        duracaoMinMs: reduzido() ? 0 : DURACAO_MIN_LOGIN_MS,
      });
      if (reduzido()) log.buffer.forEach(pintar);
      estadoLog('ok', 'concluído');
      rotuloBotao('Pronto', false);
      progresso.concluir();
      await ctx.acesso.concluir(sessao);
    } catch (e) {
      const erro = /** @type {any} */ (e);
      if (reduzido()) log.buffer.forEach(pintar);
      estadoLog('err', 'falhou');
      progresso.concluir();
      falhar(erro && erro.message ? erro.message : 'Não foi possível entrar. Tente novamente.');
      if (erro && erro.status === 429) { bloquear(erro.retryAfterSeg || 60); return; }
      travar(false);
      rotuloBotao('Tentar novamente', false);
      inSenha.focus(); inSenha.select();
    }
  }

  form.addEventListener('submit', enviar);
  inLogin.focus();
  return { destruir() { clearInterval(contagem); form.removeEventListener('submit', enviar); desligar.forEach((f) => f()); moldura.destruir(); } };
}
