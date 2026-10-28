// @ts-check

/** Funções puras da lista de caixas ao vivo (gestão): normalização, rótulos, tempo, ordem e URL. Sem DOM nem fetch. */

/**
 * @typedef {{ id: number, codigo: string, colaboradorId: number, colaboradorNome: string, etapa: string, status: string, projetoId: number, inicioMs: number, fimMs: number|null, duracaoS: number|null, imagens: number|null, grampo: boolean, deteriorado: boolean, pausadoS: number, pausaInicioMs: number|null, pausaAutomatica: boolean, fimSolicitadoMs: number|null }} CaixaOp
 */

const ROTULOS = { higienizacao: 'Higienização', remontagem: 'Remontagem', digitalizacao: 'Digitalização' };

/** @param {unknown} v */
const inteiro = (v) => (Number.isInteger(v) ? /** @type {number} */ (v) : 0);

/** Itens inválidos (sem id inteiro ou sem início válido) são descartados. @param {unknown} bruto @returns {CaixaOp[]} */
export function normalizarCaixas(bruto) {
  if (!Array.isArray(bruto)) return [];
  /** @type {CaixaOp[]} */
  const saida = [];
  for (const item of bruto) {
    if (!item || typeof item !== 'object') continue;
    const b = /** @type {Record<string, any>} */ (item);
    if (!Number.isInteger(b.id)) continue;
    const inicioMs = typeof b.inicioEm === 'string' ? Date.parse(b.inicioEm) : NaN;
    if (Number.isNaN(inicioMs)) continue;
    const fim = typeof b.fimEm === 'string' ? Date.parse(b.fimEm) : NaN;
    const pausaInicio = typeof b.pausaInicioEm === 'string' ? Date.parse(b.pausaInicioEm) : NaN;
    const fimSolicitado = typeof b.fimSolicitadoEm === 'string' ? Date.parse(b.fimSolicitadoEm) : NaN;
    saida.push({
      id: b.id,
      codigo: typeof b.codigo === 'string' ? b.codigo : String(b.codigo ?? ''),
      colaboradorId: inteiro(b.colaboradorId),
      colaboradorNome: typeof b.colaboradorNome === 'string' ? b.colaboradorNome : '',
      etapa: typeof b.etapa === 'string' ? b.etapa : '',
      status: typeof b.status === 'string' ? b.status : '',
      projetoId: inteiro(b.projetoId),
      inicioMs,
      fimMs: Number.isNaN(fim) ? null : fim,
      duracaoS: typeof b.duracaoS === 'number' && Number.isFinite(b.duracaoS) ? b.duracaoS : null,
      imagens: Number.isInteger(b.imagens) ? b.imagens : null,
      grampo: b.grampo === true,
      deteriorado: b.deteriorado === true,
      pausadoS: Number.isFinite(b.pausadoS) ? Math.max(0, b.pausadoS) : 0,
      pausaInicioMs: Number.isNaN(pausaInicio) ? null : pausaInicio,
      pausaAutomatica: b.pausaAutomatica === true,
      fimSolicitadoMs: Number.isNaN(fimSolicitado) ? null : fimSolicitado,
    });
  }
  return saida;
}

/** @param {string} etapa */
export function rotuloEtapa(etapa) {
  return Object.prototype.hasOwnProperty.call(ROTULOS, etapa) ? ROTULOS[/** @type {'higienizacao'|'remontagem'} */ (etapa)] : etapa;
}

/** Instante em que o relógio da caixa aberta parou (pausa ou conclusão pedida), ou null se está correndo. @param {CaixaOp} c */
export function instanteCongelado(c) {
  const parados = [c.pausaInicioMs, c.fimSolicitadoMs].filter((x) => x !== null);
  return parados.length ? Math.min(...parados) : null;
}

/** Segundos: do início até agora nas abertas (sem o tempo pausado); duração gravada nas concluídas. @param {CaixaOp} caixa @param {number} agoraMs */
export function tempoDecorrido(caixa, agoraMs) {
  if (caixa.status === 'aberta') {
    const ate = instanteCongelado(caixa) ?? agoraMs;
    return Math.max(0, Math.floor((ate - caixa.inicioMs) / 1000) - caixa.pausadoS);
  }
  if (caixa.duracaoS !== null) return Math.max(0, caixa.duracaoS);
  return caixa.fimMs !== null ? Math.max(0, Math.floor((caixa.fimMs - caixa.inicioMs) / 1000)) : 0;
}

/** Abertas primeiro (mais antigas no topo); depois as demais, da mais recente para a mais antiga. Não altera a entrada. @param {CaixaOp[]} lista */
export function ordenarAoVivo(lista) {
  const abertas = lista.filter((c) => c.status === 'aberta').sort((a, b) => a.inicioMs - b.inicioMs);
  const demais = lista.filter((c) => c.status !== 'aberta').sort((a, b) => (b.fimMs ?? b.inicioMs) - (a.fimMs ?? a.inicioMs));
  return [...abertas, ...demais];
}

/** @param {{ status?: string, limite?: number, projetoId?: number }} f */
export function urlCaixas(f) {
  const p = new URLSearchParams();
  if (f.status) p.set('status', f.status);
  if (f.limite !== undefined) p.set('limite', String(f.limite));
  if (f.projetoId !== undefined) p.set('projetoId', String(f.projetoId));
  const q = p.toString();
  return `/operacional/correcoes/caixas${q ? `?${q}` : ''}`;
}

export const FILTROS_ETAPA = [
  { id: '', rotulo: 'Todas' },
  { id: 'higienizacao', rotulo: 'Higienização' },
  { id: 'remontagem', rotulo: 'Remontagem' },
  { id: 'digitalizacao', rotulo: 'Digitalização' },
];

/** @param {string} t */
const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Filtra por etapa, situação e busca (código ou colaborador, sem acento nem caixa).
 * @param {CaixaOp[]} lista
 * @param {{ busca?: string, etapa?: string, status?: string }} [f]
 */
export function filtrarCaixas(lista, f = {}) {
  const busca = semAcento((f.busca || '').trim());
  return lista.filter((c) => (!f.etapa || c.etapa === f.etapa)
    && (!f.status || c.status === f.status)
    && (!busca || semAcento(c.codigo).includes(busca) || semAcento(c.colaboradorNome).includes(busca)));
}

/**
 * Contagens do topo da tela ao vivo.
 * @param {CaixaOp[]} lista
 */
export function resumoAoVivo(lista) {
  const abertas = lista.filter((c) => c.status === 'aberta');
  return {
    abertas: abertas.length,
    pausadas: abertas.filter((c) => c.pausaInicioMs !== null).length,
    pendentes: abertas.filter((c) => c.pausaAutomatica).length,
    concluidas: lista.filter((c) => c.status === 'concluida').length,
  };
}

/**
 * Selos de uma caixa: sempre ícone + texto. `tipo` vira a classe do selo (ok, warn, err, accent ou neutro).
 * @param {CaixaOp} c
 * @returns {{ tipo: 'ok'|'warn'|'err'|'accent'|'', icone: string, texto: string }[]}
 */
export function chipsDaCaixa(c) {
  /** @type {{ tipo: 'ok'|'warn'|'err'|'accent'|'', icone: string, texto: string }[]} */
  const chips = [];
  if (c.status === 'aberta') {
    if (c.fimSolicitadoMs !== null) chips.push({ tipo: 'warn', icone: 'hourglass-medium', texto: 'Aguardando imagens' });
    else if (c.pausaInicioMs !== null) chips.push({ tipo: 'warn', icone: 'pause', texto: 'Pausada' });
    else chips.push({ tipo: 'ok', icone: 'play', texto: 'Em andamento' });
    if (c.pausaAutomatica) chips.push({ tipo: 'err', icone: 'warning', texto: 'Pausa automática: corrigir' });
  } else if (c.status === 'concluida') {
    chips.push({ tipo: '', icone: 'check-circle', texto: 'Concluída' });
    if (c.pausaAutomatica) chips.push({ tipo: 'warn', icone: 'warning', texto: 'Pausa automática' });
  } else {
    chips.push({ tipo: 'err', icone: 'x-circle', texto: 'Cancelada' });
  }
  if (c.imagens !== null) chips.push({ tipo: 'accent', icone: 'images', texto: `${c.imagens.toLocaleString('pt-BR')} imagens` });
  if (c.grampo) chips.push({ tipo: 'warn', icone: 'paperclip', texto: 'Muito grampo' });
  if (c.deteriorado) chips.push({ tipo: 'warn', icone: 'file-dashed', texto: 'Papel deteriorado' });
  return chips;
}

/** Hora local HH:MM. @param {number} ms */
export function horaCurta(ms) {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
