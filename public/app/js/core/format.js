// @ts-check
/** Formatação e normalização de texto/números/datas em pt-BR (funções puras). */

/** @param {number} v @param {number} a @param {number} b */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** @param {number|string} n */
export const fmt = (n) => Number(n).toLocaleString('pt-BR');

/** @param {number|string} n @param {number} [d] */
export const fmtDec = (n, d = 1) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Valores grandes compactos para eixos: 1.284 · 12,5 mil · 3,4 mi. @param {number} n */
export const fmtCompacto = (n) => (n >= 1e6 ? `${fmtDec(n / 1e6, 1)} mi` : n >= 10000 ? `${fmtDec(n / 1000, 1)} mil` : fmt(Math.round(n)));

/** Texto sem acento e em minúsculas — base de toda busca. @param {unknown} s */
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** dd/mm/aaaa @param {Date} [d] */
export const dataBR = (d = new Date()) => d.toLocaleDateString('pt-BR');

/** dd-mm-aaaa (para nome de arquivo) @param {Date} [d] */
export const dataArquivo = (d = new Date()) => dataBR(d).replace(/\//g, '-');

/** HH:MM @param {Date} [d] */
export const horaBR = (d = new Date()) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Nome de arquivo exportado: maiúsculas, sem acento, só A-Z0-9 e "_". @param {string} s */
export const nomeArquivo = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

/** "há 12 s" · "há 5 min" · "há 3 h" · "há 2 d" (idade de um dado — RNB-010). @param {number} seg */
export function tempoRelativo(seg) {
  const s = Math.max(0, Math.floor(seg));
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

/** Saudação conforme a hora. @param {number} [hora] */
export const saudacao = (hora = new Date().getHours()) => (hora < 5 ? 'Boa noite' : hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite');

/** @param {string} nome */
export const primeiroNome = (nome) => String(nome ?? '').trim().split(/\s+/)[0] || '';

/**
 * Variação percentual exibida ("+12,4%" / "−3,0%"), com sinal tipográfico.
 * @param {number} v
 */
export const fmtVariacao = (v) => `${v >= 0 ? '+' : '−'}${fmtDec(Math.abs(v))}%`;

/**
 * Instante (ms) de uma data/hora exibida ("Inclusão", "Data Finalizado") para ordenar:
 * aceita 'dd/mm/aaaa hh:mm[:ss]' e ISO-8601. Inválida → 0.
 * @param {unknown} s
 */
export function instanteDe(s) {
  const t = String(s ?? '').trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T,]+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] || 0), Number(br[5] || 0), Number(br[6] || 0)).getTime();
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : 0;
}
