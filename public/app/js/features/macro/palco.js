// @ts-check
import { html } from '../../core/html.js';
import { mesMaiusculo } from '../../core/painel.js';
import { PROJETOS_MACRO } from '../../core/macro.js';
import { ic, icf } from '../../ui/icons.js';
import { LOGO } from '../../ui/logo.js';
import { ilustracao } from '../../ui/empty.js';

/** Markup da Macro View (frontend_screens.md §10): estrutura fixa + o palco de cada projeto. Só devolve `Html`. */

/** Cartão de um número (ícone, nome + sub, número gigante, "<unidade> · hoje"). `embreve` mostra o texto "Em breve" sem número.
 * @param {import('../../core/macro.js').CartaoMacro} c @param {number} i */
const cartao = (c, i) => html`<div class="${`mv-card${c.embreve ? ' soon' : ''}`}" style="${`--i:${i}`}" data-c="${c.id}"><div class="glow"></div>
  <div class="top">${ic(c.icone)}<div><h2 class="nm">${c.nome}</h2><div class="sb">${c.sub}</div></div></div>
  <div><div class="big" data-big>${c.embreve ? 'Em breve' : '—'}</div>${c.embreve ? '' : html`<div class="un">${c.semHoje ? c.unidade : `${c.unidade} · hoje`}</div>`}</div></div>`;

/** O palco de um projeto: título gigante, "mês de OUTUBRO" e a grade de cartões (ou "ainda não iniciado"). @param {import('../../core/macro.js').ProjetoMacro} p @param {Date} [agora] */
export const palco = (p, agora = new Date()) => html`<div class="mv-screen"><div class="mv-title"><span class="eyebrow">Macro View</span><h1>${p.nome}</h1><div class="mes">mês de <b>${mesMaiusculo(agora)}</b></div></div>
  ${p.cartoes ? html`<div class="${`mv-grid n${p.cartoes.length}`}">${p.cartoes.map(cartao)}</div>`
    : html`<div class="mv-empty">${ilustracao('ampulheta')}<h2>Projeto ainda não iniciado</h2><p>COBALTO entrará na rotação assim que a operação começar.</p></div>`}</div>`;

/** Estrutura da camada: barras *stories*, cabeçalho, faixa de aviso, palco e rodapé com as abas e as dicas de teclado. @param {number} intervalo */
export const estrutura = (intervalo) => html`
  <header class="mv-top"><div class="mv-stories" data-stories>${PROJETOS_MACRO.map((p, i) => html`<div class="mv-story" data-i="${i}" role="button" tabindex="0" aria-label="${`Ir para ${p.nome}`}"><i></i></div>`)}</div>
  <div class="mv-head"><button type="button" class="icon-btn bordered" data-acao="sair" aria-label="Sair da Macro View" data-tip="Sair · Esc">${ic('arrow-left')}</button>
    <div class="brand">${LOGO}</div>
    <button type="button" class="mv-play" data-acao="pausa" aria-label="Pausar rotação">${icf('pause')}<span>MACRO VIEW</span></button>
    <span class="chip-mono">${`${intervalo} s por tela`}</span><div class="grow"></div>
    <button type="button" class="icon-btn bordered" data-acao="tela-cheia" aria-label="Tela cheia" data-tip="Tela cheia">${ic('arrows-out')}</button>
    <div class="mv-clock"><div class="h" data-hora>--:--:--</div><div class="d" data-data></div></div></div>
  <div class="mv-aviso" role="alert" data-aviso hidden>${ic('warning')}<span>Sessão expirada — entre novamente para continuar.</span><a class="btn sm" href="#/login">Entrar novamente</a></div></header>
  <main class="mv-stage" data-palco tabindex="-1"></main>
  <footer class="mv-foot"><nav class="tabs" aria-label="Projetos">${PROJETOS_MACRO.map((p, i) => html`<button type="button" data-i="${i}">${p.nome}</button>`)}</nav>
    <span class="mv-sync" data-sync></span>
    <div class="keys"><span><kbd>←</kbd> <kbd>→</kbd> trocar projeto</span><span><kbd>Espaço</kbd> pausar</span><span><kbd>Esc</kbd> sair</span></div></footer>`;
