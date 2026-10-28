// @ts-check
import { USUARIOS, ok, falha, naoEncontrada, tokenDe, usuarioDoToken, usuarioPublico, minutosAtras } from './base.js';

/**
 * `back_auth` simulado: login, perfil, preferências, troca de senha, confirmação de senha (Correções) e criação de usuário.
 * As mudanças valem até recarregar a página.
 */

/** @type {Record<string, Record<string, unknown>>} */
const preferencias = {};
/** @type {Record<string, string>} nomes editados no perfil */
const nomes = {};
/** @type {Set<string>} logins criados nesta sessão */
const criados = new Set();
let proximoId = 200;

/** @param {import('./base.js').UsuarioDemo} u */
const perfil = (u) => ({
  ...usuarioPublico(u), nome: nomes[u.login] || u.nome, ultimoLoginEm: minutosAtras(3), criadoEm: '2026-03-02T09:15:00-03:00', preferencias: preferencias[u.login] || {},
});

const SENHA_MIN = 12;

/**
 * @param {{ metodo: string, caminho: string, corpo: any, cabecalhos: Record<string, string> }} req
 * @returns {import('./base.js').Resposta}
 */
export function rotaAuth({ metodo, caminho, corpo, cabecalhos }) {
  const c = corpo || {};
  if (caminho === '/auth/login' && metodo === 'POST') {
    const login = String(c.login || '').trim().toLowerCase();
    if (!login || !c.senha) return falha(400, 'Login e senha são obrigatórios.');
    const u = USUARIOS.find((x) => x.login === login);
    if (!u || u.senha !== c.senha) return falha(401, 'Login ou senha inválidos.');
    return ok({ token: tokenDe(u), usuario: { ...usuarioPublico(u), nome: nomes[u.login] || u.nome } });
  }

  const eu = usuarioDoToken(cabecalhos);
  if (!eu) return falha(401, 'Token de autenticação ausente ou expirado.');

  if (caminho === '/auth/me' && metodo === 'GET') return ok(perfil(eu));
  if (caminho === '/auth/me' && metodo === 'PATCH') {
    const nome = String(c.nome || '').trim();
    if (nome.length < 2 || nome.length > 150) return falha(400, 'Nome deve ter de 2 a 150 caracteres.');
    nomes[eu.login] = nome;
    return ok(perfil(eu));
  }
  if (caminho === '/auth/me/preferencias' && metodo === 'PATCH') {
    preferencias[eu.login] = { ...(preferencias[eu.login] || {}), ...c };
    return ok(preferencias[eu.login]);
  }
  if (caminho === '/auth/senha' && metodo === 'PATCH') {
    if (c.senhaAtual !== undefined && c.senhaAtual !== eu.senha) return falha(401, 'Senha atual incorreta.');
    if (String(c.novaSenha || '').length < SENHA_MIN) return falha(400, `Nova senha deve ter ao menos ${SENHA_MIN} caracteres.`);
    eu.senha = String(c.novaSenha);
    return ok({ id: eu.id, nome: eu.nome, login: eu.login });
  }
  if (caminho === '/auth/confirmar-senha' && metodo === 'POST') {
    if (c.senha !== eu.senha) return falha(401, 'Senha incorreta.');
    return ok({ token: `confirmacao-demo-${eu.id}`, expiraEmSegundos: 300 });
  }
  if (caminho === '/auth/usuarios' && metodo === 'POST') {
    if (eu.tipo !== 'admin') return falha(403, 'Apenas administradores podem criar usuários.');
    const login = String(c.login || '').trim().toLowerCase();
    if (USUARIOS.some((u) => u.login === login) || criados.has(login)) return falha(409, 'Este login já está em uso.');
    criados.add(login);
    const senhaTemporaria = `Demo-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 8)}`;
    return ok({
      id: ++proximoId, nome: String(c.nome || '').trim(), login, email: String(c.email || '').trim().toLowerCase(), tipo: c.tipo === 'admin' ? 'admin' : 'standard',
      precisaTrocarSenha: true, emailEnviado: false, senhaTemporaria,
    }, 201);
  }
  return naoEncontrada();
}
