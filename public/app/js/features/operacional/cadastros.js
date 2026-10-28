// @ts-check
import { $, $$, delegar } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { API } from '../../config.js';
import { toast } from '../../ui/toast.js';
import { erroBloco } from '../../ui/empty.js';
import { RECURSOS, validarCadastro, urlCadastro } from '../../core/cadastros-op.js';

/** Cadastros operacionais (admin): projetos, turnos, colaboradores, mesas e metas, com lista e formulário na mesma tela. */

/** Título do formulário. Recurso `semId` (metas) edita quando a etapa está preenchida; os demais, quando há id. Sem DOM. @param {import('../../core/cadastros-op.js').Recurso} def @param {Record<string, any>} valores */
export function tituloFormulario(def, valores) {
  const editando = def.semId ? valores.etapa !== undefined && valores.etapa !== null && valores.etapa !== '' : !!valores.id;
  return `${editando ? 'Editar' : 'Novo cadastro'}: ${def.rotulo}`;
}

/**
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, sinal: AbortSignal }} ctx
 */
export async function montar(view, ctx) {
  let recurso = 'colaboradores';
  /** @type {Record<string, any[]>} */
  let listas = { projetos: [], turnos: [] };
  /** @type {Record<string, any> | null} linha em edição; `{}` = novo cadastro; null = formulário fechado */
  let edicao = null;
  let versao = 0;

  /** @param {string} caminho */
  async function buscar(caminho) {
    const r = await ctx.api.get(`${API.painel}${caminho}`, { sinal: ctx.sinal, etag: false });
    const j = r.dados;
    if (!j || j.success === false) throw new Error((j && (j.message || j.error)) || 'O servidor não devolveu os dados.');
    return Array.isArray(j.data) ? j.data : [];
  }

  view.innerHTML = html`
    <div class="page-h rise"><div class="ttl"><h1>Cadastros operacionais</h1>
      <p class="sub">Projetos, turnos, colaboradores, mesas e metas do operacional.</p></div>
      <div class="acts"><button type="button" class="btn primary" data-novo>Novo cadastro</button></div></div>
    <div class="cadop-abas rise" style="--i:1" role="group" aria-label="Recurso">
      ${Object.entries(RECURSOS).map(([k, r]) => html`<button type="button" class="btn sm" data-aba="${k}" aria-pressed="false">${r.rotulo}</button>`)}
    </div>
    <div class="card rise cadop-form" style="--i:2" data-form hidden></div>
    <div class="card rise cadop-lista" style="--i:3" data-lista aria-busy="true" aria-live="polite"></div>`.toString();
  const boxForm = /** @type {HTMLElement} */ ($('[data-form]', view));
  const boxLista = /** @type {HTMLElement} */ ($('[data-lista]', view));

  const nomeDe = (/** @type {string} */ ref, /** @type {any} */ id) => listas[ref]?.find((x) => x.id === id)?.nome ?? (id ?? '');

  /** @param {import('../../core/cadastros-op.js').Campo} c @param {any} v */
  function exibir(c, v) {
    if (c.tipo === 'booleano') return v === false ? 'Não' : 'Sim';
    if (c.tipo === 'lista') return Array.isArray(v) ? v.join(', ') : '';
    if (c.ref) return v === null || v === undefined ? '' : String(nomeDe(c.ref, v));
    return v === null || v === undefined ? '' : String(v);
  }

  function pintarAbas() {
    $$('[data-aba]', view).forEach((b) => {
      const ativa = b.dataset.aba === recurso;
      b.classList.toggle('primary', ativa);
      b.setAttribute('aria-pressed', String(ativa));
    });
  }

  function desenharLista(/** @type {any[]} */ linhas) {
    const def = RECURSOS[recurso];
    boxLista.setAttribute('aria-busy', 'false');
    if (!linhas.length) {
      boxLista.innerHTML = html`<div class="empty"><h3>Nenhum cadastro</h3><p>Use “Novo cadastro” para incluir o primeiro.</p></div>`.toString();
      return;
    }
    boxLista.innerHTML = html`<div class="cadop-rolagem"><table class="tbl cadop-tab">
      <caption class="sr-only">${def.rotulo}</caption>
      <thead><tr>${def.campos.map((c) => html`<th scope="col">${c.rotulo}</th>`)}<th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${linhas.map((l, i) => html`<tr>${def.campos.map((c) => html`<td>${exibir(c, l[c.nome])}</td>`)}
        <td><button type="button" class="btn sm" data-editar="${String(i)}" aria-label="${`Editar ${l.nome ?? l.codigo ?? l.etapa ?? ''}`}">Editar</button></td></tr>`)}</tbody>
    </table></div>`.toString();
  }

  /** @type {any[]} */
  let linhas = [];

  async function carregar() {
    const meu = ++versao;
    pintarAbas();
    boxLista.setAttribute('aria-busy', 'true');
    try {
      const [projetos, turnos, atual] = await Promise.all([
        buscar(urlCadastro('projetos')),
        buscar(urlCadastro('turnos')),
        recurso === 'projetos' || recurso === 'turnos' ? null : buscar(urlCadastro(recurso)),
      ]);
      if (meu !== versao || ctx.sinal.aborted) return;
      listas = { projetos, turnos };
      linhas = atual ?? (recurso === 'projetos' ? projetos : turnos);
      desenharLista(linhas);
      if (edicao) desenharForm();
    } catch (e) {
      if (meu !== versao || ctx.sinal.aborted) return;
      console.error(e);
      boxLista.setAttribute('aria-busy', 'false');
      boxLista.innerHTML = erroBloco({ titulo: 'Não foi possível carregar os cadastros', texto: /** @type {any} */ (e).message }).toString();
    }
  }

  /** @param {import('../../core/cadastros-op.js').Campo} c @param {any} v @param {string} id */
  function controle(c, v, id) {
    const desc = `${id}-msg`;
    if (c.tipo === 'booleano') {
      return html`<label class="check"><input type="checkbox" id="${id}" name="${c.nome}" ${v === false ? '' : 'checked'}> ${c.rotulo}</label>`;
    }
    if (c.tipo === 'lista') {
      const marcados = Array.isArray(v) ? v : [];
      return html`<fieldset class="cadop-grupo" aria-describedby="${desc}"><legend>${c.rotulo}</legend>
        ${(c.opcoes || []).map((o) => html`<label class="check"><input type="checkbox" name="${c.nome}" value="${o}" ${marcados.includes(o) ? 'checked' : ''}> ${o}</label>`)}</fieldset>`;
    }
    const opcoes = c.ref
      ? listas[c.ref].map((x) => ({ valor: String(x.id), rotulo: x.nome }))
      : (c.opcoes || []).map((o) => ({ valor: o, rotulo: o }));
    if (c.ref || c.tipo === 'opcao') {
      const atual = v === null || v === undefined ? '' : String(v);
      return html`<label for="${id}">${c.rotulo}${c.obrigatorio ? ' *' : ''}</label>
        <select class="input" id="${id}" name="${c.nome}" aria-describedby="${desc}" ${c.obrigatorio ? 'required' : ''}>
          <option value="">${c.obrigatorio ? 'Selecione' : '— nenhum —'}</option>
          ${opcoes.map((o) => html`<option value="${o.valor}" ${o.valor === atual ? 'selected' : ''}>${o.rotulo}</option>`)}</select>`;
    }
    return html`<label for="${id}">${c.rotulo}${c.obrigatorio ? ' *' : ''}</label>
      <input class="input" id="${id}" name="${c.nome}" value="${v === null || v === undefined ? '' : String(v)}" autocomplete="off"
        inputmode="${c.tipo === 'numero' ? 'numeric' : 'text'}" aria-describedby="${desc}" ${c.obrigatorio ? 'required' : ''}>`;
  }

  function desenharForm() {
    if (!edicao) { boxForm.hidden = true; boxForm.textContent = ''; return; }
    const def = RECURSOS[recurso];
    const valores = edicao;
    boxForm.hidden = false;
    boxForm.innerHTML = html`<form data-cad novalidate aria-labelledby="cadop-tit">
      <h2 id="cadop-tit" tabindex="-1">${tituloFormulario(def, valores)}</h2>
      <div class="cadop-campos">${def.campos.map((c) => html`<div class="cadop-campo">${controle(c, valores[c.nome], `cad-${c.nome}`)}
        <span class="field-msg" id="${`cad-${c.nome}-msg`}" role="alert" hidden></span></div>`)}</div>
      <p class="field-msg" data-erro-geral role="alert" hidden></p>
      <div class="cadop-acoes"><button type="submit" class="btn primary"><span class="spin" aria-hidden="true"></span>Salvar</button>
        <button type="button" class="btn" data-cancelar>Cancelar</button></div>
    </form>`.toString();
    $('#cadop-tit', boxForm)?.focus();
  }

  /** @param {HTMLFormElement} form */
  function lerForm(form) {
    /** @type {Record<string, any>} */
    const v = {};
    for (const c of RECURSOS[recurso].campos) {
      const els = /** @type {HTMLInputElement[]} */ ($$(`[name="${c.nome}"]`, form));
      if (c.tipo === 'booleano') v[c.nome] = !!els[0]?.checked;
      else if (c.tipo === 'lista') v[c.nome] = els.filter((e) => e.checked).map((e) => e.value);
      else v[c.nome] = els[0] ? els[0].value : '';
    }
    return v;
  }

  /** @param {HTMLFormElement} form @param {Record<string, string>} erros */
  function pintarErros(form, erros) {
    let primeiro = true;
    for (const c of RECURSOS[recurso].campos) {
      const msg = $(`#cad-${c.nome}-msg`, form);
      if (!msg) continue;
      const t = erros[c.nome] || '';
      msg.hidden = !t; msg.textContent = t;
      $$(`[name="${c.nome}"]`, form).forEach((el) => el.setAttribute('aria-invalid', String(!!t)));
      if (t && primeiro) { primeiro = false; $(`[name="${c.nome}"]`, form)?.focus(); }
    }
    const geral = /** @type {HTMLElement} */ ($('[data-erro-geral]', form));
    geral.hidden = !erros._geral; geral.textContent = erros._geral || '';
  }

  /** @param {HTMLFormElement} form */
  async function salvar(form) {
    const def = RECURSOS[recurso];
    const editando = !!(edicao && edicao.id) && !def.semId;
    const r = validarCadastro(recurso, lerForm(form), { completo: !editando });
    if (!r.ok) { pintarErros(form, r.erros); return; }
    pintarErros(form, {});
    const botao = /** @type {HTMLButtonElement} */ ($('button[type="submit"]', form));
    botao.disabled = true; botao.classList.add('loading');
    try {
      const url = `${API.painel}${urlCadastro(recurso, editando && edicao ? edicao.id : undefined)}`;
      const resp = editando || def.semId ? await ctx.api.put(url, r.corpo) : await ctx.api.post(url, r.corpo);
      if (!resp.dados || resp.dados.success === false) throw new Error((resp.dados && resp.dados.message) || 'O servidor não aceitou o cadastro.');
      toast('sucesso', 'Cadastro salvo', def.rotulo);
      edicao = null;
      desenharForm();
      await carregar();
    } catch (err) {
      console.error(err);
      botao.disabled = false; botao.classList.remove('loading');
      pintarErros(form, { _geral: /** @type {any} */ (err).message || 'Não foi possível salvar o cadastro.' }); // 400/409 do servidor, na mensagem dele
      $('[data-erro-geral]', form)?.focus();
    }
  }

  const soltarEnvio = (() => { const h = (/** @type {Event} */ ev) => { ev.preventDefault(); salvar(/** @type {HTMLFormElement} */ (ev.target)); }; boxForm.addEventListener('submit', h); return () => boxForm.removeEventListener('submit', h); })();
  const soltarAba = delegar(view, 'click', '[data-aba]', (b) => { recurso = String(b.dataset.aba); edicao = null; desenharForm(); carregar(); });
  const soltarNovo = delegar(view, 'click', '[data-novo]', () => { edicao = {}; desenharForm(); });
  const soltarEditar = delegar(view, 'click', '[data-editar]', (b) => { edicao = { ...linhas[Number(b.dataset.editar)] }; desenharForm(); });
  const soltarCancelar = delegar(view, 'click', '[data-cancelar]', () => { edicao = null; desenharForm(); });

  await carregar();

  return { destruir() { versao++; soltarEnvio(); soltarAba(); soltarNovo(); soltarEditar(); soltarCancelar(); } };
}
