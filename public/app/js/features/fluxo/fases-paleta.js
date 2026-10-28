// @ts-check
import { ESTADO } from '../../core/store.js';
import { INSTANCIAS, carregarConfigFluxo } from './config-fluxo.js';

/**
 * Itens "Fases" da paleta de comandos (PRD-01): cada fase de cada fluxo Captura. Escolher uma
 * leva ao fluxograma da instância, centralizado na fase com realce por 3 s (`ESTADO.focoNo`, FLX-14).
 * Só aparecem com texto digitado (regra da paleta). Lê as configurações sob demanda — nada disso pesa na abertura.
 *
 * @param {(caminho: string) => void} ir
 * @returns {Promise<import('../../core/paleta.js').ItemPaleta[]>}
 */
export async function itensFases(ir) {
  /** @type {import('../../core/paleta.js').ItemPaleta[]} */
  const itens = [];
  const cfgs = await Promise.all(INSTANCIAS.map((i) => carregarConfigFluxo(i)));
  for (const c of cfgs) {
    if (!c) continue;
    for (const f of c.fases) {
      itens.push({
        id: `fase.${c.instancia}.${f.fasId}`, grupo: 'Fases', titulo: f.nome.toUpperCase(), sub: `${c.projeto} · ${c.nome}`, icone: 'flow-arrow', palavras: 'fase etapa fluxograma',
        aoExecutar: () => { ESTADO.focoNo = { instancia: c.instancia, fasId: f.fasId }; ir(`${c.rota}/fluxograma`); },
      });
    }
  }
  return itens;
}
