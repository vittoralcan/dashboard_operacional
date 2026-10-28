// @ts-check
import { $, $$, uid } from '../../core/dom.js';
import { html, raw } from '../../core/html.js';
import {
  validarGrafo, calcularLayout, caminhoOrtogonal, dePontos, zoomEm, vistaAjustada, vistaInicial, vistaCentrada,
  retanguloVisivel, pontoDoMinimapa, ehArrasto, fatorDaRoda,
} from '../../core/fluxo.js';
import { reduzido } from '../../core/motion.js';
import { ic } from '../../ui/icons.js';

/**
 * Motor do fluxograma (FLX-05, 07, 08, 11, 14): nós, losangos e arestas ortogonais,
 * pan (mouse/toque, limiar de 4 px), pinça, `Ctrl/⌘ + roda`, `Shift + roda`, botões e teclas `+ − 0`,
 * minimapa clicável, foco em nó e legenda/contadores flutuantes (HUD). Serve a TODOS os fluxos: Lumen (Indexação IA)
 * e Captura (Digitalização e ATLAS). O conteúdo de cada nó é do chamador.
 *
 * @typedef {object} NoVisual
 * @property {string|number} id
 * @property {number} x @property {number} y  posição em unidades de grade
 * @property {import('../../core/html.js').Html} html  miolo do nó (nome, números, barra de carga)
 * @property {string} aria                    "VALIDAÇÃO: 118 pastas, 17.346 imagens"
 * @property {string} [cls]                   err | wait | final | gargalo
 * @property {string} [mm]                    cor no minimapa: err | wait | g | f
 * @property {string} [tag]                   etiqueta saliente (ex.: "GARGALO")
 *
 * @param {HTMLElement} el contêiner `.flow`
 * @param {{ passo: { cw: number, ch: number, nw: number, nh: number }, nos: NoVisual[], juncoes?: { id: string|number, x: number, y: number }[],
 *           arestas: import('../../core/fluxo.js').ArestaGrafo[], rotulo: string, aoNo?: (id: string|number) => void,
 *           hudTL?: import('../../core/html.js').Html, hudTR?: import('../../core/html.js').Html,
 *           atalhos?: ReturnType<typeof import('../../core/keys.js').criarAtalhos> }} cfg
 */
export function montarFluxograma(el, cfg) {
  const grafo = { ...cfg.passo, nos: cfg.nos, juncoes: cfg.juncoes || [], arestas: cfg.arestas };
  const valido = validarGrafo(grafo);
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', cfg.rotulo);
  if (!valido.ok) {
    el.innerHTML = html`<div class="empty" role="alert"><h3>Configuração do fluxo inválida</h3><p>${valido.erros.join(' ')}</p></div>`.toString();
    return { ajustar() {}, centrar() {}, focar() {}, no: () => null, destruir() {} };
  }

  const { W, H, pos } = calcularLayout(grafo);
  const { nw, nh } = cfg.passo;
  const marca = uid('mk');
  /** @param {boolean} vermelha */
  const seta = (vermelha) => `url(#${marca}${vermelha ? 'r' : 'n'})`;

  const setas = cfg.arestas.map((a) => {
    const d = dePontos(caminhoOrtogonal(pos[String(a.from)], pos[String(a.to)]));
    const vermelha = !!a.suspensao;
    return html`<path class="${`edge${vermelha ? ' red' : ''}`}" d="${d}" marker-end="${seta(vermelha)}" ${a.bidirectional ? raw(`marker-start="${seta(vermelha)}"`) : ''}/>${vermelha ? '' : html`<path class="edge-flow" d="${d}"/>`}`;
  });
  const px = (/** @type {number} */ n) => `${n.toFixed(1)}px`;

  el.innerHTML = html`<div class="flow-world" style="${`width:${W}px;height:${H}px`}">
      <svg class="flow-edges" width="${W}" height="${H}" aria-hidden="true"><defs>
        <marker id="${`${marca}n`}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="arrow-n" d="M0,1 L10,5 L0,9 z"/></marker>
        <marker id="${`${marca}r`}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="arrow-r" d="M0,1 L10,5 L0,9 z"/></marker></defs>${setas}</svg>
      ${(cfg.juncoes || []).map((j) => html`<div class="fjunc" style="${`left:${px(pos[String(j.id)].cx - 11)};top:${px(pos[String(j.id)].cy - 11)}`}" aria-hidden="true"></div>`)}
      ${cfg.nos.map((n, i) => html`<div class="${`fnode ${n.cls || ''}`}" data-id="${String(n.id)}" role="button" tabindex="0" aria-label="${n.aria}" style="${`left:${px(pos[String(n.id)].cx - nw / 2)};top:${px(pos[String(n.id)].cy - nh / 2)};width:${nw}px;height:${nh}px;--i:${i}`}">${n.tag ? html`<span class="fn-tag">${n.tag}</span>` : ''}${n.html}</div>`)}
    </div>
    <div class="flow-hud hud-tl">${cfg.hudTL || ''}</div>
    <div class="flow-hud hud-tr">${cfg.hudTR || ''}</div>
    <div class="flow-hud hud-bl"><div class="hud-box zoom-ctl" role="group" aria-label="Zoom">
      <button type="button" class="icon-btn" data-z="out" aria-label="Afastar" data-tip="Afastar · −">${ic('minus')}</button>
      <span class="pct" data-pct>100%</span>
      <button type="button" class="icon-btn" data-z="in" aria-label="Aproximar" data-tip="Aproximar · +">${ic('plus')}</button><span class="sep"></span>
      <button type="button" class="icon-btn" data-z="fit" aria-label="Ajustar à tela" data-tip="Ajustar à tela · 0">${ic('corners-out')}</button></div></div>
    <div class="flow-hud hud-br"><div class="hud-box minimap" data-mmap role="img" aria-label="Minimapa do fluxograma. Clique ou arraste para mover a vista.">
      <svg viewBox="${`0 0 ${W} ${H}`}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${cfg.nos.map((n) => html`<rect class="${`mm-n ${n.mm || ''}`}" x="${(pos[String(n.id)].cx - nw / 2).toFixed(0)}" y="${(pos[String(n.id)].cy - nh / 2).toFixed(0)}" width="${nw}" height="${nh}" rx="10"/>`)}<rect class="mm-v" data-mmview x="0" y="0" width="10" height="10" rx="6"/></svg></div></div>`.toString();

  const mundo = /** @type {HTMLElement} */ ($('.flow-world', el));
  const mmView = /** @type {SVGElement} */ (/** @type {unknown} */ ($('[data-mmview]', el)));
  const mm = /** @type {HTMLElement} */ ($('[data-mmap]', el));
  const mmSvg = /** @type {SVGElement} */ (/** @type {unknown} */ ($('svg', mm)));
  const pct = /** @type {HTMLElement} */ ($('[data-pct]', el));
  /** @type {(() => void)[]} */
  const limpar = [];
  /** @type {any[]} */
  const timers = [];

  let vw = el.clientWidth; let vh = el.clientHeight;
  let vista = vistaInicial(W, H, vw, vh);
  /** O roteador esconde a tela enquanto o skeleton aparece: sem tamanho ainda, a vista inicial e o foco esperam o primeiro. @type {(() => void)[]} */
  let aoTerTamanho = vw && vh ? [] : [() => { vista = vistaInicial(W, H, vw, vh); }];

  /** @param {boolean} [animar] */
  const aplicar = (animar) => {
    if (animar && !reduzido()) {
      mundo.style.transition = 'transform .38s cubic-bezier(.16,1,.3,1)';
      timers.push(setTimeout(() => { mundo.style.transition = ''; }, 400));
    }
    mundo.style.transform = `translate(${vista.x.toFixed(1)}px,${vista.y.toFixed(1)}px) scale(${vista.k.toFixed(4)})`;
    el.style.backgroundPosition = `${vista.x.toFixed(1)}px ${vista.y.toFixed(1)}px`;
    el.style.backgroundSize = `${(22 * vista.k).toFixed(2)}px ${(22 * vista.k).toFixed(2)}px`;
    pct.textContent = `${Math.round(vista.k * 100)}%`;
    const r = retanguloVisivel(vista, vw, vh);
    mmView.setAttribute('x', r.x.toFixed(1)); mmView.setAttribute('y', r.y.toFixed(1));
    mmView.setAttribute('width', r.w.toFixed(1)); mmView.setAttribute('height', r.h.toFixed(1));
  };
  /** @param {number} fator @param {number} x @param {number} y @param {boolean} [animar] */
  const zoom = (fator, x, y, animar) => { const v = zoomEm(vista, fator, x, y); if (v !== vista) { vista = v; aplicar(animar); } };
  const ajustar = (/** @type {boolean} */ animar) => { vista = vistaAjustada(W, H, vw, vh); aplicar(animar); };
  const centrar = (/** @type {number} */ wx, /** @type {number} */ wy, /** @type {number} */ k, /** @type {boolean} */ animar) => { vista = vistaCentrada(vista, wx, wy, vw, vh, k); aplicar(animar); };

  // ---- pan e pinça (ponteiros) ----
  /** @type {Map<number, { x: number, y: number }>} */
  const ponteiros = new Map();
  /** @type {{ sx: number, sy: number, vx: number, vy: number, mov: boolean }|null} */
  let arrasto = null;
  /** @type {{ d: number, k: number }|null} */
  let pinca = null;
  let suprimir = false;

  /** @param {PointerEvent} e */
  const aoPressionar = (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest('.flow-hud')) return;
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ponteiros.size === 1) arrasto = { sx: e.clientX, sy: e.clientY, vx: vista.x, vy: vista.y, mov: false };
    if (ponteiros.size === 2) { const [a, b] = [...ponteiros.values()]; pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), k: vista.k }; arrasto = null; }
  };
  /** @param {PointerEvent} e */
  const aoMover = (e) => {
    if (!ponteiros.has(e.pointerId)) return;
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinca && ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()]; const r = el.getBoundingClientRect();
      zoom((pinca.k * Math.hypot(a.x - b.x, a.y - b.y) / (pinca.d || 1)) / vista.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    if (!arrasto) return;
    const dx = e.clientX - arrasto.sx; const dy = e.clientY - arrasto.sy;
    if (!arrasto.mov && ehArrasto(dx, dy)) { arrasto.mov = true; el.classList.add('dragging'); try { el.setPointerCapture(e.pointerId); } catch (er) { /* ponteiro já liberado */ } }
    if (arrasto.mov) { vista = { ...vista, x: arrasto.vx + dx, y: arrasto.vy + dy }; aplicar(); }
  };
  /** @param {PointerEvent} e */
  const aoSoltar = (e) => {
    if (arrasto && arrasto.mov) { suprimir = true; timers.push(setTimeout(() => { suprimir = false; }, 0)); }
    ponteiros.delete(e.pointerId);
    if (ponteiros.size < 2) pinca = null;
    if (!ponteiros.size) arrasto = null;
    el.classList.remove('dragging');
  };
  /** @param {MouseEvent} e  arrastar o canvas NÃO dispara clique no nó (limiar de 4 px) */
  const aoClicar = (e) => {
    if (suprimir) { e.stopPropagation(); e.preventDefault(); return; }
    const alvo = /** @type {HTMLElement} */ (e.target);
    const z = /** @type {HTMLElement|null} */ (alvo.closest('[data-z]'));
    if (z) { if (z.dataset.z === 'fit') ajustar(true); else zoom(z.dataset.z === 'in' ? 1.25 : 0.8, vw / 2, vh / 2, true); return; }
    const no = /** @type {HTMLElement|null} */ (alvo.closest('.fnode'));
    if (no && cfg.aoNo) cfg.aoNo(cfg.nos.find((n) => String(n.id) === no.dataset.id)?.id ?? /** @type {string} */ (no.dataset.id));
  };
  /** @param {KeyboardEvent} e */
  const aoTeclar = (e) => {
    const no = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest?.('.fnode'));
    if (no && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); no.click(); }
  };
  /** @param {WheelEvent} e */
  const aoRodar = (e) => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); const r = el.getBoundingClientRect(); zoom(fatorDaRoda(e.deltaY), e.clientX - r.left, e.clientY - r.top); }
    else if (e.shiftKey) { e.preventDefault(); vista = { ...vista, x: vista.x - (e.deltaY || e.deltaX) }; aplicar(); }
  };
  /** Tab para um nó fora da vista traz o nó para o centro (o foco nunca fica "escondido"). @param {FocusEvent} e */
  const aoFocar = (e) => {
    const no = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest?.('.fnode'));
    const p = no && pos[/** @type {string} */ (no.dataset.id)];
    if (!p) return;
    const sx = vista.x + p.cx * vista.k; const sy = vista.y + p.cy * vista.k;
    if (sx - p.hw * vista.k < 0 || sx + p.hw * vista.k > vw || sy - p.hh * vista.k < 0 || sy + p.hh * vista.k > vh) centrar(p.cx, p.cy, vista.k, true);
  };
  el.addEventListener('pointerdown', aoPressionar);
  el.addEventListener('pointermove', aoMover);
  el.addEventListener('pointerup', aoSoltar);
  el.addEventListener('pointercancel', aoSoltar);
  el.addEventListener('click', aoClicar, true);
  el.addEventListener('keydown', aoTeclar);
  el.addEventListener('wheel', aoRodar, { passive: false });
  el.addEventListener('focusin', aoFocar);

  // ---- minimapa: clicar/arrastar centraliza a vista ----
  let mmAtivo = false;
  /** @param {PointerEvent} e */
  const irPara = (e) => { const p = pontoDoMinimapa(e.clientX, e.clientY, mmSvg.getBoundingClientRect(), W, H); centrar(p.x, p.y, vista.k, false); };
  mm.addEventListener('pointerdown', (e) => { mmAtivo = true; try { mm.setPointerCapture(e.pointerId); } catch (er) { /* ignora */ } irPara(e); e.stopPropagation(); });
  mm.addEventListener('pointermove', (e) => { if (mmAtivo) irPara(e); });
  mm.addEventListener('pointerup', () => { mmAtivo = false; });
  mm.addEventListener('pointercancel', () => { mmAtivo = false; });

  // ---- tamanho do contêiner ----
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      vw = el.clientWidth; vh = el.clientHeight;
      if (vw && vh && aoTerTamanho.length) { const fila = aoTerTamanho; aoTerTamanho = []; fila.forEach((f) => f()); }
      aplicar();
    });
    ro.observe(el);
    limpar.push(() => ro.disconnect());
  }

  // ---- teclas + − 0 (só enquanto a tela está aberta; ignoradas em campo de texto/modal) ----
  if (cfg.atalhos) {
    const a = cfg.atalhos;
    [['+', 1.2], ['=', 1.2], ['-', 0.83], ['_', 0.83]].forEach(([tecla, f]) => limpar.push(a.registrar({ id: `tela.fluxo.zoom${tecla}`, tecla: String(tecla), aoAcionar: () => zoom(Number(f), vw / 2, vh / 2, true) })));
    limpar.push(a.registrar({ id: 'tela.fluxo.ajustar', tecla: '0', aoAcionar: () => ajustar(true) }));
  }

  aplicar();
  return {
    ajustar, centrar,
    /** Centraliza o nó em 100 % e o realça por 3 s (FLX-14). @param {string|number} id */
    focar(id) {
      const p = pos[String(id)]; if (!p) return;
      if (vw && vh) centrar(p.cx, p.cy, 1, true); else aoTerTamanho.push(() => centrar(p.cx, p.cy, 1, false));
      const no = $(`.fnode[data-id="${String(id).replace(/"/g, '\\"')}"]`, el);
      if (no) { no.classList.add('focus'); timers.push(setTimeout(() => no.classList.remove('focus'), 3000)); }
    },
    /** Elemento do nó (o chamador atualiza números e classes sem redesenhar tudo). @param {string|number} id */
    no: (id) => $$('.fnode', el).find((n) => n.dataset.id === String(id)) || null,
    destruir() { limpar.forEach((f) => f()); timers.forEach(clearTimeout); },
  };
}
