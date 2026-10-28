// @ts-check
import { $ } from '../../core/dom.js';
import { html } from '../../core/html.js';
import { saudacao, primeiroNome } from '../../core/format.js';
import { marcarAtualizado } from '../../core/vivo.js';
import { projetoPorId } from '../../core/catalogo.js';
import { INSTANCIAS_ATLAS, kpiDoProjeto, kpiAtlasPorTipo } from '../../core/painel.js';
import { ativo, ausenteSe404 } from '../../config/recursos.js';
import { ic } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { blocoEmBreve } from '../../ui/embreve.js';
import { delta } from '../../ui/controles.js';
import { criarDadosPainel } from '../painel/dados.js';
import { criarServicosPainel } from '../painel/servicos.js';
import { cartaoProjeto, cartaoProjetoEmBreve, tileHoje, chip, pintarNumero, pintarSerie, pintarTexto, cartaoGargalos, cartaoAtividades, trocarPorEmBreve } from './cartoes.js';
import { ligarAtualizacao, ligarCartoes } from './ao-vivo.js';

const EM_BREVE_GARGALOS = { recurso: 'gargalos', titulo: 'Gargalos agora', icone: 'warning-diamond', classes: 'c-4 gargalos spot disabled rise', texto: 'As fases com mais pastas paradas, o fluxo e o peso de cada uma chegam com o backend novo.' };
const EM_BREVE_ATIVIDADES = { recurso: 'atividades', titulo: 'Atividade recente', icone: 'pulse', classes: 'c-5 atividade-home spot disabled rise', texto: 'Quem fez o quê e quando aparecerá aqui.' };

/**
 * Seleção de projetos (HUB-01) — `#/projetos`: saudação, cartão ATLAS com o KPI do mês, a variação e a série de 7
 * dias, COBALTO desabilitado, "Gargalos agora", "Atividade recente" e o número "de hoje" (APIs online). **Cada bloco carrega e falha
 * sozinho**: nunca há tela inteira de erro; 404 do servidor devolve o bloco ao "Em breve". ATLAS vem numa chamada
 * (`/painel/resumo`).
 *
 * @param {HTMLElement} view
 * @param {{ api: ReturnType<typeof import('../../core/api.js').criarApi>, sinal: AbortSignal, aoSair: (f: () => void) => void, usuario: any,
 *           catalogo: import('../../core/catalogo.js').Catalogo, irPara: (c: string) => void }} ctx
 */
export function montar(view, ctx) {
  // Pintura de "Gargalos agora" e "Atividade recente" (abaixo da dobra): módulo carregado sob demanda, em paralelo com os dados.
  const blocos = () => import('./blocos.js');
  const pintarCom = (/** @type {(b: typeof import('./blocos.js')) => void} */ f) => blocos().then((b) => { if (!ctx.sinal.aborted) f(b); }).catch((e) => console.error(e));
  const dados = criarDadosPainel(ctx.api);
  const serv = criarServicosPainel(ctx.api);
  const atlas = projetoPorId(ctx.catalogo, 'atlas');
  const cn = projetoPorId(ctx.catalogo, 'cobalto');
  const nome = primeiroNome((ctx.usuario && (ctx.usuario.nome || ctx.usuario.login)) || '');
  const agora = new Date();
  const hojeTxt = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  view.innerHTML = html`
    <div class="page-h rise"><div class="ttl"><span class="greet-date">${hojeTxt}</span><h1>${nome ? `${saudacao()}, ${nome}` : saudacao()}</h1>
        <p class="sub">Selecione abaixo qual projeto deseja visualizar os dados operacionais.</p></div>
      <div class="acts"><a class="btn lg" href="#/macro-view" aria-keyshortcuts="G M">${ic('play')}Macro View<kbd>G</kbd><kbd>M</kbd></a>
        <button type="button" class="icon-btn bordered ajuda" data-acao="ajuda" aria-label="O que é a Macro View?" aria-haspopup="dialog">${ic('question')}</button></div></div>
    <div class="bento spot-group">
      ${atlas ? cartaoProjeto({ id: 'atlas', rota: atlas.rota, icone: atlas.icone, sigla: atlas.sigla, nome: atlas.nome,
        chips: atlas.fluxos.map((f) => chip(f.icone, f.nome, f.aValidar ? 'a validar' : '')), resumo: `${atlas.fluxos.length} fluxos de digitalização`, direita: 'Negativos e Papel', separado: true }) : ''}
      ${cn ? cartaoProjetoEmBreve({ sigla: cn.sigla, nome: cn.nome }) : ''}
      ${ativo('gargalos') ? cartaoGargalos('c-4 gargalos') : blocoEmBreve(EM_BREVE_GARGALOS)}
      ${ativo('atividades') ? cartaoAtividades('c-5 atividade-home') : blocoEmBreve(EM_BREVE_ATIVIDADES)}
      <div data-tiles class="tiles-hoje">
        ${tileHoje({ rota: '/boreal/monitoramento', icone: 'pulse', rotulo: 'APIs online agora', unidade: 'integrações', indice: 4 })}
      </div>
    </div>`.toString();

  // ---------------------------------------------------------------- estado dos blocos
  /** `undefined` = ainda não respondeu · `null` = falhou · objeto = ok. @type {Record<string, import('../../core/painel.js').ResumoInstancia|null|undefined>} */
  const resumos = {};
  /** @type {{ online: number, total: number }|null} */
  let apis = null;

  const card = (/** @type {string} */ id) => /** @type {HTMLElement|null} */ ($(`[data-proj="${id}"]`, view));
  const tiles = () => /** @type {HTMLElement} */ ($('[data-tiles]', view));
  const tile = (/** @type {number} */ i) => /** @type {HTMLElement} */ (tiles().children[i]);

  /** KPI do projeto a partir das instâncias que já responderam (as demais ficam de fora, avisadas como "parcial"). @param {string} id @param {string[]} ids */
  function pintarProjeto(id, ids) {
    const el = card(id);
    const respostas = ids.map((i) => resumos[i]).filter((r) => r !== undefined);
    if (!el || !respostas.length) return;
    const porTipo = id === 'atlas' ? kpiAtlasPorTipo(resumos) : null;
    const kpi = porTipo ? porTipo.papel : kpiDoProjeto(ids.map((i) => resumos[i] || null));
    pintarNumero(el, 'kpi', kpi.imagens);
    if (porTipo) pintarNumero(el, 'kpi2', porTipo.negativo.imagens);
    pintarSerie(el, 'spark', kpi.serie, 64);
    const aviso = kpi.imagens === null ? html`<span class="selo warn nodot">Dados indisponíveis agora</span>`
      : kpi.parcial ? html`<span class="selo warn nodot" data-tip="${`${kpi.faltam} de ${ids.length} fluxos sem resposta: o total pode estar incompleto.`}">parcial</span>` : '';
    // ATLAS: variação das imagens (ΣA−ΣB)/ΣB
    const micro = porTipo ? porTipo.negativo.variacaoPct : null;
    const variacao = html`${kpi.variacaoPct !== null ? delta(kpi.variacaoPct, porTipo ? 'papel em imagens vs. mês anterior' : 'em imagens vs. mês anterior') : ''}${micro !== null ? delta(micro, 'negativos em imagens vs. mês anterior') : ''}`;
    pintarTexto(el, 'aviso', html`${aviso}${variacao}`);
  }

  function pintarTiles() {
    pintarTexto(tile(0), 'n', apis ? `${apis.online}/${apis.total}` : '—'); // fração: sem contagem animada
  }

  // ---------------------------------------------------------------- dados
  /** Um bloco por vez: pinta quando o SEU dado chega; falha só marca o bloco. @template T @param {Promise<T>} p @param {(v: T) => void} aoOk @param {(e: any) => void} aoFalha */
  const bloco = (p, aoOk, aoFalha) => p.then((v) => { if (!ctx.sinal.aborted) aoOk(v); return true; }, (e) => { console.error(e); if (!ctx.sinal.aborted) aoFalha(e); return false; });
  let avisou = false;
  const msgBloco = (/** @type {string} */ k) => { const l = $(`[data-k="${k}"]`, view); if (l) l.innerHTML = html`<p class="dim bloco-txt">Não foi possível carregar agora.</p>`.toString(); };

  async function carregar() {
    const s = ctx.sinal;
    const tarefas = [
      bloco(dados.atlas(s), (r) => { for (const id of INSTANCIAS_ATLAS) resumos[id] = r[id]; pintarProjeto('atlas', [...INSTANCIAS_ATLAS]); },
        () => { for (const id of INSTANCIAS_ATLAS) resumos[id] = null; pintarProjeto('atlas', [...INSTANCIAS_ATLAS]); }),
      bloco(dados.apis(s), (a) => { apis = { online: a.online, total: a.total }; pintarTiles(); }, () => {}),
    ];
    if (ativo('gargalos')) {
      tarefas.push(bloco(serv.gargalos(s), (g) => pintarCom((b) => b.pintarGargalos(view, g, ctx.catalogo)),
        (e) => { if (ausenteSe404('gargalos', e)) trocarPorEmBreve($('[data-bloco="gargalos"]', view), EM_BREVE_GARGALOS); else msgBloco('gar-lista'); }));
    }
    if (ativo('atividades')) {
      tarefas.push(bloco(serv.atividades({ limite: 6 }, s), (a) => pintarCom((b) => b.pintarAtividades(view, a)),
        (e) => { if (ausenteSe404('atividades', e)) trocarPorEmBreve($('[data-bloco="atividades"]', view), EM_BREVE_ATIVIDADES); else msgBloco('ativ-lista'); }));
    }
    const resultados = await Promise.all(tarefas);
    if (s.aborted) return;
    if (resultados.some(Boolean)) { avisou = false; marcarAtualizado(); } else if (!avisou) { avisou = true; toast('erro', 'Não foi possível atualizar', 'Verifique a conexão. Tentaremos de novo em instantes.'); }
  }

  // ---------------------------------------------------------------- interações
  const soltarCartoes = ligarCartoes(view, (rota) => ctx.irPara(rota));
  let soltarGargalos = () => {};
  pintarCom((b) => { soltarGargalos = b.ligarGargalos(view, (rota) => ctx.irPara(rota)); });
  const ajuda = /** @type {HTMLElement} */ ($('[data-acao="ajuda"]', view));
  ajuda.addEventListener('click', async () => (await import('../../ui/popover.js')).abrirPopover(ajuda, html`<b>Macro View</b><br>A função “Macro View” permite visualizar todos os dados de produção de um ou todos os projetos, de forma resumida.
    <div class="help-acao"><a class="btn sm primary" href="#/macro-view">${ic('play')}Iniciar agora</a></div>`, { classe: 'help-pop', rotulo: 'Sobre a Macro View', focar: 'a' }));
  const vivo = ligarAtualizacao(carregar);

  carregar();
  return { destruir() { vivo.destruir(); soltarCartoes(); soltarGargalos(); } };
}
