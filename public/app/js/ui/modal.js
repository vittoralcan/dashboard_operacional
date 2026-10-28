// @ts-check
import { $, prenderFoco, uid } from '../core/dom.js';
import { html, seguro } from '../core/html.js';
import { empilhar, desempilhar } from '../core/camadas.js';
import { horaBR } from '../core/format.js';
import { ic, icf } from './icons.js';

/**
 * Modal (CMP-09): foco inicial, foco preso (Tab cíclico), devolve o foco ao gatilho, Esc e clique
 * no fundo fecham (via pilha de camadas). Textos (`titulo`, `sub`, `eyebrow`, `corpo`, `rodape`)
 * são ESCAPADOS, a menos que sejam `Html` (`html`…`` / `raw()`).
 *
 * @typedef {string|import('../core/html.js').Html} Conteudo
 * @param {{ tamanho?: 'sm'|'lg'|'xl', eyebrow?: Conteudo, titulo?: Conteudo, sub?: Conteudo, corpo?: Conteudo,
 *           rodape?: Conteudo, cabecalho?: boolean, rotulo?: string, aoFechar?: () => void }} [o]
 */
export function abrirModal(o = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  const idT = uid('mt');
  wrap.innerHTML = html`<div class="modal-backdrop" data-fechar></div>
    <div class="modal ${o.tamanho || ''}" role="dialog" aria-modal="true" aria-labelledby="${idT}" tabindex="-1">
      <div class="modal-h"><div class="ttl"></div><button class="icon-btn" data-fechar aria-label="Fechar">${ic('x')}</button></div>
      <div class="modal-b"></div>
      <div class="modal-f" hidden></div>
    </div>`.toString();
  const anterior = /** @type {HTMLElement|null} */ (document.activeElement);
  const raiz = $('#modais');
  if (!raiz) throw new Error('Contêiner #modais ausente na casca.');
  raiz.appendChild(wrap);
  const modal = /** @type {HTMLElement} */ ($('.modal', wrap));
  const cab = /** @type {{ eyebrow?: Conteudo, titulo?: Conteudo, sub?: Conteudo }} */ ({});

  const api = {
    el: wrap,
    modal,
    corpo: /** @type {HTMLElement} */ ($('.modal-b', wrap)),
    rodape: /** @type {HTMLElement} */ ($('.modal-f', wrap)),
    /** Troca partes do conteúdo (ex.: carregando → resultado). @param {{ eyebrow?: Conteudo, titulo?: Conteudo, sub?: Conteudo, corpo?: Conteudo, rodape?: Conteudo }} p */
    set(p) {
      if ('titulo' in p || 'eyebrow' in p || 'sub' in p) {
        Object.assign(cab, p);
        const ttl = /** @type {HTMLElement} */ ($('.ttl', wrap));
        ttl.innerHTML = html`${cab.eyebrow ? html`<span class="eyebrow">${cab.eyebrow}</span>` : ''}<h2 id="${idT}">${cab.titulo ?? ''}</h2>${cab.sub ? html`<p>${cab.sub}</p>` : ''}`.toString();
      }
      if ('corpo' in p) api.corpo.innerHTML = seguro(p.corpo);
      if ('rodape' in p) { api.rodape.innerHTML = seguro(p.rodape || ''); api.rodape.hidden = !p.rodape; }
      return api;
    },
    fechar() {
      if (wrap.classList.contains('closing')) return;
      wrap.classList.add('closing');
      desempilhar(camada);
      o.aoFechar?.();
      setTimeout(() => wrap.remove(), 170);
      if (anterior && anterior.focus && document.contains(anterior)) anterior.focus({ preventScroll: true });
    },
    tremer() { modal.classList.remove('shake'); void modal.offsetWidth; modal.classList.add('shake'); },
  };

  if (o.cabecalho === false) /** @type {HTMLElement} */ ($('.modal-h', wrap)).hidden = true;
  api.set({ titulo: o.titulo ?? '', eyebrow: o.eyebrow ?? '', sub: o.sub ?? '', corpo: o.corpo ?? '', rodape: o.rodape ?? '' });
  if (o.titulo === undefined) { modal.removeAttribute('aria-labelledby'); modal.setAttribute('aria-label', o.rotulo || 'Diálogo'); }

  const camada = empilhar(() => api.fechar(), wrap, 'modal');
  wrap.addEventListener('click', (e) => { if (/** @type {HTMLElement} */ (e.target).closest('[data-fechar]')) api.fechar(); });
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Tab') prenderFoco(e, modal); });
  // Corpo que rola precisa ser focável por teclado (axe: scrollable-region-focusable).
  const focavelSeRola = () => { if (api.corpo.scrollHeight > api.corpo.clientHeight + 1) { api.corpo.tabIndex = 0; api.corpo.setAttribute('role', 'region'); api.corpo.setAttribute('aria-label', 'Conteúdo'); } };
  window.addEventListener('resize', focavelSeRola);
  const aoFechar = o.aoFechar;
  o.aoFechar = () => { window.removeEventListener('resize', focavelSeRola); aoFechar?.(); };
  requestAnimationFrame(() => { wrap.classList.add('open'); focavelSeRola(); });
  setTimeout(() => {
    const f = $('[autofocus]', wrap) || $('.modal-b input, .modal-b .opt, .modal-f .btn.primary', wrap);
    (f || modal).focus({ preventScroll: true });
  }, 40);
  return api;
}

/**
 * Confirmação ("Excluir caixa?"). Resolve `true` só se o usuário confirmar.
 * @param {{ titulo: Conteudo, texto: Conteudo, rotulo?: string, icone?: string, perigo?: boolean, eyebrow?: Conteudo }} o
 * @returns {Promise<boolean>}
 */
export function confirmar(o) {
  return new Promise((resolve) => {
    let decidido = false;
    const m = abrirModal({
      tamanho: 'sm',
      eyebrow: o.eyebrow || 'Confirmação',
      titulo: o.titulo,
      corpo: html`<div class="modal-aviso"><div class="ico-tile${o.perigo ? ' perigo' : ''}">${ic(o.icone || 'warning')}</div><p>${o.texto}</p></div>`,
      rodape: html`<button class="btn ghost" data-fechar>Cancelar</button><button class="btn ${o.perigo ? 'danger' : 'primary'}" data-ok>${o.icone ? ic(o.icone) : ''}${o.rotulo || 'Confirmar'}</button>`,
      aoFechar: () => { if (!decidido) resolve(false); },
    });
    $('[data-ok]', m.el)?.addEventListener('click', () => { decidido = true; resolve(true); m.fechar(); });
    setTimeout(() => $('[data-ok]', m.el)?.focus(), 60);
  });
}

/**
 * Modal de erro global (NTF-04) — só para falhas BLOQUEANTES (ex.: relatório que não gera).
 * Falha de um bloco usa o estado de erro inline, não este modal (RNB-008).
 * @param {string} [mensagem] @param {string} [codigo] código curto para suporte
 */
export function erroGlobal(mensagem, codigo) {
  const m = abrirModal({
    tamanho: 'sm', cabecalho: false, rotulo: 'Erro',
    corpo: html`<div class="empty modal-erro">
      <div class="selo-ico">${icf('warning-octagon')}</div>
      <h3>Ops, algo deu errado!</h3>
      <p>${mensagem || 'Não foi possível carregar os dados do servidor. Tente novamente em alguns instantes.'}</p>
      <code>${`${codigo || 'ERRO'} · ${horaBR()}`}</code></div>`,
    rodape: html`<button class="btn primary block" data-fechar>Entendi</button>`,
  });
  m.tremer();
  return m;
}
