// @ts-check
import { tempoRelativo } from './format.js';
import { ESTADO } from './store.js';

/**
 * Indicador "Ao vivo" (NAV-04, RNB-010): mostra a IDADE do dado, nunca um contador que parte de
 * um número fixo. Quem carrega dados chama `marcarAtualizado()`; sem nenhuma leitura ainda,
 * o texto é "aguardando dados" (nada inventado).
 */

/** Texto do indicador. `ts`: instante da última leitura bem-sucedida da tela (ms) ou null. @param {number|null} ts @param {number} [agora] */
export function textoVivo(ts, agora = Date.now()) {
  if (ts === null || ts === undefined) return 'aguardando dados';
  return `atualizado ${tempoRelativo((agora - ts) / 1000)}`;
}

/** Registra uma leitura bem-sucedida. @param {number} [ts] */
export function marcarAtualizado(ts = Date.now()) {
  ESTADO.atualizadoEm = ts;
  document.dispatchEvent(new CustomEvent('noir:atualizado', { detail: { ts } }));
}

/** Zera ao trocar de tela (a idade é da tela atual). */
export function zerarAtualizado() { ESTADO.atualizadoEm = null; }

/**
 * Pede à tela atual que refaça suas consultas. A tela escuta `noir:atualizar` e chama
 * `detail.tratar()` ao assumir o pedido; devolve true se alguém assumiu.
 */
export function pedirAtualizacao() {
  let tratado = false;
  document.dispatchEvent(new CustomEvent('noir:atualizar', { detail: { tratar: () => { tratado = true; } } }));
  return tratado;
}
