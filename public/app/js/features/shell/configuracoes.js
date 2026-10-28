// @ts-check
import { $ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { ESTADO } from '../../core/store.js';
import { definirMacroIntervalo, sincronizacaoLigada, definirSincronizacao } from '../../core/preferencias.js';
import { definirTema, sincronizarTemaUI } from '../../core/tema.js';
import { abrirGaveta } from '../../ui/drawer.js';
import { ligarSwitch } from '../../ui/controles.js';
import { avatar } from '../../ui/avatar.js';
import { ic } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';

export const INTERVALOS_MACRO = [5, 8, 10, 15, 30];

/**
 * Gaveta de Configurações (USR-04/05): identidade, aparência (tema, barra lateral), Macro View
 * (tempo por tela), administração e rodapé com Sair. As preferências ficam neste navegador e, com
 * "Acompanhar em outros computadores" ligado, também na conta (`PATCH /auth/me/preferencias`).
 *
 * @param {{ usuario: any, admin: boolean, ir: (r: string) => void, alternarSidebar: (v?: boolean) => void,
 *           aoAtalhos: () => void, aoSair: () => void }} c
 */
export function abrirConfiguracoes(c) {
  const u = c.usuario;
  const nome = (u && (u.nome || u.login)) || 'Visitante';
  const detalhe = [u && u.cargo, u && u.login].filter(Boolean).join(' · ') || 'Sem sessão neste navegador';

  const g = abrirGaveta({
    eyebrow: 'Preferências', titulo: 'Configurações',
    corpo: html`
      <div class="set-sec">
        <div class="set-row" style="justify-content:flex-start;gap:12px">${avatar({ nome, semente: (u && u.login) || nome, tamanho: 42, online: !!u })}
          <div class="tx"><b>${nome}</b><span>${detalhe}</span></div>${c.admin ? html`<span class="selo accent nodot" style="margin-left:auto">Admin</span>` : ''}</div>
      </div>
      <div class="set-sec"><span class="eyebrow">${ic('moon')} Aparência</span>
        <div class="set-row"><div class="tx"><b>Tema</b><span data-tema-lbl>—</span></div>
          <div class="theme-tg" role="group" aria-label="Tema"><button data-tema="dark" aria-pressed="false" aria-label="Escuro">${ic('moon')}</button><button data-tema="light" aria-pressed="false" aria-label="Claro">${ic('sun')}</button></div></div>
        <div class="set-row"><div class="tx"><b>Barra lateral recolhida</b><span>Atalho <kbd>[</kbd></span></div><button class="switch" role="switch" aria-checked="false" data-sw="sidebar" aria-label="Barra lateral recolhida"></button></div>
        <div class="set-row"><div class="tx"><b>Acompanhar em outros computadores</b><span>Salvar estas preferências na sua conta</span></div><button class="switch" role="switch" aria-checked="${sincronizacaoLigada()}" data-sw="sync" aria-label="Salvar preferências na minha conta"></button></div>
      </div>
      <div class="set-sec"><span class="eyebrow">${ic('monitor-play')} Macro View</span>
        <div class="field"><label class="lbl" for="cfg-macro">Tempo de tela do modo Macro View</label>
          <select class="native" id="cfg-macro">${INTERVALOS_MACRO.map((s) => html`<option value="${s}">${`${s} segundos por tela`}</option>`)}</select>
          <span class="field-hint">Rotação BOREAL → ATLAS → COBALTO no modo TV.</span></div>
        <button class="btn" data-k="macro">${ic('play')}Iniciar Macro View</button>
      </div>
      <div class="set-sec"><span class="eyebrow">${ic('shield-check')} Administração</span>
        ${c.admin ? html`<button class="btn" data-k="novo">${ic('user-plus')}Criar novo usuário</button>` : html`<p class="muted" style="font-size:12.5px">Disponível apenas para administradores.</p>`}
        <button class="btn" data-k="atalhos">${ic('keyboard')}Ver atalhos de teclado</button>
      </div>`,
    rodape: html`${avatar({ nome, semente: (u && u.login) || nome, tamanho: 32 })}<div class="who"><b>${nome}</b><span>${(u && u.email) || (u && u.login ? `@${u.login}` : '')}</span></div><button class="btn sm" data-k="sair">${ic('sign-out')}Sair</button>`,
  });

  const el = g.el;
  sincronizarTemaUI();
  const sw = /** @type {HTMLElement} */ ($('[data-sw="sidebar"]', el));
  sw.setAttribute('aria-checked', String(ESTADO.sidebarRecolhida));
  ligarSwitch(sw, (v) => c.alternarSidebar(v));
  ligarSwitch(/** @type {HTMLElement} */ ($('[data-sw="sync"]', el)), (v) => { definirSincronizacao(v); toast('info', v ? 'Preferências na conta' : 'Preferências só neste navegador'); });
  const sel = /** @type {HTMLSelectElement} */ ($('#cfg-macro', el));
  sel.value = String(ESTADO.macroIntervalo);
  sel.addEventListener('change', () => {
    definirMacroIntervalo(Number(sel.value));
    toast('sucesso', 'Preferência salva', `Macro View: ${sel.value} segundos por tela${sincronizacaoLigada() ? ' (na sua conta)' : ' (neste navegador)'}.`);
  });
  el.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const tema = /** @type {HTMLElement|null} */ (t.closest('[data-tema]'));
    if (tema) { definirTema(/** @type {'dark'|'light'} */ (tema.dataset.tema), /** @type {MouseEvent} */ (e)); return; }
    const k = /** @type {HTMLElement|null} */ (t.closest('[data-k]'));
    if (!k) return;
    const acao = k.dataset.k;
    if (acao === 'sair') { g.fechar(); c.aoSair(); return; }
    g.fechar();
    if (acao === 'macro') c.ir('/macro-view');
    else if (acao === 'novo') c.ir('/usuarios/novo');
    else if (acao === 'atalhos') setTimeout(c.aoAtalhos, 60);
  });
  return g;
}
