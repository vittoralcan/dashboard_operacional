// @ts-check
import { instanteDe } from './format.js';

/**
 * Perfil e preferências da conta: normalização do `GET /auth/me`, validação do nome e das preferências e o
 * "emissor" que junta as mudanças e as manda ao servidor depois de uma pausa (A4: gravar local PRIMEIRO, enviar em debounce de 600 ms,
 * falha silenciosa — a preferência local continua valendo). Funções puras; o relógio entra por injeção.
 *
 * @typedef {{ tema?: 'dark'|'light', sidebarRecolhida?: boolean, macroIntervaloSeg?: 5|8|10|15|30 }} Preferencias
 */

export const INTERVALOS_MACRO_VALIDOS = [5, 8, 10, 15, 30];
export const NOME_MIN = 2;
export const NOME_MAX = 150;
/** Pausa antes de enviar as preferências ao servidor (A4). */
export const ATRASO_PREFERENCIAS_MS = 600;

const VALIDADORES = /** @type {Record<string, (v: unknown) => boolean>} */ ({
  tema: (v) => v === 'dark' || v === 'light',
  sidebarRecolhida: (v) => typeof v === 'boolean',
  macroIntervaloSeg: (v) => INTERVALOS_MACRO_VALIDOS.includes(/** @type {number} */ (v)),
});

/** Só o que o servidor e o front conhecem E é válido; chave desconhecida ou valor estranho é ignorado (nunca quebra). @param {any} obj @returns {Preferencias} */
export function preferenciasValidas(obj) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (obj && typeof obj === 'object') for (const k of Object.keys(VALIDADORES)) if (k in obj && VALIDADORES[k](obj[k])) out[k] = obj[k];
  return /** @type {Preferencias} */ (out);
}

/** `GET /auth/me` → perfil. Campos que não vêm ficam `null` (a tela mostra "—", nunca inventa). @param {any} d */
export function normalizarPerfil(d) {
  if (!d || typeof d !== 'object' || !d.login) return null;
  const ts = (/** @type {unknown} */ v) => { const t = v ? instanteDe(v) : 0; return t > 0 ? t : null; };
  return {
    id: Number(d.id), nome: String(d.nome ?? ''), login: String(d.login), email: d.email ? String(d.email) : null,
    tipo: d.tipo === 'admin' ? /** @type {const} */ ('admin') : /** @type {const} */ ('standard'), cargo: d.cargo ? String(d.cargo) : null,
    precisaTrocarSenha: !!d.precisaTrocarSenha, ultimoLoginEm: ts(d.ultimoLoginEm), criadoEm: ts(d.criadoEm), preferencias: preferenciasValidas(d.preferencias),
  };
}

/** Nome editável: 2 a 150 caracteres depois do `trim` (mesma regra do servidor). @param {string} texto */
export function validarNome(texto) {
  const n = String(texto ?? '').trim();
  if (n.length < NOME_MIN) return /** @type {const} */ ({ ok: false, erro: `Informe seu nome (mínimo ${NOME_MIN} caracteres).` });
  if (n.length > NOME_MAX) return /** @type {const} */ ({ ok: false, erro: `O nome deve ter no máximo ${NOME_MAX} caracteres.` });
  return /** @type {const} */ ({ ok: true, nome: n });
}

/** O que mudou entre o usuário guardado no navegador e o perfil do servidor (para atualizar o menu). @param {any} guardado @param {NonNullable<ReturnType<typeof normalizarPerfil>>} perfil */
export function mudancasDoUsuario(guardado, perfil) {
  /** @type {Record<string, unknown>} */
  const m = {};
  const g = guardado || {};
  if (perfil.nome && perfil.nome !== g.nome) m.nome = perfil.nome;
  if (perfil.email !== null && perfil.email !== g.email) m.email = perfil.email;
  if ((perfil.cargo ?? null) !== (g.cargo ?? null)) m.cargo = perfil.cargo;
  if (perfil.tipo !== g.tipo) m.tipo = perfil.tipo;
  return m;
}

/**
 * Junta mudanças de preferência e entrega UM `PATCH` depois de `atraso` ms sem novidade; a última escrita de cada chave vence.
 * @param {(patch: Preferencias) => Promise<unknown>} enviar
 * @param {{ atraso?: number, agendar?: (f: () => void, ms: number) => any, cancelar?: (t: any) => void }} [o]
 */
export function criarEmissor(enviar, o = {}) {
  const agendar = o.agendar || ((f, ms) => setTimeout(f, ms));
  const cancelar = o.cancelar || ((t) => clearTimeout(t));
  const atraso = o.atraso ?? ATRASO_PREFERENCIAS_MS;
  /** @type {Record<string, unknown>} */
  let pendente = {};
  /** @type {any} */
  let timer = null;
  const descarregar = () => {
    timer = null;
    const patch = preferenciasValidas(pendente);
    pendente = {};
    if (!Object.keys(patch).length) return Promise.resolve();
    return Promise.resolve(enviar(patch)).catch(() => { /* falha silenciosa: a preferência local continua valendo */ });
  };
  return {
    /** @param {keyof Preferencias} chave @param {unknown} valor */
    marcar(chave, valor) { pendente[chave] = valor; if (timer !== null) cancelar(timer); timer = agendar(descarregar, atraso); },
    /** Envia agora (ex.: ao sair da página). */
    enviarJa() { if (timer !== null) cancelar(timer); return descarregar(); },
    descartar() { if (timer !== null) cancelar(timer); timer = null; pendente = {}; },
    temPendente: () => Object.keys(pendente).length > 0,
  };
}
