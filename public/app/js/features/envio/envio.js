// @ts-check
import { $, delegar } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { API } from '../../config.js';
import { store, CHAVES } from '../../core/store.js';
import { fmt, fmtDec, tempoRelativo, horaBR, dataBR } from '../../core/format.js';
import { marcarAtualizado } from '../../core/vivo.js';
import { animarBarras } from '../../core/motion.js';
import { ativo, ausenteSe404 } from '../../config/recursos.js';
import {
  JANELAS, janelaValida, instanciaValida, normalizarResumoEnvio, semDadosDeEnvio, situacaoDoBridge, taxaExibida, linhasDoFunil, etapaDoEvento, serieDeVazao, nomeDoFluxo,
} from '../../core/envio.js';
import { ic } from '../../ui/icons.js';
import { vazio, erroBloco } from '../../ui/empty.js';
import { paginaEmBreve } from '../../ui/embreve.js';
import { graficoLinha, anelSVG } from '../../ui/charts.js';
import { montarTabela } from '../../ui/table.js';
import { ligarSegmentado } from '../../ui/controles.js';
import { ligarAtualizacao } from '../projetos/ao-vivo.js';

/**
 * Acompanhamento do Bridge (envio das pastas ao ownCloud, pós-esteira) — `#/envio`. Uma instalação do Bridge por vez
 * (`instancia`, lembrada neste navegador): sinal de vida, 4 cartões, funil por etapa, vazão (arquivos/min ou MB/s, nunca
 * dois eixos) e os eventos mais recentes. Dados: `GET /envio/resumo`. Atualiza a cada 30 s com a aba visível e no ↻ do topo; se
 * nada mudou, não redesenha (a busca da tabela não perde o foco). Falha ou 404 ficam no bloco (RNB-008, RNB-007).
 *
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, sinal: AbortSignal, aoSair: (f: () => void) => void,
 *           catalogo: import('../../core/catalogo.js').Catalogo }} ctx
 */
export async function montar(view, ctx) {
  let instancia = instanciaValida(store.texto(CHAVES.envioInstancia)) || '';
  let horas = janelaValida(store.texto(CHAVES.envioHoras));
  /** @type {'arquivos'|'mb'} */
  let grandeza = 'arquivos';
  /** @type {import('../../core/envio.js').ResumoEnvio|null} */
  let resumo = null;
  let assinatura = '';
  /** @type {{ destruir: () => void }[]} */
  let graficos = [];
  /** @type {(() => void)[]} */
  const desligar = [];

  view.innerHTML = html`
    <div class="mod-h rise"><a class="icon-btn bordered" href="#/projetos" aria-label="Voltar para projetos">${ic('arrow-left')}</a>
      <span class="ico-tile lg">${ic('arrow-fat-line-up')}</span>
      <div class="ttl"><span class="eyebrow">Pós-esteira · ownCloud</span><h1>Envio (Bridge)</h1></div>
      <div class="right"><span class="unit" id="ultima-cab">Atualizado: <b class="mono" id="gerado-txt">—</b></span></div></div>
    <form class="envio-barra rise" id="form-envio" novalidate>
      <div class="field"><label class="lbl" for="instancia">Instância do Bridge</label>
        <div class="input sm">${ic('hard-drives')}<input id="instancia" name="instancia" value="${instancia}" placeholder="ex.: bridge-cliente-x" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="instancia-msg"></div>
        <span class="field-msg" id="instancia-msg" role="alert" hidden></span></div>
      <button class="btn primary" type="submit">${ic('magnifying-glass')}Acompanhar</button>
      <div class="field"><span class="lbl" id="lbl-janela">Período</span>
        <div class="seg" role="tablist" aria-labelledby="lbl-janela" id="janela">${JANELAS.map((j) => html`<button type="button" role="tab" aria-selected="${j.horas === horas}" data-horas="${j.horas}">${j.rotulo}</button>`)}</div></div>
    </form>
    <div id="conteudo" aria-live="polite"></div>`.toString();
  const conteudo = /** @type {HTMLElement} */ ($('#conteudo', view));
  const msg = /** @type {HTMLElement} */ ($('#instancia-msg', view));
  const campo = /** @type {HTMLInputElement} */ ($('#instancia', view));

  const dataHora = (/** @type {number} */ ts) => (ts ? `${dataBR(new Date(ts)).slice(0, 5)} ${horaBR(new Date(ts))}` : '—');

  // ---------------------------------------------------------------- blocos
  function bannerSinal(/** @type {import('../../core/envio.js').ResumoEnvio} */ r) {
    const s = situacaoDoBridge(r.sinal);
    const quando = r.sinal.ultimoTs ? `${dataHora(r.sinal.ultimoTs)} (${tempoRelativo(s.idadeSeg || 0)})` : '';
    if (s.nivel === 'atrasado') return html`<div class="envio-sinal warn" role="alert">${ic('warning-diamond')}<span><b>Sem contato com o Bridge.</b> Último sinal de vida: ${quando}${r.sinal.versao ? ` · versão ${r.sinal.versao}` : ''}. Os números abaixo podem estar defasados.</span></div>`;
    if (s.nivel === 'sem-sinal') return html`<div class="envio-sinal info" role="status">${ic('info')}<span><b>Este Bridge ainda não enviou sinal de vida.</b> Confira se a instalação está configurada com a credencial desta instância.</span></div>`;
    return html`<div class="envio-sinal ok" role="status">${ic('heartbeat')}<span><b>Bridge ativo.</b> Último sinal: ${quando}${r.sinal.versao ? ` · versão ${r.sinal.versao}` : ''}.</span></div>`;
  }

  function cartoes(/** @type {import('../../core/envio.js').ResumoEnvio} */ r) {
    const c = r.cartoes;
    const taxa = taxaExibida(c);
    return html`<div class="bento spot-group">
      <section class="card c-3 spot rise" style="--i:1" aria-labelledby="k-env"><div class="card-h"><span class="card-t" id="k-env">${ic('check-circle')}Enviadas hoje</span></div>
        <div class="num-xl">${fmt(c.enviadasHoje)}</div><span class="unit">pastas concluídas desde 00:00</span></section>
      <section class="card c-3 spot rise" style="--i:2" aria-labelledby="k-pen"><div class="card-h"><span class="card-t" id="k-pen">${ic('hourglass-medium')}Pendentes</span></div>
        <div class="num-xl">${fmt(c.pendentes)}</div><span class="unit">na fila, enviando ou conferindo</span></section>
      <section class="card c-3 spot rise" style="--i:3" aria-labelledby="k-div"><div class="card-h"><span class="card-t" id="k-div">${ic('warning-diamond')}Divergências abertas</span>${c.divergenciasAbertas ? html`<span class="selo warn nodot">atenção</span>` : html`<span class="selo ok nodot">em dia</span>`}</div>
        <div class="num-xl">${fmt(c.divergenciasAbertas)}</div><span class="unit">pastas cujo último evento é "divergente"</span></section>
      <section class="card c-3 spot rise" style="--i:4" aria-labelledby="k-tax"><div class="card-h"><span class="card-t" id="k-tax">${ic('seal-check')}Taxa de conferência</span></div>
        ${taxa === null ? html`<div class="num-xl dim">—</div><span class="unit">sem envios concluídos hoje</span>`
    : html`<div class="anel-linha"><div class="anel-w">${anelSVG(Math.min(1, taxa / 100), 54, 5)}<span class="mono">${fmtDec(taxa, 1)}%</span></div><span class="unit">das pastas de hoje conferiram sem divergência</span></div>`}</section></div>`;
  }

  function funil(/** @type {import('../../core/envio.js').ResumoEnvio} */ r) {
    const janela = JANELAS.find((j) => j.horas === horas);
    return html`<section class="card c-5 spot rise" style="--i:5" aria-labelledby="t-funil"><div class="card-h"><span class="card-t" id="t-funil">${ic('funnel')}Funil de envio</span><span class="unit">últimas ${janela ? janela.rotulo : `${horas} h`}</span></div>
      <div class="rows" style="gap:6px">${linhasDoFunil(r.funil).map((l) => html`<div class="hbar funil" title="${`${l.rotulo}: ${fmt(l.total)}`}"><span class="selo nodot ${l.tom}">${l.rotulo}</span><span class="tr"><i data-w="${l.rel}"></i></span><span class="r">${fmt(l.total)}</span></div>`)}</div></section>`;
  }

  function vazao() {
    return html`<section class="card c-7 spot rise" style="--i:6" aria-labelledby="t-vaz"><div class="card-h"><span class="card-t" id="t-vaz">${ic('chart-line-up')}Vazão</span>
        <div class="seg" role="tablist" aria-label="Grandeza da vazão" id="grandeza"><button type="button" role="tab" aria-selected="true" data-g="arquivos">Arquivos/min</button><button type="button" role="tab" aria-selected="false" data-g="mb">MB/s</button></div></div>
      <div id="grafico-vazao" class="chart-box"></div></section>`;
  }

  function desenharVazao() {
    graficos.forEach((g) => g.destruir()); graficos = [];
    const el = $('#grafico-vazao', view);
    if (!el || !resumo) return;
    const s = serieDeVazao(resumo.vazao, grandeza);
    graficos.push(graficoLinha(el, { valores: s.valores, rotulos: s.rotulos, altura: 170, unidade: grandeza === 'mb' ? 'MB/s' : 'arquivos/min', nome: grandeza === 'mb' ? 'Vazão em MB por segundo' : 'Vazão em arquivos por minuto' }));
  }

  function recentes(/** @type {import('../../core/envio.js').ResumoEnvio} */ r) {
    return html`<div class="sec-h"><div><h2>${ic('list-checks')}Eventos recentes</h2><p>Os últimos eventos de envio recebidos do Bridge (até 20).</p></div></div>
      <div class="card" id="tabela-recentes"></div>`;
  }

  function montarRecentes(/** @type {import('../../core/envio.js').ResumoEnvio} */ r) {
    const el = $('#tabela-recentes', view);
    if (!el) return;
    montarTabela(el, {
      colunas: [
        { chave: 'pasta', rotulo: 'Pasta', mono: true, forte: true },
        { chave: 'fluxo', rotulo: 'Fluxo' },
        { chave: 'etapa', rotulo: 'Etapa', fmt: (_v, l) => html`<span class="${`selo nodot ${l.tom}`}">${l.alerta ? ic('warning-diamond') : ''}${l.etapa}</span>` },
        { chave: 'resultado', rotulo: 'Resultado' },
        { chave: 'detalhe', rotulo: 'Detalhe', fmt: (v) => (v ? html`<span class="envio-detalhe">${v}</span>` : '—') },
        { chave: 'quando', rotulo: 'Quando', ordenarPor: 'ts' },
      ],
      linhas: r.recentes.map((e) => {
        const et = etapaDoEvento(e);
        return { pasta: e.pasta, fluxo: nomeDoFluxo(e.fluxo, ctx.catalogo), etapa: et.rotulo, tom: et.tom, alerta: e.alerta, resultado: e.resultado || '—', detalhe: e.detalhe || (e.alerta ? 'Sem detalhe.' : ''), quando: dataHora(e.ts), ts: e.ts };
      }),
      ordemInicial: 'quando', dirInicial: -1, busca: true, altura: 360, rotuloContagem: 'eventos', rotulo: 'Eventos de envio recentes', vazio: 'Nenhum evento neste período.',
    });
  }

  function desenhar(/** @type {import('../../core/envio.js').ResumoEnvio} */ r) {
    if (semDadosDeEnvio(r)) {
      conteudo.innerHTML = html`${bannerSinal(r)}${vazio({ tipo: 'ampulheta', titulo: 'Nenhum dado de envio ainda.', texto: `A instância “${instancia}” ainda não reportou nenhum evento. Assim que o Bridge enviar a primeira pasta, ela aparece aqui.` })}`.toString();
      return;
    }
    conteudo.innerHTML = html`${bannerSinal(r)}${cartoes(r)}<div class="bento spot-group">${funil(r)}${vazao()}</div>${recentes(r)}`.toString();
    animarBarras(conteudo);
    desenharVazao();
    montarRecentes(r);
    const seg = $('#grandeza', view);
    if (seg) desligar.push(ligarSegmentado(seg, (_i, b) => { grandeza = /** @type {'arquivos'|'mb'} */ (b.dataset.g); desenharVazao(); }).destruir);
  }

  // ---------------------------------------------------------------- dados
  async function carregar() {
    if (!instancia) {
      conteudo.innerHTML = vazio({ titulo: 'Informe a instância do Bridge.', texto: 'Digite o identificador da instalação (o mesmo usado ao emitir a credencial de serviço) para acompanhar os envios dela.' }).toString();
      return;
    }
    if (!ativo('envio')) { conteudo.innerHTML = paginaEmBreve({ recurso: 'envio', titulo: 'Acompanhamento de envio', texto: 'O servidor ainda não publicou o resumo de envio do Bridge.' }).toString(); return; }
    conteudo.setAttribute('aria-busy', 'true');
    try {
      const r = await ctx.api.get(`${API.painel}/envio/resumo?instancia=${encodeURIComponent(instancia)}&horas=${horas}`, { sinal: ctx.sinal, etag: false });
      if (ctx.sinal.aborted) return;
      const j = r.dados;
      if (!j || j.success === false) throw new Error((j && (j.message || j.error)) || 'O servidor não devolveu os dados.');
      const novo = normalizarResumoEnvio(j.data);
      const ass = JSON.stringify({ ...novo, geradoEm: 0, i: instancia, h: horas });
      resumo = novo;
      const gerado = $('#gerado-txt', view); if (gerado) gerado.textContent = horaBR(new Date(novo.geradoEm || Date.now()));
      if (ass !== assinatura) { assinatura = ass; graficos.forEach((g) => g.destruir()); graficos = []; desenhar(novo); }
      marcarAtualizado();
    } catch (e) {
      if (ctx.sinal.aborted) return;
      const err = /** @type {any} */ (e);
      assinatura = '';
      if (ausenteSe404('envio', err)) { conteudo.innerHTML = paginaEmBreve({ recurso: 'envio', titulo: 'Acompanhamento de envio', texto: 'O servidor ainda não publicou o resumo de envio do Bridge.' }).toString(); return; }
      console.error(e);
      conteudo.innerHTML = erroBloco({ titulo: 'Não foi possível carregar o envio', texto: err.message || 'Erro ao consultar o servidor.' }).toString();
    } finally { conteudo.removeAttribute('aria-busy'); }
  }

  // ---------------------------------------------------------------- interações
  const vivo = ligarAtualizacao(carregar);
  const aoEnviar = (/** @type {Event} */ e) => {
    e.preventDefault();
    const v = instanciaValida(campo.value);
    if (!v) { msg.hidden = false; msg.textContent = 'Use de 3 a 60 caracteres: letras minúsculas, números e hífen.'; campo.setAttribute('aria-invalid', 'true'); campo.focus(); return; }
    msg.hidden = true; campo.removeAttribute('aria-invalid');
    campo.value = v; instancia = v; assinatura = '';
    store.gravarTexto(CHAVES.envioInstancia, v);
    vivo.rodar();
  };
  $('#form-envio', view)?.addEventListener('submit', aoEnviar);
  desligar.push(() => $('#form-envio', view)?.removeEventListener('submit', aoEnviar));
  desligar.push(ligarSegmentado(/** @type {HTMLElement} */ ($('#janela', view)), (_i, b) => { horas = janelaValida(b.dataset.horas); store.gravarTexto(CHAVES.envioHoras, String(horas)); assinatura = ''; vivo.rodar(); }).destruir);
  desligar.push(delegar(view, 'click', '[data-acao="tentar"]', () => { assinatura = ''; vivo.rodar(); }));

  await carregar();
  return {
    destruir() {
      vivo.destruir();
      desligar.forEach((f) => f());
      graficos.forEach((g) => g.destruir());
    },
  };
}
