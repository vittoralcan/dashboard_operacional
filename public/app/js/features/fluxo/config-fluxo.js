// @ts-check

/** Instâncias Captura com configuração em `config/fluxos/<instância>.json`. */
export const INSTANCIAS = ['negativos', 'certidoes', 'inventarios', 'cartografia'];

/** @type {Map<string, any>} */
const cache = new Map();

/**
 * Lê `config/fluxos/<instância>.json` (uma vez por sessão). É o mesmo schema de `GET …/config`; quando esse endpoint
 * existir (recurso `fluxo.config`), troca-se só esta função. Falha → `null` (a tela mostra o erro de configuração).
 * @param {string} instancia @param {AbortSignal} [sinal]
 * @returns {Promise<any|null>}
 */
export async function carregarConfigFluxo(instancia, sinal) {
  if (!/^[a-z-]+$/.test(instancia)) return null;
  if (cache.has(instancia)) return cache.get(instancia);
  try {
    const r = await fetch(`config/fluxos/${instancia}.json`, { signal: sinal });
    if (!r.ok) return null;
    const j = await r.json();
    cache.set(instancia, j);
    return j;
  } catch (e) { return null; }
}
