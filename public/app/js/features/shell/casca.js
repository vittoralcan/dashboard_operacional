// @ts-check
import { $ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { ESTADO, CHAVES, store } from '../../core/store.js';
import { alternarTema } from '../../core/tema.js';
import { acordes, itensPaletaCatalogo, migalhas } from '../../core/catalogo.js';
import { ehAdmin } from '../../core/acesso.js';
import { zerarAtualizado } from '../../core/vivo.js';
import { caminhoDoHash } from '../../core/router.js';
import { ativo } from '../../config/recursos.js';
import { toast } from '../../ui/toast.js';
import { iniciarSidebar } from './sidebar.js';
import { iniciarTopbar } from './topbar.js';

/**
 * Monta a casca (barra lateral + topo), os atalhos globais e a paleta, e devolve o gancho
 * `aoNavegar` que o roteador chama a cada rota. Chamada uma vez no bootstrap, depois de o
 * catálogo e a sessão serem lidos.
 *
 * @param {{ catalogo: import('../../core/catalogo.js').Catalogo, usuario: any, atalhos: ReturnType<typeof import('../../core/keys.js').criarAtalhos>,
 *           api: ReturnType<typeof import('../../core/api.js').criarApi>, rotaConhecida: (r: string) => boolean,
 *           ir: (r: string) => void, sair: () => void }} c
 */
export function iniciarCasca(c) {
  // Peças que só aparecem sob demanda (paleta, menus, gaveta, atalhos) carregam na primeira vez — orçamento da casca (RNB-015).
  const menus = () => import('./menus.js');
  const abrirAtalhos = async (/** @type {{ admin: boolean }} */ o) => (await menus()).abrirAtalhos(o);
  const abrirNotificacoes = async (/** @type {HTMLElement} */ g) => (await import('./notificacoes.js')).abrirNotificacoes(g);
  const abrirWorkspace = async (/** @type {HTMLElement} */ g, /** @type {any} */ o) => (await menus()).abrirWorkspace(g, o);
  const abrirMenuUsuario = async (/** @type {HTMLElement} */ g, /** @type {any} */ o) => (await menus()).abrirMenuUsuario(g, o);

  const admin = ehAdmin(c.usuario);
  const caminhoAtual = () => caminhoDoHash(location.hash);

  /** @type {import('../../core/paleta.js').ItemPaleta[]} */
  let fases = [];
  const paleta = async () => {
    if (!fases.length) fases = await (await import('../fluxo/fases-paleta.js')).itensFases(c.ir).catch(() => []); // "Fases" (FLX-14): lidas sob demanda
    return abrirPaletaComFases();
  };
  const abrirPaletaComFases = async () => (await import('../../ui/palette.js')).abrirPaleta(() => [
    ...itensPaletaCatalogo(c.catalogo, c.ir, { admin }),
    ...fases,
    { id: 'act.tema', grupo: 'Ações', titulo: 'Alternar tema', icone: ESTADO.tema === 'dark' ? 'sun' : 'moon', atalho: 'T', aoExecutar: () => alternarTema() },
    { id: 'act.sidebar', grupo: 'Ações', titulo: ESTADO.sidebarRecolhida ? 'Expandir barra lateral' : 'Recolher barra lateral', icone: 'sidebar-simple', atalho: '[', aoExecutar: () => sidebar.alternar() },
    { id: 'act.config', grupo: 'Ações', titulo: 'Configurações', icone: 'gear-six', atalho: ',', aoExecutar: () => config() },
    { id: 'act.atalhos', grupo: 'Ações', titulo: 'Atalhos de teclado', icone: 'keyboard', atalho: '?', aoExecutar: () => abrirAtalhos({ admin }) },
    { id: 'act.notif', grupo: 'Ações', titulo: 'Notificações', icone: 'bell', atalho: 'N', ...(ativo('notificacoes') ? { aoExecutar: () => { const b = $('#btnNotif'); if (b) abrirNotificacoes(b); } } : { emBreve: 'notificacoes' }) },
    { id: 'act.sair', grupo: 'Ações', titulo: 'Sair', icone: 'sign-out', aoExecutar: () => c.sair() },
  ], { contexto: topbar.contexto() });

  const config = async () => (await import('./configuracoes.js')).abrirConfiguracoes({ usuario: c.usuario, admin, ir: c.ir, alternarSidebar: (v) => sidebar.alternar(v), aoAtalhos: () => abrirAtalhos({ admin }), aoSair: c.sair });

  const sidebar = iniciarSidebar({
    catalogo: c.catalogo, admin, aoPaleta: paleta, aoConfig: config,
    aoAtalhos: () => abrirAtalhos({ admin }),
    aoWorkspace: (g) => abrirWorkspace(g, { catalogo: c.catalogo, caminho: caminhoAtual(), ir: c.ir }),
  });

  const topbar = Object.assign(iniciarTopbar({
    usuario: c.usuario,
    aoMenuMobile: () => sidebar.alternar(),
    aoPaleta: paleta, aoConfig: config,
    aoNotificacoes: abrirNotificacoes,
    aoUsuario: (g) => abrirMenuUsuario(g, { usuario: c.usuario, admin, ir: c.ir, aoConfig: config, aoAtalhos: () => abrirAtalhos({ admin }), aoTema: (e) => alternarTema(e), aoSair: c.sair }),
  }), { contexto: () => ($('.crumbs .cur')?.textContent || '').trim() || 'Painel' });

  // ---- atalhos globais (PRD-02) ----
  const k = c.atalhos;
  k.registrar({ id: 'casca.paleta', tecla: 'k', mod: true, aoAcionar: () => paleta() });
  k.registrar({ id: 'casca.sidebar', tecla: '[', aoAcionar: () => sidebar.alternar() });
  k.registrar({ id: 'casca.config', tecla: ',', aoAcionar: () => config() });
  k.registrar({ id: 'casca.atalhos', tecla: '?', aoAcionar: () => abrirAtalhos({ admin }) });
  k.registrar({ id: 'casca.notif', tecla: 'n', aoAcionar: () => { const b = $('#btnNotif'); if (b) abrirNotificacoes(b); } });
  for (const [letra, rota] of Object.entries(acordes(c.catalogo, { admin }))) {
    k.registrar({ id: `casca.ir.${letra}`, acorde: letra, aoAcionar: () => c.ir(rota) });
  }

  // ---- dica do acorde G ----
  const dica = $('#chordHint');
  const mostrarDica = (/** @type {boolean} */ on) => {
    if (!dica) return;
    if (on) dica.innerHTML = html`<kbd>G</kbd> então <span class="mono">P · S · E · M · B · H · D · I · A · O · R${admin ? ' · U' : ''}</span>`.toString();
    dica.classList.toggle('on', on);
  };

  // Central de notificações e preferências na conta: carregam depois da casca (fora do peso inicial).
  let vivo = true;
  /** @type {{ destruir: () => void }|null} */
  let central = null;
  import('./notificacoes.js').then((m) => { if (vivo) central = m.iniciarNotificacoes({ api: c.api, catalogo: c.catalogo, ir: c.ir, rotaConhecida: c.rotaConhecida, aoContar: (n) => topbar.definirNaoLidas(n) }); }).catch((e) => console.warn(e));
  /** @type {{ destruir: () => void }|null} */
  let prefs = null;
  import('./preferencias.js').then((m) => {
    if (!vivo) return;
    const p = m.iniciarPreferencias({ api: c.api, aplicarSidebar: (v) => { ESTADO.sidebarRecolhida = v; store.gravarTexto(CHAVES.sidebar, v ? '1' : '0'); sidebar.aplicarRecolhida(); } });
    prefs = p; p.carregar();
  }).catch((e) => console.warn(e));

  document.getElementById('shell')?.removeAttribute('data-casca');
  return {
    sidebar, topbar, mostrarDica, paleta, config,
    /** Desmonta a casca (logout/sessão expirada): atalhos, listeners e conteúdo. */
    destruir() {
      vivo = false; central?.destruir(); prefs?.destruir();
      c.atalhos.removerPrefixo('casca.');
      topbar.destruir();
      sidebar.destruir();
      mostrarDica(false);
      document.getElementById('shell')?.setAttribute('data-casca', 'pendente');
    },
    /** Chamado pelo roteador a cada navegação. @param {import('../../core/router.js').Rota} rota */
    aoNavegar(rota) {
      const caminho = caminhoAtual();
      sidebar.atualizar(caminho);
      sidebar.fecharMenuMobile();
      topbar.migalhas(migalhas(caminho, c.catalogo, rota.titulo));
      zerarAtualizado();
      topbar.atualizarTexto();
    },
    /** Aviso "sessão encerrada" após o logout. */
    avisoSaida() { toast('info', 'Sessão encerrada'); },
  };
}
