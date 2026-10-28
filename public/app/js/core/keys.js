// @ts-check
import { temCamada, fecharTopo } from './camadas.js';
import { emCampoDeTexto } from './dom.js';

/**
 * Atalhos globais (PRD-02): `Ctrl/⌘+K`, acorde `G` + letra, teclas únicas e `Esc`.
 * Regras: teclas únicas e acordes ficam DESLIGADOS em campo de texto e com modal/gaveta/paleta
 * aberta; `Ctrl/⌘+K` e `Esc` funcionam sempre. Acorde expira em 1,5 s.
 *
 * @typedef {object} Atalho
 * @property {string} id
 * @property {string} [tecla]   tecla única em minúscula ("t", "[", ",", "?", "/", "n")
 * @property {string} [acorde]  segunda tecla após "g" ("p", "s"…)
 * @property {boolean} [mod]    exige Ctrl/⌘ (ex.: Mod+K → { tecla: 'k', mod: true })
 * @property {(e: KeyboardEvent) => void} aoAcionar
 * @property {() => boolean} [ativo] condição extra (ex.: só na rota do fluxograma)
 */

const TEMPO_ACORDE_MS = 1500;
const CAMADAS_BLOQUEANTES = ['modal', 'drawer', 'cmdk'];

/**
 * @param {{ alvo?: Pick<Document,'addEventListener'|'removeEventListener'>, aoAcorde?: (on: boolean) => void,
 *           agora?: () => number, setTimeoutFn?: typeof setTimeout, clearTimeoutFn?: typeof clearTimeout }} [o]
 */
export function criarAtalhos(o = {}) {
  const alvo = o.alvo || document;
  const agendar = o.setTimeoutFn || setTimeout;
  const cancelar = o.clearTimeoutFn || clearTimeout;
  /** @type {Atalho[]} */
  const lista = [];
  let acordeAtivo = false;
  /** @type {any} */
  let timer = null;

  const encerrarAcorde = () => { if (acordeAtivo) { acordeAtivo = false; o.aoAcorde?.(false); } cancelar(timer); timer = null; };
  const iniciarAcorde = () => { acordeAtivo = true; o.aoAcorde?.(true); cancelar(timer); timer = agendar(encerrarAcorde, TEMPO_ACORDE_MS); };

  /** @param {KeyboardEvent} e */
  function aoTeclar(e) {
    if (e.isComposing || e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = (e.key || '').toLowerCase();

    if (k === 'escape') { encerrarAcorde(); if (fecharTopo()) e.preventDefault(); return; }

    // com Ctrl/⌘ só valem atalhos que pedem `mod` (funcionam até em campo de texto)
    if (mod) {
      const a = lista.find((x) => x.mod && x.tecla === k && (x.ativo?.() ?? true));
      if (a) { e.preventDefault(); a.aoAcionar(e); }
      return;
    }
    if (e.altKey) return;

    if (emCampoDeTexto(e.target) || temCamada(CAMADAS_BLOQUEANTES)) { encerrarAcorde(); return; }

    if (acordeAtivo) {
      encerrarAcorde();
      const a = lista.find((x) => x.acorde === k && (x.ativo?.() ?? true));
      if (a) { e.preventDefault(); a.aoAcionar(e); }
      return;
    }
    if (k === 'g' && !e.shiftKey && lista.some((x) => x.acorde)) { iniciarAcorde(); return; }

    const a = lista.find((x) => !x.mod && !x.acorde && x.tecla === k && (x.ativo?.() ?? true));
    if (a) { e.preventDefault(); a.aoAcionar(e); }
  }

  alvo.addEventListener('keydown', /** @type {any} */ (aoTeclar));

  return {
    /** @param {Atalho} a @returns {() => void} função que remove o atalho */
    registrar(a) {
      lista.push(a);
      return () => { const i = lista.indexOf(a); if (i >= 0) lista.splice(i, 1); };
    },
    /** Remove todos os atalhos registrados por tela (ids que começam com o prefixo). @param {string} prefixo */
    removerPrefixo(prefixo) { for (let i = lista.length - 1; i >= 0; i--) if (lista[i].id.startsWith(prefixo)) lista.splice(i, 1); },
    lista: () => lista.slice(),
    destruir() { alvo.removeEventListener('keydown', /** @type {any} */ (aoTeclar)); encerrarAcorde(); },
  };
}
