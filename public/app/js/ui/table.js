// @ts-check
import { $, $$ } from '../core/dom.js';
import { html, raw, seguro } from '../core/html.js';
import { fmt } from '../core/format.js';
import { filtrar, ordenar, contarPor, proximaOrdem } from '../core/tabela.js';
import { ic } from './icons.js';
import { vazio } from './empty.js';

/**
 * Tabela densa (CMP-01): cabeçalho fixo, ordenação por coluna (`aria-sort`), busca sem acento,
 * pílulas de categoria com contagem, contador "N de M" e estado vazio. Toda célula é escapada,
 * exceto quando `fmt` devolve `Html` (ex.: selo, tag).
 *
 * @typedef {import('../core/tabela.js').Coluna} Coluna
 * @param {HTMLElement} el
 * @param {{ colunas: Coluna[], linhas: any[], ordemInicial?: string, dirInicial?: 1|-1, pilulas?: string,
 *           rotuloPilulas?: string, busca?: boolean, altura?: number, vazio?: string, rotuloContagem?: string,
 *           rotulo?: string }} cfg
 */
export function montarTabela(el, cfg) {
  const { colunas } = cfg;
  let linhas = cfg.linhas;
  /** @type {{ chave: string|null, dir: 1|-1 }} */
  let ordem = { chave: cfg.ordemInicial || null, dir: cfg.dirInicial || -1 };
  let busca = '';
  let pilula = 'todos';
  /** @type {any[]} */
  let visiveis = linhas;

  el.innerHTML = html`<div class="tbl-tools" style="margin-bottom:10px"><div class="left">
      ${cfg.pilulas ? html`<div class="pills" data-pills role="group" aria-label="${`Filtrar por ${cfg.rotuloPilulas || 'categoria'}`}"></div>` : ''}
      ${cfg.busca ? html`<div class="input sm" style="width:210px">${ic('magnifying-glass')}<input placeholder="Filtrar linhas…" aria-label="Filtrar tabela" data-busca autocomplete="off"></div>` : ''}
    </div><span class="tbl-count" data-qtd aria-live="polite"></span></div>
    <div class="tbl-wrap" style="${`max-height:${Number(cfg.altura) || 400}px`}" tabindex="0" role="region" aria-label="${cfg.rotulo || 'Tabela'}">
      <table class="tbl"><thead><tr>${colunas.map((c) => html`<th scope="col" class="${c.num ? 'r' : ''}" data-k="${c.chave}"><button type="button">${c.rotulo}${ic('arrow-down')}</button></th>`)}</tr></thead><tbody></tbody></table>
    </div>`.toString();

  const tbody = /** @type {HTMLElement} */ ($('tbody', el));

  const pilulasHtml = () => {
    const alvo = $('[data-pills]', el);
    if (!cfg.pilulas || !alvo) return;
    const cont = contarPor(linhas, cfg.pilulas);
    alvo.innerHTML = html`<button class="pill" aria-pressed="${pilula === 'todos'}" data-p="todos">Todos <span class="n">${fmt(linhas.length)}</span></button>${Object.keys(cont).sort().map((k) => html`<button class="pill" aria-pressed="${pilula === k}" data-p="${k}">${k} <span class="n">${fmt(cont[k])}</span></button>`)}`.toString();
  };

  const celula = (/** @type {Coluna} */ c, /** @type {any} */ l) => {
    const v = l[c.chave];
    const conteudo = c.fmt ? c.fmt(v, l) : (c.num ? fmt(v) : v);
    return html`<td class="${[c.num ? 'r m' : '', c.mono ? 'm' : '', c.forte ? 'strong' : ''].join(' ').trim()}">${raw(seguro(conteudo))}</td>`;
  };

  const desenhar = () => {
    visiveis = ordenar(filtrar(linhas, colunas, { pilulaChave: cfg.pilulas, pilula, busca }), colunas, ordem);
    tbody.innerHTML = (visiveis.length
      ? html`${visiveis.map((l) => html`<tr>${colunas.map((c) => celula(c, l))}</tr>`)}`
      : html`<tr><td colspan="${colunas.length}" style="height:auto">${vazio({ titulo: 'Nenhuma linha encontrada', texto: cfg.vazio || 'Ajuste os filtros para ver resultados.' })}</td></tr>`).toString();
    const qtd = $('[data-qtd]', el);
    if (qtd) qtd.textContent = `${fmt(visiveis.length)}${visiveis.length !== linhas.length ? ` de ${fmt(linhas.length)}` : ''} ${cfg.rotuloContagem || 'linhas'}`;
    $$('th', el).forEach((th) => {
      const ativa = th.dataset.k === ordem.chave;
      if (ativa) th.setAttribute('aria-sort', ordem.dir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
      const svg = $('use', th);
      if (svg) svg.setAttribute('href', `assets/icons.svg#i-${ativa && ordem.dir > 0 ? 'arrow-up' : 'arrow-down'}`);
    });
  };

  const aoClicar = (/** @type {Event} */ e) => {
    const alvo = /** @type {HTMLElement} */ (e.target);
    const th = /** @type {HTMLElement|null} */ (alvo.closest('th[data-k]'));
    if (th) {
      const c = colunas.find((x) => x.chave === th.dataset.k);
      if (c) { ordem = proximaOrdem(ordem, c); desenhar(); }
      return;
    }
    const p = /** @type {HTMLElement|null} */ (alvo.closest('[data-p]'));
    if (p) { pilula = /** @type {string} */ (p.dataset.p); pilulasHtml(); desenhar(); }
  };
  el.addEventListener('click', aoClicar);
  const campo = /** @type {HTMLInputElement|null} */ ($('[data-busca]', el));
  const aoDigitar = () => { busca = campo ? campo.value : ''; desenhar(); };
  campo?.addEventListener('input', aoDigitar);

  pilulasHtml();
  desenhar();
  return {
    /** @param {any[]} novas */
    atualizar(novas) { linhas = novas; pilulasHtml(); desenhar(); },
    /** Linhas hoje visíveis (já filtradas e ordenadas) — é o que a exportação leva. */
    visiveis: () => visiveis,
    destruir() { el.removeEventListener('click', aoClicar); campo?.removeEventListener('input', aoDigitar); },
  };
}
