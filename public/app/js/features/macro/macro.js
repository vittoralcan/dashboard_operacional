// @ts-check
import { $, $$ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { ESTADO } from '../../core/store.js';
import { empilhar, desempilhar } from '../../core/camadas.js';
import { animarNumero, contar } from '../../core/motion.js';
import { tokenValido, obterToken } from '../../core/auth.js';
import { mesclarValores } from '../../core/painel.js';
import { horaBR } from '../../core/format.js';
import {
  PROJETOS_MACRO, INTERVALO_DADOS_MS, PASSO_MS, rotacaoInicial, avancarTempo, irParaProjeto, alternarPausa, larguraDaBarra,
  valoresIniciais, valorDoCartao, horaRelogio, dataRelogio,
} from '../../core/macro.js';
import { icf } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { criarDadosPainel } from '../painel/dados.js';
import { estrutura, palco } from './palco.js';

/** Sem mouse por 5 s → esconde o cursor (TV). */
const OCIOSO_MS = 5000;

/**
 * Macro View (MAC-01…05) — `#/macro-view`, camada `macro` (tela cheia, sem barra lateral nem topo). Rotaciona BOREAL → ATLAS →
 * COBALTO com barras *stories*; `←` `→` trocam, `Espaço` pausa, `Esc` sai. Cada bloco de dados é buscado sozinho a cada 60 s
 * (`Promise.allSettled`), **mantendo o último valor bom** quando um falha — a TV nunca mostra erro, no máximo "—". Pensada para
 * ficar horas ligada: um único `setInterval` de relógio/rotação e um de dados, ambos limpos ao sair.
 *
 * @param {HTMLElement} raiz
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, sinal: AbortSignal, aoSair: (f: () => void) => void,
 *           irPara: (c: string) => void }} ctx
 */
export function montar(raiz, ctx) {
  const dados = criarDadosPainel(ctx.api);
  const n = PROJETOS_MACRO.length;
  const intervalo = () => ESTADO.macroIntervalo;
  let rot = rotacaoInicial();
  let valores = valoresIniciais();
  let sessaoExpirada = false;
  /** Último ciclo de dados: quando foi e se algum bloco falhou. @type {{ em: Date|null, falhou: boolean }} */
  let sync = { em: null, falhou: false };

  raiz.innerHTML = estrutura(intervalo()).toString();
  raiz.classList.remove('idle');
  const palcoEl = /** @type {HTMLElement} */ ($('[data-palco]', raiz));
  const barras = $$('.mv-story i', raiz);

  // ---------------------------------------------------------------- pintura
  function pintarValores() {
    const p = PROJETOS_MACRO[rot.idx];
    for (const el of $$('.mv-card[data-c]', palcoEl)) {
      const c = (p.cartoes || []).find((x) => x.id === el.dataset.c);
      const big = $('[data-big]', el);
      if (!c || !big || c.embreve) continue;
      const v = valorDoCartao(p, c, valores);
      if (v.tipo === 'numero') { animarNumero(big, v.n, Number(big.dataset.v || 0)); big.dataset.v = String(v.n); }
      else { delete big.dataset.v; big.textContent = v.tipo === 'texto' ? v.texto : '—'; }
    }
  }

  function pintarBarras() {
    barras.forEach((b, i) => { b.style.width = `${larguraDaBarra(rot, i, intervalo())}%`; });
  }

  function desenharPalco() {
    palcoEl.innerHTML = palco(PROJETOS_MACRO[rot.idx]).toString();
    $$('.mv-foot .tabs button', raiz).forEach((b, i) => b.setAttribute('aria-current', String(i === rot.idx)));
    contar(palcoEl);
    pintarValores();
    pintarBarras();
  }

  function pintarSync() {
    const el = $('[data-sync]', raiz);
    if (!el) return;
    el.textContent = sync.em ? `Atualizado às ${horaBR(sync.em)}${sync.falhou ? ' · parte dos dados sem resposta' : ''}` : 'Carregando dados…';
    el.classList.toggle('warn', sync.falhou);
  }

  function relogio() {
    const d = new Date();
    const h = $('[data-hora]', raiz); const dt = $('[data-data]', raiz);
    if (h) h.textContent = horaRelogio(d);
    if (dt) dt.textContent = dataRelogio(d);
  }

  // ---------------------------------------------------------------- rotação
  /** @param {import('../../core/macro.js').Rotacao} nova @param {boolean} trocou */
  function aplicar(nova, trocou) {
    rot = nova;
    if (trocou) desenharPalco(); else pintarBarras();
  }
  let ultimo = performance.now();
  const passo = setInterval(() => {
    const agora = performance.now();
    const dt = Math.min((agora - ultimo) / 1000, 1); // aparelho que dormiu não "pula" projetos
    ultimo = agora;
    relogio();
    const r = avancarTempo(rot, dt, intervalo(), n);
    aplicar({ idx: r.idx, decorrido: r.decorrido, pausado: r.pausado }, r.trocou);
  }, PASSO_MS);

  const ir = (/** @type {number} */ i) => aplicar(irParaProjeto(rot, i, n), true);
  function pausar() {
    rot = alternarPausa(rot);
    const b = $('[data-acao="pausa"]', raiz);
    if (b) { b.innerHTML = html`${icf(rot.pausado ? 'play' : 'pause')}<span>MACRO VIEW</span>`.toString(); b.setAttribute('aria-label', rot.pausado ? 'Continuar rotação' : 'Pausar rotação'); }
    toast('info', rot.pausado ? 'Rotação pausada' : 'Rotação retomada', undefined, { duracao: 1400 });
  }

  // ---------------------------------------------------------------- dados (a cada 60 s; cada bloco sozinho)
  function avisarSessao() {
    if (sessaoExpirada) return;
    sessaoExpirada = true;
    const a = $('[data-aviso]', raiz);
    if (a) a.hidden = false;
  }
  async function atualizar() {
    if (sessaoExpirada) return;
    if (!tokenValido(obterToken())) { avisarSessao(); return; }
    const s = ctx.sinal;
    const [b, c] = await Promise.allSettled([dados.hojeAtlas(s), dados.apis(s)]);
    if (s.aborted || sessaoExpirada) return;
    const novo = valoresIniciais();
    if (b.status === 'fulfilled') novo.atlas = b.value;
    if (c.status === 'fulfilled') novo.apis = { online: c.value.online, total: c.value.total };
    valores = { atlas: mesclarValores(valores.atlas, novo.atlas), apis: novo.apis || valores.apis };
    const falhas = [b, c].filter((r) => r.status === 'rejected');
    falhas.forEach((r) => console.error('Macro View:', /** @type {PromiseRejectedResult} */ (r).reason));
    sync = { em: new Date(), falhou: falhas.length > 0 };
    pintarValores();
    pintarSync();
  }
  const dadosTimer = setInterval(() => { atualizar(); }, INTERVALO_DADOS_MS);
  const aoSessao = () => avisarSessao();
  document.addEventListener('noir:sessao-expirada', aoSessao);

  // ---------------------------------------------------------------- saída, tela cheia, teclado, cursor
  let saiu = false;
  const sairDaTelaCheia = () => { if (document.fullscreenElement) { try { document.exitFullscreen()?.catch(() => {}); } catch (e) { /* já saiu */ } } };
  function sair() {
    if (saiu) return;
    saiu = true;
    sairDaTelaCheia();
    const volta = ESTADO.rotaAnterior && ESTADO.rotaAnterior !== '/macro-view' ? ESTADO.rotaAnterior : '/projetos';
    ctx.irPara(volta);
  }
  const camada = empilhar(sair, raiz, 'macro'); // Esc fecha a camada do topo → sai (e o navegador encerra a tela cheia)

  function telaCheia() {
    const semTela = () => toast('info', 'Tela cheia indisponível neste navegador');
    try {
      const pr = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      pr?.catch(semTela);
    } catch (e) { semTela(); }
  }

  const aoClicar = (/** @type {Event} */ e) => {
    const alvo = /** @type {HTMLElement} */ (e.target).closest('[data-acao], [data-i]');
    if (!(alvo instanceof HTMLElement)) return;
    if (alvo.dataset.i !== undefined) { ir(Number(alvo.dataset.i)); return; }
    if (alvo.dataset.acao === 'sair') sair(); else if (alvo.dataset.acao === 'pausa') pausar(); else if (alvo.dataset.acao === 'tela-cheia') telaCheia();
  };
  raiz.addEventListener('click', aoClicar);

  const aoTeclar = (/** @type {KeyboardEvent} */ e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const emControle = /** @type {HTMLElement} */ (e.target).closest?.('button, a, [role="button"]');
    if (e.key === 'ArrowRight') { e.preventDefault(); ir(rot.idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(rot.idx - 1); }
    else if (e.key === ' ' && !emControle) { e.preventDefault(); pausar(); }
    else if ((e.key === 'Enter' || e.key === ' ') && emControle?.classList.contains('mv-story')) { e.preventDefault(); ir(Number(/** @type {HTMLElement} */ (emControle).dataset.i)); }
  };
  document.addEventListener('keydown', aoTeclar);

  /** @type {any} */ let ocioso = null;
  const acordar = () => { raiz.classList.remove('idle'); clearTimeout(ocioso); ocioso = setTimeout(() => raiz.classList.add('idle'), OCIOSO_MS); };
  raiz.addEventListener('mousemove', acordar);
  acordar();

  relogio();
  pintarSync();
  desenharPalco();
  atualizar();

  return {
    destruir() {
      saiu = true;
      clearInterval(passo); clearInterval(dadosTimer); clearTimeout(ocioso);
      desempilhar(camada);
      raiz.removeEventListener('click', aoClicar); raiz.removeEventListener('mousemove', acordar);
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('noir:sessao-expirada', aoSessao);
      sairDaTelaCheia();
      raiz.classList.remove('idle');
      raiz.replaceChildren();
    },
  };
}
