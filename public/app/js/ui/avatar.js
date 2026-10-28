// @ts-check
import { html, raw } from '../core/html.js';

/** FNV-1a de 32 bits (design_system.md §8). @param {string} s */
export function hashTexto(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Primeira letra do primeiro nome + primeira do último; nome único → duas primeiras letras. @param {string} nome */
export function iniciais(nome) {
  const p = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  const a = Array.from(p[0]);
  if (p.length > 1) return (a[0] + Array.from(p[p.length - 1])[0]).toUpperCase();
  return (a[0] + (a[1] || '')).toUpperCase();
}

/** Matizes do gradiente a partir da semente. @param {string} semente */
export function matizes(semente) {
  const h = hashTexto(semente);
  const h1 = h % 360;
  const h2 = (h1 + 40 + ((h >>> 9) % 70)) % 360;
  return { h1, h2 };
}

/**
 * Avatar com gradiente gerado. Semente: `usuario.login` (estável mesmo se o nome mudar);
 * colaboradores sem login usam o nome. Decorativo (`aria-hidden`): o nome ao lado carrega a informação.
 * @param {{ nome: string, semente?: string, tamanho?: number, online?: boolean }} o
 */
export function avatar(o) {
  const { h1, h2 } = matizes(o.semente || o.nome);
  return html`<span class="avatar" style="${`--s:${Number(o.tamanho) || 28}px;--a1:hsl(${h1} 88% 62%);--a2:hsl(${h2} 82% 44%)`}" aria-hidden="true">${iniciais(o.nome)}${o.online ? raw('<span class="st"></span>') : ''}</span>`;
}
