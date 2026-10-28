// @ts-check
import { API } from '../../config.js';
import { normalizarMonitorNativo, normalizarApiNativa, juntarTeste, intervaloValido } from '../../core/monitor.js';

/**
 * Monitor NATIVO de APIs (recurso `monitor.nativo`, `back_dashboard`): lista com histórico de uptime e latência, teste manual de UMA API
 * (1 por API a cada 10 s — o servidor responde 429 antes disso) e intervalo da verificação automática (só admin). Mesmo contrato do
 * adaptador do Apps Script (`listar`/`testar`/`definirIntervalo`): a tela troca de fonte sem saber qual é.
 *
 * @param {ReturnType<typeof import('../../core/api.js').criarApi>} api
 */
export function criarAdaptadorNativo(api) {
  const base = `${API.painel}/monitoramento`;
  /** @param {{ dados: any }} r */
  const exigir = (r) => {
    const j = r.dados;
    if (!j || j.success === false) throw Object.assign(new Error((j && j.message) || 'Falha no servidor.'), { status: 200 });
    return j;
  };
  return {
    /** @param {AbortSignal} [sinal] */
    async listar(sinal) { return normalizarMonitorNativo(exigir(await api.get(`${base}/apis`, { sinal, etag: false })).data); },
    /** Testa UMA API e devolve a entrada atualizada, com a nova verificação no fim do histórico. @param {number} indice @param {AbortSignal} [sinal] @param {import('../../core/monitor.js').Api} [atual] */
    async testar(indice, sinal, atual) {
      if (!atual || !Number.isInteger(atual.id)) throw new Error('API desconhecida.');
      const nova = normalizarApiNativa(exigir(await api.post(`${base}/apis/${encodeURIComponent(String(atual.id))}/testar`, {}, { sinal, tempo: 30000 })).data, indice);
      return juntarTeste(atual, nova);
    },
    /** SÓ admin (403 do servidor para os demais, na mensagem dele). @param {number} minutos @param {AbortSignal} [sinal] */
    async definirIntervalo(minutos, sinal) {
      if (!intervaloValido(minutos)) throw new Error('Intervalo inválido.');
      exigir(await api.put(`${base}/intervalo`, { minutos }, { sinal }));
    },
  };
}
