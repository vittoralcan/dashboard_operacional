// @ts-check
import { html, raw } from '../core/html.js';

/** Ilustrações de traço fino (herdam a cor do tema). `tipo`: 'busca' (sem resultado) | 'ampulheta' (não iniciado). @param {'busca'|'ampulheta'} [tipo] */
export function ilustracao(tipo = 'busca') {
  if (tipo === 'ampulheta') {
    return raw('<svg class="ill" viewBox="0 0 140 100" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><rect x="20" y="10" width="100" height="80" rx="12" stroke-dasharray="3 4" opacity=".5"/><path d="M56 26h28M56 74h28M58 26c0 14 24 16 24 24s-24 10-24 24M82 26c0 14-24 16-24 24s24 10 24 24"/><path d="M64 70l6-6 6 6z" fill="currentColor" opacity=".35" stroke="none"/><circle cx="108" cy="22" r="3" fill="var(--accent)" stroke="none"/></svg>');
  }
  return raw('<svg class="ill" viewBox="0 0 140 100" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><rect x="14" y="16" width="84" height="64" rx="10" stroke-dasharray="3 4" opacity=".5"/><path d="M28 36h40M28 48h56M28 60h30" opacity=".45"/><circle cx="96" cy="62" r="17"/><path d="M108.5 74.5L122 88" stroke-width="2.2" stroke-linecap="round"/><path d="M90 56l12 12M102 56L90 68" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round"/></svg>');
}

/**
 * Estado vazio (RNB-008): ilustração + título + texto + ação opcional.
 * @param {{ titulo: string, texto?: string, tipo?: 'busca'|'ampulheta', acao?: import('../core/html.js').Html }} o
 */
export function vazio(o) {
  return html`<div class="empty">${ilustracao(o.tipo)}<h3>${o.titulo}</h3>${o.texto ? html`<p>${o.texto}</p>` : ''}${o.acao || ''}</div>`;
}

/**
 * Erro inline de um bloco, com "Tentar novamente" (RNB-008). O botão leva `data-acao="tentar"`;
 * a tela liga o clique por delegação.
 * @param {{ titulo?: string, texto?: string }} [o]
 */
export function erroBloco(o = {}) {
  return html`<div class="empty" role="alert">${ilustracao('busca')}<h3>${o.titulo || 'Não foi possível carregar'}</h3><p>${o.texto || 'Verifique a conexão e tente novamente.'}</p><button class="btn sm" data-acao="tentar">Tentar novamente</button></div>`;
}
