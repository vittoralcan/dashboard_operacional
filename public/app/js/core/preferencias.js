// @ts-check
import { CHAVES, ESTADO, store } from './store.js';

/**
 * Ponto único por onde uma preferência MUDA no navegador (tema, barra lateral, tempo da Macro View): grava local e AVISA por evento
 * (`noir:preferencia`); quem sincroniza com a conta escuta o evento (features/shell/preferencias.js). Assim as telas não conhecem o servidor.
 */

export const EVENTO_PREFERENCIA = 'noir:preferencia';

/** @param {'tema'|'sidebarRecolhida'|'macroIntervaloSeg'} chave @param {unknown} valor */
export function avisarPreferencia(chave, valor) {
  try { document.dispatchEvent(new CustomEvent(EVENTO_PREFERENCIA, { detail: { chave, valor } })); } catch (e) { /* sem DOM (testes) */ }
}

/** "Acompanhar em outros computadores" (salvar na conta): ligado por padrão; desligado, nada vai nem vem do servidor. */
export const sincronizacaoLigada = () => store.texto(CHAVES.sincPrefs, '1') !== '0';
/** @param {boolean} ligada */
export const definirSincronizacao = (ligada) => { store.gravarTexto(CHAVES.sincPrefs, ligada ? '1' : '0'); };

/** Tempo de tela da Macro View, em segundos (5/8/10/15/30). @param {number} segundos */
export function definirMacroIntervalo(segundos) {
  ESTADO.macroIntervalo = segundos;
  store.gravarTexto(CHAVES.macroIntervalo, String(segundos));
  avisarPreferencia('macroIntervaloSeg', segundos);
}
