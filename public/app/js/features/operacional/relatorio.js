// @ts-check
import { $ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { fmt } from '../../core/format.js';
import { API } from '../../config.js';
import { vazio, erroBloco } from '../../ui/empty.js';
import {
  normalizarHoraAHora, normalizarProjetos, normalizarTempoMedio, duracaoCurta, dataHojeSP, urlHoraAHora, urlTempoMedio,
} from '../../core/relatorio-op.js';

/** Relatório hora a hora (gestão): caixas por hora e por pessoa, e tempo médio por colaborador, por projeto, turno e dia. */

const HORAS = Array.from({ length: 24 }, (_, h) => h);
const rotuloHora = (/** @type {number} */ h) => `${String(h).padStart(2, '0')}h`;

/**
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, sinal: AbortSignal }} ctx
 */
export async function montar(view, ctx) {
  let versao = 0;
  /** @type {import('../../core/relatorio-op.js').ProjetoRel[]} */
  let projetos = [];
  const filtro = { projetoId: 0, turnoId: 0, etapa: 'higienizacao', data: dataHojeSP(Date.now()) };

  /** @param {string} caminho */
  async function buscar(caminho) {
    const r = await ctx.api.get(`${API.painel}${caminho}`, { sinal: ctx.sinal, etag: false });
    const j = r.dados;
    if (!j || j.success === false) throw new Error((j && (j.message || j.error)) || 'O servidor não devolveu os dados.');
    return j.data;
  }

  view.innerHTML = html`
    <div class="page-h rise"><div class="ttl"><h1>Relatório hora a hora</h1>
      <p class="sub">Caixas concluídas por hora e por pessoa, e o tempo médio por colaborador.</p></div></div>
    <form class="card rise relop-filtros" style="--i:1" data-filtros novalidate aria-label="Filtros do relatório">
      <label class="relop-campo">Etapa<select class="input sm" data-etapa>
        <option value="higienizacao">Higienização</option>
        <option value="remontagem">Remontagem</option>
      </select></label>
      <label class="relop-campo">Projeto<select class="input sm" data-projeto></select></label>
      <label class="relop-campo">Turno<select class="input sm" data-turno></select></label>
      <label class="relop-campo">Dia<input class="input sm" type="date" data-data></label>
    </form>
    <div data-corpo class="relop-corpo" aria-busy="true" aria-live="polite"></div>`.toString();
  const corpo = /** @type {HTMLElement} */ ($('[data-corpo]', view));
  const selProjeto = /** @type {HTMLSelectElement} */ ($('[data-projeto]', view));
  const selTurno = /** @type {HTMLSelectElement} */ ($('[data-turno]', view));
  const selEtapa = /** @type {HTMLSelectElement} */ ($('[data-etapa]', view));
  const inData = /** @type {HTMLInputElement} */ ($('[data-data]', view));
  inData.value = filtro.data;
  selEtapa.value = filtro.etapa;

  function pintarFiltros() {
    selProjeto.innerHTML = html`${projetos.map((p) => html`<option value="${String(p.id)}">${p.nome}</option>`)}`.toString();
    selProjeto.value = String(filtro.projetoId);
    const turnos = projetos.find((p) => p.id === filtro.projetoId)?.turnos ?? [];
    selTurno.innerHTML = html`<option value="">Todos os turnos</option>${turnos.map((t) => html`<option value="${String(t.id)}">${t.nome}</option>`)}`.toString();
    selTurno.value = filtro.turnoId ? String(filtro.turnoId) : '';
  }

  /** @param {import('../../core/relatorio-op.js').HoraAHora} r @param {import('../../core/relatorio-op.js').TempoMedio} t */
  function desenhar(r, t) {
    corpo.setAttribute('aria-busy', 'false');
    if (r.total <= 0) {
      corpo.innerHTML = vazio({ titulo: 'Sem produção neste dia', texto: 'Escolha outro dia, turno ou projeto.', tipo: 'busca' }).toString();
      return;
    }
    const maximo = r.pico ? r.pico.caixas : 1;
    const resumo = `Caixas por hora. Total ${r.total}.${r.pico ? ` Pico às ${rotuloHora(r.pico.hora)} com ${r.pico.caixas}.` : ''}${r.faixa ? ` Produção entre ${rotuloHora(r.faixa.de)} e ${rotuloHora(r.faixa.ate)}.` : ''}`;
    corpo.innerHTML = html`
      <section class="card rise relop-bloco" style="--i:2" aria-label="Caixas por hora">
        <div class="relop-resumo"><b class="mono">${fmt(r.total)}</b> caixas
          ${r.pico ? html`<span class="chip-mono">Pico: ${rotuloHora(r.pico.hora)} (${fmt(r.pico.caixas)})</span>` : ''}
          ${r.faixa ? html`<span class="chip-mono">Faixa: ${rotuloHora(r.faixa.de)} a ${rotuloHora(r.faixa.ate)}</span>` : ''}</div>
        <div class="relop-rolagem">
          <div class="relop-barras" role="img" aria-label="${resumo}">
            ${HORAS.map((h) => html`<div class="relop-col${r.pico && r.pico.hora === h ? ' pico' : ''}">
              <span class="relop-val mono">${r.horas[h] > 0 ? fmt(r.horas[h]) : ''}</span>
              <span class="relop-barra" style="${`height:${Math.round((r.horas[h] / maximo) * 100)}%`}"></span>
              <span class="relop-hora mono">${String(h).padStart(2, '0')}</span></div>`)}
          </div>
        </div>
      </section>
      <section class="card rise relop-bloco" style="--i:3" aria-label="Caixas por pessoa e hora">
        <h2 class="relop-tit">Por pessoa</h2>
        <div class="relop-rolagem">
          <table class="relop-tab" id="tabela-pessoas">
            <thead><tr><th scope="col">Pessoa</th>${HORAS.map((h) => html`<th scope="col" class="num">${String(h).padStart(2, '0')}</th>`)}<th scope="col" class="num">Total</th></tr></thead>
            <tbody>${r.colaboradores.map((c) => html`<tr><th scope="row">${c.nome}</th>${c.horas.map((v) => html`<td class="num mono">${v > 0 ? fmt(v) : ''}</td>`)}<td class="num mono"><b>${fmt(c.total)}</b></td></tr>`)}</tbody>
          </table>
        </div>
      </section>
      <section class="card rise relop-bloco" style="--i:4" aria-label="Tempo médio por colaborador">
        <h2 class="relop-tit">Tempo médio por caixa</h2>
        <p class="relop-resumo">Média geral: <b class="mono" data-media-geral>${duracaoCurta(t.mediaGeralS)}</b> em ${fmt(t.caixas)} caixas (dia selecionado)</p>
        <div class="relop-rolagem">
          <table class="relop-tab" id="tabela-tempo">
            <thead><tr><th scope="col">Pessoa</th><th scope="col" class="num">Caixas</th><th scope="col" class="num">Tempo médio</th></tr></thead>
            <tbody>${t.colaboradores.map((c) => html`<tr><th scope="row">${c.nome}</th><td class="num mono">${fmt(c.caixas)}</td><td class="num mono">${duracaoCurta(c.mediaS)}</td></tr>`)}</tbody>
          </table>
        </div>
      </section>`.toString();
  }

  async function carregar() {
    const meu = ++versao;
    corpo.setAttribute('aria-busy', 'true');
    corpo.innerHTML = html`<div class="card relop-carregando" role="status">Carregando…</div>`.toString();
    try {
      if (!projetos.length) {
        projetos = normalizarProjetos(await buscar('/operacional/relatorios/projetos'));
        if (meu !== versao || ctx.sinal.aborted) return;
        if (!projetos.length) {
          corpo.setAttribute('aria-busy', 'false');
          corpo.innerHTML = vazio({ titulo: 'Nenhum projeto disponível', texto: 'Cadastre um projeto operacional para ver o relatório.', tipo: 'busca' }).toString();
          return;
        }
        filtro.projetoId = projetos[0].id;
        pintarFiltros();
      }
      const [hh, tm] = await Promise.all([
        buscar(urlHoraAHora({ projetoId: filtro.projetoId, data: filtro.data, turnoId: filtro.turnoId || undefined, etapa: filtro.etapa })),
        buscar(urlTempoMedio({ projetoId: filtro.projetoId, de: filtro.data, ate: filtro.data, etapa: filtro.etapa })),
      ]);
      if (meu !== versao || ctx.sinal.aborted) return;
      desenhar(normalizarHoraAHora(hh), normalizarTempoMedio(tm));
    } catch (e) {
      if (meu !== versao || ctx.sinal.aborted) return;
      corpo.setAttribute('aria-busy', 'false');
      corpo.innerHTML = erroBloco({ texto: e instanceof Error ? e.message : undefined }).toString();
    }
  }

  selProjeto.addEventListener('change', () => { filtro.projetoId = Number(selProjeto.value); filtro.turnoId = 0; pintarFiltros(); carregar(); }, { signal: ctx.sinal });
  selEtapa.addEventListener('change', () => { filtro.etapa = selEtapa.value; carregar(); }, { signal: ctx.sinal });
  selTurno.addEventListener('change', () => { filtro.turnoId = Number(selTurno.value) || 0; carregar(); }, { signal: ctx.sinal });
  inData.addEventListener('change', () => { if (!inData.value) return; filtro.data = inData.value; carregar(); }, { signal: ctx.sinal });
  corpo.addEventListener('click', (ev) => {
    if (ev.target instanceof Element && ev.target.closest('[data-acao="tentar"]')) carregar();
  }, { signal: ctx.sinal });

  await carregar();
}
