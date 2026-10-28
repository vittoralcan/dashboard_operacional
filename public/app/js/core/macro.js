// @ts-check
import { clamp, fmt } from './format.js';
import { INSTANCIAS_ATLAS } from './painel.js';

/**
 * Macro View (MAC-01…05): o que cada projeto mostra e a máquina de rotação — funções puras, sem DOM
 * nem relógio (o tempo entra como argumento), para testar a troca de telas, a pausa e as barras *stories*.
 *
 * @typedef {{ id: string, nome: string, sub: string, icone: string, unidade?: string, chave?: string, formato?: 'fracao', semHoje?: boolean, embreve?: string }} CartaoMacro
 * @typedef {{ id: string, nome: string, cartoes: CartaoMacro[]|null }} ProjetoMacro
 * @typedef {{ atlas: Record<string, number|null>,
 *             apis: { online: number, total: number }|null }} ValoresMacro
 */

/** @type {ProjetoMacro[]} */
export const PROJETOS_MACRO = [
  { id: 'boreal', nome: 'BOREAL', cartoes: [
    { id: 'monitoramento', nome: 'Monitoramento de APIs', sub: 'Inscrição Online', icone: 'pulse', unidade: 'APIs online', chave: 'apis', formato: 'fracao', semHoje: true },
  ] },
  { id: 'atlas', nome: 'ATLAS', cartoes: [
    { id: 'negativos', nome: 'Digitalização', sub: 'Negativos', icone: 'film-reel', unidade: 'imagens', chave: 'negativos' },
    { id: 'certidoes', nome: 'Digitalização', sub: 'Certidões', icone: 'files', unidade: 'imagens', chave: 'certidoes' },
    { id: 'inventarios', nome: 'Digitalização', sub: 'Inventários', icone: 'folder-simple', unidade: 'imagens', chave: 'inventarios' },
    { id: 'cartografia', nome: 'Digitalização', sub: 'Cartografia', icone: 'first-aid-kit', unidade: 'imagens', chave: 'cartografia' },
  ] },
  { id: 'cobalto', nome: 'COBALTO', cartoes: null },
];

/** Valores ainda desconhecidos (tudo `null` → a tela mostra "—"). @returns {ValoresMacro} */
export const valoresIniciais = () => ({ atlas: Object.fromEntries(INSTANCIAS_ATLAS.map((i) => [i, null])), apis: null });

/**
 * O que o cartão mostra: número (anima), texto (`online/total`), "Em breve" ou "—" (sem histórico — RA-015).
 * @param {ProjetoMacro} projeto @param {CartaoMacro} cartao @param {ValoresMacro} v
 * @returns {{ tipo: 'numero', n: number } | { tipo: 'texto', texto: string } | { tipo: 'embreve', recurso: string } | { tipo: 'vazio' }}
 */
export function valorDoCartao(projeto, cartao, v) {
  if (cartao.embreve) return { tipo: 'embreve', recurso: cartao.embreve };
  if (cartao.formato === 'fracao') return v.apis ? { tipo: 'texto', texto: `${fmt(v.apis.online)}/${fmt(v.apis.total)}` } : { tipo: 'vazio' };
  const n = v.atlas[cartao.chave || ''];
  return typeof n === 'number' ? { tipo: 'numero', n } : { tipo: 'vazio' };
}

// ---------------------------------------------------------------- rotação (MAC-01/02/03)

/** @typedef {{ idx: number, decorrido: number, pausado: boolean }} Rotacao */
/** @returns {Rotacao} */
export const rotacaoInicial = () => ({ idx: 0, decorrido: 0, pausado: false });

/**
 * Avança `dt` segundos. Ao completar o intervalo troca para o próximo projeto (com volta ao começo). Pausada = congela.
 * @param {Rotacao} r @param {number} dt @param {number} intervalo @param {number} n
 * @returns {Rotacao & { trocou: boolean }}
 */
export function avancarTempo(r, dt, intervalo, n) {
  if (r.pausado || n < 1 || !(intervalo > 0)) return { ...r, trocou: false };
  const d = r.decorrido + Math.max(0, dt);
  if (d >= intervalo) return { idx: (r.idx + 1) % n, decorrido: 0, pausado: false, trocou: true };
  return { ...r, decorrido: d, trocou: false };
}

/** Salta para o projeto `i` (com volta nas pontas) e zera a barra. @param {Rotacao} r @param {number} i @param {number} n @returns {Rotacao} */
export const irParaProjeto = (r, i, n) => ({ idx: n > 0 ? ((i % n) + n) % n : 0, decorrido: 0, pausado: r.pausado });

/** @param {Rotacao} r @returns {Rotacao} */
export const alternarPausa = (r) => ({ ...r, pausado: !r.pausado });

/** Largura (0–100) da barra *story* `i`: as anteriores cheias, a atual no ritmo do tempo, as próximas vazias. @param {Rotacao} r @param {number} i @param {number} intervalo */
export const larguraDaBarra = (r, i, intervalo) => (i < r.idx ? 100 : i === r.idx ? clamp((r.decorrido / (intervalo || 1)) * 100, 0, 100) : 0);

/** Próxima atualização dos valores: 60 s (§8.4). */
export const INTERVALO_DADOS_MS = 60000;

/** Passo do relógio interno: a barra se repinta a cada 200 ms (a `transition` do CSS suaviza o resto). */
export const PASSO_MS = 200;

/** Relógio do cabeçalho. @param {Date} d */
export const horaRelogio = (d) => d.toLocaleTimeString('pt-BR');
/** @param {Date} d */
export const dataRelogio = (d) => d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
