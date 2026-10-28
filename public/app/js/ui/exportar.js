// @ts-check
import { fmt } from '../core/format.js';
import { nomeDoRelatorio, baixarXlsx, baixarCsv } from '../core/exportar.js';
import { toast } from './toast.js';

/**
 * Exportação com aviso ao usuário (CMP-02): gera o XLSX com as linhas VISÍVEIS; se a biblioteca
 * não carregar, oferece o CSV (mesmas linhas) em vez de falhar mudo.
 *
 * @param {{ base: string, ref?: string, colunas: import('../core/exportar.js').ColunaExport[], linhas: any[], aba?: string }} o
 */
export async function exportarRelatorio(o) {
  if (!o.linhas.length) { toast('info', 'Nada para exportar', 'Nenhuma linha visível na tabela.'); return; }
  const nome = nomeDoRelatorio(o.base, { ref: o.ref });
  const aguarde = toast('loading', 'Gerando planilha…', nome);
  try {
    await baixarXlsx(nome, o.colunas, o.linhas, o.aba);
    aguarde.fechar();
    toast('sucesso', 'Relatório gerado', `${nome} · ${fmt(o.linhas.length)} linha(s)`);
  } catch (e) {
    console.error(e);
    aguarde.fechar();
    toast('erro', 'Não foi possível gerar o XLSX', 'Você pode baixar as mesmas linhas em CSV.', {
      duracao: 9000,
      acao: { rotulo: 'Baixar CSV', fn: () => baixarCsv(nomeDoRelatorio(o.base, { ref: o.ref, ext: 'csv' }), o.colunas, o.linhas) },
    });
  }
}
