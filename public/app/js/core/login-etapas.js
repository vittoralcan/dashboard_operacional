// @ts-check
/**
 * Sequência REAL do login (AUT-02/05/06, RNB-009). Cada etapa executa
 * trabalho de verdade e é cronometrada; nada de milissegundos fixos nem de atraso artificial acima
 * de `duracaoMinMs`. Dependências injetadas → testável sem rede nem DOM.
 *
 * Etapas: (1) autenticar → fatal; (2) permissões → usa a resposta (`GET /auth/me` é "Em breve");
 * (3) sincronizar projetos → catálogo; (4) montar painel → import() dos módulos. As etapas 2–4 NÃO
 * são fatais: falha vira aviso e segue com o que houver (RNB-007).
 *
 * @typedef {{ id: string, rotulo: string, estado: 'rodando'|'ok'|'aviso'|'erro', ms?: number, nota?: string, progresso: number }} EventoEtapa
 */

/** Percentual da barra do topo ao CONCLUIR cada etapa — proporcional às etapas, não ao tempo. */
export const PROGRESSO = { inicio: 8, autenticar: 32, permissoes: 58, projetos: 86, painel: 100 };
export const LIMITE_LENTO_MS = 4000;

/**
 * @param {{
 *   autenticar: () => Promise<{ token: string, usuario: any }>,
 *   carregarProjetos: () => Promise<{ total: number }>,
 *   montarPainel: () => Promise<void>,
 *   aoEvento: (e: EventoEtapa) => void,
 *   agora?: () => number,
 *   dormir?: (ms: number) => Promise<void>,
 *   duracaoMinMs?: number,
 *   limiteLentoMs?: number,
 *   agendar?: (fn: () => void, ms: number) => any,
 *   cancelar?: (id: any) => void,
 * }} d
 * @returns {Promise<{ token: string, usuario: any, totalMs: number }>} rejeita se a autenticação falhar (etapa 1)
 */
export async function executarLogin(d) {
  const agora = d.agora || (() => Date.now());
  const dormir = d.dormir || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const agendar = d.agendar || ((fn, ms) => setTimeout(fn, ms));
  const cancelar = d.cancelar || ((id) => clearTimeout(id));
  const t0 = agora();
  const emitir = (/** @type {EventoEtapa} */ e) => d.aoEvento(e);

  // ---- 1. autenticar (fatal) ----
  const ROT1 = 'Autenticando credenciais';
  emitir({ id: 'auth', rotulo: ROT1, estado: 'rodando', progresso: PROGRESSO.inicio });
  const ini1 = agora();
  const lento = agendar(() => emitir({ id: 'auth', rotulo: ROT1, estado: 'rodando', nota: 'O servidor está respondendo devagar…', progresso: PROGRESSO.inicio }), d.limiteLentoMs ?? LIMITE_LENTO_MS);
  /** @type {{ token: string, usuario: any }} */
  let sessao;
  try {
    sessao = await d.autenticar();
  } catch (e) {
    cancelar(lento);
    emitir({ id: 'auth', rotulo: ROT1, estado: 'erro', ms: agora() - ini1, progresso: PROGRESSO.inicio });
    throw e;
  }
  cancelar(lento);
  emitir({ id: 'auth', rotulo: ROT1, estado: 'ok', ms: agora() - ini1, progresso: PROGRESSO.autenticar });

  /** @param {string} id @param {string} rotulo @param {number} prog @param {() => Promise<string|void>} fn */
  const naoFatal = async (id, rotulo, prog, fn) => {
    emitir({ id, rotulo, estado: 'rodando', progresso: prog });
    const ini = agora();
    try {
      const nota = await fn();
      emitir({ id, rotulo: nota ? `${rotulo} ${nota}` : rotulo, estado: 'ok', ms: agora() - ini, progresso: prog });
    } catch (e) {
      emitir({ id, rotulo, estado: 'aviso', ms: agora() - ini, nota: 'indisponível — continuando', progresso: prog });
    }
  };

  // ---- 2. permissões: a resposta do login já traz tipo/precisaTrocarSenha ----
  await naoFatal('perm', 'Carregando permissões', PROGRESSO.permissoes, async () => `(${sessao.usuario && sessao.usuario.tipo ? sessao.usuario.tipo : 'padrão'})`);
  // ---- 3. projetos ----
  await naoFatal('proj', 'Sincronizando projetos', PROGRESSO.projetos, async () => { const r = await d.carregarProjetos(); return `(${r.total})`; });
  // ---- 4. painel ----
  await naoFatal('painel', 'Montando painel', PROGRESSO.painel, () => d.montarPainel());

  // piso de duração (RNB-009): espera só o que faltar, nunca mais que isso
  const total = agora() - t0;
  const min = d.duracaoMinMs ?? 0;
  if (total < min) await dormir(min - total);
  return { ...sessao, totalMs: agora() - t0 };
}

/** "00,52s" — carimbo de tempo do log (6 caracteres). @param {number} ms */
export const carimbo = (ms) => `${(Math.max(0, ms) / 1000).toFixed(2).replace('.', ',')}s`.padStart(6, '0');
