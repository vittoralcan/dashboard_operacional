// @ts-check
import { norm } from './format.js';

/** Regras de senha e de cadastro de usuário no cliente (só UX — o servidor revalida: BE-10/A5/A6). Funções puras. */

/** Mínimo exigido pelo servidor (BE-10: subiu de 8 para 12). O bcrypt só lê os 72 primeiros BYTES — acima disso o servidor recusa. */
export const SENHA_MIN = 12;
export const SENHA_MAX_BYTES = 72;
export const CARGO_MAX = 100;

/** Tamanho em bytes UTF-8 (acento e emoji pesam mais de 1). @param {string} s */
export const bytesUtf8 = (s) => new TextEncoder().encode(String(s ?? '')).length;

/**
 * Requisitos orientativos (AUT-08). Os bloqueantes são o mínimo de 12 caracteres, o teto de 72 bytes e a igualdade.
 * @param {string} senha
 */
export function requisitosSenha(senha) {
  const s = String(senha ?? '');
  return [
    { id: 'tam', rotulo: 'Mínimo 12 caracteres', ok: s.length >= SENHA_MIN },
    { id: 'caixa', rotulo: 'Maiúscula e minúscula', ok: /[a-zà-ÿ]/.test(s) && /[A-ZÀ-ß]/.test(s) },
    { id: 'num', rotulo: 'Um número', ok: /\d/.test(s) },
    { id: 'simb', rotulo: 'Um símbolo', ok: /[^A-Za-z0-9À-ÿ\s]/.test(s) },
  ];
}

const ROTULOS = ['', 'Muito fraca', 'Fraca', 'Razoável', 'Forte'];

/**
 * Força 0–4 (medidor de 4 segmentos). Senha vazia = 0; menos de 12 caracteres nunca passa de "Muito fraca".
 * @param {string} senha
 * @returns {{ nivel: 0|1|2|3|4, rotulo: string, requisitos: ReturnType<typeof requisitosSenha> }}
 */
export function forcaSenha(senha) {
  const req = requisitosSenha(senha);
  const s = String(senha ?? '');
  if (!s) return { nivel: 0, rotulo: '', requisitos: req };
  if (s.length < SENHA_MIN) return { nivel: 1, rotulo: ROTULOS[1], requisitos: req };
  const atendidos = req.filter((r) => r.ok).length; // 1 (só tamanho) … 4
  const bonus = s.length >= 16 ? 1 : 0;
  const nivel = /** @type {1|2|3|4} */ (Math.max(1, Math.min(4, atendidos - 1 + bonus)));
  return { nivel, rotulo: ROTULOS[nivel], requisitos: req };
}

/**
 * Validação bloqueante da nova senha.
 * @param {string} senha @param {string} repita
 * @returns {{ campo: 'senha'|'repita', mensagem: string } | null}
 */
export function validarNovaSenha(senha, repita) {
  if (String(senha ?? '').length < SENHA_MIN) return { campo: 'senha', mensagem: `A senha deve ter no mínimo ${SENHA_MIN} caracteres.` };
  if (bytesUtf8(senha) > SENHA_MAX_BYTES) return { campo: 'senha', mensagem: `A senha deve ter no máximo ${SENHA_MAX_BYTES} bytes (acentos e emojis contam mais de 1).` };
  if (senha !== repita) return { campo: 'repita', mensagem: 'As senhas não coincidem. Digite novamente.' };
  return null;
}

/** "João da Silva Souza" → "joao.souza" (sem acento; primeiro e último nome; só a-z0-9._-). @param {string} nome */
export function sugerirLogin(nome) {
  const p = norm(nome).replace(/['’-]/g, '').replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '';
  const l = p.length === 1 ? p[0] : `${p[0]}.${p[p.length - 1]}`;
  return l.slice(0, 50);
}

/** Tipos aceitos na criação. 'turno' = conta do tablet do supervisor (bipa caixas, não vê o painel). */
export const TIPOS_USUARIO = ['admin', 'standard', 'turno'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LOGIN_RE = /^[a-z0-9._-]{3,50}$/;

/**
 * Validação do formulário "Criar novo usuário" (mensagens da spec). Devolve só os campos com erro.
 * @param {{ nome: string, login: string, email: string, tipo: string, cargo?: string }} v
 * @returns {Partial<Record<'nome'|'login'|'email'|'tipo'|'cargo', string>>}
 */
export function validarNovoUsuario(v) {
  /** @type {Partial<Record<'nome'|'login'|'email'|'tipo'|'cargo', string>>} */
  const e = {};
  if (String(v.nome ?? '').trim().split(/\s+/).filter(Boolean).length < 2) e.nome = 'Informe o nome completo.';
  if (!LOGIN_RE.test(String(v.login ?? '').trim().toLowerCase())) e.login = 'Use ao menos 3 caracteres, sem espaços.';
  if (!EMAIL.test(String(v.email ?? '').trim())) e.email = 'Informe um e-mail válido.';
  if (String(v.cargo ?? '').trim().length > CARGO_MAX) e.cargo = `O cargo deve ter no máximo ${CARGO_MAX} caracteres.`;
  if (!TIPOS_USUARIO.includes(v.tipo)) e.tipo = 'Escolha o tipo de usuário.';
  return e;
}

/** Mensagem de 409 → campo do formulário. @param {string} mensagem */
export const campoDoConflito = (mensagem) => (/login/i.test(mensagem) ? 'login' : 'email');
