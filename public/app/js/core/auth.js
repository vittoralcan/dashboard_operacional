// @ts-check
import { CHAVES, store } from './store.js';
import { rotaConhecida, caminhoDoHash } from './router.js';

/**
 * Sessão e autenticação (frontend_spec.md §7). Mesmas chaves e formatos do `public/auth.js`
 * legado (RNB-012): o usuário pode alternar entre as duas versões sem logar de novo.
 * Funções puras + acesso protegido ao armazenamento; nada de DOM.
 *
 * @typedef {{ id?: number, nome?: string, login?: string, email?: string, cargo?: string, tipo?: string, precisaTrocarSenha?: boolean }} Usuario
 */

/** Decodifica o `exp` (segundos) de um JWT; `null` se malformado. Não valida assinatura (o servidor valida). @param {string|null|undefined} token */
export function expDoToken(token) {
  try {
    const p = String(token).split('.')[1];
    if (!p) return null;
    const json = JSON.parse(decodeURIComponent(Array.from(atob(p.replace(/-/g, '+').replace(/_/g, '/')), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch (e) {
    return null;
  }
}

/** Token presente e não vencido? Sem `exp` legível, vale (o servidor decide). @param {string|null|undefined} token @param {number} [agoraMs] */
export function tokenValido(token, agoraMs = Date.now()) {
  if (!token) return false;
  const exp = expDoToken(token);
  return exp === null ? true : exp * 1000 > agoraMs;
}

export const obterToken = () => store.texto(CHAVES.token);
/** @returns {Usuario|null} */
export const obterUsuario = () => store.json(CHAVES.usuario, null);

/** @param {string} token @param {Usuario} usuario */
export function salvarSessao(token, usuario) {
  store.gravarTexto(CHAVES.token, token);
  store.gravarJson(CHAVES.usuario, usuario);
}

export function limparSessao() {
  store.remover(CHAVES.token);
  store.remover(CHAVES.usuario);
}

/**
 * Usuário da sessão vigente: exige token válido E usuário gravado. Token vencido limpa a sessão
 * e deixa um aviso para a tela de login (AUT-10).
 * @returns {Usuario|null}
 */
export function sessaoVigente(agoraMs = Date.now()) {
  const token = obterToken();
  const usuario = obterUsuario();
  if (!token && !usuario) return null;
  if (!token || !usuario || !tokenValido(token, agoraMs)) {
    limparSessao();
    if (token || usuario) avisarLogin('info', 'Sua sessão expirou. Entre novamente.');
    return null;
  }
  return usuario;
}

/** Atualiza campos do usuário gravado (ex.: precisaTrocarSenha=false após o primeiro acesso). @param {Partial<Usuario>} parcial */
export function atualizarUsuario(parcial) {
  const atual = obterUsuario();
  if (!atual) return null;
  const novo = { ...atual, ...parcial };
  store.gravarJson(CHAVES.usuario, novo);
  return novo;
}

// ---- aviso para a tela de login (dsn-flash) ----
/** @param {'info'|'erro'} tipo @param {string} texto */
export const avisarLogin = (tipo, texto) => { store.gravarJson(CHAVES.flash, { tipo, texto }, 'sessao'); };
/** Lê e consome o aviso. */
export function consumirAviso() {
  const f = store.json(CHAVES.flash, null, 'sessao');
  store.remover(CHAVES.flash, 'sessao');
  return f && typeof f.texto === 'string' ? /** @type {{ tipo: string, texto: string }} */ (f) : null;
}

// ---- destino pós-login (AUT-14): só rota conhecida; nunca valor externo ----
/** @param {string} caminho @param {import('./router.js').Rota[]} rotas */
export function guardarDestino(caminho, rotas) {
  const c = caminhoDoHash(caminho);
  if (c === '/' || c === '/login' || c === '/primeiro-acesso' || !rotaConhecida(c, rotas)) return false;
  return store.gravarTexto(CHAVES.destino, c, 'sessao');
}
/** Lê e consome o destino; devolve `/projetos` se não houver ou se não for rota conhecida. @param {import('./router.js').Rota[]} rotas */
export function consumirDestino(rotas) {
  const d = store.texto(CHAVES.destino, null, 'sessao');
  store.remover(CHAVES.destino, 'sessao');
  return d && rotaConhecida(d, rotas) ? caminhoDoHash(d) : '/projetos';
}

// ---- chamadas ao back_auth ----
/**
 * @typedef {ReturnType<typeof import('./api.js').criarApi>} Api
 * `sessao:false` evita que um 401 de credencial ("Login ou senha inválidos.") seja tratado como sessão expirada.
 */

/** @param {Api} api @param {string} base @param {string} login @param {string} senha @param {{ sinal?: AbortSignal }} [o] */
export async function fazerLogin(api, base, login, senha, o = {}) {
  const r = await api.post(`${base}/auth/login`, { login: login.trim(), senha }, { ...o, sessao: false, tempo: 15000 });
  const d = r.dados && r.dados.data;
  if (!d || !d.token || !d.usuario) throw new Error('Resposta inesperada do servidor.');
  return /** @type {{ token: string, usuario: Usuario }} */ (d);
}

/** Primeiro acesso: só `novaSenha`. Fora dele, também `senhaAtual`. @param {Api} api @param {string} base @param {{ senhaAtual?: string, novaSenha: string }} corpo */
export const alterarSenha = (api, base, corpo) => api.patch(`${base}/auth/senha`, corpo, { sessao: false });
