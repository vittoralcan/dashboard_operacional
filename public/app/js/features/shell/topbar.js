// @ts-check
import { $ } from '../../core/dom.js';
import { html, raw } from '../../core/html.js';
import { textoVivo, pedirAtualizacao } from '../../core/vivo.js';
import { ESTADO } from '../../core/store.js';
import { ic } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { toast } from '../../ui/toast.js';
import { seloEmBreve } from '../../ui/embreve.js';
import { ativo } from '../../config/recursos.js';

/**
 * Barra superior (NAV-03/04/05): menu mobile, migalhas, "Ao vivo" (idade do dado — RNB-010),
 * paleta, sino (Em breve), configurações e botão do usuário (avatar ao lado do nome — USR-01).
 *
 * @param {{ usuario: { nome?: string, login?: string } | null, aoMenuMobile: () => void, aoPaleta: () => void,
 *           aoConfig: () => void, aoNotificacoes: (g: HTMLElement) => void, aoUsuario: (g: HTMLElement) => void }} cfg
 */
export function iniciarTopbar(cfg) {
  const barra = /** @type {HTMLElement} */ ($('.topbar'));
  const u = cfg.usuario;
  const nome = (u && (u.nome || u.login)) || 'Visitante';

  barra.innerHTML = html`
    <button class="icon-btn only-mobile" data-acao="menu" aria-label="Abrir menu">${ic('list')}</button>
    <nav class="crumbs" id="crumbs" aria-label="Trilha de navegação"></nav>
    <div class="tb-right">
      <div class="live" id="live" role="status" aria-live="off">
        <span class="dot" aria-hidden="true"></span><b class="lbl-full">Ao vivo</b><span class="dim lbl-full" aria-hidden="true">·</span><span class="t" id="liveTxt">aguardando dados</span>
        <button class="icon-btn" id="btnRefresh" data-acao="atualizar" aria-label="Atualizar dados" data-tip="Atualizar agora">${ic('arrow-clockwise')}</button>
      </div>
      <button class="icon-btn tb-hide-sm" data-acao="paleta" aria-label="Buscar (Ctrl+K)" data-tip="Buscar">${ic('magnifying-glass')}</button>
      <button class="icon-btn tb-hide-sm" data-acao="config" aria-label="Configurações" data-tip="Configurações · ,">${ic('gear-six')}</button>
      <button class="icon-btn" data-acao="notificacoes" id="btnNotif" aria-haspopup="dialog" aria-expanded="false" aria-label="${ativo('notificacoes') ? 'Notificações' : 'Notificações — em breve'}" data-tip="${ativo('notificacoes') ? 'Notificações · N' : 'Notificações · em breve'}">${ic('bell')}</button>
      <button class="user-btn" data-acao="usuario" id="btnUser" aria-haspopup="menu" aria-expanded="false" aria-label="${`Menu do usuário — ${nome}`}">
        ${avatar({ nome, semente: (u && u.login) || nome, tamanho: 28, online: !!u })}<span class="nm">${nome}</span>${ic('caret-down')}
      </button>
    </div>`.toString();

  const crumbs = /** @type {HTMLElement} */ ($('#crumbs'));
  const txt = /** @type {HTMLElement} */ ($('#liveTxt'));
  const atualizarTexto = () => { txt.textContent = textoVivo(ESTADO.atualizadoEm); };
  const timer = setInterval(atualizarTexto, 1000);
  document.addEventListener('noir:atualizado', atualizarTexto);

  barra.addEventListener('click', (e) => {
    const a = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest('[data-acao]'));
    if (!a) return;
    const k = a.dataset.acao;
    if (k === 'menu') cfg.aoMenuMobile();
    else if (k === 'paleta') cfg.aoPaleta();
    else if (k === 'config') cfg.aoConfig();
    else if (k === 'notificacoes') cfg.aoNotificacoes(a);
    else if (k === 'usuario') cfg.aoUsuario(a);
    else if (k === 'atualizar') {
      a.classList.add('girando');
      const tratado = pedirAtualizacao();
      setTimeout(() => a.classList.remove('girando'), 700);
      if (!tratado) toast('info', 'Nada para atualizar nesta tela', 'Os dados aparecem aqui quando a tela tiver leituras.');
    }
  });

  return {
    /** @param {[string, string|null, string?][]} lista */
    migalhas(lista) {
      crumbs.innerHTML = html`${lista.map((p, i) => {
        const ultimo = i === lista.length - 1;
        const icone = p[2] ? ic(p[2]) : '';
        const sep = i ? html`<span class="div" aria-hidden="true">${ic('caret-right')}</span>` : '';
        return html`${sep}${ultimo || !p[1] ? html`<span class="cur" ${ultimo ? raw('aria-current="page"') : ''}>${icone}${p[0]}</span>` : html`<a href="${`#${p[1]}`}">${icone}${p[0]}</a>`}`;
      })}`.toString();
    },
    atualizarTexto,
    /** Contador de não lidas no sino (NTF-01). @param {number} n */
    definirNaoLidas(n) {
      const b = $('#btnNotif');
      if (!b) return;
      b.querySelector('.badge-count')?.remove();
      if (n > 0) { const s = document.createElement('span'); s.className = 'badge-count'; s.setAttribute('aria-hidden', 'true'); s.textContent = n > 9 ? '9+' : String(n); b.appendChild(s); }
      const rotulo = n > 0 ? `Notificações — ${n} ${n === 1 ? 'não lida' : 'não lidas'}` : 'Notificações';
      b.setAttribute('aria-label', rotulo);
      b.setAttribute('data-tip', n > 0 ? `${n} ${n === 1 ? 'notificação não lida' : 'notificações não lidas'} · N` : 'Notificações · N');
    },
    /** Nome/avatar do botão do usuário depois que o perfil mudou (editou o nome, cargo vindo do servidor…). @param {{ nome?: string, login?: string }} usuario */
    atualizarUsuario(usuario) {
      const b = $('#btnUser');
      if (!b) return;
      const nm = usuario.nome || usuario.login || 'Visitante';
      b.setAttribute('aria-label', `Menu do usuário — ${nm}`);
      b.innerHTML = html`${avatar({ nome: nm, semente: usuario.login || nm, tamanho: 28, online: true })}<span class="nm">${nm}</span>${ic('caret-down')}`.toString();
    },
    destruir() { clearInterval(timer); document.removeEventListener('noir:atualizado', atualizarTexto); barra.replaceWith(barra.cloneNode(false)); },
  };
}

/** Conteúdo do popover do sino: a central de notificações ainda não existe (NTF-01 depende do backend). */
export function conteudoNotificacoes() {
  return html`<div class="notif-h"><b>Notificações</b>${seloEmBreve('notificacoes')}</div>
    <div class="empty" style="padding:36px 20px"><div class="ico-tile lg accent">${ic('bell')}</div><h3>Alertas em tempo real</h3><p>Avisos do Captura, do Lumen e das APIs aparecerão aqui, com um clique para abrir o item no fluxograma.</p></div>
    <div class="notif-f"><span class="dim" style="font-size:12px">Chega com o backend novo.</span></div>`;
}
