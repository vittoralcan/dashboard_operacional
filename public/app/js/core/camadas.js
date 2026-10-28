// @ts-check
/**
 * Pilha de camadas sobrepostas (popover, modal, gaveta, paleta): `Esc` fecha a do topo.
 * Funções puras sobre um array — sem DOM, testáveis.
 *
 * @typedef {{ fechar: () => void, el?: Element|null, tipo?: string }} Camada
 */

/** @type {Camada[]} */
const CAMADAS = [];

/** @param {() => void} fechar @param {Element|null} [el] @param {string} [tipo] */
export function empilhar(fechar, el = null, tipo = 'pop') {
  const c = { fechar, el, tipo };
  CAMADAS.push(c);
  return c;
}

/** @param {Camada|null|undefined} c */
export function desempilhar(c) {
  const i = c ? CAMADAS.indexOf(c) : -1;
  if (i >= 0) CAMADAS.splice(i, 1);
}

/** Fecha a camada do topo. @returns {boolean} true se havia algo para fechar. */
export function fecharTopo() {
  const c = CAMADAS[CAMADAS.length - 1];
  if (!c) return false;
  c.fechar();
  desempilhar(c);
  return true;
}

export function fecharTudo() {
  let guarda = 30;
  while (CAMADAS.length && guarda--) fecharTopo();
}

/** Há camada aberta (opcionalmente de um tipo)? @param {string|string[]} [tipo] */
export function temCamada(tipo) {
  const tipos = tipo === undefined ? null : [].concat(/** @type {any} */ (tipo));
  return CAMADAS.some((c) => !tipos || tipos.includes(/** @type {any} */ (c.tipo)));
}

export const totalCamadas = () => CAMADAS.length;
