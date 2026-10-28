// @ts-check
import { $, delegar } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { fmt } from '../../core/format.js';
import { ic } from '../../ui/icons.js';
import { abrirModal } from '../../ui/modal.js';
import { montarTabela } from '../../ui/table.js';
import { vazio, erroBloco } from '../../ui/empty.js';
import { toast } from '../../ui/toast.js';
import { exportarRelatorio } from '../../ui/exportar.js';
import { LIMITE_TELA } from './dados.js';

const COLUNAS_PASTAS = [
  { chave: 'fase', rotulo: 'Fase' },
  { chave: 'projeto', rotulo: 'Projeto', forte: true },
  { chave: 'lote', rotulo: 'Lote' },
  { chave: 'pasta', rotulo: 'Pasta', mono: true },
  { chave: 'documentos', rotulo: 'Doc.', num: true },
  { chave: 'imagens', rotulo: 'Img.', num: true },
];
const COLUNAS_LOTE = [
  { chave: 'lote', rotulo: 'Lote', forte: true },
  { chave: 'pastas', rotulo: 'Pastas', num: true },
  { chave: 'imagens', rotulo: 'Img.', num: true },
];

/**
 * Modal da fase (FLX-09): "Pastas atualmente na fase". Fase normal → tabela Fase · Projeto · Lote · Pasta · Doc. · Img.
 * (filtro e pílulas por projeto; pede `?limite=500` e avisa quando truncada; **Exportar** busca TODAS as linhas em páginas
 * de 5.000 antes de gerar). Fase de **espera** → abre agrupada por lote (`pastas-por-lote`), com alternância para pasta a pasta.
 *
 * @param {import('../../core/fluxo-prod.js').ConfigFluxo} cfg @param {import('../../core/fluxo-prod.js').Fase} fase
 * @param {ReturnType<typeof import('./dados.js').criarDadosFluxo>} dados
 */
export function abrirModalFase(cfg, fase, dados) {
  const ctl = new AbortController();
  const espera = fase.tipo === 'espera';
  let agrupado = espera;
  const m = abrirModal({ tamanho: 'lg', eyebrow: 'Pastas atualmente na fase', titulo: fase.nome, sub: `${cfg.projeto} · ${cfg.nome}`, aoFechar: () => ctl.abort() });
  const rodapeBase = html`<button type="button" class="btn ghost" data-fechar>Fechar</button>`;

  const cabecalho = (/** @type {number} */ total, /** @type {boolean} */ lote) => m.set({
    titulo: html`${fase.nome}<span class="selo accent nodot">${`${fmt(total)} Total`}</span>`,
    sub: `${cfg.projeto} · ${cfg.nome}${lote ? ' · visão agrupada por lote' : ''}`,
  });

  async function carregar() {
    m.set({
      corpo: html`<div class="sk-card" style="min-height:240px" aria-busy="true"><div class="sk sk-line" style="width:100%;height:30px"></div><div class="sk sk-line" style="width:100%;height:30px"></div><div class="sk sk-line" style="width:100%;height:30px"></div></div>
        <div class="sk-label"><span class="spin" aria-hidden="true"></span>Carregando pastas…</div>`,
      rodape: rodapeBase,
    });
    try {
      if (agrupado) await mostrarPorLote(); else await mostrarPastas();
    } catch (e) {
      if (ctl.signal.aborted) return;
      console.error(e);
      m.set({ corpo: erroBloco({ titulo: 'Não foi possível carregar as pastas', texto: /** @type {any} */ (e).message }), rodape: rodapeBase });
    }
  }

  const alternar = () => (espera ? html`<button type="button" class="btn" data-alternar>${agrupado ? 'Ver pasta a pasta' : 'Ver agrupado por lote'}</button>` : '');

  async function mostrarPorLote() {
    const linhas = await dados.pastasPorLote(fase.fasId, ctl.signal);
    if (ctl.signal.aborted) return;
    const total = linhas.reduce((s, l) => s + l.pastas, 0);
    cabecalho(total, true);
    if (!linhas.length) { semPastas(); return; }
    m.set({ corpo: html`<div data-tabela></div>`, rodape: html`${rodapeBase}${alternar()}<button type="button" class="btn primary" data-xlsx>${ic('microsoft-excel-logo')}Exportar (XLSX)</button>` });
    const tb = montarTabela(/** @type {HTMLElement} */ ($('[data-tabela]', m.el)), { colunas: COLUNAS_LOTE, linhas, busca: true, altura: 380, ordemInicial: 'pastas', dirInicial: -1, rotuloContagem: 'lotes', rotulo: 'Pastas por lote' });
    $('[data-xlsx]', m.el)?.addEventListener('click', () => exportarRelatorio({ base: `${cfg.nome} ${fase.nome} por lote`, colunas: COLUNAS_LOTE, linhas: tb.visiveis(), aba: 'Por lote' }));
  }

  async function mostrarPastas() {
    const { linhas, total } = await dados.pastas(fase.fasId, { limite: LIMITE_TELA }, ctl.signal);
    if (ctl.signal.aborted) return;
    cabecalho(total, false);
    if (!linhas.length) { semPastas(); return; }
    const truncada = total > linhas.length;
    m.set({
      corpo: html`${truncada ? html`<div class="aviso-amostra" role="note">${ic('info')}${`Mostrando ${fmt(linhas.length)} de ${fmt(total)} pastas.`}</div>` : ''}<div data-tabela></div>`,
      rodape: html`${rodapeBase}${alternar()}<button type="button" class="btn primary" data-xlsx>${ic('microsoft-excel-logo')}Exportar (XLSX)</button>`,
    });
    const tb = montarTabela(/** @type {HTMLElement} */ ($('[data-tabela]', m.el)), {
      colunas: COLUNAS_PASTAS, linhas, busca: true, pilulas: 'projeto', rotuloPilulas: 'projeto', altura: 380, rotuloContagem: 'pastas', rotulo: 'Pastas atualmente na fase',
    });
    const botao = /** @type {HTMLButtonElement} */ ($('[data-xlsx]', m.el));
    botao.addEventListener('click', async () => {
      if (!truncada) { exportarRelatorio({ base: `${cfg.nome} ${fase.nome}`, colunas: COLUNAS_PASTAS, linhas: tb.visiveis(), aba: 'Pastas' }); return; }
      // truncada: o arquivo leva TODAS as pastas da fase, não só as 500 da tela
      botao.disabled = true;
      const rotulo = botao.innerHTML;
      try {
        const todas = await dados.pastasTodas(fase.fasId, (feito, tot) => { botao.textContent = `Buscando ${fmt(feito)} de ${fmt(tot)}…`; }, ctl.signal);
        if (ctl.signal.aborted) return;
        toast('info', 'Exportando todas as pastas da fase', `${fmt(todas.length)} pastas (a exportação ignora o filtro da tela).`);
        await exportarRelatorio({ base: `${cfg.nome} ${fase.nome}`, colunas: COLUNAS_PASTAS, linhas: todas, aba: 'Pastas' });
      } catch (e) {
        if (!ctl.signal.aborted) toast('erro', 'Não foi possível buscar todas as pastas', /** @type {any} */ (e).message);
      } finally { if (botao.isConnected) { botao.disabled = false; botao.innerHTML = rotulo; } }
    });
  }

  function semPastas() {
    m.set({ corpo: vazio({ titulo: 'Nenhuma pasta nesta fase', texto: 'Quando houver pastas aguardando nesta etapa, elas serão listadas aqui.' }), rodape: rodapeBase });
  }

  delegar(m.el, 'click', '[data-acao="tentar"]', () => carregar());
  delegar(m.el, 'click', '[data-alternar]', () => { agrupado = !agrupado; carregar(); });
  carregar();
  return m;
}
