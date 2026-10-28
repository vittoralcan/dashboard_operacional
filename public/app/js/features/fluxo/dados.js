// @ts-check
import { API } from '../../config.js';
import {
  normalizarStatus, normalizarGestao, normalizarResumoMes, normalizarPastas, normalizarPorLote, normalizarRelatorioFase,
} from '../../core/fluxo-prod.js';
import { normalizarGargaloInstancia } from '../../core/gargalos.js';

/** Linhas por página na tela (`?limite=`) e por página ao exportar tudo. */
export const LIMITE_TELA = 500;
export const LIMITE_EXPORTACAO = 5000;

/**
 * Acesso aos dados de UMA instância Captura, sempre do painel: `back_dashboard` (`API.painel/atlas/<instância>`).
 *
 * @param {ReturnType<typeof import('../../core/api.js').criarApi>} api
 * @param {import('../../core/fluxo-prod.js').ConfigFluxo} cfg
 */
export function criarDadosFluxo(api, cfg) {
  const base = `${API.painel}/atlas/${cfg.instancia}`;
  /** `{ success:false }` com status 200 também é falha. @param {{ dados: any }} r */
  const exigir = (r) => {
    const j = r.dados;
    if (!j || j.success === false) throw new Error((j && (j.message || j.error)) || 'O servidor não devolveu os dados.');
    return j;
  };
  return {
    /** Pastas e imagens por fase (`GET /status-fases`). @param {AbortSignal} [sinal] */
    async statusFases(sinal) { return normalizarStatus(exigir(await api.get(`${base}/status-fases`, { sinal })).data); },
    /** Colunas (totais do mês, série de 7 dias, estados no BOREAL) e o `resumo` de meta/variação quando o servidor manda (`GET /gestao`). @param {AbortSignal} [sinal] */
    async gestao(sinal) {
      const d = exigir(await api.get(`${base}/gestao`, { sinal })).data;
      return { colunas: normalizarGestao(cfg, d), resumo: normalizarResumoMes(d && d.resumo) };
    },
    /** "Dados de HH:MM" (FLX-13) — só as instâncias ATLAS têm. Falha aqui NUNCA abre modal: devolve null. @param {AbortSignal} [sinal] */
    async sincronizacao(sinal) {
      if (cfg.fonte !== 'atlas') return null;
      try { return exigir(await api.get(`${base}/sincronizacao`, { sinal })).data; } catch (e) { return null; }
    },
    /** Gargalo desta instância (RN-009) — só o ATLAS (back_dashboard) calcula; no BOREAL devolve `null`. @param {AbortSignal} [sinal] */
    async gargalo(sinal) {
      if (cfg.fonte !== 'atlas') return null;
      return normalizarGargaloInstancia(exigir(await api.get(`${base}/gargalos`, { sinal })).data);
    },
    /** Pastas da fase. `total` vem de `X-Total-Count` quando o servidor pagina. @param {number} faseId @param {{ limite?: number, offset?: number }} [p] @param {AbortSignal} [sinal] */
    async pastas(faseId, p = {}, sinal) {
      const q = `?limite=${p.limite ?? LIMITE_TELA}${p.offset ? `&offset=${p.offset}` : ''}`;
      const r = await api.get(`${base}/fase/${faseId}/pastas${q}`, { sinal, etag: false });
      const linhas = normalizarPastas(exigir(r).data);
      return { linhas, total: r.total ?? linhas.length };
    },
    /** TODAS as pastas da fase, em páginas de 5.000 até completar o total (exportação). @param {number} faseId @param {(feito: number, total: number) => void} [progresso] @param {AbortSignal} [sinal] */
    async pastasTodas(faseId, progresso, sinal) {
      /** @type {ReturnType<typeof normalizarPastas>} */
      let acc = [];
      let total = Infinity;
      for (let offset = 0; offset < total; offset += LIMITE_EXPORTACAO) {
        const p = await this.pastas(faseId, { limite: LIMITE_EXPORTACAO, offset }, sinal);
        acc = acc.concat(p.linhas);
        total = p.total;
        progresso?.(acc.length, Number.isFinite(total) ? total : acc.length);
        if (p.linhas.length < LIMITE_EXPORTACAO || p.linhas.length === 0) break; // sem paginação no servidor: veio tudo de uma vez
      }
      return acc;
    },
    /** Fases de espera: totais por lote (`GET /fase/:id/pastas-por-lote`). @param {number} faseId @param {AbortSignal} [sinal] */
    async pastasPorLote(faseId, sinal) { return normalizarPorLote(exigir(await api.get(`${base}/fase/${faseId}/pastas-por-lote`, { sinal, etag: false })).data); },
    /** Pastas finalizadas na fase e no período (`GET /relatorio`). `400` (ex.: "O período máximo é de 92 dias.") sobe como ErroApi. @param {number} faseId @param {{ dataInicio: string, dataFim: string }} periodo @param {AbortSignal} [sinal] */
    async relatorio(faseId, periodo, sinal) {
      const q = `faseId=${faseId}&dataInicio=${encodeURIComponent(periodo.dataInicio)}&dataFim=${encodeURIComponent(periodo.dataFim)}`;
      return normalizarRelatorioFase(exigir(await api.get(`${base}/relatorio?${q}`, { sinal, etag: false, tempo: 60000 })).data);
    },
  };
}
