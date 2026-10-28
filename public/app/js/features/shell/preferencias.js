// @ts-check
import { ESTADO } from '../../core/store.js';
import { aplicarTema } from '../../core/tema.js';
import { obterUsuario, atualizarUsuario } from '../../core/auth.js';
import { criarEmissor, mudancasDoUsuario } from '../../core/perfil.js';
import { EVENTO_PREFERENCIA, sincronizacaoLigada, definirMacroIntervalo } from '../../core/preferencias.js';
import { ativo, ausenteSe404 } from '../../config/recursos.js';
import { criarServicoConta } from '../usuarios/conta.js';

/**
 * Preferências na conta (USR-05, A4) e identidade (A2). Ao entrar, lê `GET /auth/me`: atualiza o que o menu mostra (nome, e-mail,
 * cargo, tipo) e — com "Acompanhar em outros computadores" ligado — **aplica as preferências do servidor** (tema, barra lateral,
 * tempo da Macro View). Depois, cada mudança local (evento `noir:preferencia`) vai ao servidor em *debounce* de 600 ms, com
 * falha silenciosa: a preferência local sempre vale. Um 404 devolve o recurso ao "Em breve".
 *
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, aplicarSidebar: (recolhida: boolean) => void }} c
 */
export function iniciarPreferencias(c) {
  const conta = criarServicoConta(c.api);
  const ctl = new AbortController();
  let aplicando = false;
  const emissor = criarEmissor(async (patch) => {
    try { await conta.salvarPreferencias(patch); } catch (e) { ausenteSe404('auth.preferencias', e); throw e; }
  });

  const aoMudar = (/** @type {Event} */ e) => {
    if (aplicando || !sincronizacaoLigada() || !ativo('auth.preferencias')) return;
    const d = /** @type {CustomEvent} */ (e).detail;
    emissor.marcar(d.chave, d.valor);
  };
  document.addEventListener(EVENTO_PREFERENCIA, aoMudar);

  /** Aplica no navegador o que o servidor guardou (sem devolver ao servidor). @param {import('../../core/perfil.js').Preferencias} p */
  function aplicar(p) {
    aplicando = true;
    try {
      if (p.tema && p.tema !== ESTADO.tema) aplicarTema(p.tema);
      if (typeof p.sidebarRecolhida === 'boolean' && p.sidebarRecolhida !== ESTADO.sidebarRecolhida) c.aplicarSidebar(p.sidebarRecolhida);
      if (p.macroIntervaloSeg && p.macroIntervaloSeg !== ESTADO.macroIntervalo) definirMacroIntervalo(p.macroIntervaloSeg);
    } finally { aplicando = false; }
  }

  return {
    /** Lê a conta, atualiza o usuário guardado e aplica as preferências. Falha NUNCA incomoda: o painel segue com o que o login trouxe. */
    async carregar() {
      if (!ativo('auth.me')) return null;
      try {
        const perfil = await conta.me(ctl.signal);
        const mudou = mudancasDoUsuario(obterUsuario(), perfil);
        if (Object.keys(mudou).length) { atualizarUsuario(/** @type {any} */ (mudou)); document.dispatchEvent(new CustomEvent('noir:usuario')); }
        if (sincronizacaoLigada()) aplicar(perfil.preferencias);
        return perfil;
      } catch (e) {
        if (!ctl.signal.aborted) { console.warn('Não foi possível ler a conta.', e); ausenteSe404('auth.me', e); }
        return null;
      }
    },
    destruir() { ctl.abort(); emissor.descartar(); document.removeEventListener(EVENTO_PREFERENCIA, aoMudar); },
  };
}
