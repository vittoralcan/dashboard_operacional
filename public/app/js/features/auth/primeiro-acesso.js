// @ts-check
import { $ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { validarNovaSenha } from '../../core/senha.js';
import { progresso } from '../../core/motion.js';
import { ic } from '../../ui/icons.js';
import { campoTexto, campoSenha, ligarOlhos, ligarCapsLock, seloCaps, erroCampo, limparErros, tremer } from './campos.js';
import { medidorSenha, atualizarMedidor, atualizarIgualdade } from './medidor-senha.js';
import { montarMoldura } from './layout.js';

/**
 * Primeiro acesso (AUT-07/08): troca obrigatória da senha temporária. Única validação bloqueante:
 * ≥ 12 caracteres e igualdade; medidor e checklist são orientativos; a política de verdade é do
 * servidor (suas mensagens aparecem no campo). Sucesso → barra, wipe, `/projetos` e toast.
 *
 * @param {HTMLElement} raiz
 * @param {{ usuario: { login?: string }, acesso: { definirSenha: (nova: string) => Promise<void>, finalizarPrimeiroAcesso: () => Promise<void>, sair: () => void } }} ctx
 */
export function montar(raiz, ctx) {
  const moldura = montarMoldura(raiz, html`
    <div class="auth-card" id="cartao">
      <div class="auth-logo">${ic('shield-check')}</div>
      <div class="auth-hd"><span class="eyebrow">Primeiro acesso</span><h1>Crie sua nova senha</h1>
        <p>Sua senha atual é temporária. Defina uma nova senha para acessar o painel.</p></div>
      <form class="auth-form" id="form" novalidate>
        <div class="form-err" id="erro-geral" role="alert" hidden></div>
        ${campoTexto({ id: 'login-ro', rotulo: 'Login', icone: 'user', valor: (ctx.usuario && ctx.usuario.login) || '', somenteLeitura: true, autocomplete: 'username' })}
        ${campoSenha({ id: 'nova', rotulo: 'Nova senha', autocomplete: 'new-password', extra: seloCaps() })}
        ${medidorSenha()}
        ${campoSenha({ id: 'repita', rotulo: 'Repita sua senha', autocomplete: 'new-password' })}
        <div class="pw-igual" id="igual" aria-live="polite"></div>
        <button class="btn primary lg block" type="submit" id="salvar"><span class="spin" aria-hidden="true"></span><span class="rot">Salvar</span></button>
      </form>
      <button class="btn ghost block" type="button" id="sair">${ic('sign-out')}Sair e voltar ao login</button>
    </div>`);

  const cartao = /** @type {HTMLElement} */ ($('#cartao', raiz));
  const form = /** @type {HTMLFormElement} */ ($('#form', raiz));
  const nova = /** @type {HTMLInputElement} */ ($('#nova', raiz));
  const repita = /** @type {HTMLInputElement} */ ($('#repita', raiz));
  const salvar = /** @type {HTMLButtonElement} */ ($('#salvar', raiz));
  const erroGeral = /** @type {HTMLElement} */ ($('#erro-geral', raiz));
  const igual = /** @type {HTMLElement} */ ($('#igual', raiz));
  const desligar = [ligarOlhos(raiz), ligarCapsLock(nova, $('[data-caps]', raiz))];

  atualizarMedidor(raiz, '');
  const aoDigitar = () => { atualizarMedidor(raiz, nova.value); atualizarIgualdade(igual, nova.value, repita.value); limparErros(raiz, 'nova'); limparErros(raiz, 'repita'); erroGeral.hidden = true; };
  nova.addEventListener('input', aoDigitar);
  repita.addEventListener('input', aoDigitar);

  async function enviar(/** @type {Event} */ e) {
    e.preventDefault();
    limparErros(raiz); erroGeral.hidden = true;
    const v = validarNovaSenha(nova.value, repita.value);
    if (v) { erroCampo(raiz, v.campo === 'senha' ? 'nova' : 'repita', v.mensagem); tremer(cartao); (v.campo === 'senha' ? nova : repita).focus(); return; }
    salvar.disabled = true; salvar.classList.add('loading'); salvar.querySelector('.rot')?.replaceChildren(document.createTextNode('Salvando…'));
    progresso.iniciar();
    try {
      await ctx.acesso.definirSenha(nova.value);
      progresso.concluir();
      await ctx.acesso.finalizarPrimeiroAcesso();
    } catch (err) {
      progresso.concluir();
      const msg = /** @type {any} */ (err)?.message || 'Não foi possível definir a senha. Tente novamente.';
      erroGeral.hidden = false;
      erroGeral.innerHTML = html`${ic('warning-circle')}<span>${msg}</span>`.toString();
      tremer(cartao);
      salvar.disabled = false; salvar.classList.remove('loading'); salvar.querySelector('.rot')?.replaceChildren(document.createTextNode('Salvar'));
      nova.focus();
    }
  }
  form.addEventListener('submit', enviar);
  const aoSair = () => ctx.acesso.sair();
  $('#sair', raiz)?.addEventListener('click', aoSair);
  nova.focus();
  return { destruir() { nova.removeEventListener('input', aoDigitar); repita.removeEventListener('input', aoDigitar); form.removeEventListener('submit', enviar); desligar.forEach((f) => f()); moldura.destruir(); } };
}
