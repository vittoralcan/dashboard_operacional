// @ts-check
import { $ } from '../core/dom.js';
import { html } from '../core/html.js';
import { ic, icf } from './icons.js';

const MAX_TOASTS = 4;
const ICONE = /** @type {Record<string,string>} */ ({ sucesso: 'check-circle', erro: 'x-circle', info: 'info' });

/**
 * Aviso temporário (NTF-03): sucesso | erro | info | loading. Máx. 4 empilhados (o mais antigo sai),
 * barra de tempo, pausa ao passar o mouse, ação opcional. `role="alert"` só em erro.
 * `titulo` e `texto` são sempre escapados (a menos que sejam `Html`).
 *
 * @param {'sucesso'|'erro'|'info'|'loading'} tipo
 * @param {string} titulo
 * @param {string} [texto]
 * @param {{ duracao?: number, acao?: { rotulo: string, fn: () => void } }} [opts] `duracao` 0 = não expira
 */
export function toast(tipo, titulo, texto, opts = {}) {
  const box = $('#toasts');
  if (!box) return { el: null, fechar() {} };
  while (box.children.length >= MAX_TOASTS) box.firstElementChild?.remove();

  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  const dur = opts.duracao !== undefined ? opts.duracao : (tipo === 'loading' ? 0 : 4400);
  const icone = tipo === 'loading' ? html`<span class="spin" aria-hidden="true"></span>` : icf(ICONE[tipo] || 'info');
  el.innerHTML = html`${icone}<div><b>${titulo}</b>${texto ? html`<p>${texto}</p>` : ''}</div>
    <div class="t-acts">${opts.acao ? html`<button class="btn sm" data-t-acao>${opts.acao.rotulo}</button>` : ''}<button class="icon-btn sm" data-t-x aria-label="Fechar aviso">${ic('x')}</button></div>
    ${dur ? html`<span class="bar" style="${`animation-duration:${dur}ms`}"></span>` : ''}`.toString();
  box.appendChild(el);

  /** @type {any} */ let timer = null;
  let restante = dur;
  let inicio = 0;
  const fechar = () => { if (el.classList.contains('out')) return; clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  const agendar = () => { if (!restante) return; inicio = Date.now(); timer = setTimeout(fechar, restante); };
  el.addEventListener('mouseenter', () => { if (!dur) return; clearTimeout(timer); restante -= Date.now() - inicio; const b = $('.bar', el); if (b) b.style.animationPlayState = 'paused'; });
  el.addEventListener('mouseleave', () => { if (!dur) return; const b = $('.bar', el); if (b) b.style.animationPlayState = 'running'; agendar(); });
  $('[data-t-x]', el)?.addEventListener('click', fechar);
  if (opts.acao) $('[data-t-acao]', el)?.addEventListener('click', () => { try { opts.acao?.fn(); } finally { fechar(); } });
  agendar();
  return { el, fechar };
}
