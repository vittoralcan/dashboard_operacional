// @ts-check
import { falha, naoEncontrada, ok, usuarioDoToken } from './base.js';
import { rotaAuth } from './auth.js';
import { criarFluxos } from './fluxos.js';
import { criarServicos } from './servicos.js';
import { rotaTerminal, rotaCorrecoes } from './op-terminal.js';
import { rotaGestaoOperacional } from './op-gestao.js';

/**
 * API simulada do modo demonstração: recebe a requisição que o painel faria ao `back_auth`, ao `back_dashboard` ou ao Apps Script
 * do Monitoramento e devolve a resposta no mesmo contrato (`{ success, data }` / `{ success:false, message }` e status HTTP).
 * É uma função pura de (método, URL, corpo, cabeçalhos) sobre um estado em memória; quem a liga ao `fetch` é `instalar.js`.
 *
 * @param {{ bases: { auth: string, painel: string, gas: string }, buscarArquivo: (caminho: string) => Promise<any> }} dep
 */
export function criarApiSimulada(dep) {
  /** @type {Map<string, Promise<any>>} */
  const configs = new Map();
  const buscarConfig = (/** @type {string} */ inst) => {
    if (!configs.has(inst)) configs.set(inst, dep.buscarArquivo(`config/fluxos/${inst}.json`));
    return /** @type {Promise<any>} */ (configs.get(inst));
  };
  /** @type {ReturnType<typeof criarServicos> | null} */
  let servicos = null;
  const fluxos = criarFluxos({ buscarConfig, metaDe: (inst) => (servicos ? servicos.metaDe(inst) : null) });
  servicos = criarServicos({ fluxos });
  const serv = servicos;

  /** A URL é de uma das APIs simuladas? @param {string} url */
  const atende = (url) => [dep.bases.auth, dep.bases.painel, dep.bases.gas].some((b) => url === b || url.startsWith(`${b}/`) || url.startsWith(`${b}?`));

  /**
   * @param {{ metodo: string, url: string, corpo: any, cabecalhos: Record<string, string> }} req
   * @returns {Promise<import('./base.js').Resposta>}
   */
  async function responder({ metodo, url, corpo, cabecalhos }) {
    const u = new URL(url);
    if (url.startsWith(dep.bases.gas)) return serv.rotaGas(u.searchParams);
    const base = url.startsWith(dep.bases.auth) ? 'auth' : 'painel';
    const caminho = u.pathname.replace(/^.*?\/api(?=\/)/, '');
    if (caminho === '/health') return ok({ status: 'ok', demo: true });
    if (base === 'auth') return rotaAuth({ metodo, caminho, corpo, cabecalhos });

    const usuario = usuarioDoToken(cabecalhos);
    if (!usuario) return falha(401, 'Token de autenticação ausente ou expirado.');
    const query = u.searchParams;
    if (caminho.startsWith('/operacional/terminal/')) {
      if (usuario.tipo !== 'turno' && usuario.tipo !== 'admin') return falha(403, 'Acesso restrito ao tablet do turno.');
      return rotaTerminal({ metodo, caminho: caminho.slice('/operacional/terminal'.length), corpo, usuario });
    }
    if (usuario.tipo === 'turno') return falha(403, 'Conta de turno só acessa o tablet.');
    if (caminho.startsWith('/operacional/correcoes/')) return rotaCorrecoes({ metodo, caminho: caminho.slice('/operacional/correcoes'.length), query, corpo, cabecalhos });
    if (caminho.startsWith('/operacional/')) return rotaGestaoOperacional({ metodo, caminho: caminho.slice('/operacional'.length), query, corpo, usuario });
    if (caminho.startsWith('/atlas/')) return fluxos.rota({ metodo, caminho, query });
    const r = await serv.rota({ metodo, caminho, query, corpo, usuario });
    return r || naoEncontrada();
  }

  return { atende, responder };
}
