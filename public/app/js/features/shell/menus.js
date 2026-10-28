// @ts-check
import { MOD } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { ESTADO } from '../../core/store.js';
import { projetoAtual } from '../../core/catalogo.js';
import { abrirPopover } from '../../ui/popover.js';
import { abrirModal } from '../../ui/modal.js';
import { avatar } from '../../ui/avatar.js';
import { ic } from '../../ui/icons.js';
import { conteudoNotificacoes } from './topbar.js';

const kbd = (/** @type {string} */ a) => html`<span class="kbds">${a.split(' ').map((k) => html`<kbd>${k === 'Mod' ? MOD : k}</kbd>`)}</span>`;

/**
 * Menu do usuário (USR-02): cabeçalho com avatar/nome/e-mail, perfil, configurações, criar usuário
 * (só admin), tema, atalhos e Sair (mostra o login).
 * @param {HTMLElement} gatilho
 * @param {{ usuario: any, admin: boolean, ir: (r: string) => void, aoConfig: () => void, aoAtalhos: () => void, aoTema: (e: MouseEvent) => void, aoSair: () => void }} c
 */
export function abrirMenuUsuario(gatilho, c) {
  const u = c.usuario;
  const nome = (u && (u.nome || u.login)) || 'Visitante';
  const detalhe = (u && (u.email || (u.login ? `@${u.login}` : ''))) || 'Sem sessão neste navegador';
  abrirPopover(gatilho, html`
    <div class="menu-h" role="presentation">${avatar({ nome, semente: (u && u.login) || nome, tamanho: 34, online: !!u })}<div class="who"><b>${nome}</b><span>${detalhe}</span></div></div>
    <button class="menu-i" role="menuitem" data-k="perfil">${ic('user-circle')}<span class="grow">Meu perfil</span></button>
    <button class="menu-i" role="menuitem" data-k="config">${ic('gear-six')}<span class="grow">Configurações</span>${kbd(',')}</button>
    ${c.admin ? html`<button class="menu-i" role="menuitem" data-k="novo">${ic('user-plus')}<span class="grow">Criar novo usuário</span>${kbd('G U')}</button>` : ''}
    <div class="menu-sep" role="separator"></div>
    <button class="menu-i" role="menuitem" data-k="tema">${ic(ESTADO.tema === 'dark' ? 'sun' : 'moon')}<span class="grow">Alternar tema</span>${kbd('T')}</button>
    <button class="menu-i" role="menuitem" data-k="atalhos">${ic('keyboard')}<span class="grow">Atalhos de teclado</span>${kbd('?')}</button>
    <div class="menu-sep" role="separator"></div>
    <button class="menu-i danger" role="menuitem" data-k="sair">${ic('sign-out')}<span class="grow">Sair</span>${u && u.login ? html`<span class="mono dim" style="font-size:11px">${u.login}</span>` : ''}</button>`,
  { classe: 'user-pop', papel: 'menu', rotulo: 'Menu do usuário', aoAbrir: (el, fechar) => {
    el.style.width = '272px';
    el.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest('[data-k]'));
      if (!b) return;
      fechar();
      const k = b.dataset.k;
      if (k === 'perfil') c.ir('/perfil');
      else if (k === 'config') setTimeout(c.aoConfig, 60);
      else if (k === 'novo') c.ir('/usuarios/novo');
      else if (k === 'tema') c.aoTema(/** @type {MouseEvent} */ (e));
      else if (k === 'atalhos') setTimeout(c.aoAtalhos, 60);
      else if (k === 'sair') c.aoSair();
    });
  } });
}

/**
 * Troca de projeto (NAV-02).
 * @param {HTMLElement} gatilho
 * @param {{ catalogo: import('../../core/catalogo.js').Catalogo, caminho: string, ir: (r: string) => void }} c
 */
export function abrirWorkspace(gatilho, c) {
  const atual = projetoAtual(c.caminho, c.catalogo);
  const item = (/** @type {string} */ rot, /** @type {string} */ sub, /** @type {string} */ icone, /** @type {string} */ href, /** @type {string|undefined} */ atalho, /** @type {boolean} */ on) =>
    html`<button class="${`menu-i${on ? ' on' : ''}`}" role="menuitem" data-href="${href}">${ic(icone)}<span class="grow">${rot} ${sub ? html`<span class="dim" style="font-size:12px">${sub}</span>` : ''}</span>${on ? ic('check') : atalho ? kbd(atalho) : ''}</button>`;
  abrirPopover(gatilho, html`<div class="menu-t" role="presentation">Trocar de projeto</div>
    ${c.catalogo.projetos.map((p) => (p.status === 'ativo'
    ? item(p.sigla, `${p.modulos.length || p.fluxos.length} ${p.modulos.length ? 'módulos' : 'fluxos'}`, p.icone, p.rota, p.atalho, atual === p.sigla)
    : html`<button class="menu-i dis" role="menuitem" aria-disabled="true">${ic(p.icone)}<span class="grow">${p.sigla}</span><span class="selo nodot" style="height:18px;font-size:10px">Em breve</span></button>`))}
    <div class="menu-sep" role="separator"></div>
    ${item('Todos os projetos', '', 'squares-four', '/projetos', 'G P', atual === 'Todos')}
    ${item('Macro View', '', 'monitor-play', '/macro-view', 'G M', false)}`,
  { classe: 'ws-pop', alinhar: 'start', papel: 'menu', rotulo: 'Projetos', aoAbrir: (el, fechar) => {
    el.style.width = '268px';
    el.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest('[data-href]'));
      if (b) { fechar(); c.ir(/** @type {string} */ (b.dataset.href)); }
    });
  } });
}

/** Sino (NTF-01): a central ainda não existe — popover explicativo "Em breve". @param {HTMLElement} gatilho */
export function abrirNotificacoes(gatilho) {
  abrirPopover(gatilho, conteudoNotificacoes(), { classe: 'notif-pop', rotulo: 'Notificações', focar: 'button' });
}

/**
 * Lista de atalhos (PRD-03), agrupada. `admin` mostra "G U".
 * @param {{ admin: boolean }} c
 */
export function abrirAtalhos(c) {
  /** @type {[string, [string, string][]][]} */
  const grupos = [
    ['Geral', [[`${MOD} K`, 'Abrir a paleta de comandos'], ['T', 'Alternar tema claro/escuro'], ['[', 'Recolher/expandir a barra lateral'], [',', 'Abrir configurações'], ['N', 'Notificações'], ['?', 'Esta lista de atalhos'], ['Esc', 'Fechar a camada do topo']]],
    ['Navegação (G e depois…)', [['G P', 'Seleção de projetos'], ['G E', 'ATLAS'], ['G M', 'Macro View'], ['G B', 'Envio (Bridge)'], ['G O', 'Monitoramento de APIs'],...(c.admin ? /** @type {[string, string][]} */ ([['G U', 'Criar novo usuário']]) : [])]],
    ['Fluxograma', [['+  −', 'Aproximar / afastar'], ['0', 'Ajustar à tela'], [`${MOD} + roda`, 'Zoom no cursor'], ['Shift + roda', 'Rolar na horizontal']]],
    ['Macro View', [['← →', 'Tela anterior / próxima'], ['Espaço', 'Pausar / retomar'], ['Esc', 'Sair']]],
  ];
  abrirModal({
    tamanho: 'lg', eyebrow: 'Ajuda', titulo: 'Atalhos de teclado', sub: 'Teclas de uma letra ficam desligadas enquanto você digita em um campo ou com uma janela aberta.',
    corpo: html`<div class="keys-grid">${grupos.map(([t, itens]) => html`<h4>${t}</h4>${itens.map(([k, d]) => html`<div class="key-row"><span>${d}</span>${kbd(k.replace(/ {2}/g, ' '))}</div>`)}`)}</div>`,
    rodape: html`<span class="left">${ic('info')}Em teclado Mac, ${MOD} é a tecla ⌘.</span><button class="btn primary" data-fechar>Entendi</button>`,
  });
}
