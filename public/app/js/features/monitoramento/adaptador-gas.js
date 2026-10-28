// @ts-check
import { GAS_MONITOR } from '../../config.js';
import { normalizarApis, intervaloValido } from '../../core/monitor.js';

/**
 * Adaptador do Web App do Google Apps Script (fonte de dados do Monitoramento enquanto o monitor
 * nativo — recurso `monitor.nativo` — não existe). Troca-se só este arquivo quando ele chegar.
 *
 * O GAS responde `{ status: 'success'|'error', data, message }` e **não** usa o token do painel:
 * `GAS_MONITOR` não está em `API`, então o `api.js` nunca anexa o `Authorization` (FE-06).
 * ⚠ Hoje as ações do GAS (inclusive `setTrigger`) não têm autenticação — risco herdado da tela atual.
 *
 * @param {ReturnType<typeof import('../../core/api.js').criarApi>} api
 * @param {string} [base]
 */
export function criarAdaptadorGas(api, base = GAS_MONITOR) {
  const url = (/** @type {Record<string, string|number>} */ params) => {
    const q = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    return q ? `${base}${base.includes('?') ? '&' : '?'}${q}` : base;
  };
  /** @param {string} u @param {AbortSignal} [sinal] @param {number} [tempo] */
  const chamar = async (u, sinal, tempo) => {
    const r = await api.get(u, { sinal, etag: false, tempo });
    const j = r.dados;
    if (!j || j.status !== 'success') throw Object.assign(new Error((j && j.message) || 'Falha no servidor.'), { status: 200 });
    return j;
  };
  return {
    /** Lista as APIs e o intervalo de automação configurado. @param {AbortSignal} [sinal] */
    async listar(sinal) {
      const j = await chamar(url({}), sinal, 30000);
      const intervalo = Number(j.triggerInterval);
      return { apis: normalizarApis(j.data), intervalo: intervaloValido(intervalo) ? intervalo : null };
    },
    /** Testa UMA API (índice da lista) e devolve a API atualizada. @param {number} indice @param {AbortSignal} [sinal] */
    async testar(indice, sinal) {
      const j = await chamar(url({ action: 'testSingle', index: indice }), sinal, 60000);
      const [api1] = normalizarApis([j.data]);
      return { ...api1, indice };
    },
    /** Define o intervalo de teste automático (minutos). @param {number} minutos @param {AbortSignal} [sinal] */
    async definirIntervalo(minutos, sinal) {
      if (!intervaloValido(minutos)) throw new Error('Intervalo inválido.');
      await chamar(url({ action: 'setTrigger', minutes: minutos }), sinal, 30000);
    },
  };
}
