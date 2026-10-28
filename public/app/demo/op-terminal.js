// @ts-check
import { iso, ok, falha, naoEncontrada } from './base.js';
import { cadastros, caixas, novoId, vista, concluir, pausaAberta, pausadoS, PROJETO_ID, REGEX_CODIGO } from './op-dados.js';

/**
 * Tablet do turno, digitalização e Correções (gestão) simulados — mesmas regras do `back_dashboard`: código validado pelo regex do
 * projeto, bipe repetido em até 3 s, um colaborador com uma caixa por vez e confirmação de senha antes de corrigir.
 */

const JANELA_DUPLICADO_MS = 3000;
const ms = (/** @type {string} */ s) => Date.parse(s);
const ehDigitalizacao = (/** @type {string} */ e) => e === 'digitalizacao';

/** @param {string} texto */
function validarCodigo(texto) {
  const codigo = String(texto ?? '').trim();
  if (!codigo) return { ok: false, motivo: 'vazio', codigo };
  if (codigo.length > 60) return { ok: false, motivo: 'longo', codigo };
  if (!new RegExp(`^(?:${REGEX_CODIGO})$`).test(codigo)) return { ok: false, motivo: 'formato', codigo };
  return { ok: true, motivo: null, codigo };
}

/**
 * `/operacional/terminal/*` (conta de turno; um admin também pode abrir o tablet).
 * @param {{ metodo: string, caminho: string, corpo: any, usuario: import('./base.js').UsuarioDemo }} req
 * @returns {import('./base.js').Resposta}
 */
export function rotaTerminal({ metodo, caminho, corpo, usuario }) {
  const c = corpo || {};
  const turnoId = usuario.turnoId || 8;
  const doTurno = cadastros.colaboradores.filter((x) => x.turnoId === turnoId && x.ativo);
  const agora = iso(Date.now());
  if (caminho === '/colaboradores' && metodo === 'GET') return ok(doTurno.map(({ id, nome, funcao, avatar }) => ({ id, nome, funcao, avatar })));
  if (caminho === '/estado' && metodo === 'GET') return ok({ agora, abertas: caixas.filter((x) => x.status === 'aberta' && x.turnoId === turnoId).map(vista) });
  if (caminho === '/bip' && metodo === 'POST') {
    const v = validarCodigo(c.codigo);
    if (!v.ok) return falha(422, 'Código de caixa inválido.', { acao: 'inexistente', motivo: v.motivo });
    const etapaPedida = c.etapa || 'higienizacao';
    const aberta = caixas.find((x) => x.status === 'aberta' && x.codigo === v.codigo);
    if (aberta) {
      if (ehDigitalizacao(aberta.etapa) !== ehDigitalizacao(etapaPedida)) return ok({ acao: 'outra_etapa', codigo: v.codigo, etapa: aberta.etapa });
      if (Date.now() - ms(aberta.inicioEm) <= JANELA_DUPLICADO_MS) return ok({ acao: 'duplicado' });
      if (ehDigitalizacao(aberta.etapa)) {
        aberta.fimSolicitadoEm = aberta.fimSolicitadoEm || agora;
        return ok({ acao: 'finalizar_pendente', codigo: v.codigo, registroId: aberta.id, fimSolicitadoEm: aberta.fimSolicitadoEm });
      }
      return ok({ acao: 'finalizar', codigo: v.codigo, ...concluir(aberta, {}) });
    }
    const ultima = caixas.filter((x) => x.codigo === v.codigo && x.etapa === etapaPedida).sort((a, b) => ms(b.inicioEm) - ms(a.inicioEm))[0];
    if (ultima && ultima.status === 'concluida') {
      if (ultima.fimEm && Date.now() - ms(ultima.fimEm) <= JANELA_DUPLICADO_MS) return ok({ acao: 'duplicado' });
      return ok({ acao: 'ja_concluida' });
    }
    return ok({ acao: 'iniciar', codigo: v.codigo });
  }
  if (caminho === '/caixas' && metodo === 'POST') {
    const v = validarCodigo(c.codigo);
    if (!v.ok) return falha(400, 'Código de caixa inválido.');
    if (!Number.isInteger(c.colaboradorId) || c.colaboradorId < 1) return falha(400, 'Campo "colaboradorId" deve ser um inteiro positivo.');
    if (!doTurno.some((x) => x.id === c.colaboradorId)) return falha(400, 'Colaborador não pertence ao turno.');
    if (caixas.some((x) => x.status === 'aberta' && x.codigo === v.codigo)) return falha(409, 'Caixa já está aberta.');
    const ocupado = caixas.find((x) => x.status === 'aberta' && x.colaboradorId === c.colaboradorId);
    if (ocupado) {
      return falha(409, `Este colaborador já tem a caixa ${ocupado.codigo} em andamento. Conclua antes de iniciar outra.`,
        { motivo: 'colaborador_ocupado', ocupadoCom: { codigo: ocupado.codigo, etapa: ocupado.etapa, inicioEm: ocupado.inicioEm } });
    }
    /** @type {import('./op-dados.js').Caixa} */
    const nova = { id: novoId(), codigo: v.codigo, colaboradorId: c.colaboradorId, projetoId: PROJETO_ID, turnoId, etapa: c.etapa || 'higienizacao', status: 'aberta', inicioEm: agora, pausas: [] };
    caixas.push(nova);
    return ok(vista(nova), 201);
  }
  const m = /^\/caixas\/(\d+)\/(pausar|retomar|concluir|encerrando)$/.exec(caminho);
  if (m) {
    const cx = caixas.find((x) => x.id === Number(m[1]) && x.status === 'aberta');
    if (!cx) return falha(404, 'Caixa aberta não encontrada.');
    if (m[2] === 'encerrando') {
      cx.fimSolicitadoEm = metodo === 'DELETE' ? null : (cx.fimSolicitadoEm || agora);
      return ok({ id: cx.id, fimSolicitadoEm: cx.fimSolicitadoEm });
    }
    if (m[2] === 'pausar') {
      if (pausaAberta(cx)) return falha(409, 'Caixa já está pausada.');
      cx.pausas.push({ inicio: agora, fim: null, auto: false });
      return ok({ id: cx.id, pausada: true }, 201);
    }
    if (m[2] === 'retomar') {
      const pa = pausaAberta(cx);
      if (!pa) return falha(409, 'Caixa não está pausada.');
      pa.fim = agora;
      return ok({ id: cx.id, pausada: false });
    }
    if (!ehDigitalizacao(cx.etapa)) return falha(400, 'Só a digitalização conclui com imagens.');
    if (!Number.isInteger(c.imagens) || c.imagens < 1) return falha(400, 'Campo "imagens" deve ser um inteiro maior ou igual a 1.');
    return ok({ acao: 'finalizar', codigo: cx.codigo, ...concluir(cx, c) });
  }
  return naoEncontrada();
}

/**
 * `/operacional/correcoes/*` (gestão). Alterações exigem o cabeçalho de confirmação emitido por `/auth/confirmar-senha`.
 * @param {{ metodo: string, caminho: string, query: URLSearchParams, corpo: any, cabecalhos: Record<string, string> }} req
 * @returns {import('./base.js').Resposta}
 */
export function rotaCorrecoes({ metodo, caminho, query, corpo, cabecalhos }) {
  const c = corpo || {};
  if (caminho === '/caixas' && metodo === 'GET') {
    const st = query.get('status');
    const projetoId = Number(query.get('projetoId')) || null;
    const lim = Math.min(500, Number(query.get('limite')) || 200);
    return ok(caixas.filter((x) => (!st || x.status === st) && (!projetoId || x.projetoId === projetoId))
      .sort((a, b) => ms(b.inicioEm) - ms(a.inicioEm)).slice(0, lim).map(vista));
  }
  if (caminho === '/colaboradores' && metodo === 'GET') {
    const projetoId = Number(query.get('projetoId')) || PROJETO_ID;
    return ok(cadastros.colaboradores.filter((x) => x.projetoId === projetoId && x.ativo)
      .map(({ id, nome, turnoId }) => ({ id, nome, turnoId })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })));
  }
  const m = /^\/caixas\/(\d+)(?:\/(colaborador|codigo|fechar|reabrir))?$/.exec(caminho);
  if (!m) return naoEncontrada();
  if (!String(cabecalhos['x-confirmacao-senha'] || '').startsWith('confirmacao-demo-')) {
    return falha(403, 'Confirme sua senha para alterar lançamentos.', { codigo: 'confirmacao' });
  }
  const i = caixas.findIndex((x) => x.id === Number(m[1]));
  if (i < 0) return falha(404, 'Lançamento não encontrado.');
  const cx = caixas[i];
  const agora = iso(Date.now());
  if (!m[2] && metodo === 'DELETE') { caixas.splice(i, 1); return ok(vista(cx)); }
  if (m[2] === 'colaborador' && metodo === 'PATCH') {
    if (!cadastros.colaboradores.some((x) => x.id === c.colaboradorId)) return falha(400, 'Colaborador inválido.');
    if (cx.status === 'aberta' && caixas.some((x) => x.status === 'aberta' && x.colaboradorId === c.colaboradorId && x.id !== cx.id)) return falha(409, 'Este colaborador já tem outra caixa em andamento.');
    cx.colaboradorId = c.colaboradorId;
    return ok(vista(cx));
  }
  if (m[2] === 'codigo' && metodo === 'PATCH') {
    const codigo = String(c.codigo || '').trim();
    if (!codigo) return falha(400, 'Código de caixa inválido.');
    if (!new RegExp(`^(?:${REGEX_CODIGO})$`).test(codigo)) return falha(400, 'O código não segue o padrão do projeto (AC- e 6 dígitos).');
    cx.codigo = codigo;
    return ok(vista(cx));
  }
  if (m[2] === 'fechar' && metodo === 'POST') {
    if (cx.status !== 'aberta') return falha(409, 'O lançamento já está fechado.');
    const pa = pausaAberta(cx);
    if (pa) pa.fim = agora;
    cx.status = c.resultado === 'cancelada' ? 'cancelada' : 'concluida';
    cx.fimEm = agora;
    cx.duracaoS = Math.max(0, Math.floor((Date.now() - ms(cx.inicioEm)) / 1000) - pausadoS(cx));
    return ok(vista(cx));
  }
  if (m[2] === 'reabrir' && metodo === 'POST') {
    if (cx.status === 'aberta') return falha(409, 'O lançamento já está em andamento.');
    if (caixas.some((x) => x.status === 'aberta' && x.codigo === cx.codigo && x.id !== cx.id)) return falha(409, 'Já existe uma caixa aberta com esse código.');
    if (caixas.some((x) => x.status === 'aberta' && x.colaboradorId === cx.colaboradorId && x.id !== cx.id)) return falha(409, 'Este colaborador já tem outra caixa em andamento.');
    Object.assign(cx, { status: 'aberta', fimEm: null, duracaoS: null, fimSolicitadoEm: null });
    return ok(vista(cx));
  }
  return naoEncontrada();
}
