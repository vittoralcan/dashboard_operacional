// @ts-check
import { delegar } from '../../core/dom.js';

/** Atualização automática dos números da seleção de projetos e dos hubs (igual aos módulos: 30 s, só com a aba visível). */
export const INTERVALO_MS = 30000;

/**
 * Liga o ↻ do topo (`noir:atualizar`) e a atualização periódica a UMA função `carregar`. Nunca roda duas ao mesmo tempo
 * (uma consulta lenta não empilha as seguintes) e pausa com a aba oculta.
 * @param {() => Promise<void>} carregar @param {number} [intervalo]
 */
export function ligarAtualizacao(carregar, intervalo = INTERVALO_MS) {
  let rodando = false;
  const rodar = async () => {
    if (rodando) return;
    rodando = true;
    try { await carregar(); } finally { rodando = false; }
  };
  const aoAtualizar = (/** @type {Event} */ e) => { /** @type {any} */ (e).detail.tratar(); rodar(); };
  document.addEventListener('noir:atualizar', aoAtualizar);
  const timer = setInterval(() => { if (!document.hidden) rodar(); }, intervalo);
  return { rodar, destruir() { clearInterval(timer); document.removeEventListener('noir:atualizar', aoAtualizar); } };
}

/**
 * Cartões `role="link"` com `data-nav="/rota"`: clique, Enter e Espaço navegam (o que o `<a>` faria). Clique em controle
 * interno (botão, link) não dispara o cartão.
 * @param {HTMLElement} raiz @param {(rota: string) => void} ir
 */
export function ligarCartoes(raiz, ir) {
  const soltar = delegar(raiz, 'click', '[data-nav]', (el, e) => {
    if (/** @type {HTMLElement} */ (e.target).closest('a, button')) return;
    ir(/** @type {string} */ (el.dataset.nav));
  });
  const aoTeclar = (/** @type {KeyboardEvent} */ e) => {
    const el = /** @type {HTMLElement|null} */ ((/** @type {any} */ (e.target)).closest?.('[data-nav]'));
    if (!el || e.target !== el || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    ir(/** @type {string} */ (el.dataset.nav));
  };
  raiz.addEventListener('keydown', /** @type {any} */ (aoTeclar));
  return () => { soltar(); raiz.removeEventListener('keydown', /** @type {any} */ (aoTeclar)); };
}
