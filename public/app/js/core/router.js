// @ts-check
import { fecharTudo } from './camadas.js';
import { $ } from './dom.js';
import { ESTADO } from './store.js';

/**
 * Roteador por hash (`#/rota`) — funciona em hospedagem estática e preserva o botão Voltar.
 * Contrato de uma tela: `export async function montar(view, ctx)` → `{ destruir() }`. O roteador cuida de abortar a tela anterior, fechar camadas,
 * título, skeleton e corrida entre navegações.
 *
 * @typedef {'auth'|'shell'|'macro'|'tablet'} Camada
 * @typedef {'publica'|'logado'|'admin'|'turno'|'gestao'} Acesso
 * @typedef {object} Rota
 * @property {string} caminho            ex.: '/boreal/digitalizacao/:vista?'
 * @property {Camada} camada
 * @property {Acesso} acesso
 * @property {string} titulo
 * @property {string} [skeleton]         'home' | 'hub' | 'modulo' | 'canvas' | 'lista'
 * @property {string} [instancia]       fluxo Captura: qual `config/fluxos/<instancia>.json` a tela usa
 * @property {boolean} [dev]             só aparece em ambiente de desenvolvimento
 * @property {string} [redireciona]      caminho para onde esta rota redireciona (ex.: '/' → '/projetos')
 * @property {() => Promise<{ montar: (view: HTMLElement, ctx: any) => any }>} [carregar]  obrigatório, exceto em rotas que redirecionam
 */

/**
 * Compila '/atlas/:instancia/:vista?' em { regex, nomes }. `:nome?` = segmento opcional.
 * @param {string} caminho
 */
export function compilar(caminho) {
  /** @type {string[]} */
  const nomes = [];
  const partes = caminho.split('/').filter(Boolean).map((p) => {
    if (p.startsWith(':')) {
      const opcional = p.endsWith('?');
      nomes.push(p.slice(1).replace('?', ''));
      return opcional ? '(?:/([^/]+))?' : '/([^/]+)';
    }
    return `/${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
  });
  return { regex: new RegExp(`^${partes.join('') || '/'}/?$`), nomes };
}

/** Extrai o caminho de um hash ('#/a/b?x=1' → '/a/b'). @param {string} hash */
export function caminhoDoHash(hash) {
  const s = String(hash || '').replace(/^#/, '').split('?')[0].trim();
  if (!s || s === '/') return '/';
  return `/${s.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

/**
 * Descobre a rota e os parâmetros. A primeira que casa vence (ordem da tabela).
 * @param {string} caminho @param {Rota[]} rotas
 * @returns {{ rota: Rota, params: Record<string,string> } | null}
 */
export function resolver(caminho, rotas) {
  for (const rota of rotas) {
    const { regex, nomes } = compilar(rota.caminho);
    const m = regex.exec(caminho);
    if (!m) continue;
    /** @type {Record<string,string>} */
    const params = {};
    nomes.forEach((n, i) => { if (m[i + 1] !== undefined) params[n] = decodeURIComponent(m[i + 1]); });
    return { rota, params };
  }
  return null;
}

/** Rota conhecida? (valida destino pós-login e destino de notificação — nunca confiar em valor externo). */
export const rotaConhecida = (/** @type {string} */ caminho, /** @type {Rota[]} */ rotas) => !!resolver(caminhoDoHash(caminho), rotas);

const MIN_SKELETON_MS = 300;

/**
 * @typedef {object} Ganchos
 * @property {(r: Rota, params: Record<string,string>) => true | { para: string, aviso?: string }} [guard]
 * @property {(camada: Camada) => void} [aoCamada]       liga/desliga as camadas (#auth, #shell, #macro, #tablet)
 * @property {(titulo: string) => void} [aoTitulo]
 * @property {(tipo: string, view: HTMLElement) => () => void} [skeleton]  esconde a `view`, mostra o skeleton ao lado e devolve quem o remove
 * @property {(r: Rota, params: Record<string,string>) => void} [aoNavegar]  sidebar, breadcrumbs…
 * @property {(view: HTMLElement) => void} [aposRender]  contar(), animarBarras()…
 * @property {(e: unknown, r: Rota) => void} [aoErro]
 * @property {(r: Rota|null) => void} [aoNaoEncontrada]
 * @property {() => any} [contexto]                       extras do ctx (api, estado…)
 * @property {(aviso: string) => void} [aviso]            toast de aviso do guard
 */

/**
 * @param {{ rotas: Rota[], ganchos?: Ganchos, ambienteDev?: boolean, janela?: Pick<Window,'addEventListener'|'removeEventListener'|'location'> }} cfg
 */
export function criarRoteador(cfg) {
  const ganchos = cfg.ganchos || {};
  const rotas = cfg.rotas.filter((r) => !r.dev || cfg.ambienteDev);
  const janela = cfg.janela || window;
  let token = 0;
  /** @type {{ destruir?: () => void } | null} */
  let telaAtual = null;
  /** @type {AbortController | null} */
  let abortar = null;
  /** @type {(() => void)[]} */
  let aoSairFns = [];
  /** Skeleton da navegação em curso: se outra navegação o atropela, é removido antes de seguir (senão a `view` ficava escondida). */
  let removerSkeletonAtual = () => {};

  const limparTela = () => {
    try { telaAtual?.destruir?.(); } catch (e) { /* tela já destruída */ }
    telaAtual = null;
    aoSairFns.forEach((f) => { try { f(); } catch (e) { /* ignora */ } });
    aoSairFns = [];
    abortar?.abort();
    abortar = null;
  };

  /** Vai para um caminho ('/projetos'). @param {string} caminho @param {{ substituir?: boolean }} [o] */
  function ir(caminho, o = {}) {
    const alvo = `#${caminho.startsWith('/') ? caminho : `/${caminho}`}`;
    if (janela.location.hash === alvo) { renderizar(); return; }
    if (o.substituir) janela.location.replace(alvo); else janela.location.hash = alvo;
  }

  async function renderizar() {
    const meu = ++token;
    const caminho = caminhoDoHash(janela.location.hash);
    const achada = resolver(caminho, rotas);

    if (!achada) {
      limparTela(); fecharTudo();
      ganchos.aoNaoEncontrada?.(null);
      return;
    }
    const { rota, params } = achada;
    if (rota.redireciona) { ir(rota.redireciona, { substituir: true }); return; }

    const g = ganchos.guard?.(rota, params) ?? true;
    if (g !== true) {
      if (g.aviso) ganchos.aviso?.(g.aviso);
      ir(g.para, { substituir: true });
      return;
    }

    removerSkeletonAtual(); removerSkeletonAtual = () => {};
    limparTela();
    fecharTudo();
    ESTADO.rotaAnterior = ESTADO.rota;
    ESTADO.rota = caminho;
    ganchos.aoTitulo?.(rota.titulo);
    ganchos.aoCamada?.(rota.camada);
    ganchos.aoNavegar?.(rota, params);

    const view = /** @type {HTMLElement|null} */ ($(rota.camada === 'shell' ? '#view' : rota.camada === 'auth' ? '#auth' : rota.camada === 'tablet' ? '#tablet' : '#macro'));
    if (!view) return;

    const t0 = Date.now();
    let removerSkeleton = () => {};
    if (rota.skeleton && ganchos.skeleton) removerSkeleton = removerSkeletonAtual = ganchos.skeleton(rota.skeleton, view);

    abortar = new AbortController();
    const ctx = {
      params,
      rota,
      caminho,
      sinal: abortar.signal,
      /** @param {() => void} fn */
      aoSair: (fn) => { aoSairFns.push(fn); },
      irPara: ir,
      ...(ganchos.contexto?.() || {}),
    };

    try {
      const mod = await /** @type {NonNullable<Rota['carregar']>} */ (rota.carregar)();
      if (meu !== token) return;
      view.replaceChildren(); // o skeleton (se houver) fica ao lado da `view`, que só reaparece pronta
      const tela = await mod.montar(view, ctx);
      if (meu !== token) { try { tela?.destruir?.(); } catch (e) { /* ignora */ } return; }
      telaAtual = tela || null;
      const espera = MIN_SKELETON_MS - (Date.now() - t0);
      if (rota.skeleton && espera > 0) await new Promise((r) => setTimeout(r, espera));
      if (meu !== token) return;
      removerSkeleton();
      ganchos.aposRender?.(view);
      if (rota.camada === 'shell') view.focus({ preventScroll: true });
    } catch (e) {
      if (meu !== token) return;
      removerSkeleton();
      ganchos.aoErro?.(e, rota);
    }
  }

  return {
    iniciar() {
      janela.addEventListener('hashchange', renderizar);
      return renderizar();
    },
    ir,
    renderizar,
    rotas: () => rotas.slice(),
    parar() { janela.removeEventListener('hashchange', renderizar); limparTela(); token++; },
  };
}
