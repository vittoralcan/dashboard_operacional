// @ts-check
import { aleatorio, semente, entre, emSP, instanteSP, somarDias, diasNoMes, diaDaSemana, iso, ok, falha, naoEncontrada } from './base.js';

/**
 * Fluxos de digitalização simulados (projeto fictício Atlas): estoque por fase, produção diária, gestão do mês, gargalos,
 * relatório por período, Macro View e o resumo do painel. Tudo sai de funções determinísticas da data, da instância e da fase:
 * o mesmo dia mostra os mesmos números, e a produção de hoje cresce ao longo do expediente (7h–18h).
 */

export const INSTANCIAS = ['negativos', 'certidoes', 'inventarios', 'cartografia'];

/** Perfil de cada acervo: escala de volume, imagens por pasta, prefixo das pastas, tipologias e a fase que vira gargalo. */
const PERFIL = /** @type {Record<string, { k: number, ipp: [number, number], prefixo: string, gargalo: number, tipos: { projeto: string, lote: string, rotulo: string }[] }>} */ ({
  negativos: { k: 1, ipp: [160, 260], prefixo: 'NEG', gargalo: 1, tipos: [
    { projeto: 'ROLOS 16MM', lote: 'REMESSA 01', rotulo: 'Rolos 16 mm · Remessa 01' },
    { projeto: 'ROLOS 35MM', lote: 'REMESSA 02', rotulo: 'Rolos 35 mm · Remessa 02' }] },
  certidoes: { k: 1.5, ipp: [30, 70], prefixo: 'CRT', gargalo: 7, tipos: [
    { projeto: 'CERTIDOES NASCIMENTO', lote: 'LIVRO A', rotulo: 'Certidões de nascimento · Livro A' },
    { projeto: 'CERTIDOES CASAMENTO', lote: 'LIVRO B', rotulo: 'Certidões de casamento · Livro B' },
    { projeto: 'CERTIDOES OBITO', lote: 'LIVRO C', rotulo: 'Certidões de óbito · Livro C' }] },
  inventarios: { k: 0.8, ipp: [90, 180], prefixo: 'INV', gargalo: 51, tipos: [
    { projeto: 'INVENTARIOS JUDICIAIS', lote: 'CAIXAS 2026', rotulo: 'Inventários judiciais · Caixas 2026' },
    { projeto: 'PARTILHAS', lote: 'CAIXAS 2025', rotulo: 'Partilhas · Caixas 2025' }] },
  cartografia: { k: 0.45, ipp: [8, 24], prefixo: 'CAR', gargalo: 16, tipos: [
    { projeto: 'MAPAS CADASTRAIS', lote: 'MAPOTECA 1', rotulo: 'Mapas cadastrais · Mapoteca 1' }] },
});

/** Fração do expediente (7h–18h) já cumprida agora, em São Paulo. */
function fracaoDoDia() {
  const a = emSP(Date.now());
  return Math.min(1, Math.max(0, (a.hora + a.minuto / 60 - 7) / 11));
}

/** Produção de UMA fase num dia (pastas que passaram por ela). @param {string} inst @param {number} fasId @param {string} data @param {number} [fator] */
export function producaoDoDia(inst, fasId, data, fator = 1) {
  const p = PERFIL[inst];
  const hoje = emSP(Date.now()).data;
  if (data > hoje) return { pastas: 0, imagens: 0 };
  const r = aleatorio(semente(`${inst}|${fasId}|${data}`));
  const dow = diaDaSemana(data);
  const base = dow === 0 ? 0 : dow === 6 ? entre(r, 0, 5) : entre(r, 18, 34);
  let pastas = Math.round(base * p.k * fator);
  if (data === hoje) pastas = Math.round(pastas * fracaoDoDia());
  const ipp = entre(r, p.ipp[0], p.ipp[1]);
  return { pastas, imagens: pastas * ipp + entre(r, 0, pastas * 4) };
}

/** Dias úteis (seg–sex) entre o dia 1 e `ate` do mês. @param {number} ano @param {number} mes @param {number} ate */
function diasUteis(ano, mes, ate) {
  let n = 0;
  for (let d = 1; d <= ate; d++) { const w = diaDaSemana(`${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`); if (w !== 0 && w !== 6) n++; }
  return n;
}

/**
 * @param {{ buscarConfig: (inst: string) => Promise<any>, metaDe: (inst: string) => number|null }} dep
 */
export function criarFluxos(dep) {
  /** @type {Map<string, Map<number, { pastas: number, imagens: number }>>} */
  const estoques = new Map();

  /** Linha determinística de uma pasta parada numa fase. @param {string} inst @param {any} fase @param {number} i */
  function linhaDaPasta(inst, fase, i) {
    const p = PERFIL[inst];
    const r = aleatorio(semente(`${inst}|${fase.fasId}|p${i}`));
    const t = p.tipos[Math.floor(r() * p.tipos.length)];
    return {
      Fase: fase.nome, Projeto: t.projeto, Lote: t.lote,
      Pasta: `${p.prefixo}-${String(fase.fasId).padStart(3, '0')}${String(i + 1).padStart(5, '0')}`,
      Documentos: entre(r, 3, 42), Imagens: entre(r, p.ipp[0], p.ipp[1]),
    };
  }

  /** Quantas pastas estão paradas em cada fase agora. @param {string} inst @param {any} fase */
  function pastasNaFase(inst, fase) {
    const p = PERFIL[inst];
    const r = aleatorio(semente(`${inst}|estoque|${fase.fasId}|${emSP(Date.now()).data}`));
    if (fase.fasId === p.gargalo) return Math.round(entre(r, 110, 160) * p.k);
    switch (fase.tipo) {
      case 'entrada': return Math.round(entre(r, 45, 95) * p.k);
      case 'processo': return Math.round(entre(r, 6, 38) * p.k);
      case 'erro': return entre(r, 0, 7);
      case 'reprocessamento': return entre(r, 2, 9);
      case 'espera': return Math.round(entre(r, 35, 85) * p.k);
      case 'terminal': return Math.round(entre(r, 4200, 7800) * p.k);
      default: return 0;
    }
  }

  /** @param {string} inst */
  async function estoque(inst) {
    const guardado = estoques.get(inst);
    if (guardado) return guardado;
    const cfg = await dep.buscarConfig(inst);
    const m = new Map();
    for (const f of cfg.fases) {
      const n = pastasNaFase(inst, f);
      let imagens = 0;
      for (let i = 0; i < n; i++) imagens += linhaDaPasta(inst, f, i).Imagens;
      m.set(f.fasId, { pastas: n, imagens });
    }
    estoques.set(inst, m);
    return m;
  }

  /** Série do mês corrente (até hoje) de uma fase. @param {string} inst @param {number} fasId @param {number} fator */
  function serieDoMes(inst, fasId, fator) {
    const a = emSP(Date.now());
    const pre = `${a.ano}-${String(a.mes).padStart(2, '0')}`;
    return Array.from({ length: a.dia }, (_, i) => {
      const dia = `${pre}-${String(i + 1).padStart(2, '0')}`;
      return { dia, ...producaoDoDia(inst, fasId, dia, fator) };
    });
  }

  /** Resumo do mês da fase final: finalizadas, meta, variação contra o mesmo dia do mês anterior e projeção. @param {string} inst @param {number} faseFinal */
  function resumoDoMes(inst, faseFinal) {
    const a = emSP(Date.now());
    const serie = serieDoMes(inst, faseFinal, 1);
    const pastas = serie.reduce((s, d) => s + d.pastas, 0);
    const imagens = serie.reduce((s, d) => s + d.imagens, 0);
    const anoAnt = a.mes === 1 ? a.ano - 1 : a.ano;
    const mesAnt = a.mes === 1 ? 12 : a.mes - 1;
    const ateDia = Math.min(a.dia, diasNoMes(anoAnt, mesAnt));
    let antP = 0; let antI = 0;
    for (let d = 1; d <= ateDia; d++) {
      const v = producaoDoDia(inst, faseFinal, `${anoAnt}-${String(mesAnt).padStart(2, '0')}-${String(d).padStart(2, '0')}`, 0.94);
      antP += v.pastas; antI += v.imagens;
    }
    const uteisFeitos = Math.max(1, diasUteis(a.ano, a.mes, a.dia) - (1 - fracaoDoDia()));
    return {
      serie,
      resumo: {
        finalizadasMes: { pastas, imagens },
        metaPastas: dep.metaDe(inst),
        variacaoPct: antP > 0 ? Number((((pastas - antP) / antP) * 100).toFixed(1)) : null,
        projecaoMes: Math.round((pastas / uteisFeitos) * diasUteis(a.ano, a.mes, diasNoMes(a.ano, a.mes))),
        mesAnterior: { pastas: antP, imagens: antI, ateDia },
      },
    };
  }

  /** Projeção do mês da fase final (usada para as metas iniciais). @param {string} inst */
  const projecao = (inst) => resumoDoMes(inst, 12).resumo.projecaoMes;

  /** @param {string} inst */
  async function gestao(inst) {
    const cfg = await dep.buscarConfig(inst);
    const p = PERFIL[inst];
    /** @type {Record<string, any>} */
    const data = {};
    cfg.gestaoColunas.forEach((/** @type {any} */ c, /** @type {number} */ idx) => {
      const fator = 1 + 0.08 * (cfg.gestaoColunas.length - 1 - idx);
      const serie = c.fasId === cfg.faseFinal ? resumoDoMes(inst, c.fasId).serie : serieDoMes(inst, c.fasId, fator);
      const TotalPastas = serie.reduce((s, d) => s + d.pastas, 0);
      const TotalImagens = serie.reduce((s, d) => s + d.imagens, 0);
      const r = aleatorio(semente(`${inst}|tipos|${c.fasId}`));
      const pesos = p.tipos.map(() => 1 + r() * 3);
      const soma = pesos.reduce((s, x) => s + x, 0);
      let restoP = TotalPastas; let restoI = TotalImagens;
      const porTipo = p.tipos.map((t, i) => {
        const ultimo = i === p.tipos.length - 1;
        const pastas = ultimo ? restoP : Math.round((TotalPastas * pesos[i]) / soma);
        const imagens = ultimo ? restoI : Math.round((TotalImagens * pesos[i]) / soma);
        restoP -= pastas; restoI -= imagens;
        return { tipo: t.rotulo, projeto: t.projeto, lote: t.lote, pastas, imagens };
      }).sort((x, y) => y.pastas - x.pastas);
      data[`fase${c.fasId}`] = { totaisMes: { TotalPastas, TotalImagens }, graficoMes: serie, grafico7Dias: serie.slice(-7).map((d) => d.pastas), porTipo };
    });
    data.resumo = resumoDoMes(inst, cfg.faseFinal).resumo;
    return data;
  }

  /** Gargalo de vazão (a fase de processo mais cheia) e a base "paradas" (RN-008: tudo menos final e espera). @param {string} inst */
  async function gargaloDe(inst) {
    const cfg = await dep.buscarConfig(inst);
    const st = await estoque(inst);
    let pastas = 0; let imagens = 0;
    for (const f of cfg.fases) if (f.tipo !== 'terminal' && f.tipo !== 'espera') { const v = st.get(f.fasId); pastas += v.pastas; imagens += v.imagens; }
    const proc = cfg.fases.filter((/** @type {any} */ f) => f.tipo === 'processo').map((/** @type {any} */ f) => ({ fasId: f.fasId, nome: f.nome, ...st.get(f.fasId) }))
      .sort((/** @type {any} */ a, /** @type {any} */ b) => b.pastas - a.pastas);
    const g = proc[0];
    const pct = (/** @type {number} */ n) => (pastas > 0 ? Number(((n / pastas) * 100).toFixed(1)) : null);
    const entrada = cfg.fases.find((/** @type {any} */ f) => f.tipo === 'entrada');
    const ve = entrada ? st.get(entrada.fasId) : null;
    const altoVolume = entrada && ve && g && ve.pastas > g.pastas ? { fasId: entrada.fasId, nome: entrada.nome, ...ve, pctParadas: pct(ve.pastas) } : null;
    return {
      regra: { minPastas: 50, pctMinimo: 25 }, paradas: { pastas, imagens },
      gargalo: g && g.pastas >= 50 ? { ...g, pctParadas: pct(g.pastas) } : null, altoVolume,
    };
  }

  /** Pastas finalizadas na fase num período (≤ 92 dias), uma linha por pasta, com o instante da finalização. @param {string} inst @param {URLSearchParams} q */
  async function relatorio(inst, q) {
    const cfg = await dep.buscarConfig(inst);
    const fasId = Number(q.get('faseId'));
    const fase = cfg.fases.find((/** @type {any} */ f) => f.fasId === fasId);
    if (!fase) return falha(400, 'Parâmetro "faseId" inválido.');
    const ini = String(q.get('dataInicio') || '').slice(0, 10);
    const fim = String(q.get('dataFim') || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || ini > fim) return falha(400, 'Período inválido.');
    if ((Date.parse(fim) - Date.parse(ini)) / 86400000 > 92) return falha(400, 'O período máximo é de 92 dias.');
    const col = cfg.gestaoColunas.findIndex((/** @type {any} */ c) => c.fasId === fasId);
    const fator = col < 0 ? 1 : 1 + 0.08 * (cfg.gestaoColunas.length - 1 - col);
    const p = PERFIL[inst];
    const lista = [];
    const totais = { pastas: 0, imagens: 0 };
    for (let d = ini; d <= fim; d = somarDias(d, 1)) {
      const v = producaoDoDia(inst, fasId, d, fator);
      totais.pastas += v.pastas; totais.imagens += v.imagens;
      const r = aleatorio(semente(`${inst}|rel|${fasId}|${d}`));
      for (let i = 0; i < v.pastas && lista.length < 3000; i++) {
        const t = p.tipos[Math.floor(r() * p.tipos.length)];
        const ts = instanteSP(d, entre(r, 7, 17), entre(r, 0, 59));
        lista.push({ Fase: fase.nome, Projeto: t.projeto, Lote: t.lote, Pasta: `${p.prefixo}-${d.replace(/-/g, '').slice(2)}${String(i + 1).padStart(3, '0')}`,
          Documentos: entre(r, 3, 42), Imagens: Math.round(v.imagens / Math.max(1, v.pastas)), DataFinalizado: iso(Math.min(ts, Date.now())) });
      }
    }
    lista.sort((a, b) => b.DataFinalizado.localeCompare(a.DataFinalizado));
    return ok({ totais, lista });
  }

  const sincronizacao = () => ({ ultimaSincronizacao: iso(Math.floor(Date.now() / 600000) * 600000 - 60000), atrasado: false });

  /** Resumo de uma instância como `GET /painel/resumo` devolve. @param {string} inst */
  async function resumoPainel(inst) {
    const cfg = await dep.buscarConfig(inst);
    const st = await estoque(inst);
    const entrada = cfg.fases.find((/** @type {any} */ f) => f.tipo === 'entrada');
    const { serie, resumo } = resumoDoMes(inst, cfg.faseFinal);
    return {
      projeto: 'atlas', emAndamento: entrada ? st.get(entrada.fasId).pastas : null, finalizadosTotal: st.get(cfg.faseFinal).pastas,
      ...resumo, serieMes: serie, serie7Dias: serie.slice(-7).map((d) => d.imagens), sincronizacao: sincronizacao(),
    };
  }

  /** Gargalos de todas as instâncias (`GET /gargalos`), do mais cheio para o mais vazio. */
  async function gargalosGerais() {
    const out = [];
    for (const inst of INSTANCIAS) {
      const g = await gargaloDe(inst);
      if (g.gargalo) out.push({ projeto: 'atlas', instancia: inst, fasId: g.gargalo.fasId, nome: g.gargalo.nome, pastas: g.gargalo.pastas, pctParadas: g.gargalo.pctParadas });
    }
    return out.sort((a, b) => b.pastas - a.pastas);
  }

  /**
   * `/atlas/...` do back_dashboard.
   * @param {{ metodo: string, caminho: string, query: URLSearchParams }} req
   * @returns {Promise<import('./base.js').Resposta>}
   */
  async function rota({ metodo, caminho, query }) {
    if (metodo !== 'GET') return naoEncontrada();
    if (caminho === '/atlas/macro-view/summary') {
      const hoje = emSP(Date.now()).data;
      /** @type {Record<string, any>} */
      const d = {};
      for (const inst of INSTANCIAS) {
        const cfg = await dep.buscarConfig(inst);
        const entrada = cfg.fases.find((/** @type {any} */ f) => f.tipo === 'entrada');
        d[inst] = { imagensHoje: producaoDoDia(inst, entrada.fasId, hoje, 1.2).imagens };
      }
      return ok(d);
    }
    const m = /^\/atlas\/([a-z0-9-]+)\/(.+)$/.exec(caminho);
    if (!m || !INSTANCIAS.includes(m[1])) return naoEncontrada();
    const [, inst, resto] = m;
    if (resto === 'config') return ok(await dep.buscarConfig(inst));
    if (resto === 'status-fases') {
      const st = await estoque(inst);
      return ok(Object.fromEntries([...st].map(([k, v]) => [String(k), v])));
    }
    if (resto === 'gestao') return ok(await gestao(inst));
    if (resto === 'sincronizacao') return ok(sincronizacao());
    if (resto === 'gargalos') return ok(await gargaloDe(inst));
    if (resto === 'relatorio') return relatorio(inst, query);
    const mf = /^fase\/(\d+)\/(pastas|pastas-por-lote)$/.exec(resto);
    if (mf) {
      const cfg = await dep.buscarConfig(inst);
      const fase = cfg.fases.find((/** @type {any} */ f) => f.fasId === Number(mf[1]));
      if (!fase) return falha(404, 'Fase não encontrada.');
      const n = (await estoque(inst)).get(fase.fasId).pastas;
      if (mf[2] === 'pastas-por-lote') {
        /** @type {Map<string, { Lote: string, Pastas: number, Imagens: number }>} */
        const lotes = new Map();
        for (let i = 0; i < n; i++) {
          const l = linhaDaPasta(inst, fase, i);
          const g = lotes.get(l.Lote) || { Lote: l.Lote, Pastas: 0, Imagens: 0 };
          g.Pastas += 1; g.Imagens += l.Imagens; lotes.set(l.Lote, g);
        }
        return ok([...lotes.values()].sort((a, b) => b.Pastas - a.Pastas));
      }
      const limite = Math.min(5000, Math.max(1, Number(query.get('limite')) || 500));
      const offset = Math.max(0, Number(query.get('offset')) || 0);
      const linhas = [];
      for (let i = offset; i < Math.min(n, offset + limite); i++) linhas.push(linhaDaPasta(inst, fase, i));
      return ok(linhas, 200, { 'X-Total-Count': String(n) });
    }
    return naoEncontrada();
  }

  return { rota, resumoPainel, gargalosGerais, gargaloDe, projecao };
}
