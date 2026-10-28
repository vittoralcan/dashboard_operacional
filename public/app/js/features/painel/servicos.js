// @ts-check
import { API } from '../../config.js';
import { normalizarMetas } from '../../core/metas.js';
import { normalizarGargalos, normalizarGargaloInstancia } from '../../core/gargalos.js';

/**
 * Serviços do `back_dashboard` que entraram com o backend novo. Cada método devolve o dado já
 * normalizado e SOBE o erro (a tela decide: estado inline, "Em breve" no 404, ou nada). `{ success:false }` com 200 também é erro.
 *
 * @param {ReturnType<typeof import('../../core/api.js').criarApi>} api
 */
export function criarServicosPainel(api) {
  /** @param {{ dados: any }} r */
  const exigir = (r) => {
    const j = r.dados;
    if (!j || j.success === false) throw new Error((j && (j.message || j.error)) || 'O servidor não devolveu os dados.');
    return j;
  };
  return {
    /** Metas do mês (qualquer usuário). `mes` de 1 a 12. @param {{ ano: number, mes: number }} p @param {AbortSignal} [sinal] */
    async metas(p, sinal) { return normalizarMetas(exigir(await api.get(`${API.painel}/metas?ano=${p.ano}&mes=${p.mes}`, { sinal, etag: false })).data); },
    /** Define (ou troca) uma meta — SÓ admin; o servidor valida de novo e audita. @param {import('../../core/metas.js').Meta} m */
    async definirMeta(m) { return exigir(await api.put(`${API.painel}/metas`, m)).data; },
    /** "Gargalos agora": todas as instâncias com gargalo, do maior para o menor. @param {AbortSignal} [sinal] */
    async gargalos(sinal) { return normalizarGargalos(exigir(await api.get(`${API.painel}/gargalos`, { sinal })).data); },
    /** Gargalo de UMA instância do ATLAS (destaque no fluxograma, FLX-06). @param {string} instancia @param {AbortSignal} [sinal] */
    async gargaloDe(instancia, sinal) { return normalizarGargaloInstancia(exigir(await api.get(`${API.painel}/atlas/${encodeURIComponent(instancia)}/gargalos`, { sinal })).data); },
    /** Atividade recente (fonte: auditoria do painel). @param {{ limite?: number, projeto?: string }} [p] @param {AbortSignal} [sinal] */
    async atividades(p = {}, sinal) {
      const q = [`limite=${p.limite || 10}`, p.projeto ? `projeto=${encodeURIComponent(p.projeto)}` : ''].filter(Boolean).join('&');
      const { normalizarAtividades } = await import('../../core/servicos.js'); // atividades e notificações: só quem as usa baixa o módulo (RNB-015)
      return normalizarAtividades(exigir(await api.get(`${API.painel}/atividades?${q}`, { sinal, etag: false })).data);
    },
    /** Notificações do usuário + contador de não lidas. @param {AbortSignal} [sinal] */
    async notificacoes(sinal) { const { normalizarNotificacoes } = await import('../../core/servicos.js'); return normalizarNotificacoes(exigir(await api.get(`${API.painel}/notificacoes?limite=30`, { sinal, etag: false })).data); },
    /** @param {number} id */
    async marcarLida(id) { exigir(await api.post(`${API.painel}/notificacoes/${encodeURIComponent(String(id))}/lida`, {})); },
    async marcarTodasLidas() { exigir(await api.post(`${API.painel}/notificacoes/lidas`, {})); },
  };
}
