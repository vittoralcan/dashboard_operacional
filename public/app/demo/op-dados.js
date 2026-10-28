// @ts-check
import { aleatorio, semente, entre, emSP, instanteSP, somarDias, iso } from './base.js';

/**
 * Estado do módulo operacional simulado (projeto fictício "Acervo Central"): cadastros, colaboradores e as caixas dos últimos
 * três dias, com pausas, digitalização com imagens e algumas caixas em andamento agora. Vive em memória até recarregar a página.
 */

/** @typedef {{ inicio: string, fim: string|null, auto: boolean }} Pausa */
/** @typedef {{ id: number, codigo: string, colaboradorId: number, projetoId: number, turnoId: number, etapa: string, status: string, inicioEm: string, fimEm?: string|null, duracaoS?: number|null, imagens?: number|null, grampo?: boolean, deteriorado?: boolean, fimSolicitadoEm?: string|null, pausas: Pausa[] }} Caixa */

export const PROJETO_ID = 5;
export const REGEX_CODIGO = '^AC-\\d{6}$';

export const cadastros = {
  projetos: [
    { id: 5, slug: 'acervo', nome: 'Acervo Central', codigoRegex: REGEX_CODIGO, integracoes: ['captura'], ativo: true },
    { id: 6, slug: 'arquivo-norte', nome: 'Arquivo Norte', codigoRegex: null, integracoes: [], ativo: true },
  ],
  turnos: [
    { id: 8, projetoId: 5, nome: 'Matutino 1', usuarioAuthId: 90, ativo: true },
    { id: 9, projetoId: 5, nome: 'Vespertino 1', usuarioAuthId: null, ativo: true },
    { id: 10, projetoId: 6, nome: 'Integral', usuarioAuthId: null, ativo: true },
  ],
  colaboradores: /** @type {{ id: number, projetoId: number, nome: string, funcao: string|null, turnoId: number|null, avatar: string|null, ativo: boolean }[]} */ ([
    ['Ana Lima', 'Higienização', 8], ['Bruno Reis', 'Higienização', 8], ['Carla Souza', 'Remontagem', 8], ['Diego Martins', 'Digitalização', 8],
    ['Érica Dias', 'Higienização', 8], ['Fábio Nunes', 'Digitalização', 8], ['Gabriela Rocha', 'Remontagem', 8], ['Hugo Teles', 'Higienização', 8],
    ['Isabela Prado', 'Higienização', 9], ['Júlio Freitas', 'Digitalização', 9], ['Karen Melo', 'Remontagem', 9], ['Lucas Viana', 'Higienização', 9],
  ].map(([nome, funcao, turnoId], i) => ({ id: i + 1, projetoId: 5, nome: String(nome), funcao: String(funcao), turnoId: Number(turnoId), avatar: null, ativo: true }))),
  mesas: [
    { id: 1, projetoId: 5, codigo: 'H-01', tipo: 'higienizacao', ativo: true },
    { id: 2, projetoId: 5, codigo: 'H-02', tipo: 'higienizacao', ativo: true },
    { id: 3, projetoId: 5, codigo: 'R-01', tipo: 'remontagem', ativo: true },
  ],
  metas: [
    { projetoId: 5, etapa: 'higienizacao', valorDia: 120, unidade: 'caixas' },
    { projetoId: 5, etapa: 'scanner', valorDia: 45000, unidade: 'imagens' },
  ],
};

const ETAPA_DA_FUNCAO = /** @type {Record<string, string>} */ ({ Higienização: 'higienizacao', Remontagem: 'remontagem', Digitalização: 'digitalizacao' });
const DURACAO_MIN = /** @type {Record<string, [number, number]>} */ ({ higienizacao: [14, 34], remontagem: [18, 42], digitalizacao: [28, 66] });

/** @type {Caixa[]} */
export const caixas = [];
let seqCaixa = 0;
let seqCodigo = 4000;
export const novoId = () => ++seqCaixa;
export const proximoCodigo = () => `AC-${String(++seqCodigo).padStart(6, '0')}`;

/** Gera a produção de um colaborador numa janela de tempo, deixando (ou não) uma caixa aberta no fim. */
function gerarJanela(/** @type {any} */ col, /** @type {number} */ ini, /** @type {number} */ fim, /** @type {boolean} */ deixarAberta, /** @type {() => number} */ r) {
  const etapa = ETAPA_DA_FUNCAO[col.funcao] || 'higienizacao';
  const [dmin, dmax] = DURACAO_MIN[etapa];
  let t = ini + entre(r, 0, 20) * 60000;
  while (t < fim) {
    const dur = entre(r, dmin, dmax) * 60000;
    const pausa = r() < 0.15 ? entre(r, 4, 15) * 60000 : 0;
    const termino = t + dur + pausa;
    const base = { id: novoId(), codigo: proximoCodigo(), colaboradorId: col.id, projetoId: col.projetoId, turnoId: col.turnoId, etapa, inicioEm: iso(t) };
    if (termino > fim) {
      if (deixarAberta) caixas.push({ ...base, status: 'aberta', pausas: [] });
      return;
    }
    /** @type {Pausa[]} */
    const pausas = pausa ? [{ inicio: iso(t + dur / 2), fim: iso(t + dur / 2 + pausa), auto: false }] : [];
    caixas.push({ ...base, status: 'concluida', fimEm: iso(termino), duracaoS: Math.round(dur / 1000), pausas,
      ...(etapa === 'digitalizacao' ? { imagens: entre(r, 600, 1800), grampo: r() < 0.3, deteriorado: r() < 0.12 } : {}) });
    t = termino + entre(r, 1, 6) * 60000;
  }
}

/** Monta o histórico: dois dias completos (7h–17h) e hoje até agora (pelo menos as últimas 3 horas). */
(function gerarHistorico() {
  const agora = Date.now();
  const hoje = emSP(agora).data;
  const r = aleatorio(semente(`operacional|${hoje}`));
  for (const dias of [-2, -1]) {
    const d = somarDias(hoje, dias);
    for (const col of cadastros.colaboradores) {
      const [ini, fim] = col.turnoId === 9 ? [13, 19] : [7, 13];
      gerarJanela(col, instanteSP(d, ini), instanteSP(d, fim), false, r);
    }
  }
  const inicioHoje = Math.min(instanteSP(hoje, 7), agora - 3 * 3600000);
  for (const col of cadastros.colaboradores) gerarJanela(col, inicioHoje, agora, col.turnoId === 8 && col.id <= 6, r);
  // situações que a tela de Correções e as Caixas ao vivo mostram: uma pausa em curso e uma pausa automática antiga
  const abertas = caixas.filter((c) => c.status === 'aberta');
  if (abertas[1]) abertas[1].pausas.push({ inicio: iso(agora - 6 * 60000), fim: null, auto: false });
  const longa = { id: novoId(), codigo: proximoCodigo(), colaboradorId: 9, projetoId: 5, turnoId: 9, etapa: 'higienizacao', status: 'aberta', inicioEm: iso(agora - 9 * 3600000),
    pausas: [{ inicio: iso(agora - 8 * 3600000), fim: null, auto: true }] };
  caixas.push(longa);
}());

const ms = (/** @type {string} */ s) => Date.parse(s);
/** Segundos pausados (pausas já encerradas). @param {Caixa} c */
export const pausadoS = (c) => c.pausas.filter((p) => p.fim).reduce((t, p) => t + Math.floor((ms(/** @type {string} */ (p.fim)) - ms(p.inicio)) / 1000), 0);
/** @param {Caixa} c */
export const pausaAberta = (c) => c.pausas.find((p) => !p.fim);
/** @param {number} id */
export const nomeDe = (id) => cadastros.colaboradores.find((x) => x.id === id)?.nome || '';

/** Registro como o servidor devolve. @param {Caixa} c */
export const vista = (c) => ({
  id: c.id, codigo: c.codigo, colaboradorId: c.colaboradorId, colaboradorNome: nomeDe(c.colaboradorId), mesaId: null, etapa: c.etapa, status: c.status,
  inicioEm: c.inicioEm, fimEm: c.fimEm ?? null, duracaoS: c.duracaoS ?? null, projetoId: c.projetoId, turnoId: c.turnoId,
  imagens: c.imagens ?? null, grampo: !!c.grampo, deteriorado: !!c.deteriorado,
  fimSolicitadoEm: c.fimSolicitadoEm ?? null, pausadoS: pausadoS(c), pausaInicioEm: pausaAberta(c)?.inicio ?? null, pausaAutomatica: c.pausas.some((p) => p.auto),
});

/** Conclui a caixa: o relógio parou no bip (ou no "Concluir"), não na confirmação. @param {Caixa} c @param {{ imagens?: number, grampo?: boolean, deteriorado?: boolean }} extras */
export function concluir(c, extras) {
  const fim = c.fimSolicitadoEm || iso(Date.now());
  const pa = pausaAberta(c);
  if (pa) pa.fim = fim;
  c.status = 'concluida';
  c.fimEm = fim;
  c.duracaoS = Math.max(0, Math.floor((ms(fim) - ms(c.inicioEm)) / 1000) - pausadoS(c));
  if (extras.imagens) Object.assign(c, { imagens: extras.imagens, grampo: !!extras.grampo, deteriorado: !!extras.deteriorado });
  return { duracaoS: c.duracaoS, registro: vista(c) };
}
