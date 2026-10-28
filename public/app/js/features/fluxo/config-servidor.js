// @ts-check
import { API } from '../../config.js';
import { ativo, ausenteSe404 } from '../../config/recursos.js';
import { validarConfigFluxo, mesclarConfigServidor } from '../../core/fluxo-config.js';

/** Configurações já resolvidas nesta sessão (o grafo só muda com um deploy do manifesto — `Cache-Control: max-age=300`). @type {Map<string, import('../../core/fluxo-prod.js').ConfigFluxo>} */
const cache = new Map();

/**
 * Configuração do fluxo com o **backend como fonte** (recurso `fluxo.config`): pega `GET /atlas/<instância>/config`, mescla por cima do
 * JSON local e valida o resultado. Qualquer problema — 404, rede, resposta incoerente — devolve a configuração LOCAL (o fluxograma nunca
 * fica sem desenho) e só registra o motivo no console. O BOREAL (`fonte: 'boreal'`) não tem `/config`: sempre local.
 *
 * @param {ReturnType<typeof import('../../core/api.js').criarApi>} api
 * @param {import('../../core/fluxo-prod.js').ConfigFluxo} local @param {AbortSignal} [sinal]
 * @returns {Promise<{ cfg: import('../../core/fluxo-prod.js').ConfigFluxo, origem: 'servidor'|'local' }>}
 */
export async function resolverConfigFluxo(api, local, sinal) {
  if (local.fonte !== 'atlas' || !ativo('fluxo.config')) return { cfg: local, origem: 'local' };
  const guardada = cache.get(local.instancia);
  if (guardada) return { cfg: guardada, origem: 'servidor' };
  try {
    const r = await api.get(`${API.painel}/atlas/${encodeURIComponent(local.instancia)}/config`, { sinal });
    const j = r.dados;
    if (!j || j.success === false) throw new Error((j && j.message) || 'Resposta inesperada.');
    const cfg = mesclarConfigServidor(local, j.data);
    const v = validarConfigFluxo(cfg);
    if (!v.ok) { console.warn(`Configuração do servidor para "${local.instancia}" é incoerente; usando a local.`, v.erros); return { cfg: local, origem: 'local' }; }
    cache.set(local.instancia, cfg);
    return { cfg, origem: 'servidor' };
  } catch (e) {
    if (!(sinal && sinal.aborted)) { ausenteSe404('fluxo.config', e); console.warn(`Sem /config do servidor para "${local.instancia}"; usando a local.`, e); }
    return { cfg: local, origem: 'local' };
  }
}
