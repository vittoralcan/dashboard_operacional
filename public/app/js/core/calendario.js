// @ts-check
/**
 * Lógica pura do calendário de intervalo (CMP-07): grade do mês, seleção início → fim, atalhos.
 * Datas como `Date` à meia-noite LOCAL; `iso()` devolve 'aaaa-mm-dd' (o formato dos relatórios).
 */

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** @param {Date} d */
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 'aaaa-mm-dd' → Date local (null se inválida). @param {string} s */
export function deIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
}

/** @param {Date} d */
export const inicioDoDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** @param {Date} a @param {Date} b */
export const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** @param {Date} d @param {number} n */
export const somarDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** dd/mm/aaaa @param {Date} d */
export const dataCurta = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/**
 * Semanas do mês (domingo primeiro). Dias fora do mês vêm como `null`.
 * @param {number} ano @param {number} mes 0..11
 * @returns {(Date|null)[][]}
 */
export function semanasDoMes(ano, mes) {
  const primeiro = new Date(ano, mes, 1);
  const total = new Date(ano, mes + 1, 0).getDate();
  /** @type {(Date|null)[]} */
  const dias = Array(primeiro.getDay()).fill(null);
  for (let d = 1; d <= total; d++) dias.push(new Date(ano, mes, d));
  while (dias.length % 7) dias.push(null);
  const semanas = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return semanas;
}

/** Mês anterior/seguinte. @param {{ ano: number, mes: number }} v @param {number} delta */
export function navegarMes(v, delta) {
  const d = new Date(v.ano, v.mes + delta, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() };
}

/**
 * Clique em um dia: 1º clique define o início; 2º define o fim (se anterior ao início, inverte);
 * 3º clique recomeça. Dias futuros (> `hoje`) são ignorados.
 * @param {{ ini: Date|null, fim: Date|null }} sel @param {Date} dia @param {Date} hoje
 */
export function clicarDia(sel, dia, hoje) {
  if (inicioDoDia(dia) > inicioDoDia(hoje)) return sel;
  if (!sel.ini || (sel.ini && sel.fim)) return { ini: dia, fim: null };
  return dia < sel.ini ? { ini: dia, fim: sel.ini } : { ini: sel.ini, fim: dia };
}

/** Situação do dia dentro da seleção: 'ini' | 'fim' | 'ini fim' | 'in' | ''. @param {Date} dia @param {{ ini: Date|null, fim: Date|null }} sel */
export function estadoDoDia(dia, sel) {
  if (!sel.ini) return '';
  const ehIni = mesmoDia(dia, sel.ini);
  const ehFim = !!sel.fim && mesmoDia(dia, sel.fim);
  if (ehIni && (ehFim || !sel.fim)) return 'ini fim';
  if (ehIni) return 'ini';
  if (ehFim) return 'fim';
  return sel.fim && dia > sel.ini && dia < sel.fim ? 'in' : '';
}

/** Dias corridos entre duas datas, inclusive. @param {Date} a @param {Date} b */
export const diasNoIntervalo = (a, b) => Math.round((inicioDoDia(b).getTime() - inicioDoDia(a).getTime()) / 86400000) + 1;

/**
 * Atalhos de intervalo.
 * @param {Date} hoje
 * @returns {{ id: string, rotulo: string, ini: Date, fim: Date }[]}
 */
export function atalhosDeIntervalo(hoje) {
  const h = inicioDoDia(hoje);
  return [
    { id: 'hoje', rotulo: 'Hoje', ini: h, fim: h },
    { id: '7d', rotulo: 'Últimos 7 dias', ini: somarDias(h, -6), fim: h },
    { id: '30d', rotulo: 'Últimos 30 dias', ini: somarDias(h, -29), fim: h },
    { id: 'mes', rotulo: 'Este mês', ini: new Date(h.getFullYear(), h.getMonth(), 1), fim: h },
  ];
}

/**
 * Período do relatório: "Hoje" ou intervalo escolhido (datas locais → 'aaaa-mm-dd').
 * Devolve `null` se o intervalo estiver incompleto.
 * @param {'hoje'|'periodo'} modo @param {Date|null} ini @param {Date|null} fim @param {Date} [hoje]
 */
export function periodoDoRelatorio(modo, ini, fim, hoje = new Date()) {
  if (modo === 'hoje') { const d = iso(inicioDoDia(hoje)); return { dataInicio: d, dataFim: d }; }
  if (!ini || !fim) return null;
  return { dataInicio: iso(ini), dataFim: iso(fim) };
}

/** 'aaaa-mm-dd' → 'dd/mm/aaaa'. @param {string} s */
export const dataBrDeIso = (s) => { const [a, m, d] = String(s).split('-'); return a && m && d ? `${d}/${m}/${a}` : String(s); };

/** "dd/mm/aaaa" ou "dd/mm/aaaa a dd/mm/aaaa". @param {{ dataInicio: string, dataFim: string }} p */
export const rotuloPeriodo = (p) => (p.dataInicio === p.dataFim ? dataBrDeIso(p.dataInicio) : `${dataBrDeIso(p.dataInicio)} a ${dataBrDeIso(p.dataFim)}`);
