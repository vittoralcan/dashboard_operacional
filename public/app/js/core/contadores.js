// @ts-check
/**
 * Contadores da barra lateral (NAV-10): "em andamento" por fluxo e `online/total` das APIs, com ponto vermelho quando há API fora.
 * Sem polling próprio: quem já leu o dado (Home, hubs, Monitoramento, fluxo) o entrega aqui, e a barra só pinta. O que ninguém leu
 * ainda simplesmente não aparece (nunca um número inventado). Chaves = id da instância (`negativos`) ou do
 * módulo (`monitoramento`).
 */

export const EVENTO_CONTADORES = 'noir:contadores';

/** @typedef {{ texto: string, erro: boolean, dica: string }} Contador */

/** @type {Map<string, Contador>} */
const ESTADO_CONTADORES = new Map();

/** Contador do fluxo: pastas em andamento (`null` = ainda sem leitura → nada). @param {number|null|undefined} n @returns {Contador|null} */
export function contadorEmAndamento(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  return { texto: new Intl.NumberFormat('pt-BR').format(n), erro: false, dica: `${new Intl.NumberFormat('pt-BR').format(n)} em andamento` };
}

/** Contador do monitoramento: `online/total`; ponto vermelho se alguma API estiver fora. @param {{ online: number, total: number }|null|undefined} r @returns {Contador|null} */
export function contadorApis(r) {
  if (!r || !Number.isInteger(r.total) || r.total <= 0) return null;
  const fora = r.total - r.online;
  return { texto: `${r.online}/${r.total}`, erro: fora > 0, dica: fora > 0 ? `${fora} ${fora === 1 ? 'API fora do ar' : 'APIs fora do ar'}` : 'Todas as APIs online' };
}

/** Guarda os contadores recebidos (`null` apaga) e avisa a barra. @param {Record<string, Contador|null>} novos */
export function definirContadores(novos) {
  let mudou = false;
  for (const [k, c] of Object.entries(novos)) {
    const antes = ESTADO_CONTADORES.get(k);
    if (c === null) { if (antes) { ESTADO_CONTADORES.delete(k); mudou = true; } continue; }
    if (!antes || antes.texto !== c.texto || antes.erro !== c.erro) { ESTADO_CONTADORES.set(k, c); mudou = true; }
  }
  if (mudou && typeof document !== 'undefined') document.dispatchEvent(new CustomEvent(EVENTO_CONTADORES));
}

/** @param {string} chave @returns {Contador|undefined} */
export const lerContador = (chave) => ESTADO_CONTADORES.get(chave);

/** Esquece tudo (logout). */
export function limparContadores() { ESTADO_CONTADORES.clear(); }
