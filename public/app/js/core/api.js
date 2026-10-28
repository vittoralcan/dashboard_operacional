// @ts-check
/**
 * Cliente HTTP: timeout, retry só em GET, ETag, erros normalizados
 * e token anexado SOMENTE a URLs das bases configuradas (FE-06).
 */

export class ErroApi extends Error {
  /**
   * @param {number} status 0 = falha de rede/timeout
   * @param {string} mensagem texto já legível para o usuário
   * @param {{ retryAfterSeg?: number, corpo?: any, tipo?: 'rede'|'timeout'|'http' }} [extra]
   */
  constructor(status, mensagem, extra = {}) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.retryAfterSeg = extra.retryAfterSeg;
    this.corpo = extra.corpo;
    this.tipo = extra.tipo || 'http';
  }
}

const MSG_REDE = 'Erro de conexão com o servidor. Tente novamente.';
const MSG_TEMPO = 'O servidor demorou demais para responder. Tente novamente.';
const MSG_STATUS = {
  400: 'Requisição inválida.',
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Recurso não encontrado.',
  429: 'Muitas tentativas. Aguarde um instante e tente de novo.',
  500: 'Erro interno do servidor.',
  502: 'Servidor indisponível no momento.',
  503: 'Servidor indisponível no momento.',
  504: 'O servidor demorou demais para responder.',
};
const RETENTAVEIS = new Set([502, 503, 504]);
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @typedef {object} OpcoesApi
 * @property {typeof fetch} [fetch] injeção para testes
 * @property {() => string|null} [obterToken]
 * @property {string[]} [bases] URLs-base que recebem o `Authorization`
 * @property {() => void} [aoSessaoInvalida] chamado em 401 (limpa sessão e vai ao login)
 * @property {number} [tempoPadrao]
 * @property {number[]} [esperas] backoff dos retries (ms)
 */

/** @param {OpcoesApi} [opts] */
export function criarApi(opts = {}) {
  const buscar = opts.fetch || ((...a) => globalThis.fetch(...a));
  const bases = opts.bases || [];
  const esperas = opts.esperas || [400, 1200];
  const tempoPadrao = opts.tempoPadrao ?? 15000;
  /** @type {Map<string, { etag: string, corpo: any }>} */
  const cacheEtag = new Map();

  /** @param {string} url */
  const baseDe = (url) => bases.find((b) => url === b || url.startsWith(b.endsWith('/') ? b : `${b}/`) || url.startsWith(`${b}?`));

  /**
   * @param {string} metodo @param {string} url
   * @param {{ corpo?: any, sinal?: AbortSignal, tempo?: number, etag?: boolean, cabecalhos?: Record<string,string>, sessao?: boolean }} [o]
   *   `sessao:false`: um 401 NÃO derruba a sessão (login errado, "senha atual incorreta").
   */
  async function requisitar(metodo, url, o = {}) {
    const base = baseDe(url);
    /** @type {Record<string,string>} */
    const cab = { Accept: 'application/json', ...(o.cabecalhos || {}) };
    const token = base ? opts.obterToken?.() : null;
    if (token) cab.Authorization = `Bearer ${token}`;
    let corpo;
    if (o.corpo !== undefined) { cab['Content-Type'] = 'application/json'; corpo = JSON.stringify(o.corpo); }
    const usaEtag = metodo === 'GET' && o.etag !== false;
    const guardado = usaEtag ? cacheEtag.get(url) : undefined;
    if (guardado) cab['If-None-Match'] = guardado.etag;

    const tentativas = metodo === 'GET' ? esperas.length + 1 : 1;
    let ultimo = /** @type {ErroApi|null} */ (null);
    for (let n = 0; n < tentativas; n++) {
      const ctl = new AbortController();
      const tempo = o.tempo ?? tempoPadrao;
      let estourou = false;
      const timer = setTimeout(() => { estourou = true; ctl.abort(); }, tempo);
      const aoAbortar = () => ctl.abort();
      if (o.sinal) {
        if (o.sinal.aborted) { clearTimeout(timer); throw new ErroApi(0, 'Requisição cancelada.', { tipo: 'rede' }); }
        o.sinal.addEventListener('abort', aoAbortar, { once: true });
      }
      try {
        const res = await buscar(url, { method: metodo, headers: cab, body: corpo, signal: ctl.signal });
        clearTimeout(timer);
        if (res.status === 304 && guardado) return { dados: guardado.corpo, total: undefined, semMudanca: true, status: 304 };
        let json = null;
        const texto = await res.text();
        if (texto) { try { json = JSON.parse(texto); } catch (e) { json = null; } }
        if (!res.ok) {
          if (RETENTAVEIS.has(res.status) && n < tentativas - 1) { await sleep(esperas[n]); continue; }
          const msg = (json && (json.message || json.error)) || /** @type {any} */ (MSG_STATUS)[res.status] || `Erro ${res.status}.`;
          const ra = Number(res.headers?.get?.('Retry-After'));
          const erro = new ErroApi(res.status, String(msg), { corpo: json, retryAfterSeg: Number.isFinite(ra) && ra > 0 ? ra : undefined });
          if (res.status === 401 && base && o.sessao !== false) opts.aoSessaoInvalida?.();
          throw erro;
        }
        const etag = res.headers?.get?.('ETag');
        if (usaEtag && etag) cacheEtag.set(url, { etag, corpo: json });
        const total = Number(res.headers?.get?.('X-Total-Count'));
        return { dados: json, total: Number.isFinite(total) && res.headers?.get?.('X-Total-Count') ? total : undefined, semMudanca: false, status: res.status };
      } catch (e) {
        clearTimeout(timer);
        if (e instanceof ErroApi) throw e;
        const cancelado = o.sinal?.aborted;
        ultimo = new ErroApi(0, estourou ? MSG_TEMPO : cancelado ? 'Requisição cancelada.' : MSG_REDE, { tipo: estourou ? 'timeout' : 'rede' });
        if (cancelado || n >= tentativas - 1) throw ultimo;
        await sleep(esperas[n]);
      } finally {
        o.sinal?.removeEventListener('abort', aoAbortar);
      }
    }
    throw ultimo || new ErroApi(0, MSG_REDE, { tipo: 'rede' });
  }

  return {
    /** @param {string} url @param {{ sinal?: AbortSignal, tempo?: number, etag?: boolean }} [o] */
    get: (url, o) => requisitar('GET', url, o),
    /** @param {string} url @param {any} [corpo] @param {{ sinal?: AbortSignal, tempo?: number, sessao?: boolean }} [o] */
    post: (url, corpo, o) => requisitar('POST', url, { ...o, corpo: corpo ?? {} }),
    /** @param {string} url @param {any} [corpo] @param {{ sinal?: AbortSignal, tempo?: number, sessao?: boolean }} [o] */
    patch: (url, corpo, o) => requisitar('PATCH', url, { ...o, corpo: corpo ?? {} }),
    /** @param {string} url @param {any} [corpo] @param {{ sinal?: AbortSignal, tempo?: number }} [o] */
    put: (url, corpo, o) => requisitar('PUT', url, { ...o, corpo: corpo ?? {} }),
    /** @param {string} url @param {{ sinal?: AbortSignal, tempo?: number }} [o] */
    delete: (url, o) => requisitar('DELETE', url, o),
    limparCache: () => cacheEtag.clear(),
  };
}
