// @ts-check
import { norm } from './format.js';

/**
 * Busca "fuzzy" sem acento para a paleta de comandos (PRD-01).
 * Os caracteres da consulta precisam aparecer em ordem no texto; pontua mais quem casa
 * em sequência, no começo de palavras e perto do início.
 *
 * @param {string} consulta
 * @param {string} texto
 * @returns {{ pontos: number, posicoes: number[] } | null} `null` quando não casa.
 */
export function fuzzy(consulta, texto) {
  const q = norm(consulta).replace(/\s+/g, '');
  const t = norm(texto);
  if (!q) return { pontos: 0, posicoes: [] };
  const posicoes = [];
  let pontos = 0;
  let ti = 0;
  let anterior = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    const achou = t.indexOf(c, ti);
    if (achou === -1) return null;
    posicoes.push(achou);
    pontos += 1;
    if (achou === anterior + 1) pontos += 3;                       // sequência
    if (achou === 0 || /[\s\-_/.]/.test(t[achou - 1])) pontos += 4; // começo de palavra
    pontos -= Math.min(achou, 20) * 0.05;                           // perto do início
    anterior = achou;
    ti = achou + 1;
  }
  if (t.includes(q)) pontos += 10;                                  // substring exata
  return { pontos, posicoes };
}

/**
 * Realça no texto ORIGINAL (com acento) as posições casadas, escapando o resto.
 * `norm` mantém o mesmo comprimento para letras acentuadas comuns (NFD + remoção
 * de marcas), então as posições valem para o original; se o comprimento divergir,
 * devolve o texto escapado sem realce.
 *
 * @param {string} texto
 * @param {number[]} posicoes
 * @param {(s: string) => string} escapar
 */
export function realcar(texto, posicoes, escapar) {
  if (!posicoes.length || norm(texto).length !== texto.length) return escapar(texto);
  const set = new Set(posicoes);
  let saida = '';
  let aberto = false;
  for (let i = 0; i < texto.length; i++) {
    const marcado = set.has(i);
    if (marcado && !aberto) { saida += '<mark>'; aberto = true; }
    if (!marcado && aberto) { saida += '</mark>'; aberto = false; }
    saida += escapar(texto[i]);
  }
  return aberto ? `${saida}</mark>` : saida;
}

/**
 * Filtra e ordena itens por pontuação.
 * @template T
 * @param {string} consulta
 * @param {T[]} itens
 * @param {(item: T) => string} texto
 * @returns {{ item: T, pontos: number, posicoes: number[] }[]}
 */
export function buscar(consulta, itens, texto) {
  const saida = [];
  for (const item of itens) {
    const r = fuzzy(consulta, texto(item));
    if (r) saida.push({ item, pontos: r.pontos, posicoes: r.posicoes });
  }
  return saida.sort((a, b) => b.pontos - a.pontos);
}
