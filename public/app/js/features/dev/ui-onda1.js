// @ts-check
import { html } from '../../core/html.js';
import { $, delegar } from '../../core/dom.js';
import { alternarTema } from '../../core/tema.js';
import { contar, animarBarras } from '../../core/motion.js';
import { ic } from '../../ui/icons.js';
import { graficoLinha, graficoBarras, sparkSVG, anelSVG } from '../../ui/charts.js';
import { montarTabela } from '../../ui/table.js';
import { montarCalendario } from '../../ui/calendar.js';
import { abrirPaleta } from '../../ui/palette.js';
import { abrirGaveta } from '../../ui/drawer.js';
import { delta, medidor, numeroContado, ligarSegmentado, ligarSwitch } from '../../ui/controles.js';
import { avatar } from '../../ui/avatar.js';

/** Demonstração dos componentes da Onda 1 (somente `#/_ui`). Dados de exemplo: só aqui, nunca em tela de produção. */

const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const V7 = [168, 192, 174, 210, 188, 12, 0];
const SPARK = [[12, 18, 15, 22, 28, 26, 34], [40, 38, 44, 41, 52, 49, 58], [5, 5, 6, 9, 7, 12, 11]];

const LINHAS = [
  { caixa: 'CX00262G14A', mesa: '0007', colab: 'Maria Souza', imagens: 1840, fase: 'VALIDAÇÃO', inicio: '02/10 09:12', ts: 5 },
  { caixa: 'CX00262G15B', mesa: '0003', colab: 'João Lima', imagens: 962, fase: 'DIGITALIZAÇÃO', inicio: '02/10 08:40', ts: 4 },
  { caixa: 'CX00262G16C', mesa: '0012', colab: 'Ana Paula', imagens: 2210, fase: 'QUALIDADE', inicio: '01/10 16:05', ts: 3 },
  { caixa: 'CX00262G2', mesa: '0001', colab: 'Carlos Silva', imagens: 75, fase: 'VALIDAÇÃO', inicio: '01/10 11:30', ts: 2 },
  { caixa: 'CX00262G10', mesa: '0009', colab: 'Fernanda Rocha', imagens: 1304, fase: 'DIGITALIZAÇÃO', inicio: '30/09 15:22', ts: 1 },
  { caixa: 'CX00262G9', mesa: '0004', colab: '<b>Teste</b> XSS', imagens: 310, fase: 'QUALIDADE', inicio: '30/09 10:01', ts: 0 },
];

const ITENS_PALETA = [
  { id: 'n1', grupo: 'Navegação', titulo: 'Seleção de projetos', icone: 'squares-four', atalho: 'G P' },
  { id: 'n2', grupo: 'Navegação', titulo: 'Macro View', icone: 'monitor-play', atalho: 'G M', palavras: 'tv' },
  { id: 'm1', grupo: 'Módulos', titulo: 'Higienização', sub: 'BOREAL · Operação Galpão Norte', icone: 'stack', atalho: 'G H' },
  { id: 'm2', grupo: 'Módulos', titulo: 'Digitalização', sub: 'BOREAL · Captura', icone: 'printer', atalho: 'G D' },
  { id: 'f1', grupo: 'Fluxos', titulo: 'Negativos', sub: 'ATLAS', icone: 'film-reel' },
  { id: 'p1', grupo: 'Fases', titulo: 'VALIDAÇÃO', sub: 'Negativos', icone: 'flow-arrow', metrica: '118 pastas' },
  { id: 'p2', grupo: 'Fases', titulo: 'VALIDAÇÃO', sub: 'Inventários', icone: 'flow-arrow', metrica: '64 pastas' },
  { id: 'a1', grupo: 'Ações', titulo: 'Alternar tema', icone: 'moon', atalho: 'T', aoExecutar: () => alternarTema() },
  { id: 'a2', grupo: 'Ações', titulo: 'Notificações', icone: 'bell', emBreve: 'auth.sessao' },
];

export function secoesOnda1() {
  return html`
  <section id="o1-graficos"><div class="sec-h"><div><h2>Gráficos SVG <span class="selo accent nodot">Onda 1</span></h2><p>Substituem Chart.js e ApexCharts. Passe o mouse: crosshair e tooltip. A tabela de valores está no <code>aria-label</code>.</p></div></div>
    <div class="bento">
      <div class="card c-8"><div class="card-h"><span class="card-t">${ic('chart-line-up')}Volume de trabalho (7 dias)</span></div><div id="g-linha"></div></div>
      <div class="card c-4"><div class="card-h"><span class="card-t">${ic('chart-bar')}Volume diário</span></div><div id="g-barras"></div></div>
      <div class="card c-12 spot-group" style="padding:0;border:0;background:none;box-shadow:none"><div class="bento">
        ${[['Higienização', 'caixas', 34, 'stack'], ['Digitalização', 'imagens', 58, 'printer'], ['Indexação IA', 'documentos', 11, 'file-text']].map(([n, u, v, ico], i) => html`
        <div class="card link spot c-4" tabindex="0"><div class="card-h"><span class="card-t">${ic(String(ico))}${n}</span>${delta(i === 1 ? -3.2 : 12.4)}</div>
          <div class="num-xl">${numeroContado(Number(v) * 37)}</div><span class="unit">${u} · este mês</span>${sparkSVG(SPARK[i], 44)}</div>`)}
      </div></div>
      <div class="card c-6"><div class="card-h"><span class="card-t">${ic('target')}Meta mensal</span></div>
        <div style="display:flex;gap:18px;align-items:center">${anelSVG(0.79, 72, 6)}<div style="flex:1;display:flex;flex-direction:column;gap:10px">${medidor({ valor: 948, meta: 1200 })}${medidor({ valor: 1150, meta: 1200, rotulo: 'Meta (≥ 90 % fica verde)' })}</div></div></div>
      <div class="card c-6"><div class="card-h"><span class="card-t">${ic('warning-diamond')}Casos de borda</span></div>
        <div id="g-vazio"></div><div id="g-um"></div></div>
    </div></section>

  <section id="o1-tabela"><div class="sec-h"><div><h2>Tabela densa interativa <span class="selo accent nodot">Onda 1</span></h2><p>Clique no cabeçalho para ordenar, use a busca (sem acento) e as pílulas. Há uma linha com HTML escapado de propósito.</p></div></div>
    <div class="card" id="o1-tbl"></div></section>

  <section id="o1-calendario"><div class="sec-h"><div><h2>Calendário de intervalo <span class="selo accent nodot">Onda 1</span></h2><p>Substitui o Flatpickr. Sem datas futuras; clique início → fim; atalhos.</p></div></div>
    <div class="bento"><div class="c-5"><div id="cal"></div></div><div class="card c-7"><div class="card-t">${ic('calendar')}Seleção atual</div><p class="mono" id="cal-saida">—</p></div></div></section>

  <section id="o1-overlays"><div class="sec-h"><div><h2>Paleta, gaveta e controles <span class="selo accent nodot">Onda 1</span></h2><p>A paleta abre também com <kbd>Ctrl</kbd> <kbd>K</kbd> nesta página.</p></div></div>
    <div class="card"><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
      <button class="btn" data-o1="paleta">${ic('magnifying-glass')}Abrir paleta <kbd>Ctrl K</kbd></button>
      <button class="btn" data-o1="gaveta">${ic('gear-six')}Abrir gaveta</button>
      <div class="seg" role="tablist" aria-label="Visualização" id="seg"><button role="tab" aria-selected="true">Análise</button><button role="tab" aria-selected="false">Fluxograma</button><button role="tab" aria-selected="false">Relatório</button></div>
      <button class="switch" role="switch" aria-checked="false" aria-label="Barra lateral recolhida" id="sw"></button><span class="dim" id="o1-estado">—</span>
    </div></div></section>`;
}

/** @param {HTMLElement} view */
export function ligarOnda1(view) {
  /** @type {(() => void)[]} */
  const fim = [];
  const g1 = graficoLinha(/** @type {HTMLElement} */ ($('#g-linha', view)), { valores: V7, rotulos: SEMANA, unidade: 'imagens', nome: 'Volume de trabalho' });
  const g2 = graficoBarras(/** @type {HTMLElement} */ ($('#g-barras', view)), { valores: V7, rotulos: SEMANA, unidade: 'imagens', nome: 'Volume diário' });
  graficoLinha(/** @type {HTMLElement} */ ($('#g-vazio', view)), { valores: [], rotulos: [], altura: 60, nome: 'Sem dados' });
  graficoLinha(/** @type {HTMLElement} */ ($('#g-um', view)), { valores: [42], rotulos: ['Hoje'], altura: 60, nome: 'Um ponto', eixoY: false });
  fim.push(g1.destruir, g2.destruir);

  const tab = montarTabela(/** @type {HTMLElement} */ ($('#o1-tbl', view)), {
    colunas: [
      { chave: 'caixa', rotulo: 'Caixa', mono: true, forte: true },
      { chave: 'mesa', rotulo: 'Mesa', mono: true },
      { chave: 'colab', rotulo: 'Colaborador', fmt: (v) => html`<span style="display:inline-flex;align-items:center;gap:8px">${avatar({ nome: v, tamanho: 20 })}${v}</span>` },
      { chave: 'imagens', rotulo: 'Imagens', num: true },
      { chave: 'fase', rotulo: 'Fase', fmt: (v) => html`<span class="tag">${v}</span>` },
      { chave: 'inicio', rotulo: 'Início', mono: true, ordenarPor: 'ts' },
    ],
    linhas: LINHAS, pilulas: 'fase', rotuloPilulas: 'fase', busca: true, ordemInicial: 'inicio', dirInicial: -1, rotuloContagem: 'caixas', rotulo: 'Caixas em andamento',
  });
  fim.push(tab.destruir);

  const saida = $('#cal-saida', view);
  const cal = montarCalendario(/** @type {HTMLElement} */ ($('#cal', view)), { atalhos: true, aoMudar: (s) => { if (saida) saida.textContent = s.completo ? `${s.ini?.toLocaleDateString('pt-BR')} → ${s.fim?.toLocaleDateString('pt-BR')}` : `Início: ${s.ini?.toLocaleDateString('pt-BR')}`; } });
  fim.push(cal.destruir);

  const estado = $('#o1-estado', view);
  const seg = ligarSegmentado(/** @type {HTMLElement} */ ($('#seg', view)), (i, b) => { if (estado) estado.textContent = `Aba: ${b.textContent}`; });
  const sw = ligarSwitch(/** @type {HTMLElement} */ ($('#sw', view)), (v) => { if (estado) estado.textContent = `Switch: ${v ? 'ligado' : 'desligado'}`; });
  fim.push(seg.destruir, sw.destruir);

  const abrir = () => abrirPaleta(() => ITENS_PALETA, { contexto: 'Catálogo' });
  fim.push(delegar(view, 'click', '[data-o1]', (a) => {
    if (a.dataset.o1 === 'paleta') abrir();
    else {
      const g = abrirGaveta({
      eyebrow: 'Exemplo', titulo: 'Configurações',
      corpo: html`<div class="set-sec"><div class="set-row"><div class="tx"><b>Tema</b><span data-tema-lbl>—</span></div><div class="theme-tg"><button data-tema="dark" aria-pressed="true" aria-label="Escuro">${ic('moon')}</button><button data-tema="light" aria-pressed="false" aria-label="Claro">${ic('sun')}</button></div></div></div>
        <div class="set-sec"><div class="set-row"><div class="tx"><b>Barra lateral recolhida</b><span>Lembra a escolha neste navegador</span></div><button class="switch" role="switch" aria-checked="false" aria-label="Barra lateral recolhida"></button></div></div>`,
      rodape: html`${avatar({ nome: 'Rafael Lima', semente: 'rafael.lima', tamanho: 32, online: true })}<div class="who"><b>Rafael Lima</b><span>rafael@exemplo.com</span></div><button class="btn sm" data-fechar>${ic('sign-out')}Fechar</button>`,
      });
      g.el.addEventListener('click', (e) => { const t = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest('[data-tema]')); if (t) alternarTema(/** @type {MouseEvent} */ (e)); });
    }
  }));
  const aoTeclar = (/** @type {KeyboardEvent} */ e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrir(); } };
  document.addEventListener('keydown', aoTeclar);
  fim.push(() => document.removeEventListener('keydown', aoTeclar));

  contar(view); animarBarras(view);
  return () => fim.forEach((f) => f());
}
