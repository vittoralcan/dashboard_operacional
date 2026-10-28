// @ts-check
import { nomeArquivo, dataArquivo } from './format.js';

/**
 * Exportação de tabelas (CMP-02, FE-11): XLSX (SheetJS fixado em `vendor/`, carregado só ao exportar)
 * ou CSV (`;` + BOM). Exporta as LINHAS VISÍVEIS (já filtradas e ordenadas). Toda célula de texto
 * passa por `protegerCelula` (injeção de fórmula).
 *
 * @typedef {{ chave: string, rotulo: string }} ColunaExport
 */

export const XLSX_ARQUIVO = 'vendor/xlsx-0.20.3.full.min.js';
/** SHA-384 do arquivo acima (conferido por `tests/app/exportar.test.js`; o navegador recusa o script se divergir). */
export const XLSX_SRI = 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';

/** Texto que começa com `= + - @` (ou tab/CR) viraria fórmula numa planilha: prefixa `'`. Números passam intactos. @param {unknown} v */
export function protegerCelula(v) {
  if (typeof v !== 'string') return v === null || v === undefined ? '' : v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Nome do arquivo: `Relatorio_<NOME>_<ref>.<ext>` (ref = período ou data de hoje). @param {string} base @param {{ ref?: string, ext?: 'xlsx'|'csv', data?: Date }} [o] */
export function nomeDoRelatorio(base, o = {}) {
  const ref = o.ref ? nomeArquivo(o.ref).replace(/_/g, '-') : dataArquivo(o.data);
  return `Relatorio_${nomeArquivo(base)}_${ref}.${o.ext || 'xlsx'}`;
}

/** Matriz [cabeçalho, ...linhas] com as células protegidas. @param {ColunaExport[]} colunas @param {any[]} linhas */
export function matrizDeExportacao(colunas, linhas) {
  return [colunas.map((c) => c.rotulo), ...linhas.map((l) => colunas.map((c) => protegerCelula(l[c.chave])))];
}

/** CSV com `;`, aspas duplicadas e BOM UTF-8 (abre certo no Excel pt-BR). @param {ColunaExport[]} colunas @param {any[]} linhas */
export function gerarCsv(colunas, linhas) {
  const celula = (/** @type {unknown} */ v) => `"${String(v).replace(/"/g, '""')}"`;
  return `﻿${matrizDeExportacao(colunas, linhas).map((l) => l.map(celula).join(';')).join('\r\n')}`;
}

/** Dispara o download de um Blob. @param {string} nome @param {Blob} blob */
export function baixarBlob(nome, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** @param {string} nome @param {ColunaExport[]} colunas @param {any[]} linhas */
export function baixarCsv(nome, colunas, linhas) {
  baixarBlob(nome, new Blob([gerarCsv(colunas, linhas)], { type: 'text/csv;charset=utf-8' }));
}

/** @type {Promise<any>|null} */
let carregando = null;

/** Carrega o SheetJS uma única vez (script do próprio site, com SRI). Falha → rejeita e permite nova tentativa. */
export function carregarXlsx() {
  if (/** @type {any} */ (globalThis).XLSX) return Promise.resolve(/** @type {any} */ (globalThis).XLSX);
  if (carregando) return carregando;
  carregando = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_ARQUIVO;
    s.integrity = XLSX_SRI;
    s.async = true;
    s.onload = () => (/** @type {any} */ (globalThis).XLSX ? resolve(/** @type {any} */ (globalThis).XLSX) : reject(new Error('Biblioteca de planilha indisponível.')));
    s.onerror = () => { carregando = null; s.remove(); reject(new Error('Não foi possível carregar a biblioteca de planilha.')); };
    document.head.appendChild(s);
  });
  return carregando;
}

/**
 * Gera e baixa o XLSX com as linhas dadas.
 * @param {string} nome arquivo .xlsx @param {ColunaExport[]} colunas @param {any[]} linhas @param {string} [aba]
 */
export async function baixarXlsx(nome, colunas, linhas, aba = 'Relatório') {
  const XLSX = await carregarXlsx();
  const ws = XLSX.utils.aoa_to_sheet(matrizDeExportacao(colunas, linhas));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, aba.slice(0, 31));
  XLSX.writeFile(wb, nome);
}
