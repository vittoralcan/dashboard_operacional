// @ts-check
import { API } from '../../config.js';
import { normalizarPerfil } from '../../core/perfil.js';

/**
 * A conta do usuário no `back_auth` (api_noir.md A2–A4): perfil, edição do próprio nome e preferências. Cada método sobe o erro
 * (a tela decide o que mostrar). `{ success:false }` com 200 também é falha.
 *
 * @param {ReturnType<typeof import('../../core/api.js').criarApi>} api
 */
export function criarServicoConta(api) {
  /** @param {{ dados: any }} r */
  const exigir = (r) => {
    const j = r.dados;
    if (!j || j.success === false) throw new Error((j && (j.message || j.error)) || 'O servidor não devolveu os dados.');
    return j;
  };
  return {
    /** Dados da conta logada — também revalida `tipo`/`ativo` (conta desativada → 401). @param {AbortSignal} [sinal] */
    async me(sinal) {
      const p = normalizarPerfil(exigir(await api.get(`${API.auth}/auth/me`, { sinal, etag: false })).data);
      if (!p) throw new Error('Resposta inesperada do servidor.');
      return p;
    },
    /** Edita o PRÓPRIO nome (2–150 caracteres). `sessao:false`: um 401 aqui não derruba a sessão sozinho. @param {string} nome */
    async editarNome(nome) {
      const p = normalizarPerfil(exigir(await api.patch(`${API.auth}/auth/me`, { nome })).data);
      if (!p) throw new Error('Resposta inesperada do servidor.');
      return p;
    },
    /** Atualização PARCIAL das preferências; devolve o objeto completo já mesclado. @param {import('../../core/perfil.js').Preferencias} patch */
    async salvarPreferencias(patch) {
      const j = exigir(await api.patch(`${API.auth}/auth/me/preferencias`, patch));
      return j.data || {};
    },
  };
}
