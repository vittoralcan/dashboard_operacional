// @ts-check
/**
 * Lógica pura do Monitoramento de APIs (MON-02/03/04) sobre os dados do Apps Script (GAS):
 * `{ funcao_api, status_api, log_api, link_api, hora_disparo }` por API. Tudo que vem do GAS é
 * texto livre editável numa planilha → só é escapado na hora de renderizar (RNB-004).
 *
 * @typedef {{ s: 'o'|'l'|'f', ms: number|null, em: number }} Verificacao  uma verificação do histórico (monitor nativo): online / lenta / falha
 * @typedef {{ indice: number, nome: string, online: boolean, log: string, link: string, host: string, hora: string, horaTxt: string, ts: number|null, sistema: string,
 *             id?: number, estado?: 'online'|'lenta'|'falha'|null, latenciaMs?: number|null, historico?: Verificacao[] }} Api
 */

export const INTERVALOS_TESTE = [5, 10, 15, 30, 60];
export const ROTULO_INTERVALO = /** @type {Record<number,string>} */ ({ 5: 'A cada 5 min', 10: 'A cada 10 min', 15: 'A cada 15 min', 30: 'A cada 30 min', 60: 'A cada 1 hora' });

/** Host de uma URL ("api.exemplo.com.br"); texto inválido devolve o próprio texto aparado. @param {string} link */
export function hostDe(link) {
  const s = String(link ?? '').trim();
  try { return new URL(s).host; } catch (e) { return s; }
}

/**
 * Sistema a que a API pertence, **inferido do nome** (o GAS ainda não envia o campo `sistema`).
 * @param {string} nome
 */
export function sistemaDe(nome) {
  const n = String(nome ?? '');
  if (/portaldoc/i.test(n)) return 'PortalDoc';
  if (/lumen/i.test(n)) return 'Lumen';
  if (/inscri[cç][aã]o/i.test(n)) return 'Inscrição Online';
  if (/boreal/i.test(n)) return 'BOREAL';
  return 'Outras';
}

/** Instante (ms) de `hora_disparo`: ISO com "T" → Date; outro formato → null (não dá para ordenar). @param {string} s */
export function instanteDe(s) {
  if (!s || !String(s).includes('T')) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Texto do horário. ISO → `dd/mm/aaaa HH:MM` em America/Sao_Paulo; outro texto → como veio;
 * vazio → "Pendente" (comportamento da tela atual).
 * @param {string} s
 */
export function formatarHora(s) {
  if (!s) return 'Pendente';
  if (!String(s).includes('T')) return String(s);
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return String(s);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}

/** Só "HH:MM" (para a linha "host · verificado HH:MM"). @param {string} s */
export function horaCurta(s) {
  const t = formatarHora(s);
  const m = /(\d{2}:\d{2})(?::\d{2})?$/.exec(t);
  return m ? m[1] : t;
}

/**
 * Normaliza `data` do GAS. Entradas que não são objeto são descartadas.
 * @param {any} data @returns {Api[]}
 */
export function normalizarApis(data) {
  if (!Array.isArray(data)) return [];
  return data.filter((a) => a && typeof a === 'object').map((a, i) => ({
    indice: i,
    nome: String(a.funcao_api ?? `API ${i + 1}`),
    online: String(a.status_api ?? '').toLowerCase() === 'online',
    log: String(a.log_api ?? ''),
    link: String(a.link_api ?? ''),
    host: hostDe(a.link_api),
    hora: String(a.hora_disparo ?? ''),
    horaTxt: formatarHora(String(a.hora_disparo ?? '')),
    ts: instanteDe(String(a.hora_disparo ?? '')),
    sistema: sistemaDe(String(a.funcao_api ?? '')),
  }));
}

/** Resumo: quantas online, total e a verificação mais recente. @param {Api[]} apis */
export function resumir(apis) {
  const online = apis.filter((a) => a.online).length;
  let maisRecente = /** @type {Api|null} */ (null);
  for (const a of apis) if (a.ts !== null && (!maisRecente || /** @type {number} */ (a.ts) > /** @type {number} */ (maisRecente.ts))) maisRecente = a;
  return { online, total: apis.length, ultima: maisRecente ? maisRecente.horaTxt : null, offline: apis.length - online };
}

/** Contagem por sistema, para as pílulas (só aparecem quando há mais de um). @param {Api[]} apis */
export function contarPorSistema(apis) {
  /** @type {Record<string, number>} */
  const c = {};
  for (const a of apis) c[a.sistema] = (c[a.sistema] || 0) + 1;
  return c;
}

/** @param {Api[]} apis @param {string} sistema 'todos' ou nome do sistema */
export const filtrarPorSistema = (apis, sistema) => (sistema === 'todos' ? apis : apis.filter((a) => a.sistema === sistema));

/** O intervalo escolhido é um dos permitidos? @param {unknown} v */
export const intervaloValido = (v) => INTERVALOS_TESTE.includes(Number(v));

// ---------------------------------------------------------------- monitor nativo (api_noir.md B10)

/**
 * Uma entrada de `GET /monitoramento/apis` (ou do `POST …/testar`) no MESMO formato `Api` da tela. `estado: null` = ainda sem
 * verificação (API recém-cadastrada): não é "fora do ar" nem "online". Lenta CONTA como online (responde), mas é sinalizada.
 * @param {any} e @param {number} indice @returns {Api}
 */
export function normalizarApiNativa(e, indice) {
  const estado = e && (e.estado === 'online' || e.estado === 'lenta' || e.estado === 'falha') ? /** @type {'online'|'lenta'|'falha'} */ (e.estado) : null;
  const hora = String((e && e.verificadoEm) ?? '');
  const hist = (Array.isArray(e && e.historico) ? e.historico : []).filter((/** @type {any} */ h) => h && ['o', 'l', 'f'].includes(h.s))
    .map((/** @type {any} */ h) => ({ s: /** @type {'o'|'l'|'f'} */ (h.s), ms: h.ms !== null && h.ms !== undefined && Number.isFinite(Number(h.ms)) ? Number(h.ms) : null, em: new Date(h.em).getTime() || 0 }));
  return {
    indice, id: Number(e && e.id), nome: String((e && e.nome) ?? `API ${indice + 1}`), online: estado === 'online' || estado === 'lenta', estado,
    latenciaMs: e && e.latenciaMs !== null && e.latenciaMs !== undefined && Number.isFinite(Number(e.latenciaMs)) ? Number(e.latenciaMs) : null,
    log: String((e && e.log) ?? ''), link: String((e && e.url) ?? ''), host: String((e && e.host) || hostDe(e && e.url)), hora, horaTxt: formatarHora(hora), ts: instanteDe(hora),
    sistema: String((e && e.sistema) || sistemaDe(e && e.nome)), historico: hist,
  };
}

/** `data` de `GET /monitoramento/apis` → lista, intervalo e os números do resumo (latência média, disponibilidade). @param {any} data */
export function normalizarMonitorNativo(data) {
  const apis = (Array.isArray(data && data.apis) ? data.apis : []).filter((/** @type {unknown} */ a) => a && typeof a === 'object').map((/** @type {any} */ a, /** @type {number} */ i) => normalizarApiNativa(a, i));
  const r = (data && data.resumo) || {};
  const nz = (/** @type {unknown} */ v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const intervalo = Number(data && data.intervaloMin);
  return {
    apis, intervalo: intervaloValido(intervalo) ? intervalo : null,
    latenciaMediaMs: nz(r.latenciaMediaMs), disponibilidadePct: nz(r.disponibilidadePct),
    proxima: data && data.proximaVerificacao ? String(data.proximaVerificacao) : null,
  };
}

/** Mantém as últimas 30 verificações ao juntar o resultado de um teste manual ao histórico que já havia. @param {Api} atual @param {Api} nova */
export function juntarTeste(atual, nova) {
  const h = [...(atual.historico || []), ...(nova.historico || [])];
  return { ...nova, indice: atual.indice, historico: h.slice(-30) };
}
