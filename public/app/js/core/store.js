// @ts-check
/**
 * Estado da aplicação e armazenamento do navegador.
 * Toda leitura/escrita é protegida por try/catch (modo privado, dados bloqueados):
 * leitura devolve o padrão, escrita falha em silêncio — a UI nunca quebra por isso.
 * As chaves `dsn-*` e seus formatos são compartilhados com o legado (RNB-012).
 */

export const CHAVES = Object.freeze({
  token: 'dsn-auth-token',            // localStorage · string (JWT) — compartilhada com o legado
  usuario: 'dsn-auth-usuario',        // localStorage · JSON {id,nome,login,email?,tipo,cargo?,precisaTrocarSenha}
  tema: 'dsn-theme',                  // localStorage · "dark" | "light" (texto puro) — compartilhada
  sincPrefs: 'dsn-ui-sync',           // localStorage · "1" | "0" — salvar preferências na conta (padrão ligado)
  macroIntervalo: 'dsn-macroview-interval', // localStorage · segundos (texto) — compartilhada
  sidebar: 'dsn-ui-sidebar',          // localStorage · "1" | "0"
  destino: 'dsn-destino',             // sessionStorage · rota guardada antes do login
  flash: 'dsn-flash',                 // sessionStorage · {tipo,texto} para a tela de login
  envioInstancia: 'dsn-envio-instancia', // localStorage · instância do Bridge acompanhada em #/envio
  envioHoras: 'dsn-envio-horas',      // localStorage · janela (horas) do acompanhamento
  ausentes: 'dsn-ausentes',           // sessionStorage · lista de recursos 404 memorizados
});

/** @type {{ local: Storage|null, sessao: Storage|null }} */
const injetados = { local: null, sessao: null };

/** Permite trocar o armazenamento (testes). @param {{ local?: any, sessao?: any }} a */
export function definirArmazenamento(a) {
  injetados.local = a.local ?? null;
  injetados.sessao = a.sessao ?? null;
}

/** @param {'local'|'sessao'} nome @returns {Storage|null} */
function area(nome) {
  try {
    if (nome === 'sessao') return injetados.sessao ?? globalThis.sessionStorage ?? null;
    return injetados.local ?? globalThis.localStorage ?? null;
  } catch (e) {
    return null;
  }
}

export const store = {
  /** @param {string} k @param {string|null} [padrao] @param {'local'|'sessao'} [a] */
  texto(k, padrao = null, a = 'local') {
    try { const v = area(a)?.getItem(k); return v === null || v === undefined ? padrao : v; } catch (e) { return padrao; }
  },
  /** @param {string} k @param {string} v @param {'local'|'sessao'} [a] */
  gravarTexto(k, v, a = 'local') {
    try { area(a)?.setItem(k, String(v)); return true; } catch (e) { return false; }
  },
  /** @template T @param {string} k @param {T} padrao @param {'local'|'sessao'} [a] @returns {T} */
  json(k, padrao, a = 'local') {
    try { const v = area(a)?.getItem(k); return v === null || v === undefined ? padrao : JSON.parse(v); } catch (e) { return padrao; }
  },
  /** @param {string} k @param {unknown} v @param {'local'|'sessao'} [a] */
  gravarJson(k, v, a = 'local') {
    try { area(a)?.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  },
  /** @param {string} k @param {'local'|'sessao'} [a] */
  remover(k, a = 'local') {
    try { area(a)?.removeItem(k); } catch (e) { /* sem armazenamento */ }
  },
};

/** Tema salvo; qualquer valor diferente de "dark" é claro (padrão). */
export const lerTema = () => (store.texto(CHAVES.tema) === 'dark' ? 'dark' : 'light');

/** Estado global (objeto único). Cresce por onda; nada aqui é persistido sozinho. */
export const ESTADO = {
  tema: /** @type {'dark'|'light'} */ ('light'),
  sidebarRecolhida: false,
  macroIntervalo: 10,
  rota: /** @type {string|null} */ (null),
  rotaAnterior: /** @type {string|null} */ (null),
  camada: /** @type {string|null} */ (null),
  usuario: /** @type {any} */ (null),
  catalogo: /** @type {any} */ (null),
  atualizadoEm: /** @type {number|null} */ (null),
  focoNo: /** @type {{ instancia: string, fasId: number }|null} */ (null),
};

/** Carrega do armazenamento o que é persistido (chamado uma vez no bootstrap). */
export function carregarEstado() {
  ESTADO.tema = lerTema();
  ESTADO.sidebarRecolhida = store.texto(CHAVES.sidebar) === '1';
  const n = Number(store.texto(CHAVES.macroIntervalo, '10'));
  ESTADO.macroIntervalo = [5, 8, 10, 15, 30].includes(n) ? n : 10;
}
