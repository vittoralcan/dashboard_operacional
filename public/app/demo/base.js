// @ts-check
/**
 * Base da API simulada do modo demonstração: aleatório com semente (os números ficam estáveis no mesmo dia), relógio de
 * São Paulo, envelope `{ success, data }`, token falso e os usuários de demonstração. Tudo fictício; nada sai do navegador.
 */

/** Gerador pseudoaleatório com semente (mulberry32). @param {number} semente */
export function aleatorio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semente estável para um texto (FNV-1a). @param {string} texto */
export function semente(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Inteiro entre `min` e `max` (inclusive). @param {() => number} r @param {number} min @param {number} max */
export const entre = (r, min, max) => Math.floor(min + r() * (max - min + 1));

const PARTES_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Data e hora de parede em São Paulo de um instante. @param {number} ms */
export function emSP(ms) {
  const p = Object.fromEntries(PARTES_SP.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour) % 24, minuto: Number(p.minute) };
}

/** Instante (ms) de uma hora de parede em São Paulo (UTC−3, sem horário de verão). @param {string} data AAAA-MM-DD @param {number} [hora] @param {number} [minuto] */
export const instanteSP = (data, hora = 0, minuto = 0) => Date.parse(`${data}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-03:00`);

/** AAAA-MM-DD somando dias. @param {string} data @param {number} dias */
export function somarDias(data, dias) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Dias do mês. @param {number} ano @param {number} mes 1–12 */
export const diasNoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Dia da semana (0 = domingo) de AAAA-MM-DD. @param {string} data */
export const diaDaSemana = (data) => new Date(`${data}T12:00:00Z`).getUTCDay();

export const iso = (/** @type {number} */ ms) => new Date(ms).toISOString();
export const minutosAtras = (/** @type {number} */ m) => iso(Date.now() - m * 60000);

/**
 * @typedef {{ status: number, corpo?: any, cabecalhos?: Record<string, string> }} Resposta
 */

/** @param {any} data @param {number} [status] @param {Record<string, string>} [cabecalhos] @returns {Resposta} */
export const ok = (data, status = 200, cabecalhos = {}) => ({ status, corpo: { success: true, data }, cabecalhos });

/** @param {number} status @param {string} message @param {Record<string, any>} [extra] @returns {Resposta} */
export const falha = (status, message, extra = {}) => ({ status, corpo: { success: false, message, ...extra } });

export const naoEncontrada = () => falha(404, 'Rota não encontrada.');

// ---------------------------------------------------------------- usuários e token (fictícios)

/** @typedef {{ id: number, nome: string, login: string, senha: string, tipo: 'admin'|'standard'|'turno', cargo: string, turnoId?: number }} UsuarioDemo */

/** @type {UsuarioDemo[]} */
export const USUARIOS = [
  { id: 1, nome: 'Marina Costa', login: 'gestor', senha: 'gestor123', tipo: 'admin', cargo: 'Coordenadora de produção' },
  { id: 2, nome: 'Tiago Ramos', login: 'leitor', senha: 'leitor123', tipo: 'standard', cargo: 'Analista de qualidade' },
  { id: 90, nome: 'Equipe Matutina', login: 'operador', senha: 'operador123', tipo: 'turno', cargo: 'Tablet do turno', turnoId: 8 },
];

const b64 = (/** @type {any} */ o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Token no formato JWT (sem assinatura de verdade: a demonstração não tem servidor). @param {UsuarioDemo} u */
export const tokenDe = (u) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: u.id, login: u.login, tipo: u.tipo, exp: Math.floor(Date.now() / 1000) + 8 * 3600 })}.demo`;

/** Usuário dono do `Authorization: Bearer …`, ou null. @param {Record<string, string>} cabecalhos */
export function usuarioDoToken(cabecalhos) {
  const auth = cabecalhos.authorization || '';
  const partes = auth.replace(/^Bearer\s+/i, '').split('.');
  if (partes.length < 2) return null;
  try {
    const c = JSON.parse(decodeURIComponent(escape(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')))));
    if (typeof c.exp === 'number' && c.exp * 1000 < Date.now()) return null;
    return USUARIOS.find((u) => u.login === c.login) || null;
  } catch {
    return null;
  }
}

/** Usuário como o `back_auth` devolve no login. @param {UsuarioDemo} u */
export const usuarioPublico = (u) => ({ id: u.id, nome: u.nome, login: u.login, email: `${u.login}@example.com`, tipo: u.tipo, cargo: u.cargo, precisaTrocarSenha: false });
