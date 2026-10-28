// @ts-check
import { avisarPreferencia } from '../../core/preferencias.js';
import { $, MOD } from '../../core/dom.js';
import { html, raw, esc } from '../../core/html.js';
import { secoesSidebar, itemAtivo, projetoAtual } from '../../core/catalogo.js';
import { ESTADO, CHAVES, store } from '../../core/store.js';
import { empilhar, desempilhar } from '../../core/camadas.js';
import { ic } from '../../ui/icons.js';
import { LOGO } from '../../ui/logo.js';
import { seloEmBreve, atributosEmBreve } from '../../ui/embreve.js';
import { EVENTO_CONTADORES, lerContador, limparContadores } from '../../core/contadores.js';

/**
 * Barra lateral (NAV-01/02/05): seções, item ativo com barra de acento, projeto atual no
 * "workspace switcher", recolher (`[`, persistido em `dsn-ui-sidebar`) e gaveta no mobile (< 1024 px).
 * Contadores por item (NAV-10): "em andamento" por fluxo e `online/total` das APIs (ponto vermelho se alguma estiver fora),
 * entregues por quem já leu o dado (`core/contadores.js`) — a barra não consulta nada.
 *
 * @param {{ catalogo: import('../../core/catalogo.js').Catalogo, admin: boolean,
 *           aoPaleta: () => void, aoWorkspace: (gatilho: HTMLElement) => void, aoConfig: () => void, aoAtalhos: () => void }} cfg
 */
export function iniciarSidebar(cfg) {
  const aside = /** @type {HTMLElement} */ ($('#sidebar'));
  const shell = /** @type {HTMLElement} */ ($('#shell'));
  /** @type {ReturnType<typeof empilhar>|null} */
  let camadaMobile = null;

  aside.innerHTML = html`
    <div class="sb-top">
      <button class="ws-switch" id="wsSwitch" aria-haspopup="menu" aria-expanded="false" aria-label="Trocar de projeto" data-tip="Trocar de projeto" data-tip-side="right">
        <span class="ws-logo">${LOGO}</span>
        <span class="ws-text"><span>Demo</span><span class="sep">·</span><span class="proj" id="wsProj">Todos</span></span>
        ${ic('caret-up-down')}
      </button>
    </div>
    <button class="sb-search" data-acao="paleta" aria-label="${`Buscar ou ir para (${MOD}+K)`}" data-tip="${`Buscar · ${MOD} K`}" data-tip-side="right">
      ${ic('magnifying-glass')}<span class="grow">Buscar ou ir para…</span><span class="kbds"><kbd>${MOD}</kbd><kbd>K</kbd></span>
    </button>
    <nav class="sb-nav" id="sbNav" aria-label="Navegação principal"></nav>
    <div class="sb-foot">
      <button class="sb-item" data-acao="atalhos" aria-label="Atalhos de teclado" data-tip="Atalhos de teclado · ?" data-tip-side="right">${ic('keyboard')}<span class="lbl">Atalhos de teclado</span><span class="kbds"><kbd>?</kbd></span></button>
      <div class="sb-foot-row">
        <button class="sb-item" data-acao="config" aria-label="Configurações" data-tip="Configurações · ," data-tip-side="right">${ic('gear-six')}<span class="lbl">Configurações</span><span class="kbds"><kbd>,</kbd></span></button>
        <button class="icon-btn sb-collapse" id="sbCollapse" data-acao="recolher" data-tip="Recolher · [" data-tip-side="right" aria-label="Recolher barra lateral">${ic('sidebar-simple')}</button>
      </div>
    </div>`.toString();

  const nav = /** @type {HTMLElement} */ ($('#sbNav'));

  /** @param {string} caminho */
  function desenharNav(caminho) {
    const secoes = secoesSidebar(cfg.catalogo, { admin: cfg.admin });
    nav.innerHTML = html`${secoes.map((s) => html`<div class="sb-sec"><div class="sb-sec-t"><span>${s.secao}</span>${s.extra ? html`<span>${s.extra}</span>` : ''}</div>${s.itens.map((it) => {
      if (it.desabilitado) {
        return html`<span class="sb-item disabled" role="link" aria-disabled="true" aria-label="${`${it.rotulo} — em breve`}" ${it.emBreve ? atributosEmBreve(it.emBreve) : raw(`data-tip="${esc(`${it.dica || it.rotulo} · Em breve`)}"`)} data-tip-side="right">${ic(it.icone)}<span class="lbl">${it.rotulo}</span>${it.emBreve ? seloEmBreve(it.emBreve, { semIcone: true }) : html`<span class="selo nodot" style="height:18px;font-size:10px">${it.selo || 'Em breve'}</span>`}</span>`;
      }
      const ativo = itemAtivo(it, caminho);
      return html`<a class="${`sb-item${ativo ? ' active' : ''}`}" href="${`#${it.rota}`}" aria-label="${it.aValidar ? `${it.rotulo} — grafo a validar` : it.rotulo}" ${ativo ? raw('aria-current="page"') : ''} data-tip="${it.dica || it.rotulo}" data-tip-side="right">${ic(it.icone)}<span class="lbl">${it.rotulo}</span>${it.aValidar ? raw('<span class="mini-dot warn" aria-label="grafo a validar"></span>') : ''}${it.chave ? raw(`<span class="mini-dot err" data-dot="${esc(it.chave)}" hidden></span><span class="cnt hide-h" data-cnt="${esc(it.chave)}" hidden></span>`) : ''}${it.atalho ? html`<span class="kbds">${it.atalho.split(' ').map((k) => html`<kbd>${k}</kbd>`)}</span>` : ''}</a>`;
    })}</div>`)}`.toString();
    const proj = $('#wsProj');
    if (proj) proj.textContent = projetoAtual(caminho, cfg.catalogo);
    pintarContadores();
  }

  /** Pinta os contadores já conhecidos nos itens da barra (e esconde os que não têm leitura). */
  function pintarContadores() {
    nav.querySelectorAll('[data-cnt]').forEach((el) => {
      const chave = /** @type {HTMLElement} */ (el).dataset.cnt || '';
      const c = lerContador(chave);
      const dot = nav.querySelector(`[data-dot="${CSS.escape(chave)}"]`);
      const a = el.closest('a');
      el.toggleAttribute('hidden', !c);
      el.classList.toggle('err-t', !!c && c.erro);
      el.textContent = c ? c.texto : '';
      dot?.toggleAttribute('hidden', !(c && c.erro));
      if (a) { const base = a.dataset.tipBase || (a.dataset.tipBase = a.dataset.tip || ''); a.dataset.tip = c ? `${base} · ${c.dica}` : base; }
    });
  }
  document.addEventListener(EVENTO_CONTADORES, pintarContadores);

  function aplicarRecolhida() {
    shell.classList.toggle('collapsed', ESTADO.sidebarRecolhida);
    const b = $('#sbCollapse');
    if (b) { b.setAttribute('aria-label', ESTADO.sidebarRecolhida ? 'Expandir barra lateral' : 'Recolher barra lateral'); b.dataset.tip = `${ESTADO.sidebarRecolhida ? 'Expandir' : 'Recolher'} · [`; }
    document.querySelectorAll('[data-sw="sidebar"]').forEach((s) => s.setAttribute('aria-checked', String(ESTADO.sidebarRecolhida)));
  }

  function fecharMenuMobile() {
    shell.classList.remove('menu-open');
    if (camadaMobile) { desempilhar(camadaMobile); camadaMobile = null; }
  }
  function abrirMenuMobile() {
    shell.classList.add('menu-open');
    camadaMobile = empilhar(fecharMenuMobile, aside, 'menu');
  }

  /** Recolhe/expande (desktop) ou abre/fecha a gaveta (mobile). @param {boolean} [forcar] */
  function alternar(forcar) {
    if (window.innerWidth < 1024) { if (shell.classList.contains('menu-open')) fecharMenuMobile(); else abrirMenuMobile(); return; }
    ESTADO.sidebarRecolhida = typeof forcar === 'boolean' ? forcar : !ESTADO.sidebarRecolhida;
    store.gravarTexto(CHAVES.sidebar, ESTADO.sidebarRecolhida ? '1' : '0');
    aplicarRecolhida();
    avisarPreferencia('sidebarRecolhida', ESTADO.sidebarRecolhida);
  }

  aside.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('a.sb-item')) { fecharMenuMobile(); return; }
    const ws = /** @type {HTMLElement|null} */ (t.closest('#wsSwitch'));
    if (ws) { cfg.aoWorkspace(ws); return; }
    const a = /** @type {HTMLElement|null} */ (t.closest('[data-acao]'));
    if (!a) return;
    fecharMenuMobile();
    if (a.dataset.acao === 'paleta') cfg.aoPaleta();
    else if (a.dataset.acao === 'config') cfg.aoConfig();
    else if (a.dataset.acao === 'atalhos') cfg.aoAtalhos();
    else if (a.dataset.acao === 'recolher') alternar();
  });
  $('#sbScrim')?.addEventListener('click', fecharMenuMobile);
  const aoRedimensionar = () => { if (window.innerWidth >= 1024) fecharMenuMobile(); };
  window.addEventListener('resize', aoRedimensionar);

  aplicarRecolhida();
  desenharNav('/');
  return {
    atualizar: desenharNav, alternar, aplicarRecolhida, fecharMenuMobile, abrirMenuMobile,
    /** Desfaz tudo (logout): tira o listener da janela e troca os nós por cópias vazias (sem handlers). */
    destruir() {
      window.removeEventListener('resize', aoRedimensionar);
      document.removeEventListener(EVENTO_CONTADORES, pintarContadores);
      limparContadores();
      fecharMenuMobile();
      const scrim = $('#sbScrim');
      scrim?.replaceWith(scrim.cloneNode(false));
      aside.replaceWith(aside.cloneNode(false));
    },
  };
}
