// @ts-check
import { $, delegar } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { fmt } from '../../core/format.js';
import { MESES } from '../../core/calendario.js';
import { escoposDeMeta, metaDoEscopo, validarValorMeta, VALOR_META_MAX } from '../../core/metas.js';
import { ausenteSe404 } from '../../config/recursos.js';
import { ic } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { erroBloco } from '../../ui/empty.js';
import { criarServicosPainel } from '../painel/servicos.js';

/** Metas mensais (HUB-04, admin) — tela mínima: uma linha por fluxo/módulo, valor do mês e **Salvar** (`PUT /metas`, auditado no servidor). */

const ANO_MIN = 2024;
const MESES_A_FRENTE = 12;

/**
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, sinal: AbortSignal, catalogo: import('../../core/catalogo.js').Catalogo }} ctx
 */
export async function montar(view, ctx) {
  const serv = criarServicosPainel(ctx.api);
  const escopos = escoposDeMeta(ctx.catalogo);
  const hoje = new Date();
  const limite = new Date(hoje.getFullYear(), hoje.getMonth() + MESES_A_FRENTE, 1);
  let ref = { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
  /** @type {import('../../core/metas.js').Meta[]} */
  let metas = [];
  let versao = 0;

  view.innerHTML = html`
    <div class="page-h rise"><div class="ttl"><span class="eyebrow">${ic('shield-check')} Administração</span><h1>Metas mensais</h1>
      <p class="sub">Defina a meta de cada fluxo e módulo para o mês. Ela alimenta os medidores do painel e o aviso de “meta atingida”.</p></div>
      <div class="acts mes-nav" role="group" aria-label="Mês das metas">
        <button type="button" class="icon-btn bordered" data-mes="-1" aria-label="Mês anterior">${ic('caret-left')}</button>
        <span class="chip-mono mes-rot" data-rotulo aria-live="polite"></span>
        <button type="button" class="icon-btn bordered" data-mes="1" aria-label="Próximo mês">${ic('caret-right')}</button></div></div>
    <div class="card rise" style="--i:1" data-lista aria-busy="true"></div>`.toString();
  const lista = /** @type {HTMLElement} */ ($('[data-lista]', view));

  const rotuloMes = () => `${MESES[ref.mes - 1].toUpperCase()} DE ${ref.ano}`;

  function pintarNav() {
    const r = /** @type {HTMLElement} */ ($('[data-rotulo]', view));
    r.textContent = rotuloMes();
    const ant = /** @type {HTMLButtonElement} */ ($('[data-mes="-1"]', view));
    const prox = /** @type {HTMLButtonElement} */ ($('[data-mes="1"]', view));
    ant.disabled = ref.ano === ANO_MIN && ref.mes === 1;
    prox.disabled = new Date(ref.ano, ref.mes, 1) > limite;
  }

  function desenhar() {
    lista.setAttribute('aria-busy', 'false');
    lista.innerHTML = html`<div class="metas-tab">
      <div class="metas-cab" aria-hidden="true"><span>Fluxo / módulo</span><span>Meta atual</span><span>Nova meta</span><span></span></div>
      ${escopos.map((e, i) => {
    const m = metaDoEscopo(metas, e.projeto, e.escopo);
    const id = `meta-${i}`;
    return html`<form class="metas-lin" aria-label="${`Meta de ${e.nome}`}" data-i="${i}" novalidate>
          <span class="metas-nm"><span class="ico-tile">${ic(e.icone)}</span><span><b>${e.nome}</b><small>${`${e.projetoNome} · ${e.unidade}`}</small></span></span>
          <span class="metas-atual mono">${m ? `${fmt(m.valor)} ${e.unidade}` : html`<span class="dim">Sem meta</span>`}</span>
          <span class="metas-campo"><label class="sr-only" for="${id}">${`Nova meta de ${e.nome} (${e.unidade})`}</label>
            <span class="input sm"><input id="${id}" inputmode="numeric" autocomplete="off" placeholder="${m ? String(m.valor) : 'Ex.: 1200'}" value="${m ? String(m.valor) : ''}" aria-describedby="${`${id}-msg`}"></span>
            <span class="field-msg" id="${`${id}-msg`}" role="alert" hidden></span></span>
          <span class="metas-acao"><button type="submit" class="btn sm primary"><span class="spin" aria-hidden="true"></span>Salvar</button></span>
        </form>`;
  })}</div>
      <p class="field-hint metas-nota">${ic('info')} Valores inteiros de 1 a ${fmt(VALOR_META_MAX)}. Cada alteração fica registrada na atividade do painel.</p>`.toString();
  }

  async function carregar() {
    const meu = ++versao;
    pintarNav();
    lista.setAttribute('aria-busy', 'true');
    try {
      const m = await serv.metas(ref, ctx.sinal);
      if (meu !== versao || ctx.sinal.aborted) return;
      metas = m;
      desenhar();
    } catch (e) {
      if (meu !== versao || ctx.sinal.aborted) return;
      console.error(e);
      const ausente = ausenteSe404('metas', e);
      lista.setAttribute('aria-busy', 'false');
      lista.innerHTML = (ausente
        ? html`<div class="empty"><h3>Metas ainda não disponíveis</h3><p>O servidor não tem a rota de metas publicada. Tente de novo depois que o backend for atualizado.</p></div>`
        : erroBloco({ titulo: 'Não foi possível carregar as metas', texto: /** @type {any} */ (e).message })).toString();
    }
  }

  /** @param {HTMLFormElement} form */
  async function salvar(form) {
    const e = escopos[Number(form.dataset.i)];
    const campo = /** @type {HTMLInputElement} */ ($('input', form));
    const msg = /** @type {HTMLElement} */ ($('.field-msg', form));
    const botao = /** @type {HTMLButtonElement} */ ($('button[type="submit"]', form));
    const v = validarValorMeta(campo.value);
    const erro = (/** @type {string} */ t) => { msg.hidden = !t; msg.textContent = t; campo.closest('.input')?.classList.toggle('invalid', !!t); campo.setAttribute('aria-invalid', String(!!t)); };
    if (!v.ok) { erro(v.erro); campo.focus(); return; }
    erro('');
    botao.disabled = true; botao.classList.add('loading');
    try {
      await serv.definirMeta({ projeto: e.projeto, escopo: e.escopo, ano: ref.ano, mes: ref.mes, valor: v.valor, unidade: e.unidade });
      toast('sucesso', 'Meta salva', `${e.nome}: ${fmt(v.valor)} ${e.unidade} em ${rotuloMes().toLowerCase()}.`);
      await carregar();
    } catch (err) {
      console.error(err);
      botao.disabled = false; botao.classList.remove('loading');
      erro(/** @type {any} */ (err).message || 'Não foi possível salvar a meta.'); // 400/403 do servidor, na mensagem dele
      campo.focus();
    }
  }

  const soltarEnvio = (() => { const h = (/** @type {Event} */ ev) => { ev.preventDefault(); salvar(/** @type {HTMLFormElement} */ (ev.target)); }; lista.addEventListener('submit', h); return () => lista.removeEventListener('submit', h); })();
  const soltarMes = delegar(view, 'click', '[data-mes]', (b) => {
    const d = new Date(ref.ano, ref.mes - 1 + Number(b.dataset.mes), 1);
    ref = { ano: d.getFullYear(), mes: d.getMonth() + 1 };
    carregar();
  });
  const soltarTentar = delegar(view, 'click', '[data-acao="tentar"]', () => carregar());

  await carregar();
  return { destruir() { soltarEnvio(); soltarMes(); soltarTentar(); } };
}
