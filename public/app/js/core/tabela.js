// @ts-check
import { norm } from './format.js';

/**
 * Lógica pura da tabela densa (CMP-01): filtro por categoria, busca sem acento e ordenação.
 * @typedef {{ chave: string, rotulo: string, num?: boolean, mono?: boolean, forte?: boolean, ordenarPor?: string,
 *             fmt?: (valor: any, linha: any) => any }} Coluna
 */

/**
 * @param {any[]} linhas @param {Coluna[]} colunas
 * @param {{ pilulaChave?: string, pilula?: string, busca?: string }} f
 */
export function filtrar(linhas, colunas, f) {
  let ls = linhas;
  if (f.pilulaChave && f.pilula && f.pilula !== 'todos') ls = ls.filter((l) => String(l[/** @type {string} */ (f.pilulaChave)]) === f.pilula);
  if (f.busca) {
    const q = norm(f.busca);
    ls = ls.filter((l) => colunas.some((c) => norm(l[c.chave]).includes(q)));
  }
  return ls;
}

/**
 * Número ↔ número; texto com `localeCompare('pt-BR', { numeric: true })`; coluna com `ordenarPor`
 * usa a chave auxiliar (ex.: timestamp). Não altera o array original.
 * @param {any[]} linhas @param {Coluna[]} colunas @param {{ chave: string|null, dir: 1|-1 }} ordem
 */
export function ordenar(linhas, colunas, ordem) {
  if (!ordem.chave) return linhas;
  const c = colunas.find((k) => k.chave === ordem.chave);
  const sk = (c && c.ordenarPor) || ordem.chave;
  return linhas.slice().sort((a, b) => {
    const va = a[sk]; const vb = b[sk];
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * ordem.dir;
    return String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true }) * ordem.dir;
  });
}

/** Contagem por categoria para as pílulas. @param {any[]} linhas @param {string} chave */
export function contarPor(linhas, chave) {
  /** @type {Record<string, number>} */
  const cont = {};
  for (const l of linhas) { const k = String(l[chave]); cont[k] = (cont[k] || 0) + 1; }
  return cont;
}

/**
 * Próxima ordem ao clicar no cabeçalho: mesma coluna inverte; coluna nova começa
 * decrescente se numérica, crescente se texto.
 * @param {{ chave: string|null, dir: 1|-1 }} atual @param {Coluna} coluna
 * @returns {{ chave: string, dir: 1|-1 }}
 */
export function proximaOrdem(atual, coluna) {
  if (atual.chave === coluna.chave) return { chave: coluna.chave, dir: /** @type {1|-1} */ (-atual.dir) };
  return { chave: coluna.chave, dir: coluna.num ? -1 : 1 };
}
