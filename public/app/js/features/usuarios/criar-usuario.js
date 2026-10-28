// @ts-check
import { $, $$ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { sugerirLogin, validarNovoUsuario, campoDoConflito } from '../../core/senha.js';
import { ic } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { campoTexto, erroCampo, limparErros, tremer } from '../auth/campos.js';

/** Rótulo do tipo na tela de sucesso. */
const TIPO_ROTULO = /** @type {Record<string, string>} */ ({ admin: 'Usuário admin', standard: 'Usuário standard', turno: 'Conta de turno' });

/**
 * Criar novo usuário (USR-06 — admin). Login sugerido como `nome.sobrenome` até o admin editá-lo;
 * validação por campo; `409` mostra o conflito no campo certo. A senha temporária NUNCA aparece
 * quando o e-mail foi enviado; só no fallback (`emailEnviado:false`), com aviso e botão de copiar.
 *
 * @param {HTMLElement} view
 * @param {{ acesso: { criarUsuario: (d: { nome: string, login: string, email: string, tipo: string, cargo?: string }) => Promise<any> }, irPara: (r: string) => void }} ctx
 */
export function montar(view, ctx) {
  let tipo = 'standard';
  let loginEditado = false;

  view.innerHTML = html`
    <div class="page-h rise"><div class="ttl"><span class="eyebrow">${ic('shield-check')} Administração</span><h1>Criar novo usuário</h1>
      <p class="sub">O usuário recebe uma senha temporária por e-mail e define a própria senha no primeiro acesso.</p></div></div>
    <div class="bento">
      <div class="card c-7 rise" style="--i:1" id="cartao"></div>
      <aside class="card c-5 rise" style="--i:2" aria-labelledby="perfis-t"><div class="card-h"><span class="card-t" id="perfis-t">${ic('users')}Perfis de acesso</span></div>
        <div class="rows">
          <div class="row-i" style="grid-template-columns:auto 1fr"><span class="ico-tile accent">${ic('shield-star')}</span><div><b>Usuário admin</b><p class="muted" style="font-size:12.5px">Vê todos os projetos, cria usuários e altera configurações.</p></div></div>
          <div class="row-i" style="grid-template-columns:auto 1fr"><span class="ico-tile">${ic('user')}</span><div><b>Usuário standard</b><p class="muted" style="font-size:12.5px">Acompanha a produção, gera relatórios e usa a Macro View.</p></div></div>
          <div class="row-i" style="grid-template-columns:auto 1fr"><span class="ico-tile">${ic('device-mobile')}</span><div><b>Conta de turno</b><p class="muted" style="font-size:12.5px">Usada no tablet do supervisor: bipa caixas e não vê o painel.</p></div></div>
        </div>
        <p class="field-hint">${ic('info')} Nenhuma senha é exibida em tela: o envio acontece por e-mail para o endereço informado.</p></aside>
    </div>`.toString();

  const cartao = /** @type {HTMLElement} */ ($('#cartao', view));

  function formulario() {
    cartao.innerHTML = html`<form id="form" class="form-grid" novalidate>
      <div class="full">${campoTexto({ id: 'nome', rotulo: 'Nome completo', icone: 'identification-card', autocomplete: 'off' })}</div>
      ${campoTexto({ id: 'login', rotulo: 'Login', icone: 'at', autocomplete: 'off', ajuda: 'Sugerido a partir do nome; você pode editar.' })}
      ${campoTexto({ id: 'email', rotulo: 'E-mail', icone: 'envelope-simple', tipo: 'email', autocomplete: 'off' })}
      <div class="full">${campoTexto({ id: 'cargo', rotulo: 'Cargo (opcional)', icone: 'identification-card', autocomplete: 'off', ajuda: 'Ex.: Supervisor de Produção. Aparece no perfil.' })}</div>
      <div class="full field"><span class="lbl" id="tipo-l">Tipo de usuário</span>
        <div class="opts" role="radiogroup" aria-labelledby="tipo-l">
          <button type="button" class="opt" role="radio" aria-checked="${tipo === 'admin'}" data-tipo="admin">${ic('shield-star')}<b>Usuário admin</b><span>Acesso total ao painel</span><i class="chk" aria-hidden="true"></i></button>
          <button type="button" class="opt" role="radio" aria-checked="${tipo === 'standard'}" data-tipo="standard">${ic('user')}<b>Usuário standard</b><span>Acompanhamento e relatórios</span><i class="chk" aria-hidden="true"></i></button>
          <button type="button" class="opt" role="radio" aria-checked="${tipo === 'turno'}" data-tipo="turno">${ic('device-mobile')}<b>Conta de turno</b><span>Conta do tablet do turno: bipa caixas, não vê o painel</span><i class="chk" aria-hidden="true"></i></button>
        </div></div>
      <div class="full form-err" id="erro-geral" role="alert" hidden></div>
      <div class="full" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button type="button" class="btn ghost" data-acao="cancelar">Cancelar</button>
        <button type="submit" class="btn primary" id="criar"><span class="spin" aria-hidden="true"></span>${ic('user-plus')}Criar usuário e gerar senha temporária</button></div>
    </form>`.toString();
    const nome = /** @type {HTMLInputElement} */ ($('#nome', cartao));
    const login = /** @type {HTMLInputElement} */ ($('#login', cartao));
    nome.addEventListener('input', () => { if (!loginEditado) login.value = sugerirLogin(nome.value); });
    login.addEventListener('input', () => { loginEditado = login.value !== '' && login.value !== sugerirLogin(nome.value); if (!login.value) loginEditado = false; });
    nome.focus();
  }

  /** @param {any} d */
  function sucesso(d) {
    const fallback = d.emailEnviado === false && d.senhaTemporaria;
    cartao.innerHTML = html`<div class="success-hero rise"><div class="app-ok">${ic('check-circle')}</div><h2 style="font-size:22px">Novo usuário criado!</h2>
      <p>Login <code>${d.login}</code> · ${TIPO_ROTULO[d.tipo] ?? d.tipo}.${fallback ? '' : html` A senha temporária foi enviada por e-mail para <b>${d.email}</b>.`}</p></div>
      ${fallback ? html`<div class="form-err" role="alert" style="--x:0">${ic('warning')}<span>Não foi possível enviar por e-mail — repasse esta senha manualmente.</span></div>
        <div class="copy-row"><span class="grow" id="senha-temp">${d.senhaTemporaria}</span><button class="btn sm" data-acao="copiar">${ic('copy')}Copiar</button></div>
        <p class="field-hint">Fallback: a senha só aparece porque o envio por e-mail falhou. Ela expira no primeiro acesso.</p>` : html`<p class="field-hint" style="text-align:center">Se o e-mail não chegar, peça ao administrador para gerar uma nova senha (gestão de usuários: em breve).</p>`}
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" data-acao="outro">${ic('user-plus')}Criar outro usuário</button><a class="btn primary" href="#/projetos">Voltar ao painel</a></div>`.toString();
    toast('sucesso', 'Usuário criado', fallback ? `${d.nome}: repasse a senha temporária.` : `${d.nome} receberá a senha por e-mail.`);
  }

  async function enviar(/** @type {HTMLFormElement} */ form) {
    limparErros(cartao); $('#erro-geral', cartao)?.setAttribute('hidden', '');
    const v = { nome: /** @type {HTMLInputElement} */ ($('#nome', cartao)).value, login: /** @type {HTMLInputElement} */ ($('#login', cartao)).value, email: /** @type {HTMLInputElement} */ ($('#email', cartao)).value, tipo, cargo: /** @type {HTMLInputElement} */ ($('#cargo', cartao)).value };
    const erros = validarNovoUsuario(v);
    const campos = /** @type {('nome'|'login'|'email'|'cargo')[]} */ (['nome', 'login', 'email', 'cargo']).filter((c) => erros[c]);
    if (campos.length) {
      campos.forEach((c) => erroCampo(cartao, c, /** @type {string} */ (erros[c])));
      tremer(cartao); $(`#${campos[0]}`, cartao)?.focus(); return;
    }
    const botao = /** @type {HTMLButtonElement} */ ($('#criar', cartao));
    botao.disabled = true; botao.classList.add('loading');
    try {
      const d = await ctx.acesso.criarUsuario({ nome: v.nome.trim(), login: v.login.trim().toLowerCase(), email: v.email.trim(), tipo, ...(v.cargo.trim() ? { cargo: v.cargo.trim() } : {}) });
      sucesso(d);
    } catch (e) {
      const err = /** @type {any} */ (e);
      botao.disabled = false; botao.classList.remove('loading');
      tremer(cartao);
      if (err.status === 409) { const c = campoDoConflito(err.message); erroCampo(cartao, c, err.message); $(`#${c}`, cartao)?.focus(); return; }
      const g = $('#erro-geral', cartao);
      if (g) { g.hidden = false; g.innerHTML = html`${ic('warning-circle')}<span>${err.message || 'Não foi possível criar o usuário.'}</span>`.toString(); }
    }
    void form;
  }

  const aoClicar = (/** @type {Event} */ e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const op = /** @type {HTMLElement|null} */ (t.closest('[data-tipo]'));
    if (op) { tipo = /** @type {string} */ (op.dataset.tipo); $$('[data-tipo]', cartao).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tipo === tipo))); return; }
    const a = /** @type {HTMLElement|null} */ (t.closest('[data-acao]'));
    if (!a) return;
    if (a.dataset.acao === 'cancelar') ctx.irPara('/projetos');
    else if (a.dataset.acao === 'outro') { loginEditado = false; tipo = 'standard'; formulario(); }
    else if (a.dataset.acao === 'copiar') {
      const txt = $('#senha-temp', cartao)?.textContent || '';
      navigator.clipboard?.writeText(txt).then(() => toast('sucesso', 'Senha copiada'), () => toast('erro', 'Não foi possível copiar', 'Selecione e copie manualmente.'));
    }
  };
  const aoEnviar = (/** @type {Event} */ e) => { e.preventDefault(); enviar(/** @type {HTMLFormElement} */ (e.target)); };
  cartao.addEventListener('click', aoClicar);
  cartao.addEventListener('submit', aoEnviar);
  formulario();
  return { destruir() { cartao.removeEventListener('click', aoClicar); cartao.removeEventListener('submit', aoEnviar); } };
}
