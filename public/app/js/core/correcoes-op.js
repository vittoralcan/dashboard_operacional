// @ts-check

/** Funções puras das correções de caixas (gestão): requisição de cada ação, cabeçalho de confirmação, colaboradores e mensagens. Sem DOM nem fetch. */

const BASE = '/operacional/correcoes';
const RESULTADOS = ['concluida', 'cancelada'];

/**
 * @param {string} acao 'trocar' | 'fechar' | 'excluir' | 'codigo' | 'reabrir'
 * @param {{ id: number }} caixa
 * @param {Record<string, any>} [dados]
 * @returns {{ metodo: 'PATCH'|'POST'|'DELETE', caminho: string, corpo?: Record<string, any> }}
 */
export function montarRequisicao(acao, caixa, dados = {}) {
  if (!caixa || !Number.isInteger(caixa.id) || caixa.id <= 0) throw new Error('Caixa inválida.');
  const raiz = `${BASE}/caixas/${caixa.id}`;
  if (acao === 'trocar') {
    if (!Number.isInteger(dados.colaboradorId) || dados.colaboradorId <= 0) throw new Error('Escolha o colaborador.');
    return { metodo: 'PATCH', caminho: `${raiz}/colaborador`, corpo: { colaboradorId: dados.colaboradorId } };
  }
  if (acao === 'fechar') {
    if (!RESULTADOS.includes(dados.resultado)) throw new Error('Escolha o resultado: concluída ou cancelada.');
    return { metodo: 'POST', caminho: `${raiz}/fechar`, corpo: { resultado: dados.resultado } };
  }
  if (acao === 'codigo') {
    const codigo = typeof dados.codigo === 'string' ? dados.codigo.replace(/[\u0000-\u001F\u007F]/g, '').trim() : '';
    if (!codigo) throw new Error('Digite o número da caixa.');
    return { metodo: 'PATCH', caminho: `${raiz}/codigo`, corpo: { codigo } };
  }
  if (acao === 'reabrir') return { metodo: 'POST', caminho: `${raiz}/reabrir`, corpo: {} };
  if (acao === 'excluir') return { metodo: 'DELETE', caminho: raiz };
  throw new Error('Ação desconhecida.');
}

/** @param {string} token */
export function cabecalhoConfirmacao(token) {
  return { 'X-Confirmacao-Senha': token };
}

/** @param {number} projetoId */
export function urlColaboradores(projetoId) {
  return `${BASE}/colaboradores?projetoId=${encodeURIComponent(String(projetoId))}`;
}

/** Itens sem id inteiro ou sem nome são descartados. @param {unknown} bruto @returns {{ id: number, nome: string, turnoId: number|null }[]} */
export function normalizarColaboradores(bruto) {
  if (!Array.isArray(bruto)) return [];
  /** @type {{ id: number, nome: string, turnoId: number|null }[]} */
  const saida = [];
  for (const item of bruto) {
    if (!item || typeof item !== 'object') continue;
    const b = /** @type {Record<string, any>} */ (item);
    if (!Number.isInteger(b.id) || typeof b.nome !== 'string' || !b.nome) continue;
    saida.push({ id: b.id, nome: b.nome, turnoId: Number.isInteger(b.turnoId) ? b.turnoId : null });
  }
  return saida;
}

/**
 * @param {{ status?: number, mensagem?: string, message?: string, corpo?: any }} erro
 * @param {'confirmacao'|'alteracao'} [fase] etapa em que o erro ocorreu
 */
export function mensagemFalha(erro, fase = 'alteracao') {
  const status = erro && erro.status;
  if (status === 401 && fase === 'confirmacao') return 'Senha incorreta. Confira e tente de novo.';
  if (status === 403 && erro.corpo && erro.corpo.codigo === 'confirmacao') return 'O painel pediu a confirmação da senha. Digite a senha novamente.';
  return (erro && (erro.mensagem || erro.message)) || 'Não foi possível concluir a alteração.';
}
