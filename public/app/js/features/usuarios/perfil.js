// @ts-check
import { $ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { ESTADO } from '../../core/store.js';
import { dataBR, horaBR } from '../../core/format.js';
import { atualizarUsuario } from '../../core/auth.js';
import { validarNome } from '../../core/perfil.js';
import { definirMacroIntervalo, sincronizacaoLigada, definirSincronizacao } from '../../core/preferencias.js';
import { ausenteSe404 } from '../../config/recursos.js';
import { definirTema, sincronizarTemaUI } from '../../core/tema.js';
import { validarNovaSenha } from '../../core/senha.js';
import { ic } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { toast } from '../../ui/toast.js';
import { ligarSwitch } from '../../ui/controles.js';
import { INTERVALOS_MACRO } from '../shell/configuracoes.js';
import { criarServicoConta } from './conta.js';
import { campoSenha, ligarOlhos, erroCampo, limparErros, tremer } from '../auth/campos.js';
import { medidorSenha, atualizarMedidor, atualizarIgualdade } from '../auth/medidor-senha.js';

/**
 * Meu perfil (USR-01…05). Mostra a identidade (nome, @login, tipo, e-mail, cargo, último acesso, conta criada em — de `GET /auth/me`,
 * com o que o login já trouxe enquanto isso), permite **editar o próprio nome** (`PATCH /auth/me`), ajustar as preferências (que
 * acompanham a conta, se o usuário quiser) e alterar a senha (`PATCH /auth/senha`).
 *
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, sinal: AbortSignal, usuario: any, acesso: { alterarSenha: (c: { senhaAtual: string, novaSenha: string }) => Promise<void>, sair: () => void, alternarSidebar: (v?: boolean) => void } }} ctx
 */
export function montar(view, ctx) {
  const u = ctx.usuario || {};
  const nome = u.nome || u.login || 'Visitante';

  view.innerHTML = html`
    <div class="page-h rise"><div class="ttl"><span class="eyebrow">${ic('user-circle')} Conta</span><h1>Meu perfil</h1>
      <p class="sub">Seus dados, preferências e a segurança da sua conta.</p></div></div>
    <div class="bento">
      <section class="card c-5 rise" style="--i:1" aria-labelledby="id-t">
        <div class="card-h"><span class="card-t" id="id-t">${ic('identification-card')}Identidade</span></div>
        <div class="perfil-id">${avatar({ nome, semente: u.login || nome, tamanho: 64, online: !!ctx.usuario })}
          <h2 data-v="nome">${nome}</h2>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="mono dim">${u.login ? `@${u.login}` : ''}</span><span class="${`selo ${u.tipo === 'admin' ? 'accent' : ''} nodot`}">${u.tipo === 'admin' ? 'Admin' : 'Standard'}</span></div>
          <div class="kv-lista">
            <div><span>E-mail</span><b data-v="email">${u.email || '—'}</b></div>
            <div><span>Cargo</span><b data-v="cargo">${u.cargo || '—'}</b></div>
            <div><span>Último acesso</span><b data-v="ultimo">…</b></div>
            <div><span>Conta criada em</span><b data-v="criado">…</b></div>
          </div>
          <div class="nome-area" data-nome-area><button type="button" class="btn sm" data-acao="editar-nome">${ic('pencil-simple-line')}Editar nome</button></div>
          <span class="field-hint">Para alterar e-mail, login ou tipo, peça a um administrador.</span>
        </div>
      </section>
      <section class="card c-7 rise" style="--i:2" aria-labelledby="pref-t">
        <div class="card-h"><span class="card-t" id="pref-t">${ic('gear-six')}Preferências</span></div>
        <div class="set-row"><div class="tx"><b>Tema</b><span data-tema-lbl>—</span></div>
          <div class="theme-tg" role="group" aria-label="Tema"><button data-tema="dark" aria-pressed="false" aria-label="Escuro">${ic('moon')}</button><button data-tema="light" aria-pressed="false" aria-label="Claro">${ic('sun')}</button></div></div>
        <div class="set-row"><div class="tx"><b>Barra lateral recolhida</b><span>Atalho <kbd>[</kbd></span></div><button class="switch" role="switch" aria-checked="${ESTADO.sidebarRecolhida}" id="sw-sb" aria-label="Barra lateral recolhida"></button></div>
        <div class="set-row"><div class="tx"><b>Tempo de tela do Macro View</b><span>Rotação BOREAL → ATLAS → COBALTO</span></div>
          <select class="native" id="macro" aria-label="Tempo de tela do Macro View">${INTERVALOS_MACRO.map((s) => html`<option value="${s}">${`${s} s`}</option>`)}</select></div>
        <div class="set-row"><div class="tx"><b>Acompanhar em outros computadores</b><span data-sync-nota>—</span></div><button class="switch" role="switch" aria-checked="${sincronizacaoLigada()}" id="sw-sync" aria-label="Salvar preferências na minha conta"></button></div>
      </section>
      <section class="card c-12 rise" style="--i:3" aria-labelledby="seg-t">
        <div class="card-h"><span class="card-t" id="seg-t">${ic('key')}Segurança</span></div>
        <form id="form-senha" class="form-grid" novalidate style="max-width:760px">
          <div class="full form-err" id="erro-geral" role="alert" hidden></div>
          <div class="full">${campoSenha({ id: 'atual', rotulo: 'Senha atual', autocomplete: 'current-password' })}</div>
          <div>${campoSenha({ id: 'nova', rotulo: 'Nova senha', autocomplete: 'new-password' })}${medidorSenha()}</div>
          <div>${campoSenha({ id: 'repita', rotulo: 'Repita a nova senha', autocomplete: 'new-password' })}<div class="pw-igual" id="igual" aria-live="polite"></div></div>
          <div class="full" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="submit" id="salvar"><span class="spin" aria-hidden="true"></span>${ic('check')}Alterar senha</button>
            <button class="btn" type="button" id="sair">${ic('sign-out')}Encerrar sessão</button></div>
        </form>
      </section>
    </div>`.toString();

  sincronizarTemaUI();
  const desligar = [ligarOlhos(view)];
  const sw = /** @type {HTMLElement} */ ($('#sw-sb', view));
  desligar.push(ligarSwitch(sw, (v) => ctx.acesso.alternarSidebar(v)).destruir);
  const macro = /** @type {HTMLSelectElement} */ ($('#macro', view));
  macro.value = String(ESTADO.macroIntervalo);
  const notaSync = () => { const e = $('[data-sync-nota]', view); if (e) e.textContent = sincronizacaoLigada() ? 'Salvas na sua conta — acompanham você em qualquer computador.' : 'Salvas só neste navegador.'; };
  notaSync();
  desligar.push(ligarSwitch(/** @type {HTMLElement} */ ($('#sw-sync', view)), (v) => { definirSincronizacao(v); notaSync(); }).destruir);
  const aoMacro = () => { definirMacroIntervalo(Number(macro.value)); toast('sucesso', 'Preferência salva', sincronizacaoLigada() ? 'Na sua conta.' : 'Neste navegador.'); };
  macro.addEventListener('change', aoMacro);
  const aoClicar = (/** @type {Event} */ e) => { const t = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest('[data-tema]')); if (t) definirTema(/** @type {'dark'|'light'} */ (t.dataset.tema), /** @type {MouseEvent} */ (e)); };
  view.addEventListener('click', aoClicar);
  $('#sair', view)?.addEventListener('click', () => ctx.acesso.sair());

  // ---- identidade (GET /auth/me) e edição do nome (PATCH /auth/me) ----
  const conta = criarServicoConta(ctx.api);
  const texto = (/** @type {string} */ k, /** @type {string} */ t) => { const e = $(`[data-v="${k}"]`, view); if (e) e.textContent = t; };
  const quando = (/** @type {number|null} */ ts) => (ts ? `${dataBR(new Date(ts))} ${horaBR(new Date(ts))}` : '—');
  conta.me(ctx.sinal).then((p) => {
    if (ctx.sinal.aborted) return;
    texto('nome', p.nome || nome); texto('email', p.email || '—'); texto('cargo', p.cargo || '—'); texto('ultimo', quando(p.ultimoLoginEm)); texto('criado', quando(p.criadoEm));
  }, (e) => {
    if (ctx.sinal.aborted) return;
    console.warn('Perfil: não foi possível ler a conta.', e);
    ausenteSe404('auth.me', e);
    texto('ultimo', '—'); texto('criado', '—');
  });

  const area = /** @type {HTMLElement} */ ($('[data-nome-area]', view));
  const botaoEditar = html`<button type="button" class="btn sm" data-acao="editar-nome">${ic('pencil-simple-line')}Editar nome</button>`.toString();
  function editarNome() {
    const atualNome = ($('[data-v="nome"]', view)?.textContent || nome).trim();
    area.innerHTML = html`<form class="nome-form" data-form-nome novalidate><label class="sr-only" for="novo-nome">Seu nome</label>
      <span class="input"><input id="novo-nome" value="${atualNome}" maxlength="150" autocomplete="name" aria-describedby="novo-nome-msg"></span>
      <span class="field-msg" id="novo-nome-msg" role="alert" hidden></span>
      <span class="nome-acoes"><button type="submit" class="btn sm primary"><span class="spin" aria-hidden="true"></span>Salvar</button><button type="button" class="btn sm ghost" data-acao="cancelar-nome">Cancelar</button></span></form>`.toString();
    const campo = /** @type {HTMLInputElement} */ ($('#novo-nome', area));
    campo.focus(); campo.select();
  }
  async function salvarNome(/** @type {HTMLFormElement} */ f) {
    const campo = /** @type {HTMLInputElement} */ ($('#novo-nome', f));
    const msg = /** @type {HTMLElement} */ ($('.field-msg', f));
    const botao = /** @type {HTMLButtonElement} */ ($('button[type="submit"]', f));
    const erro = (/** @type {string} */ t) => { msg.hidden = !t; msg.textContent = t; campo.closest('.input')?.classList.toggle('invalid', !!t); };
    const v = validarNome(campo.value);
    if (!v.ok) { erro(v.erro); campo.focus(); return; }
    erro(''); botao.disabled = true; botao.classList.add('loading');
    try {
      const p = await conta.editarNome(v.nome);
      atualizarUsuario({ nome: p.nome });
      document.dispatchEvent(new CustomEvent('noir:usuario'));
      texto('nome', p.nome);
      area.innerHTML = botaoEditar;
      toast('sucesso', 'Perfil atualizado', 'Seu nome foi alterado.');
    } catch (e) {
      botao.disabled = false; botao.classList.remove('loading');
      erro(/** @type {any} */ (e).message || 'Não foi possível salvar o nome.'); campo.focus();
    }
  }
  const aoAreaClique = (/** @type {Event} */ e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-acao="editar-nome"]')) editarNome();
    else if (t.closest('[data-acao="cancelar-nome"]')) { area.innerHTML = botaoEditar; $('[data-acao="editar-nome"]', area)?.focus(); }
  };
  const aoAreaEnviar = (/** @type {Event} */ e) => { e.preventDefault(); salvarNome(/** @type {HTMLFormElement} */ (e.target)); };
  area.addEventListener('click', aoAreaClique); area.addEventListener('submit', aoAreaEnviar);
  desligar.push(() => { area.removeEventListener('click', aoAreaClique); area.removeEventListener('submit', aoAreaEnviar); });

  // ---- alterar senha ----
  const form = /** @type {HTMLFormElement} */ ($('#form-senha', view));
  const atual = /** @type {HTMLInputElement} */ ($('#atual', view));
  const nova = /** @type {HTMLInputElement} */ ($('#nova', view));
  const repita = /** @type {HTMLInputElement} */ ($('#repita', view));
  const salvar = /** @type {HTMLButtonElement} */ ($('#salvar', view));
  const erroGeral = /** @type {HTMLElement} */ ($('#erro-geral', view));
  const igual = /** @type {HTMLElement} */ ($('#igual', view));
  atualizarMedidor(view, '');
  const aoDigitar = () => { atualizarMedidor(view, nova.value); atualizarIgualdade(igual, nova.value, repita.value); };
  nova.addEventListener('input', aoDigitar); repita.addEventListener('input', aoDigitar);

  const aoEnviar = async (/** @type {Event} */ e) => {
    e.preventDefault();
    limparErros(form); erroGeral.hidden = true;
    if (!atual.value) { erroCampo(form, 'atual', 'Informe a senha atual.'); tremer(form); atual.focus(); return; }
    const v = validarNovaSenha(nova.value, repita.value);
    if (v) { const id = v.campo === 'senha' ? 'nova' : 'repita'; erroCampo(form, id, v.mensagem); tremer(form); $(`#${id}`, form)?.focus(); return; }
    salvar.disabled = true; salvar.classList.add('loading');
    try {
      await ctx.acesso.alterarSenha({ senhaAtual: atual.value, novaSenha: nova.value });
      toast('sucesso', 'Senha alterada', 'Use a nova senha no próximo acesso.');
      form.reset(); atualizarMedidor(view, ''); atualizarIgualdade(igual, '', '');
    } catch (err) {
      const x = /** @type {any} */ (err);
      tremer(form);
      if (x.status === 401 && /senha atual/i.test(x.message)) { erroCampo(form, 'atual', x.message); atual.focus(); atual.select(); }
      else { erroGeral.hidden = false; erroGeral.innerHTML = html`${ic('warning-circle')}<span>${x.message || 'Não foi possível alterar a senha.'}</span>`.toString(); }
    } finally { salvar.disabled = false; salvar.classList.remove('loading'); }
  };
  form.addEventListener('submit', aoEnviar);

  return { destruir() { desligar.forEach((f) => f()); macro.removeEventListener('change', aoMacro); view.removeEventListener('click', aoClicar); nova.removeEventListener('input', aoDigitar); repita.removeEventListener('input', aoDigitar); form.removeEventListener('submit', aoEnviar); } };
}
