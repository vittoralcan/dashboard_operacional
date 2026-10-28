// @ts-check
import { $, delegar } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { API } from '../../config.js';
import { toast } from '../../ui/toast.js';
import { abrirModal } from '../../ui/modal.js';
import { vazio, erroBloco } from '../../ui/empty.js';
import { ic } from '../../ui/icons.js';
import { chipsHtml } from '../../ui/caixa-chips.js';
import { duracaoCurta } from '../../core/relatorio-op.js';
import { FILTROS_ETAPA, filtrarCaixas, horaCurta, normalizarCaixas, ordenarAoVivo, rotuloEtapa, tempoDecorrido, urlCaixas } from '../../core/caixas-op.js';
import { cabecalhoConfirmacao, mensagemFalha, montarRequisicao, normalizarColaboradores, urlColaboradores } from '../../core/correcoes-op.js';

/** Correções de caixas (gestão): trocar colaborador, editar o número, fechar ou excluir, confirmando a senha do supervisor a cada alteração. */

const TITULOS = { trocar: 'Trocar colaborador', codigo: 'Editar número da caixa', fechar: 'Fechar caixa', reabrir: 'Retomar em andamento', excluir: 'Excluir caixa' };
const CONCLUIDO = { trocar: 'Colaborador trocado', codigo: 'Número da caixa alterado', fechar: 'Caixa fechada', reabrir: 'Caixa em andamento de novo', excluir: 'Caixa excluída' };

/**
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, sinal: AbortSignal }} ctx
 */
export async function montar(view, ctx) {
  let vivo = true;
  let versao = 0;
  /** @type {import('../../core/caixas-op.js').CaixaOp[]} */
  let caixas = [];
  let busca = '';
  let etapa = '';
  let status = '';

  view.innerHTML = html`
    <div class="page-h rise"><div class="ttl"><h1>Correções de caixas</h1>
      <p class="sub">Troque o colaborador, corrija o número, feche ou exclua uma caixa. Cada alteração pede a sua senha.</p></div></div>
    <div class="corop-filtros" role="search">
      <input class="input" type="search" placeholder="Buscar por caixa ou colaborador" aria-label="Buscar por caixa ou colaborador" data-busca>
      <div class="op-seg" role="group" aria-label="Etapa">${FILTROS_ETAPA.map((f) => html`<button type="button" class="btn sm ghost" data-etapa="${f.id}" aria-pressed="${String(f.id === '')}">${f.rotulo}</button>`)}</div>
      <div class="op-seg" role="group" aria-label="Situação">${[['', 'Todas'], ['aberta', 'Em andamento'], ['concluida', 'Concluídas']].map(([id, rotulo]) => html`<button type="button" class="btn sm ghost" data-status="${id}" aria-pressed="${String(id === '')}">${rotulo}</button>`)}</div>
    </div>
    <div data-corpo class="corop-corpo" aria-busy="true" aria-live="polite"></div>`.toString();
  const corpo = /** @type {HTMLElement} */ ($('[data-corpo]', view));

  /** @param {string} caminho */
  async function buscar(caminho) {
    const r = await ctx.api.get(`${API.painel}${caminho}`, { sinal: ctx.sinal, etag: false });
    const j = r.dados;
    if (!j || j.success === false) throw new Error((j && (j.message || j.error)) || 'O servidor não devolveu os dados.');
    return j.data;
  }

  function pintar() {
    corpo.setAttribute('aria-busy', 'false');
    if (!caixas.length) {
      corpo.innerHTML = vazio({ titulo: 'Nenhuma caixa para corrigir', texto: 'Quando houver caixas, elas aparecem aqui.', tipo: 'ampulheta' }).toString();
      return;
    }
    const lista = ordenarAoVivo(filtrarCaixas(caixas, { busca, etapa, status }));
    if (!lista.length) {
      corpo.innerHTML = vazio({ titulo: 'Nada com esse filtro', texto: 'Limpe a busca ou escolha outra etapa ou situação.' }).toString();
      return;
    }
    const agora = Date.now();
    corpo.innerHTML = html`<ul class="corop-lista" aria-label="Lista de caixas">${lista.map((c) => html`<li class="corop-item${c.pausaAutomatica && c.status === 'aberta' ? ' pendente' : ''}">
      <div><div class="corop-linha1"><span class="corop-cod">${c.codigo}</span><span class="cxop-etapa">${rotuloEtapa(c.etapa)}</span></div>
        <div class="corop-selos">${chipsHtml(c)}</div></div>
      <div class="corop-meta"><span>${c.colaboradorNome}</span><small>Início ${horaCurta(c.inicioMs)}${c.fimMs !== null ? html` · fim ${horaCurta(c.fimMs)}` : ''} · ${duracaoCurta(tempoDecorrido(c, agora))}</small></div>
      <div class="corop-acoes">
        <button type="button" class="btn sm" data-acao="codigo" data-id="${String(c.id)}" aria-label="${`Editar número da caixa ${c.codigo}`}">${ic('pencil-simple')}Editar número</button>
        <button type="button" class="btn sm" data-acao="trocar" data-id="${String(c.id)}" aria-label="${`Trocar colaborador da caixa ${c.codigo}`}">${ic('users')}Trocar colaborador</button>
        ${c.status === 'aberta' ? html`<button type="button" class="btn sm" data-acao="fechar" data-id="${String(c.id)}" aria-label="${`Fechar caixa ${c.codigo}`}">${ic('check')}Fechar</button>`
          : html`<button type="button" class="btn sm" data-acao="reabrir" data-id="${String(c.id)}" aria-label="${`Retomar a caixa ${c.codigo} em andamento`}">${ic('arrow-clockwise')}Retomar em andamento</button>`}
        <button type="button" class="btn sm danger" data-acao="excluir" data-id="${String(c.id)}" aria-label="${`Excluir caixa ${c.codigo}`}">${ic('trash')}Excluir</button>
      </div></li>`)}</ul>`.toString();
  }

  async function carregar() {
    const meu = ++versao;
    corpo.setAttribute('aria-busy', 'true');
    try {
      const dados = await buscar(urlCaixas({ limite: 100 }));
      if (meu !== versao || !vivo) return;
      caixas = normalizarCaixas(dados);
      pintar();
    } catch (e) {
      if (meu !== versao || !vivo || ctx.sinal.aborted) return;
      console.error(e);
      corpo.setAttribute('aria-busy', 'false');
      corpo.innerHTML = erroBloco({ titulo: 'Não foi possível carregar as caixas', texto: /** @type {any} */ (e).message }).toString();
    }
  }

  /** @param {'trocar'|'codigo'|'fechar'|'reabrir'|'excluir'} acao @param {import('../../core/caixas-op.js').CaixaOp} caixa */
  async function abrirConfirmacao(acao, caixa) {
    /** @type {{ id: number, nome: string, turnoId: number|null }[]} */
    let colaboradores = [];
    let erroLista = '';
    if (acao === 'trocar') {
      try { colaboradores = normalizarColaboradores(await buscar(urlColaboradores(caixa.projetoId))); } catch (e) {
        console.error(e);
        erroLista = 'Não foi possível carregar os colaboradores do projeto.';
      }
    }
    const campos = acao === 'trocar'
      ? html`<label for="corop-colab">Novo colaborador</label>
          <select class="input" id="corop-colab" name="colaboradorId" required>
            <option value="">Selecione</option>
            ${colaboradores.map((c) => html`<option value="${String(c.id)}" ${c.id === caixa.colaboradorId ? 'selected' : ''}>${c.nome}</option>`)}</select>`
      : acao === 'codigo'
        ? html`<label for="corop-codigo">Número da caixa</label>
          <input class="input mono" id="corop-codigo" name="codigo" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${caixa.codigo}" required>`
      : acao === 'fechar'
        ? html`<label for="corop-res">Resultado</label>
          <select class="input" id="corop-res" name="resultado"><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option></select>`
        : acao === 'reabrir'
          ? html`<p class="corop-aviso">A caixa ${caixa.codigo} volta para “Em andamento”, com ${caixa.colaboradorNome}. O tempo entre o fechamento e agora não conta na duração.</p>`
          : html`<p class="corop-aviso" role="alert">Excluir a caixa ${caixa.codigo} não tem desfazer. A ação fica registrada na auditoria.</p>`;
    const m = abrirModal({
      tamanho: 'sm',
      titulo: TITULOS[acao],
      sub: `Caixa ${caixa.codigo}`,
      corpo: html`<form class="corop-form" data-form novalidate>
        ${campos}
        <label for="corop-senha">Sua senha</label>
        <input class="input" id="corop-senha" name="senha" type="password" autocomplete="current-password" required>
        <p class="corop-erro field-msg" data-erro role="alert" ${erroLista ? '' : 'hidden'}>${erroLista}</p>
        <div class="corop-acoes"><button type="submit" class="btn ${acao === 'excluir' ? 'danger' : 'primary'}"><span class="spin" aria-hidden="true"></span>Confirmar</button>
          <button type="button" class="btn ghost" data-fechar>Cancelar</button></div>
      </form>`,
    });
    const form = /** @type {HTMLFormElement} */ ($('[data-form]', m.el));
    const erro = /** @type {HTMLElement} */ ($('[data-erro]', m.el));
    const botao = /** @type {HTMLButtonElement} */ ($('button[type="submit"]', form));
    /** @param {string} t */
    const falhar = (t) => { erro.hidden = !t; erro.textContent = t; botao.disabled = false; botao.classList.remove('loading'); };

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(form);
      const senha = String(f.get('senha') || '');
      if (!senha) { falhar('Digite a sua senha para confirmar.'); $('#corop-senha', m.el)?.focus(); return; }
      botao.disabled = true; botao.classList.add('loading');
      /** @type {'confirmacao'|'alteracao'} */
      let fase = 'confirmacao';
      try {
        const conf = await ctx.api.post(`${API.auth}/auth/confirmar-senha`, { senha }, { sessao: false });
        const token = conf.dados && conf.dados.data && conf.dados.data.token;
        if (typeof token !== 'string' || !token) throw new Error('O servidor não confirmou a senha.');
        fase = 'alteracao';
        const dados = {
          colaboradorId: Number(f.get('colaboradorId')),
          resultado: String(f.get('resultado') || ''),
          codigo: String(f.get('codigo') || ''),
        };
        const req = montarRequisicao(acao, caixa, dados);
        const url = `${API.painel}${req.caminho}`;
        const opcoes = { cabecalhos: cabecalhoConfirmacao(token) };
        const resp = req.metodo === 'DELETE'
          ? await ctx.api.delete(url, opcoes)
          : await (req.metodo === 'PATCH' ? ctx.api.patch : ctx.api.post)(url, req.corpo, opcoes);
        if (resp.dados && resp.dados.success === false) throw new Error(resp.dados.message || 'O painel não aceitou a alteração.');
        toast('sucesso', CONCLUIDO[acao], `Caixa ${caixa.codigo}`);
        m.fechar();
        await carregar();
      } catch (e) {
        console.error(e);
        falhar(mensagemFalha(/** @type {any} */ (e), fase));
        m.tremer();
      }
    });
  }

  const soltar = delegar(view, 'click', '[data-acao]', (b) => {
    const caixa = caixas.find((c) => c.id === Number(b.dataset.id));
    const acao = /** @type {'trocar'|'codigo'|'fechar'|'reabrir'|'excluir'} */ (b.dataset.acao);
    if (caixa && acao in TITULOS) abrirConfirmacao(acao, caixa);
  });

  $('[data-busca]', view)?.addEventListener('input', (ev) => { busca = /** @type {HTMLInputElement} */ (ev.target).value; pintar(); }, { signal: ctx.sinal });
  view.addEventListener('click', (ev) => {
    const b = ev.target instanceof Element ? /** @type {HTMLElement|null} */ (ev.target.closest('[data-etapa],[data-status]')) : null;
    if (!b) return;
    if (b.dataset.etapa !== undefined) etapa = b.dataset.etapa; else status = b.dataset.status || '';
    const grupo = b.dataset.etapa !== undefined ? '[data-etapa]' : '[data-status]';
    const atual = b.dataset.etapa !== undefined ? etapa : status;
    view.querySelectorAll(grupo).forEach((x) => x.setAttribute('aria-pressed', String((/** @type {HTMLElement} */ (x).dataset.etapa ?? /** @type {HTMLElement} */ (x).dataset.status) === atual)));
    pintar();
  }, { signal: ctx.sinal });

  await carregar();

  return { destruir() { vivo = false; versao++; soltar(); } };
}
