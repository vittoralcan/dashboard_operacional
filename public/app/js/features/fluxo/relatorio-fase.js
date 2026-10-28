// @ts-check
import { $, delegar } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { fmt } from '../../core/format.js';
import { rotuloPeriodo } from '../../core/calendario.js';
import { contar } from '../../core/motion.js';
import { ic } from '../../ui/icons.js';
import { abrirModal } from '../../ui/modal.js';
import { abrirModalPeriodo } from '../../ui/periodo.js';
import { montarTabela } from '../../ui/table.js';
import { erroBloco } from '../../ui/empty.js';
import { exportarRelatorio } from '../../ui/exportar.js';

const COLUNAS = [
  { chave: 'fase', rotulo: 'Fase' },
  { chave: 'projeto', rotulo: 'Projeto', forte: true },
  { chave: 'lote', rotulo: 'Lote' },
  { chave: 'pasta', rotulo: 'Pasta', mono: true },
  { chave: 'documentos', rotulo: 'Doc.', num: true },
  { chave: 'imagens', rotulo: 'Img.', num: true },
  { chave: 'dataFinalizado', rotulo: 'Data Finalizado', mono: true, ordenarPor: '_ts' },
];

/**
 * "Gerar Relatório" de uma coluna da análise (FLX-04): modal de opções (Hoje | Por Período) → resultado `xl`
 * com "Compilando relatório…", totais, tabela "Pastas Finalizadas" (filtro, pílulas por projeto, ordenação) e
 * **Exportar (XLSX)** das linhas visíveis. `400` do servidor (ex.: "O período máximo é de 92 dias.") aparece NO
 * modal de opções, sem fechá-lo; falha de rede no resultado vira estado de erro com "Tentar novamente".
 *
 * @param {import('../../core/fluxo-prod.js').ConfigFluxo} cfg @param {import('../../core/fluxo-prod.js').ColunaGestao} coluna
 * @param {ReturnType<typeof import('./dados.js').criarDadosFluxo>} dados
 */
export function abrirRelatorioFase(cfg, coluna, dados) {
  abrirModalPeriodo({
    eyebrow: `Relatório · ${cfg.nome}`, titulo: 'Opções de Relatório', sub: `${coluna.titulo} — pastas finalizadas`,
    gerar: (periodo, ctrl) => abrirResultado(cfg, coluna, dados, periodo, ctrl),
  });
}

/** @param {import('../../core/fluxo-prod.js').ConfigFluxo} cfg @param {import('../../core/fluxo-prod.js').ColunaGestao} coluna @param {ReturnType<typeof import('./dados.js').criarDadosFluxo>} dados @param {{ dataInicio: string, dataFim: string }} periodo @param {{ erro: (m: string) => void, fechar: () => void }} ctrl */
function abrirResultado(cfg, coluna, dados, periodo, ctrl) {
  const ref = rotuloPeriodo(periodo);
  const ctl = new AbortController();
  const m = abrirModal({
    tamanho: 'xl', eyebrow: `Relatório · ${cfg.nome}`, titulo: `${coluna.titulo} — pastas finalizadas`,
    sub: html`Data de referência: <b class="mono" style="color:var(--fg)">${ref}</b>`, aoFechar: () => ctl.abort(),
  });
  const rodape = html`<button type="button" class="btn ghost" data-fechar>Fechar</button>`;
  let primeira = true;

  async function carregar() {
    m.set({
      corpo: html`<div class="sk-card" style="min-height:300px" aria-busy="true"><div class="sk sk-line" style="width:100%;height:30px"></div><div class="sk sk-line" style="width:100%;height:30px"></div><div class="sk sk-line" style="width:100%;height:30px"></div></div>
        <div class="sk-label"><span class="spin" aria-hidden="true"></span>Compilando relatório…</div>`,
      rodape,
    });
    try {
      const r = await dados.relatorio(coluna.fasId, periodo, ctl.signal);
      if (ctl.signal.aborted) return;
      if (primeira) { primeira = false; ctrl.fechar(); m.modal.focus({ preventScroll: true }); } // o resultado chegou: o modal de opções já cumpriu o papel
      m.set({
        corpo: html`<div class="doc-corpo"><div class="stat-pair"><div><span class="eyebrow">Total pastas</span><span class="num-lg" data-count="${r.totais.pastas}">${fmt(r.totais.pastas)}</span></div>
            <div><span class="eyebrow">Total imagens</span><span class="num-lg" data-count="${r.totais.imagens}">${fmt(r.totais.imagens)}</span></div></div>
          <h3 style="font-size:13.5px">Pastas Finalizadas</h3><div data-tabela></div></div>`,
        rodape: html`${rodape}<button type="button" class="btn primary" data-xlsx>${ic('microsoft-excel-logo')}Exportar (XLSX)</button>`,
      });
      contar(m.el);
      const tb = montarTabela(/** @type {HTMLElement} */ ($('[data-tabela]', m.el)), {
        colunas: COLUNAS, linhas: r.linhas, busca: true, pilulas: 'projeto', rotuloPilulas: 'projeto', altura: 340, ordemInicial: 'dataFinalizado', dirInicial: -1,
        rotuloContagem: 'pastas', rotulo: 'Pastas finalizadas no período', vazio: 'Nenhuma pasta finalizada neste período.',
      });
      $('[data-xlsx]', m.el)?.addEventListener('click', () => exportarRelatorio({
        base: `${cfg.nome} ${coluna.titulo}`, ref, aba: 'Pastas finalizadas', linhas: tb.visiveis(), colunas: COLUNAS.map((c) => ({ chave: c.chave, rotulo: c.rotulo })),
      }));
    } catch (e) {
      if (ctl.signal.aborted) return;
      const erro = /** @type {any} */ (e);
      if (primeira && erro.status === 400) { m.fechar(); ctrl.erro(erro.message || 'Período inválido.'); return; } // recusa do servidor: volta ao modal de opções
      console.error(e);
      m.set({ corpo: erroBloco({ titulo: 'Não foi possível gerar o relatório', texto: erro.message }), rodape });
    }
  }
  delegar(m.el, 'click', '[data-acao="tentar"]', () => carregar());
  carregar();
}
