// @ts-check
import { html } from '../../core/html.js';
import { $, $$, delegar } from '../../core/dom.js';
import { alternarTema } from '../../core/tema.js';
import { paraRgb, razaoContraste } from '../../core/cor.js';
import { fmt, fmtDec, fmtCompacto, tempoRelativo } from '../../core/format.js';
import { ic } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { toast } from '../../ui/toast.js';
import { abrirModal, confirmar, erroGlobal } from '../../ui/modal.js';
import { abrirPopover } from '../../ui/popover.js';
import { blocoEmBreve, valorEmBreve, seloEmBreve, paginaEmBreve, atributosEmBreve } from '../../ui/embreve.js';
import { skeleton, TIPOS_SKELETON } from '../../ui/skeleton.js';
import { vazio, erroBloco } from '../../ui/empty.js';
import { RECURSOS } from '../../config/recursos.js';
import { secoesOnda1, ligarOnda1 } from './ui-onda1.js';

/**
 * Catálogo de componentes (só em desenvolvimento): prova visual dos tokens e dos componentes
 * nos dois temas, antes de montar qualquer tela. Rota `#/_ui`.
 */

const TOKENS_COR = ['bg', 'bg-elev', 'surface', 'surface-2', 'surface-3', 'border', 'border-2', 'border-3', 'fg', 'fg-2', 'fg-3', 'fg-4',
  'accent', 'accent-hi', 'accent-lo', 'accent-solid', 'accent-text', 'ok', 'warn', 'err', 'info', 'edge'];

/** Pares texto/fundo que precisam passar em AA (4,5:1; 3:1 para decorativo grande). */
const PARES_CONTRASTE = [
  ['fg', 'surface', 'Texto principal'], ['fg-2', 'surface', 'Texto secundário'], ['fg-3', 'surface', 'Rótulos / placeholder'],
  ['fg-3', 'surface-3', 'Rótulos sobre selo/trilha'], ['accent-text', 'surface', 'Texto de acento'],
  ['ok', 'surface', 'Status: ok'], ['warn', 'surface', 'Status: atenção'], ['err', 'surface', 'Status: erro'], ['info', 'surface', 'Status: info'],
  ['on-accent', 'accent-solid', 'Texto branco sobre acento'],
];

const secao = (/** @type {string} */ id, /** @type {string} */ titulo, /** @type {string} */ desc, /** @type {any} */ corpo) => html`
  <section id="${id}" aria-labelledby="${`${id}-t`}">
    <div class="sec-h"><div><h2 id="${`${id}-t`}">${titulo}</h2>${desc ? html`<p>${desc}</p>` : ''}</div></div>
    ${corpo}
  </section>`;

const tokenLer = (/** @type {string} */ n) => getComputedStyle(document.documentElement).getPropertyValue(`--${n}`).trim();

function tabelaContraste() {
  const linhas = PARES_CONTRASTE.map(([f, b, rotulo]) => {
    const rf = paraRgb(tokenLer(f)); const rb = paraRgb(tokenLer(b));
    const r = rf && rb ? razaoContraste(rf, rb) : 0;
    const ok = r >= 4.5;
    return html`<tr><td class="strong">${rotulo}</td><td class="m">--${f} / --${b}</td><td class="r m">${fmtDec(r, 2)}:1</td><td>${ok ? html`<span class="selo ok">AA</span>` : html`<span class="selo err">Reprova</span>`}</td></tr>`;
  });
  return html`<div class="tbl-wrap" tabindex="0" role="region" aria-label="Tabela rolável"><table class="tbl"><thead><tr><th scope="col">Par</th><th scope="col">Tokens</th><th scope="col" class="r">Razão</th><th scope="col">Resultado</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
}

function conteudo() {
  const swatches = TOKENS_COR.map((n) => html`<div class="sw"><span class="sw-c" style="${`background:var(--${n})`}"></span><span class="mono">--${n}</span></div>`);

  return html`
  <div class="page-h rise">
    <div class="ttl">
      <span class="eyebrow">${ic('squares-four')} Somente desenvolvimento · Ondas 0 e 1</span>
      <h1>Catálogo de componentes</h1>
      <p class="sub">Prova visual dos tokens, componentes, "Em breve" e overlays nos dois temas. Se algo aqui estiver errado, estará errado em todas as telas.</p>
    </div>
    <div class="acts">
      <button class="btn" data-acao="tema">${ic('moon')}Alternar tema <kbd>T</kbd></button>
    </div>
  </div>

  ${secao('tipografia', 'Tipografia', 'Geist para interface, Geist Mono para dados, rótulos e códigos.', html`
    <div class="card"><div style="display:flex;flex-direction:column;gap:14px">
      <div><span class="eyebrow">h1 página · 28/600</span><h1 style="font-size:28px;letter-spacing:-.035em">Seleção de projetos</h1></div>
      <div><span class="eyebrow">Números</span><div style="display:flex;gap:28px;align-items:baseline;flex-wrap:wrap"><span class="num-xxl">${fmt(139870)}</span><span class="num-xl">${fmt(1284)}</span><span class="num-lg">${fmt(948)}</span><span class="num-md">${fmt(60)}</span><span class="num-sm">${fmtCompacto(1234567)}</span></div></div>
      <div><span class="eyebrow">Mono · códigos, horários, lotes</span><p class="mono" style="margin-top:6px">CX00262G14A · 14:32 · Lote 0007 · ${fmtDec(12.4)}% · ${tempoRelativo(125)}</p></div>
      <p>Texto corrido em Geist 14/1,5 — acentuação: ação, coração, órgão, língua, pingüim, “aspas”, travessão — e reticências…</p>
    </div></div>`)}

  ${secao('cores', 'Tokens de cor', 'Fonte única de cor (RNB-005). Fora de tokens.css não há hexadecimal.', html`
    <div class="card"><div class="swatches">${swatches}</div></div>
    <div class="sec-h"><div><h2 style="font-size:13px">Contraste medido nesta página (tema atual)</h2><p>Texto normal ≥ 4,5:1. Muda ao alternar o tema.</p></div></div>
    <div id="contraste">${tabelaContraste()}</div>`)}

  ${secao('botoes', 'Botões', 'Padrão, primário, fantasma, perigo; tamanhos; carregando; desabilitado; só-ícone.', html`
    <div class="card"><div class="linha-demo">
      <button class="btn">${ic('plus')}Padrão</button>
      <button class="btn primary">${ic('check')}Primário <kbd>↵</kbd></button>
      <button class="btn ghost">Fantasma</button>
      <button class="btn danger">${ic('trash')}Perigo</button>
      <button class="btn sm">Pequeno</button>
      <button class="btn lg">Grande</button>
      <button class="btn primary loading" aria-busy="true"><span class="spin" aria-hidden="true"></span>Entrando…</button>
      <button class="btn" disabled>Desabilitado</button>
      <button class="icon-btn bordered" aria-label="Notificações">${ic('bell')}</button>
      <button class="icon-btn" aria-label="Configurações">${ic('gear-six')}</button>
      <button class="icon-btn danger-h" aria-label="Excluir">${ic('trash')}</button>
    </div></div>`)}

  ${secao('campos', 'Campos e controles', 'Campo com foco, inválido, senha, select, switch, segmentado, pílulas.', html`
    <div class="bento">
      <div class="card c-4"><div class="field"><label class="lbl" for="d-login">Login</label><div class="input">${ic('user')}<input id="d-login" placeholder="nome.sobrenome" autocomplete="off"></div><span class="field-hint">Sugerido a partir do nome.</span></div>
        <div class="field"><label class="lbl" for="d-inv">Campo inválido</label><div class="input invalid">${ic('at')}<input id="d-inv" value="usuario@"></div><span class="field-msg">${ic('warning-circle')}Informe um e-mail válido.</span></div></div>
      <div class="card c-4"><div class="field"><label class="lbl" for="d-senha">Senha <span class="caps">${ic('arrow-fat-line-up')}Caps Lock ativado</span></label><div class="input">${ic('lock-simple')}<input id="d-senha" type="password" value="segredo123"><button class="reveal" type="button" aria-label="Mostrar senha" aria-pressed="false" data-acao="olho">${ic('eye')}</button></div></div>
        <div class="field"><label class="lbl" for="d-sel">Intervalo</label><select class="native" id="d-sel"><option>5 min</option><option>10 min</option><option>30 min</option></select></div></div>
      <div class="card c-4">
        <div class="set-row"><div class="tx"><b>Barra lateral recolhida</b><span>Switch (role="switch")</span></div><button class="switch" role="switch" aria-checked="false" aria-label="Barra lateral recolhida" data-acao="switch"></button></div>
        <div class="seg" role="tablist" aria-label="Visualização"><button role="tab" aria-selected="true">Análise</button><button role="tab" aria-selected="false">Fluxograma</button></div>
        <div class="pills" role="group" aria-label="Filtro"><button class="pill" aria-pressed="true">Todos <span class="n">${fmt(128)}</span></button><button class="pill" aria-pressed="false">DF <span class="n">${fmt(34)}</span></button><button class="pill" aria-pressed="false">RJ <span class="n">${fmt(21)}</span></button></div>
      </div>
    </div>`)}

  ${secao('selos', 'Selos, variação, medidor, avatar', 'Status nunca só por cor: cor + ponto + palavra.', html`
    <div class="card"><div class="linha-demo">
      <span class="selo ok">Online</span><span class="selo warn">Lenta</span><span class="selo err pulse">Fora do Ar</span><span class="selo info">Testando…</span><span class="selo accent nodot">Ativo</span><span class="selo">Neutro</span>
      <span class="delta up">${ic('trend-up')}+12,4%</span><span class="delta down">${ic('trend-down')}−3,0%</span><span class="delta-note">vs. mês anterior</span>
    </div>
    <div class="meter-row"><span>Meta mensal</span><span><b>948</b> / 1.200 · 79%</span></div>
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="1200" aria-valuenow="948" aria-label="Progresso da meta mensal"><i data-w="79"></i></div>
    <div class="linha-demo">${[20, 26, 28, 34, 42, 64].map((t, i) => avatar({ nome: ['Rafael Lima', 'Maria Souza', 'Joao', 'Ana Paula Lima', 'Carlos Silva', 'Fernanda Rocha'][i], semente: ['rafael.lima', 'maria.souza', 'joao', 'ana.lima', 'carlos.silva', 'fernanda.rocha'][i], tamanho: t, online: i % 2 === 0 }))}
      <span class="dim">Gradiente gerado pelo login · iniciais · ponto de sessão ativa</span></div></div>`)}

  ${secao('cartoes', 'Cartões bento e spotlight', 'Mova o mouse sobre o grupo: borda luminosa e brilho seguem o cursor.', html`
    <div class="bento spot-group">
      ${[['Higienização', 'Operação Galpão Norte', 1284, 'caixas'], ['Digitalização', 'Captura', 139870, 'imagens'], ['Indexação IA', 'Lumen', 52310, 'documentos']].map(([n, s, v, u]) => html`
      <div class="card link spot c-4" tabindex="0" role="link" aria-label="${n}">
        <div class="card-h"><span class="card-t">${ic('stack')}${n}</span><span class="selo ok">Ativo</span></div>
        <div><div class="num-xl" data-count="${v}">${fmt(Number(v))}</div><span class="unit">${u} · este mês</span></div>
        <div class="card-f"><span class="dim">${s}</span>${ic('arrow-up-right')}</div>
      </div>`)}
    </div>`)}

  ${secao('embreve', 'Em breve (RNB-007 revisada)', 'O que depende do backend novo aparece no lugar certo, marcado — sem dado inventado e sem requisição.', html`
    <div class="bento spot-group">
      ${blocoEmBreve({ recurso: 'boreal.resumo', titulo: 'Meta mensal', icone: 'target', classes: 'c-4 spot disabled', texto: 'O progresso da meta do mês aparecerá aqui.' })}
      ${blocoEmBreve({ recurso: 'atividades.boreal', titulo: 'Atividade do BOREAL', icone: 'warning-diamond', classes: 'c-4 spot disabled' })}
      <div class="card c-4"><div class="card-h"><span class="card-t">${ic('chart-line-up')}KPI com número real</span></div>
        <div class="num-xl">1.284</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="dim">Variação mensal:</span>${valorEmBreve('boreal.resumo')}</div></div>
    </div>
    <div class="card" style="margin-top:12px"><div class="linha-demo">
      <button class="btn" ${atributosEmBreve('boreal.mesas.criar')}>${ic('plus')}Adicionar mesa ${seloEmBreve('boreal.mesas.criar', { semIcone: true })}</button>
      <button class="menu-i dis" style="width:auto" ${atributosEmBreve('auth.sessao')}>${ic('bell')}<span class="grow">Notificações</span>${seloEmBreve('auth.sessao', { semIcone: true })}</button>
    </div></div>
    <div class="card" style="margin-top:12px">${paginaEmBreve({ recurso: 'auth.usuarios', titulo: 'Gestão de usuários', texto: 'Listar, ativar e redefinir senha de usuários chega com o backend novo.' })}</div>
    <div class="card" style="margin-top:12px"><div class="card-t">Recursos registrados (${Object.keys(RECURSOS).length})</div>
      <div class="tbl-wrap" tabindex="0" role="region" aria-label="Tabela rolável"><table class="tbl"><thead><tr><th scope="col">Recurso</th><th scope="col">Depende de</th><th scope="col">Funções</th><th scope="col">Estado</th></tr></thead><tbody>
      ${Object.entries(RECURSOS).map(([id, r]) => html`<tr><td class="strong m">${id}</td><td class="m">${r.api}</td><td class="m">${r.funcoes.join(', ')}</td><td>${r.estado === 'ativo' ? html`<span class="selo ok">Ativo</span>` : seloEmBreve(id)}</td></tr>`)}
      </tbody></table></div></div>`)}

  ${secao('overlays', 'Overlays e avisos', 'Toasts, modal, confirmação, erro global e popover — foco preso, Esc fecha, foco devolvido.', html`
    <div class="card"><div class="linha-demo">
      <button class="btn" data-acao="toast-ok">${ic('check-circle')}Toast sucesso</button>
      <button class="btn" data-acao="toast-erro">${ic('x-circle')}Toast erro</button>
      <button class="btn" data-acao="toast-info">${ic('info')}Toast info</button>
      <button class="btn" data-acao="toast-load">Toast loading</button>
      <button class="btn" data-acao="toast-acao">Toast com ação</button>
      <button class="btn" data-acao="modal">Modal</button>
      <button class="btn danger" data-acao="confirmar">${ic('trash')}Confirmar exclusão</button>
      <button class="btn" data-acao="erro">Erro global</button>
      <button class="btn" data-acao="popover" aria-haspopup="menu" aria-expanded="false">Popover ${ic('caret-down')}</button>
    </div></div>`)}

  ${secao('estados', 'Skeleton, vazio e erro de bloco', 'Três estados em todo bloco de dado (RNB-008).', html`
    <div class="bento">
      <div class="card c-4">${vazio({ titulo: 'Nenhuma linha encontrada', texto: 'Ajuste os filtros para ver resultados.' })}</div>
      <div class="card c-4">${vazio({ tipo: 'ampulheta', titulo: 'Projeto ainda não iniciado', texto: 'Assim que a operação começar, os indicadores aparecerão aqui.' })}</div>
      <div class="card c-4">${erroBloco()}</div>
    </div>
    <div class="sec-h"><div><h2 style="font-size:13px">Layouts de skeleton</h2></div></div>
    <div class="pills" role="tablist" aria-label="Tipo de skeleton">${TIPOS_SKELETON.map((t, i) => html`<button class="pill" role="tab" aria-selected="${i === 0}" data-sk="${t}">${t}</button>`)}</div>
    <div id="sk-demo" class="card pad-0" style="margin-top:12px;padding:16px;overflow:hidden" aria-busy="true">${skeleton(TIPOS_SKELETON[0])}</div>`)}

  ${secao('tabela', 'Tabela densa (marcação)', 'A tabela interativa (ordenar, filtrar, pílulas) chega na Onda 1; aqui só o visual.', html`
    <div class="tbl-wrap" tabindex="0" role="region" aria-label="Tabela rolável"><table class="tbl"><thead><tr><th scope="col" aria-sort="descending"><button type="button">Caixa ${ic('arrow-down')}</button></th><th scope="col">Mesa</th><th scope="col" class="r"><button type="button">Imagens ${ic('arrow-down')}</button></th><th scope="col">Fase</th></tr></thead><tbody>
      <tr><td class="m strong">CX00262G14A</td><td class="m">0007</td><td class="r m">${fmt(1840)}</td><td><span class="tag">VALIDAÇÃO</span></td></tr>
      <tr><td class="m strong">CX00262G15B</td><td class="m">0003</td><td class="r m">${fmt(962)}</td><td><span class="tag">DIGITALIZAÇÃO</span></td></tr>
      <tr><td class="m strong">CX00262G16C</td><td class="m">0012</td><td class="r m">${fmt(2210)}</td><td><span class="tag">QUALIDADE</span></td></tr>
    </tbody></table></div>`)}

  ${secao('movimento', 'Movimento', 'Animações do catálogo. Com `prefers-reduced-motion` todas ficam instantâneas.', html`
    <div class="card"><div class="linha-demo">
      <button class="btn" data-acao="anim-shake">Shake (erro de login)</button>
      <button class="btn" data-acao="anim-rise">Rise (entrada)</button>
      <span class="spin lg" role="img" aria-label="Carregando"></span><span class="dim">spinner</span>
      <span class="live" style="margin:0"><span class="dot"></span><b>Ao vivo</b></span>
    </div>
    <div id="anim-alvo" class="card" style="max-width:320px"><span class="card-t">Alvo da animação</span></div></div>`)}
  ${secoesOnda1()}
  `;
}

/** @param {HTMLElement} view */
export function montar(view) {
  view.innerHTML = conteudo().toString();
  animarMedidores(view);
  const desligarOnda1 = ligarOnda1(view);

  const limpar = delegar(view, 'click', '[data-acao], [data-sk]', (alvo, e) => {
    if (alvo.dataset.sk) {
      $$('[data-sk]', view).forEach((b) => { const on = b === alvo; b.setAttribute('aria-selected', String(on)); });
      const demo = $('#sk-demo', view); if (demo) demo.innerHTML = skeleton(alvo.dataset.sk).toString();
      return;
    }
    const a = alvo.dataset.acao;
    if (a === 'tema') alternarTema(/** @type {MouseEvent} */ (e));
    else if (a === 'olho') { const inp = /** @type {HTMLInputElement} */ ($('#d-senha', view)); const ver = inp.type === 'password'; inp.type = ver ? 'text' : 'password'; alvo.setAttribute('aria-pressed', String(ver)); alvo.setAttribute('aria-label', ver ? 'Ocultar senha' : 'Mostrar senha'); }
    else if (a === 'switch') alvo.setAttribute('aria-checked', String(alvo.getAttribute('aria-checked') !== 'true'));
    else if (a === 'toast-ok') toast('sucesso', 'Produção salva!', 'Caixa CX00262G14A finalizada.');
    else if (a === 'toast-erro') toast('erro', 'Falha ao salvar', 'Erro de conexão com o servidor. Tente novamente.');
    else if (a === 'toast-info') toast('info', 'Dados atualizados', 'Sincronizado às 14:32.');
    else if (a === 'toast-load') { const t = toast('loading', 'Gerando relatório…'); setTimeout(() => { t.fechar(); toast('sucesso', 'Relatório pronto'); }, 1800); }
    else if (a === 'toast-acao') toast('sucesso', 'Relatório gerado', 'Relatorio_HIGIENIZACAO_02-10-2026.xlsx', { acao: { rotulo: 'Baixar CSV', fn: () => toast('info', 'Download iniciado') } });
    else if (a === 'modal') abrirModal({ eyebrow: 'Exemplo', titulo: 'Título do modal', sub: 'Foco preso: Tab circula só aqui dentro; Esc fecha.', corpo: html`<div class="field"><label class="lbl" for="m-in">Campo</label><div class="input"><input id="m-in" placeholder="Digite algo"></div></div><p class="muted">Texto de usuário é escapado: ${'<script>alert(1)</script>'}</p>`, rodape: html`<span class="left">${ic('info')}Esc para fechar</span><button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" data-fechar>Salvar</button>` });
    else if (a === 'confirmar') confirmar({ titulo: 'Excluir caixa?', texto: 'A caixa CX00262G14A será removida da lista de hoje. Esta ação não pode ser desfeita.', rotulo: 'Excluir caixa', icone: 'trash', perigo: true }).then((ok) => toast(ok ? 'sucesso' : 'info', ok ? 'Caixa excluída' : 'Ação cancelada'));
    else if (a === 'erro') erroGlobal('Não foi possível gerar o relatório. Tente novamente em alguns instantes.', 'ERR_RELATORIO');
    else if (a === 'popover') abrirPopover(alvo, html`<div class="menu-h" role="presentation">${avatar({ nome: 'Rafael Lima', semente: 'rafael.lima', tamanho: 34, online: true })}<div class="who"><b>Rafael Lima</b><span>rafael@exemplo.com</span></div></div>
      <button role="menuitem" class="menu-i">${ic('user-circle')}<span class="grow">Meu perfil</span></button>
      <button role="menuitem" class="menu-i">${ic('gear-six')}<span class="grow">Configurações</span><span class="kbds"><kbd>,</kbd></span></button>
      <button role="menuitem" class="menu-i dis" ${atributosEmBreve('auth.sessao')}>${ic('bell')}<span class="grow">Notificações</span>${seloEmBreve('auth.sessao', { semIcone: true })}</button>
      <div class="menu-sep" role="separator"></div>
      <button role="menuitem" class="menu-i danger">${ic('sign-out')}<span class="grow">Sair</span></button>`, { papel: 'menu', rotulo: 'Menu do usuário' });
    else if (a === 'anim-shake') { const x = $('#anim-alvo', view); if (x) { x.classList.remove('shake'); void x.offsetWidth; x.style.animation = 'shake .45s var(--ease)'; setTimeout(() => { x.style.animation = ''; }, 500); } }
    else if (a === 'anim-rise') { const x = $('#anim-alvo', view); if (x) { x.style.animation = 'none'; void x.offsetWidth; x.style.animation = 'rise .55s var(--ease)'; } }
  });

  // O contraste é medido sobre os tokens do tema ATUAL: recalcula a cada troca (botão ou tecla T).
  function atualizarContraste() { const c = $('#contraste', view); if (c) c.innerHTML = tabelaContraste().toString(); }
  const obs = new MutationObserver(() => requestAnimationFrame(atualizarContraste));
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return { destruir() { limpar(); obs.disconnect(); desligarOnda1(); } };
}

/** @param {HTMLElement} view */
function animarMedidores(view) {
  setTimeout(() => $$('[data-w]', view).forEach((i) => { i.style.width = `${i.dataset.w}%`; }), 80);
}

// Estilos exclusivos desta página de desenvolvimento (arquivo próprio: a CSP não permite <style> inline).
if (!document.getElementById('css-ui-dev')) {
  const l = document.createElement('link');
  l.id = 'css-ui-dev';
  l.rel = 'stylesheet';
  l.href = 'css/screens/dev.css';
  document.head.appendChild(l);
}
