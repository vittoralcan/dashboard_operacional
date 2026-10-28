// @ts-check
import { ordenarNomes } from './operacional.js';

/** Funções puras do relatório hora a hora (gestão): normalização das respostas, duração curta, data de hoje em São Paulo e URLs. Sem DOM nem fetch. */

/**
 * @typedef {{ colaboradorId: number, nome: string, total: number, horas: number[] }} LinhaPessoa
 * @typedef {{ etapa: string, data: string, total: number, horas: number[], pico: { hora: number, caixas: number }|null, faixa: { de: number, ate: number }|null, colaboradores: LinhaPessoa[] }} HoraAHora
 * @typedef {{ id: number, nome: string }} TurnoRel
 * @typedef {{ id: number, slug: string, nome: string, turnos: TurnoRel[] }} ProjetoRel
 * @typedef {{ colaboradorId: number, nome: string, caixas: number, totalS: number, mediaS: number }} TempoPessoa
 * @typedef {{ etapa: string, caixas: number, mediaGeralS: number, colaboradores: TempoPessoa[] }} TempoMedio
 */

/** Número finito e não negativo, ou 0. @param {unknown} v */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** @param {unknown} v */
const objeto = (v) => (v && typeof v === 'object' ? /** @type {Record<string, any>} */ (v) : {});

/** @param {unknown} v */
const lista = (v) => (Array.isArray(v) ? v : []);

/** Etapa devolvida pelo servidor; sem ela, higienização (padrão). @param {Record<string, any>} b */
const etapaDe = (b) => (typeof b.etapa === 'string' && b.etapa ? b.etapa : 'higienizacao');

/** Sempre 24 posições (hora 0 a 23). @param {unknown} v */
function vinteEQuatro(v) {
  const l = lista(v);
  return Array.from({ length: 24 }, (_, h) => num(l[h]));
}

/** @param {unknown} bruto @returns {HoraAHora} */
export function normalizarHoraAHora(bruto) {
  const b = objeto(bruto);
  const horas = Array.from({ length: 24 }, () => 0);
  for (const h of lista(b.horas)) {
    const o = objeto(h);
    if (Number.isInteger(o.hora) && o.hora >= 0 && o.hora < 24) horas[o.hora] = num(o.caixas);
  }
  /** @type {LinhaPessoa[]} */
  const pessoas = [];
  for (const c of lista(b.colaboradores)) {
    const o = objeto(c);
    if (!Number.isInteger(o.colaboradorId) || typeof o.nome !== 'string') continue;
    pessoas.push({ colaboradorId: o.colaboradorId, nome: o.nome, total: num(o.total), horas: vinteEQuatro(o.horas) });
  }
  const soma = horas.reduce((acc, caixas) => acc + caixas, 0);
  const totalBruto = num(b.total);
  const total = totalBruto > 0 ? totalBruto : soma;
  let pico = null;
  let de = -1;
  let ate = -1;
  horas.forEach((caixas, hora) => {
    if (caixas <= 0) return;
    if (!pico || caixas > pico.caixas) pico = { hora, caixas };
    if (de < 0) de = hora;
    ate = hora;
  });
  return {
    etapa: etapaDe(b),
    data: typeof b.data === 'string' ? b.data : '',
    total,
    horas,
    pico,
    faixa: de < 0 ? null : { de, ate },
    colaboradores: ordenarNomes(pessoas),
  };
}

/** @param {unknown} bruto @returns {ProjetoRel[]} */
export function normalizarProjetos(bruto) {
  /** @type {ProjetoRel[]} */
  const projetos = [];
  for (const p of lista(objeto(bruto).projetos)) {
    const o = objeto(p);
    if (!Number.isInteger(o.id) || typeof o.nome !== 'string') continue;
    /** @type {TurnoRel[]} */
    const turnos = [];
    for (const t of lista(o.turnos)) {
      const x = objeto(t);
      if (Number.isInteger(x.id) && typeof x.nome === 'string') turnos.push({ id: x.id, nome: x.nome });
    }
    projetos.push({ id: o.id, slug: typeof o.slug === 'string' ? o.slug : '', nome: o.nome, turnos: ordenarNomes(turnos) });
  }
  return ordenarNomes(projetos);
}

/** @param {unknown} bruto @returns {TempoMedio} */
export function normalizarTempoMedio(bruto) {
  const b = objeto(bruto);
  /** @type {TempoPessoa[]} */
  const pessoas = [];
  for (const c of lista(b.colaboradores)) {
    const o = objeto(c);
    if (!Number.isInteger(o.colaboradorId) || typeof o.nome !== 'string') continue;
    pessoas.push({ colaboradorId: o.colaboradorId, nome: o.nome, caixas: num(o.caixas), totalS: num(o.totalS), mediaS: num(o.mediaS) });
  }
  const resumo = { caixas: num(b.caixas), mediaGeralS: num(b.mediaGeralS), colaboradores: ordenarNomes(pessoas) };
  // Sem corpo nenhum não há etapa a manter; com corpo, vale a do servidor (padrão higienização).
  return bruto && typeof bruto === 'object' ? { etapa: etapaDe(b), ...resumo } : /** @type {TempoMedio} */ (resumo);
}

/** "0 s", "45 s", "10 min", "10 min 50 s", "1 h 05 min". @param {number} segundos */
export function duracaoCurta(segundos) {
  const s = Number.isFinite(segundos) && segundos > 0 ? Math.round(segundos) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return r > 0 ? `${m} min ${r} s` : `${m} min`;
  return `${r} s`;
}

/** Data de hoje (AAAA-MM-DD) em São Paulo. @param {number} agoraMs */
export function dataHojeSP(agoraMs) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(agoraMs));
  const de = (/** @type {string} */ t) => partes.find((p) => p.type === t)?.value ?? '';
  return `${de('year')}-${de('month')}-${de('day')}`;
}

/** Caminho relativo (sem a base). @param {{ projetoId: number, data: string, turnoId?: number|null, etapa?: string }} p */
export function urlHoraAHora(p) {
  const turno = p.turnoId ? `&turnoId=${encodeURIComponent(String(p.turnoId))}` : '';
  const etapa = p.etapa ? `&etapa=${encodeURIComponent(p.etapa)}` : '';
  return `/operacional/relatorios/hora-a-hora?projetoId=${encodeURIComponent(String(p.projetoId))}&data=${encodeURIComponent(p.data)}${turno}${etapa}`;
}

/** Caminho relativo (sem a base). @param {{ projetoId: number, de: string, ate: string, etapa?: string }} p */
export function urlTempoMedio(p) {
  const etapa = p.etapa ? `&etapa=${encodeURIComponent(p.etapa)}` : '';
  return `/operacional/relatorios/tempo-medio?projetoId=${encodeURIComponent(String(p.projetoId))}&de=${encodeURIComponent(p.de)}&ate=${encodeURIComponent(p.ate)}${etapa}`;
}
