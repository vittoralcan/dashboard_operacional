// @ts-check
import { $$ } from './dom.js';
import { reduzido } from './motion.js';
import { CHAVES, ESTADO, store } from './store.js';
import { avisarPreferencia } from './preferencias.js';

/**
 * Tema claro/escuro (THM-01…03). Claro é o padrão. Usa a chave `dsn-theme` (texto puro
 * "dark"/"light"), a mesma do legado, para o tema acompanhar o usuário entre as versões.
 * O `data-theme` inicial é definido por js/anti-fouc.js antes da primeira pintura.
 */

/** @param {'dark'|'light'} t */
export function aplicarTema(t) {
  ESTADO.tema = t;
  document.documentElement.setAttribute('data-theme', t);
  store.gravarTexto(CHAVES.tema, t);
  sincronizarTemaUI();
  avisarPreferencia('tema', t);
}

/** Atualiza os controles de tema na tela (`.theme-tg`, `[data-tema-lbl]`, `[data-tema-ic]`). */
export function sincronizarTemaUI() {
  $$('.theme-tg button[data-tema]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tema === ESTADO.tema)));
  $$('[data-tema-lbl]').forEach((s) => { s.textContent = `${ESTADO.tema === 'dark' ? 'Escuro' : 'Claro'} · salvo neste navegador`; });
}

/**
 * Troca o tema com revelação circular (View Transitions API a partir do clique) e, sem suporte,
 * com transição de cores de 350 ms. Sem movimento (reduced-motion): troca direta.
 * @param {'dark'|'light'} novo @param {{ clientX?: number, clientY?: number }} [ev]
 */
export function definirTema(novo, ev) {
  if (novo === ESTADO.tema) return;
  const raiz = document.documentElement;
  const vt = /** @type {any} */ (document).startViewTransition;
  if (vt && !reduzido()) {
    let x = window.innerWidth - 56;
    let y = 26;
    if (ev && typeof ev.clientX === 'number' && ev.clientX) { x = ev.clientX; y = /** @type {number} */ (ev.clientY); }
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    try {
      const t = vt.call(document, () => aplicarTema(novo));
      setTimeout(() => { if (ESTADO.tema !== novo) aplicarTema(novo); }, 900);
      t.ready.then(() => {
        raiz.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 560, easing: 'cubic-bezier(.16,1,.3,1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(() => { /* ignora */ });
      return;
    } catch (e) { /* cai no fallback */ }
  }
  if (!reduzido()) raiz.classList.add('theme-anim');
  aplicarTema(novo);
  setTimeout(() => raiz.classList.remove('theme-anim'), 450);
}

/** @param {{ clientX?: number, clientY?: number }} [ev] */
export const alternarTema = (ev) => definirTema(ESTADO.tema === 'dark' ? 'light' : 'dark', ev);
