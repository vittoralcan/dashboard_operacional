// @ts-check
import { fuzzy } from './fuzzy.js';
import { norm } from './format.js';

/**
 * Lógica pura da paleta de comandos (PRD-01): busca fuzzy sem acento, grupos em ordem fixa,
 * itens de "Fases" só aparecem com texto digitado, itens "em breve" vão para o fim e não executam.
 *
 * @typedef {object} ItemPaleta
 * @property {string} id
 * @property {string} grupo        'Navegação' | 'Módulos' | 'Fluxos' | 'Fases' | 'Ações'
 * @property {string} titulo
 * @property {string} [sub]
 * @property {string} [icone]
 * @property {string} [atalho]     ex.: 'G H'
 * @property {string} [metrica]    texto à direita (ex.: "118 pastas")
 * @property {string} [palavras]   sinônimos para a busca (não aparecem)
 * @property {string} [emBreve]    id de recurso: item desabilitado
 * @property {() => void} [aoExecutar]
 *
 * @typedef {{ item: ItemPaleta, pontos: number, posicoes: number[] }} Resultado
 * @typedef {{ grupo: string, itens: Resultado[] }} Grupo
 */

export const ORDEM_GRUPOS = ['Navegação', 'Módulos', 'Fluxos', 'Fases', 'Ações'];
const MAX_POR_GRUPO_SEM_BUSCA = 8;
const MAX_POR_GRUPO_COM_BUSCA = 6;

/**
 * @param {ItemPaleta[]} itens @param {string} consulta
 * @returns {Grupo[]}
 */
export function filtrarItens(itens, consulta) {
  const q = String(consulta || '').trim();
  /** @type {Map<string, Resultado[]>} */
  const porGrupo = new Map();
  for (const item of itens) {
    if (item.grupo === 'Fases' && !q) continue;
    let r = { pontos: 0, posicoes: /** @type {number[]} */ ([]) };
    if (q) {
      const t = fuzzy(q, item.titulo);
      // Subtítulo e sinônimos só casam por TRECHO contíguo; fuzzy (letras espalhadas) vale só para o título.
      // Sem isso, "tema" achava "Digitalização · Captura" por letras soltas.
      const extra = `${item.sub || ''} ${item.palavras || ''}`;
      const alt = t || !norm(extra).includes(norm(q)) ? null : { pontos: 1, posicoes: /** @type {number[]} */ ([]) };
      const achou = t || alt;
      if (!achou) continue;
      // posições só valem para o título; casamentos por sub/palavras não realçam
      r = { pontos: achou.pontos - (t ? 0 : 6), posicoes: t ? t.posicoes : [] };
    }
    const lista = porGrupo.get(item.grupo) || [];
    lista.push({ item, ...r });
    porGrupo.set(item.grupo, lista);
  }
  const limite = q ? MAX_POR_GRUPO_COM_BUSCA : MAX_POR_GRUPO_SEM_BUSCA;
  /** @type {Grupo[]} */
  const saida = [];
  for (const g of ORDEM_GRUPOS) {
    const lista = porGrupo.get(g);
    if (!lista?.length) continue;
    const ordenada = q
      ? lista.slice().sort((a, b) => Number(!!a.item.emBreve) - Number(!!b.item.emBreve) || b.pontos - a.pontos)
      : lista.slice().sort((a, b) => Number(!!a.item.emBreve) - Number(!!b.item.emBreve));
    saida.push({ grupo: g, itens: ordenada.slice(0, limite) });
  }
  return saida;
}

/** Itens na ordem em que aparecem (para ↑↓). @param {Grupo[]} grupos */
export const achatar = (grupos) => grupos.flatMap((g) => g.itens);

/**
 * Próximo índice selecionado, circular, pulando itens "em breve".
 * @param {Resultado[]} lista @param {number} atual @param {1|-1} passo
 */
export function moverSelecao(lista, atual, passo) {
  const n = lista.length;
  if (!n) return -1;
  let i = atual;
  for (let k = 0; k < n; k++) {
    i = (i + passo + n) % n;
    if (!lista[i].item.emBreve) return i;
  }
  return atual;
}
