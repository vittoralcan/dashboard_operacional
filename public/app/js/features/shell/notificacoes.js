// @ts-check
import { html } from '../../core/html.js';
import { tempoRelativo } from '../../core/format.js';
import { ESTADO } from '../../core/store.js';
import { resolverDestino } from '../../core/servicos.js';
import { ativo, ausenteSe404 } from '../../config/recursos.js';
import { ic } from '../../ui/icons.js';
import { abrirPopover } from '../../ui/popover.js';
import { toast } from '../../ui/toast.js';
import { criarServicosPainel } from '../painel/servicos.js';
import { conteudoNotificacoes } from './topbar.js';

/**
 * Central de notificações (NTF-01/03/04): contador no sino (consulta a cada 60 s com a aba visível), lista no popover, "marcar
 * como lida" por item e em lote, e clique que abre o destino — já com o nó do fluxograma em foco. O destino vem do servidor e só
 * vira navegação depois de conferido contra o catálogo e a tabela de rotas (`resolverDestino`). 404 → volta a "Em breve".
 */

const INTERVALO_MS = 60000;
const ICONE_TIPO = /** @type {Record<string, string>} */ ({ erro: 'warning-octagon', alerta: 'warning-diamond', sucesso: 'check-circle', info: 'info' });

/** @type {ReturnType<typeof criar>|null} */
let ativa = null;

/**
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, catalogo: import('../../core/catalogo.js').Catalogo,
 *           ir: (r: string) => void, rotaConhecida: (r: string) => boolean, aoContar: (n: number) => void }} c
 */
function criar(c) {
  const serv = criarServicosPainel(c.api);
  /** @type {{ naoLidas: number, itens: import('../../core/servicos.js').Notificacao[] }} */
  let dados = { naoLidas: 0, itens: [] };
  let carregou = false;
  let falhou = false;
  /** @type {ReturnType<typeof abrirPopover>|null} */
  let pop = null;
  const ctl = new AbortController();

  async function carregar() {
    if (!ativo('notificacoes') || ctl.signal.aborted) return;
    try {
      dados = await serv.notificacoes(ctl.signal);
      carregou = true; falhou = false;
      c.aoContar(dados.naoLidas);
      if (pop && pop.el.isConnected) desenhar();
    } catch (e) {
      if (ctl.signal.aborted) return;
      console.warn('Notificações indisponíveis agora.', e);
      falhou = true;
      if (ausenteSe404('notificacoes', e)) c.aoContar(0);
      if (pop && pop.el.isConnected) desenhar();
    }
  }

  const timer = setInterval(() => { if (!document.hidden) carregar(); }, INTERVALO_MS);

  /** Lê o destino de uma notificação e navega (e foca o nó). @param {import('../../core/servicos.js').Notificacao} n */
  function abrirDestino(n) {
    const rota = resolverDestino(n.destino, c.catalogo, c.rotaConhecida);
    if (!rota) return;
    const f = n.destino && n.destino.foco;
    if (f) ESTADO.focoNo = { instancia: f.instancia, fasId: f.fasId };
    c.ir(rota);
  }

  async function marcar(/** @type {number|null} */ id) {
    const antes = dados;
    // otimista: o ponto some na hora; se o servidor falhar, volta ao que era e avisa
    dados = { naoLidas: 0, itens: dados.itens.map((n) => (id === null || n.id === id ? { ...n, lida: true } : n)) };
    dados.naoLidas = dados.itens.filter((n) => !n.lida).length;
    c.aoContar(dados.naoLidas);
    if (pop && pop.el.isConnected) desenhar();
    try { if (id === null) await serv.marcarTodasLidas(); else await serv.marcarLida(id); } catch (e) {
      console.error(e);
      dados = antes; c.aoContar(dados.naoLidas);
      if (pop && pop.el.isConnected) desenhar();
      toast('erro', 'Não foi possível marcar como lida', /** @type {any} */ (e).message);
    }
  }

  function desenhar() {
    if (!pop) return;
    const itens = dados.itens;
    pop.el.innerHTML = html`<div class="notif-h"><b>Notificações</b>${dados.naoLidas ? html`<button type="button" class="btn ghost sm" data-n-todas>${ic('checks')}Marcar todas como lidas</button>` : ''}</div>
      <div class="notif-list" aria-live="polite">${!carregou && !falhou ? html`<p class="dim notif-vazio">Carregando…</p>`
    : falhou && !itens.length ? html`<div class="empty notif-vazio"><h3>Não foi possível carregar</h3><p>Verifique a conexão e tente novamente.</p><button type="button" class="btn sm" data-n-tentar>Tentar novamente</button></div>`
    : itens.length ? html`${itens.map((n) => {
      const abre = n.destino && resolverDestino(n.destino, c.catalogo, c.rotaConhecida);
      return html`<button type="button" class="${`notif ${n.tipo}${n.lida ? ' lida' : ''}`}" data-n-id="${n.id}" ${abre ? '' : html`data-n-sem-destino`}>
        ${n.lida ? '' : html`<span class="unread" aria-hidden="true"></span>`}<span class="ic-t">${ic(ICONE_TIPO[n.tipo] || 'info')}</span>
        <span><b>${n.titulo}</b>${n.texto ? html`<p>${n.texto}</p>` : ''}${n.lida ? '' : html`<span class="sr-only">Não lida</span>`}</span>
        <time>${n.ts ? tempoRelativo((Date.now() - n.ts) / 1000) : ''}</time></button>`;
    })}`
      : html`<div class="empty notif-vazio"><div class="ico-tile lg accent">${ic('bell')}</div><h3>Tudo em dia</h3><p>Nenhuma notificação por enquanto.</p></div>`}</div>`.toString();
    pop.reposicionar();
  }

  return {
    carregar,
    /** @param {HTMLElement} gatilho */
    abrir(gatilho) {
      if (!ativo('notificacoes')) { abrirPopover(gatilho, conteudoNotificacoes(), { classe: 'notif-pop', rotulo: 'Notificações', focar: 'button' }); return; }
      const p = abrirPopover(gatilho, html`<div class="notif-h"><b>Notificações</b></div>`, { classe: 'notif-pop', rotulo: 'Notificações', focar: '.notif, button',
        aoFechar: () => { pop = null; },
        aoAbrir: (el, fechar) => {
          el.addEventListener('click', (e) => {
            const t = /** @type {HTMLElement} */ (e.target);
            if (t.closest('[data-n-todas]')) { marcar(null); return; }
            if (t.closest('[data-n-tentar]')) { carregar(); return; }
            const item = /** @type {HTMLElement|null} */ (t.closest('[data-n-id]'));
            if (!item) return;
            const n = dados.itens.find((x) => x.id === Number(item.dataset.nId));
            if (!n) return;
            if (!n.lida) marcar(n.id);
            fechar();
            abrirDestino(n);
          });
        } });
      if (!p) return; // o 2º clique no sino fecha
      pop = p;
      desenhar();
      carregar();
    },
    destruir() { ctl.abort(); clearInterval(timer); pop?.fechar(); pop = null; },
  };
}

/** Liga a central ao app logado (chamado depois que a casca existe). @param {Parameters<typeof criar>[0]} c */
export function iniciarNotificacoes(c) {
  ativa?.destruir();
  ativa = criar(c);
  ativa.carregar();
  return ativa;
}

/** Abre o popover do sino (sem central ligada, mostra o aviso "Em breve"). @param {HTMLElement} gatilho */
export function abrirNotificacoes(gatilho) {
  if (ativa) ativa.abrir(gatilho);
  else abrirPopover(gatilho, conteudoNotificacoes(), { classe: 'notif-pop', rotulo: 'Notificações', focar: 'button' });
}
