// @ts-check
import { $, MOD } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { fmt } from '../../core/format.js';
import { estiloDaFase, contadoresParados, maiorCarga, valoresDe } from '../../core/fluxo-prod.js';
import { grafoDeConfig } from '../../core/fluxo-config.js';
import { cargaRelativa } from '../../core/fluxo.js';
import { animarNumero } from '../../core/motion.js';
import { ativo } from '../../config/recursos.js';
import { ic } from '../../ui/icons.js';
import { atributosEmBreve, seloEmBreve } from '../../ui/embreve.js';
import { montarFluxograma } from './flowchart.js';

/** Cabeçalho da aba + contêiner do canvas. "Ir para o gargalo" (FLX-06) só existe onde o servidor calcula o gargalo (ATLAS); nasce desabilitado até haver um. */
export const fluxoProdHtml = (/** @type {import('../../core/fluxo-prod.js').ConfigFluxo} */ cfg) => html`<div class="sec-h"><div><h2>Fluxograma de processos do Captura</h2>
    <p>Arraste para mover · <kbd>${MOD}</kbd> + roda para zoom · clique em um nó para ver as pastas da fase.</p></div>
    <div class="sec-tools">${cfg.fonte !== 'atlas' ? '' : ativo('gargalos')
      ? html`<button type="button" class="btn sm" data-acao="gargalo" disabled aria-disabled="true" data-tip="Nenhum gargalo agora">${ic('target')}Ir para o gargalo</button>`
      : html`<button type="button" class="btn sm" ${atributosEmBreve('gargalos')}>${ic('target')}Ir para o gargalo${seloEmBreve('gargalos', { semIcone: true })}</button>`}
      <button type="button" class="btn sm" data-acao="ajustar">${ic('corners-out')}Ajustar à tela</button></div></div>
  <div class="flow" data-flow></div>`;

/**
 * Aba "Fluxograma" (FLX-05, 10, 11): o motor desenha o grafo da configuração; cada nó mostra PASTAS e IMAGENS de
 * `status-fases` e uma barra de carga relativa ao maior nó (FINALIZADO sempre cheio). O HUD traz os contadores "paradas
 * no fluxo" (RN-008) — com bloco "Aguardando" quando há fase de espera — e a legenda.
 *
 * @param {HTMLElement} raiz @param {{ cfg: import('../../core/fluxo-prod.js').ConfigFluxo, atalhos: any, aoFase: (fase: import('../../core/fluxo-prod.js').Fase) => void }} o
 */
export function montarFluxoProd(raiz, o) {
  const { cfg } = o;
  const g = grafoDeConfig(cfg);
  const fases = new Map(cfg.fases.map((f) => [f.fasId, f]));
  const temEspera = cfg.fases.some((f) => f.tipo === 'espera');
  const flow = montarFluxograma(/** @type {HTMLElement} */ ($('[data-flow]', raiz)), {
    passo: cfg.passo, arestas: g.arestas, juncoes: g.juncoes, rotulo: `Fluxograma de processos — ${cfg.nome}`, atalhos: o.atalhos,
    nos: cfg.grafo.nos.map((n) => {
      const f = /** @type {import('../../core/fluxo-prod.js').Fase} */ (fases.get(n.fasId));
      const est = estiloDaFase(f.tipo);
      return {
        id: n.fasId, x: n.x, y: n.y, cls: est.cls, mm: est.mm, aria: `${f.nome}: sem leitura`,
        html: html`<div class="fn-l">${f.nome}</div><span class="fn-plus" aria-hidden="true">${ic('plus')}</span>
          <div class="fn-m"><div><span>PASTAS</span><b data-fp>—</b></div><div><span>IMAGENS</span><b data-fi>—</b></div></div><div class="fn-load"><i data-fc></i></div>`,
      };
    }),
    hudTL: html`<div class="hud-box hud-counter"><div><span class="k">Pastas paradas no fluxo</span><span class="v" data-par="pastas">—</span></div><div><span class="k">Imagens paradas no fluxo</span><span class="v" data-par="imagens">—</span></div></div>
      ${temEspera ? html`<div class="hud-box hud-counter wait"><div><span class="k">Aguardando · Pastas</span><span class="v" data-esp="pastas">—</span></div><div><span class="k">Aguardando · Imagens</span><span class="v" data-esp="imagens">—</span></div></div>` : ''}`,
    hudTR: html`<div class="hud-box legend"><span><i></i>Fase</span>${cfg.fonte === 'atlas' && ativo('gargalos') ? html`<span><i class="g"></i>Gargalo</span><span><i class="v"></i>Alto volume</span>` : ''}<span><i class="r"></i>Suspensão</span>${temEspera ? html`<span><i class="w"></i>Espera</span>` : ''}<span><i class="f"></i>Finalizado</span></div>`,
    aoNo: (id) => { const f = fases.get(Number(id)); if (f) o.aoFase(f); },
  });
  raiz.querySelector('[data-acao="ajustar"]')?.addEventListener('click', () => flow.ajustar(true));

  /** @type {number|null} */
  let gargaloId = null;
  /** @type {number|null} */
  let altoVolumeId = null;
  const botaoGargalo = /** @type {HTMLButtonElement|null} */ (raiz.querySelector('[data-acao="gargalo"]'));
  botaoGargalo?.addEventListener('click', () => { if (gargaloId !== null) flow.focar(gargaloId); });

  /** @param {HTMLElement|null} el @param {number} alvo */
  const numero = (el, alvo) => { if (!el) return; animarNumero(el, alvo, Number(el.dataset.v || 0)); el.dataset.v = String(alvo); };

  /** Alto volume (RF-54): o gargalo de vazão tem precedência sobre a mesma fase. */
  const pintarAltoVolume = () => {
    cfg.grafo.nos.forEach((n) => {
      const no = flow.no(n.fasId);
      if (!no || n.fasId === gargaloId) return;
      const e = n.fasId === altoVolumeId;
      no.classList.toggle('alto-volume', e);
      no.querySelector('.fn-tag')?.remove();
      if (e) { const t = document.createElement('span'); t.className = 'fn-tag'; t.textContent = 'ALTO VOLUME'; no.prepend(t); }
    });
  };

  return {
    flow,
    /**
     * Realça a fase-gargalo (RN-009): borda/pulso, etiqueta "GARGALO" e cor no minimapa; liga "Ir para o gargalo". `null` limpa.
     * @param {number|null} fasId
     */
    marcarGargalo(fasId) {
      gargaloId = fasId;
      const rects = Array.from(raiz.querySelectorAll('[data-mmap] .mm-n'));
      cfg.grafo.nos.forEach((n, i) => {
        const no = flow.no(n.fasId); const f = fases.get(n.fasId);
        if (!no || !f) return;
        const e = n.fasId === fasId;
        no.classList.toggle('gargalo', e);
        if (e) no.classList.remove('alto-volume');
        no.querySelector('.fn-tag')?.remove();
        if (e) { const t = document.createElement('span'); t.className = 'fn-tag'; t.textContent = 'GARGALO'; no.prepend(t); }
        rects[i]?.setAttribute('class', `mm-n ${e ? 'g' : estiloDaFase(f.tipo).mm}`);
      });
      if (botaoGargalo) {
        botaoGargalo.disabled = fasId === null;
        botaoGargalo.setAttribute('aria-disabled', String(fasId === null));
        if (fasId === null) botaoGargalo.setAttribute('data-tip', 'Nenhum gargalo agora'); else botaoGargalo.removeAttribute('data-tip');
      }
      pintarAltoVolume();
    },
    /**
     * Realça a fase de alto volume (RF-54): borda e etiqueta "ALTO VOLUME". Se a fase também for o gargalo, vale só o gargalo. `null` limpa.
     * @param {number|null} fasId
     */
    marcarAltoVolume(fasId) {
      altoVolumeId = fasId;
      pintarAltoVolume();
    },
    /** Atualiza números, barras, contadores e `aria-label` SEM redesenhar o grafo. @param {import('../../core/fluxo-prod.js').StatusFases} st */
    atualizar(st) {
      const maior = maiorCarga(cfg, st);
      for (const n of cfg.grafo.nos) {
        const no = flow.no(n.fasId); const f = fases.get(n.fasId);
        if (!no || !f) continue;
        const v = valoresDe(st, n.fasId);
        numero($('[data-fp]', no), v.pastas); numero($('[data-fi]', no), v.imagens);
        const barra = $('[data-fc]', no); if (barra) barra.style.width = `${cargaRelativa(v.pastas, maior, f.tipo === 'terminal')}%`;
        no.setAttribute('aria-label', `${f.nome}: ${fmt(v.pastas)} pastas, ${fmt(v.imagens)} imagens`);
      }
      const c = contadoresParados(cfg, st);
      numero($('[data-par="pastas"]', raiz), c.pastas); numero($('[data-par="imagens"]', raiz), c.imagens);
      numero($('[data-esp="pastas"]', raiz), c.espera ? c.espera.pastas : 0); numero($('[data-esp="imagens"]', raiz), c.espera ? c.espera.imagens : 0);
    },
  };
}
