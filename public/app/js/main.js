// @ts-check
/**
 * Bootstrap da SPA: estado, tema, catálogo, sessão, casca (barra lateral + topo), atalhos e roteador.
 * A sessão é a do `back_auth` (chaves `dsn-auth-*`, compartilhadas com o sistema antigo — RNB-012).
 * Login, primeiro acesso e logout (com `wipe`) são orquestrados aqui e usados pelas telas via `ctx.acesso`.
 */
import { DEV, API } from './config.js';
import { carregarEstado, ESTADO, CHAVES, store } from './core/store.js';
import { criarApi } from './core/api.js';
import { criarRoteador, resolver, caminhoDoHash, rotaConhecida } from './core/router.js';
import { criarAtalhos } from './core/keys.js';
import { contar, animarBarras, progresso, wipe, reduzido, sleep } from './core/motion.js';
import { sincronizarTemaUI, alternarTema } from './core/tema.js';
import { carregarCatalogo } from './core/catalogo.js';
import { decidirAcesso } from './core/acesso.js';
import { fecharTudo } from './core/camadas.js';
import { sessaoVigente, salvarSessao, limparSessao, atualizarUsuario, avisarLogin, guardarDestino, consumirDestino, fazerLogin, alterarSenha } from './core/auth.js';
import { $ } from './core/dom.js';
import { iniciarTooltip } from './ui/tooltip.js';
import { iniciarSpotlight } from './ui/spotlight.js';
import { mostrarSkeleton } from './ui/skeleton.js';
import { toast } from './ui/toast.js';
import { iniciarCasca } from './features/shell/casca.js';
import { conteudo404 } from './features/shell/nao-encontrada.js';
import { ROTAS } from './rotas.js';

/** Erro global (modal). O módulo do modal só é baixado quando precisa; se nem isso der (sem rede), cai no aviso. @param {string} msg @param {string} codigo */
const erroGlobal = (msg, codigo) => import('./ui/modal.js').then((m) => m.erroGlobal(msg, codigo)).catch(() => toast('erro', msg, codigo));


carregarEstado();
sincronizarTemaUI();
iniciarTooltip();
iniciarSpotlight();

/** @type {any} */
let usuario = sessaoVigente();
ESTADO.usuario = usuario;
/** @type {ReturnType<typeof iniciarCasca> | null} */
let casca = null;
/** @type {ReturnType<typeof criarRoteador>} */
let roteador;
/** Destino pós-login, resolvido na etapa "Montando painel" e consumido ao concluir. */
let destinoFinal = '/projetos';

/**
 * Sessão encerrada de fora (401 em chamada de dados): limpa tudo e volta ao login com aviso.
 * Na Macro View (TV) NÃO se volta mudo ao login: a própria tela mostra a faixa "Sessão expirada" e segue girando (MAC-06).
 */
function sessaoInvalida() {
  if (ESTADO.rota === '/macro-view') { document.dispatchEvent(new CustomEvent('noir:sessao-expirada')); return; }
  limparSessao();
  avisarLogin('info', 'Sua sessão expirou. Entre novamente.');
  usuario = null; ESTADO.usuario = null;
  destruirCasca();
  roteador?.ir('/login');
}

const api = criarApi({
  bases: Object.values(API),
  obterToken: () => store.texto(CHAVES.token),
  aoSessaoInvalida: sessaoInvalida,
});

/** @type {{ projetos: any[] }} */
let catalogo = { projetos: [] };
try { catalogo = await carregarCatalogo(); } catch (e) {
  console.error(e);
  erroGlobal('Não foi possível carregar a lista de projetos. Recarregue a página.', 'ERR_CATALOGO');
}
ESTADO.catalogo = catalogo;

// Nome, e-mail, cargo ou tipo mudaram (lidos de GET /auth/me ou editados no perfil): atualiza o objeto que a casca já guarda e o botão do topo.
document.addEventListener('noir:usuario', () => {
  const novo = sessaoVigente();
  if (!usuario || !novo) return;
  Object.assign(usuario, novo);
  ESTADO.usuario = usuario;
  casca?.topbar.atualizarUsuario(usuario);
});

const atalhos = criarAtalhos({ aoAcorde: (on) => casca?.mostrarDica(on) });
atalhos.registrar({ id: 'global.tema', tecla: 't', aoAcionar: () => alternarTema() });

/** @param {'auth'|'shell'|'macro'|'tablet'} camada */
function mostrarCamada(camada) {
  ['auth', 'shell', 'macro', 'tablet'].forEach((c) => { const el = $(`#${c}`); if (el) el.hidden = c !== camada; });
  document.body.classList.toggle('in-shell', camada === 'shell');
}

const ir = (/** @type {string} */ r) => roteador.ir(r);

function montarCasca() {
  if (casca || !usuario || usuario.tipo === 'turno') return; // conta de turno vive só no tablet, sem casca
  casca = iniciarCasca({ catalogo, usuario, atalhos, ir, sair, api, rotaConhecida: (r) => rotaConhecida(r, ROTAS) });
}
function destruirCasca() {
  casca?.destruir();
  casca = null;
}

/** Logout animado (AUT-11): a casca esmaece, o "wipe" cobre a tela, a sessão é limpa e o login aparece. */
async function sair() {
  fecharTudo();
  const shell = $('#shell');
  if (!reduzido()) { shell?.classList.add('saindo'); await sleep(450); }
  await wipe(async () => {
    limparSessao();
    usuario = null; ESTADO.usuario = null;
    destruirCasca();
    shell?.classList.remove('saindo');
    roteador.ir('/login');
  });
  toast('info', 'Sessão encerrada');
}

/** Funções que as telas de acesso usam (login, primeiro acesso, conta). */
const acesso = {
  autenticar: (/** @type {string} */ login, /** @type {string} */ senha) => fazerLogin(api, API.auth, login, senha),
  carregarProjetos: async () => ({ total: catalogo.projetos.length }),
  /** Etapa "Montando painel": grava a sessão, monta a casca e pré-carrega a tela de destino (trabalho real). */
  async prepararPainel(/** @type {{ token: string, usuario: any }} */ s) {
    salvarSessao(s.token, s.usuario);
    usuario = s.usuario; ESTADO.usuario = usuario;
    if (s.usuario.tipo === 'turno') destinoFinal = '/tablet';
    else destinoFinal = s.usuario.precisaTrocarSenha ? '/primeiro-acesso' : consumirDestino(ROTAS);
    if (!s.usuario.precisaTrocarSenha) montarCasca();
    const alvo = resolver(caminhoDoHash(destinoFinal), ROTAS);
    await alvo?.rota.carregar?.();
  },
  async concluir() {
    await wipe(async () => { roteador.ir(destinoFinal); });
    if (!usuario?.precisaTrocarSenha) toast('sucesso', `Olá, ${(usuario?.nome || usuario?.login || '').split(' ')[0]}`, 'Sessão iniciada.');
  },
  definirSenha: async (/** @type {string} */ novaSenha) => { await alterarSenha(api, API.auth, { novaSenha }); },
  async finalizarPrimeiroAcesso() {
    usuario = atualizarUsuario({ precisaTrocarSenha: false }) || usuario; ESTADO.usuario = usuario;
    montarCasca();
    const destino = consumirDestino(ROTAS);
    await wipe(async () => { roteador.ir(destino); });
    toast('sucesso', 'Senha definida com sucesso', 'Você já pode usar o painel com a nova senha.');
  },
  alterarSenha: async (/** @type {{ senhaAtual: string, novaSenha: string }} */ c) => { await alterarSenha(api, API.auth, c); },
  criarUsuario: async (/** @type {any} */ dados) => { const r = await api.post(`${API.auth}/auth/usuarios`, dados); return r.dados && r.dados.data; },
  alternarSidebar: (/** @type {boolean|undefined} */ v) => casca?.sidebar.alternar(v),
  sair,
};

roteador = criarRoteador({
  rotas: ROTAS,
  ambienteDev: DEV,
  ganchos: {
    guard: (rota) => {
      const u = sessaoVigente();
      if (!u && usuario) { usuario = null; ESTADO.usuario = null; destruirCasca(); }
      if (u) { usuario = u; ESTADO.usuario = u; if (!u.precisaTrocarSenha) montarCasca(); }
      const d = decidirAcesso(rota, usuario, { telaLogin: true, telaPrimeiroAcesso: true });
      if (d !== true && d.para === '/login') guardarDestino(location.hash, ROTAS);
      return d;
    },
    aoCamada: mostrarCamada,
    aoTitulo: (t) => { document.title = `${t} · Painel Operacional`; },
    aoNavegar: (rota) => { progresso.iniciar(); casca?.aoNavegar(rota); },
    skeleton: mostrarSkeleton,
    contexto: () => ({ api, catalogo, usuario, acesso, atalhos }),
    aposRender: (view) => { contar(view); animarBarras(view); progresso.concluir(); },
    aviso: (msg) => toast('info', msg),
    aoErro: (e) => {
      console.error(e);
      progresso.concluir();
      erroGlobal('Não foi possível abrir esta tela. Tente novamente.', 'ERR_TELA');
    },
    aoNaoEncontrada: () => {
      document.title = 'Página não encontrada · Painel Operacional';
      progresso.concluir();
      if (!usuario) { roteador.ir('/login'); return; }
      mostrarCamada('shell');
      casca?.aoNavegar({ caminho: '/404', camada: 'shell', acesso: 'publica', titulo: 'Página não encontrada' });
      const view = $('#view');
      if (view) view.innerHTML = conteudo404(location.hash).toString();
    },
  },
});

roteador.iniciar();

// Facilita inspeção no console durante o desenvolvimento (não existe em produção).
if (DEV) /** @type {any} */ (window).__noir = { api, roteador, atalhos, get casca() { return casca; }, catalogo };
