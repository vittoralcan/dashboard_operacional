// @ts-check
import { aleatorio, semente, entre, emSP, iso, minutosAtras, ok, falha, naoEncontrada } from './base.js';
import { INSTANCIAS } from './fluxos.js';

/**
 * Serviços de painel simulados: metas mensais, atividade recente, notificações, acompanhamento do envio (Bridge) e o monitor de
 * APIs (nativo e a reserva do Apps Script). Sistemas e endereços são fictícios (domínio reservado `.example`).
 */

const NOME_FLUXO = /** @type {Record<string, string>} */ ({ negativos: 'Negativos', certidoes: 'Certidões', inventarios: 'Inventários', cartografia: 'Cartografia' });
const PROTOCOLO = 'https:';
const endereco = (/** @type {string} */ host, /** @type {string} */ caminho) => `${PROTOCOLO}//${host}${caminho}`;

/** APIs monitoradas (fictícias) e a situação típica de cada uma. */
const APIS = [
  { id: 1, nome: 'Inscrição Online · Autenticação', sistema: 'Inscrição Online', host: 'inscricao.boreal.example', caminho: '/api/auth/health', perfil: 'online', ms: 180 },
  { id: 2, nome: 'Inscrição Online · Consulta de vagas', sistema: 'Inscrição Online', host: 'inscricao.boreal.example', caminho: '/api/vagas/health', perfil: 'online', ms: 240 },
  { id: 3, nome: 'Inscrição Online · Emissão de boletos', sistema: 'Inscrição Online', host: 'boletos.boreal.example', caminho: '/health', perfil: 'falha', ms: 0 },
  { id: 4, nome: 'PortalDoc · Envio de documentos', sistema: 'PortalDoc', host: 'portaldoc.boreal.example', caminho: '/api/upload/status', perfil: 'lenta', ms: 2300 },
  { id: 5, nome: 'PortalDoc · Busca', sistema: 'PortalDoc', host: 'portaldoc.boreal.example', caminho: '/api/busca/status', perfil: 'online', ms: 320 },
  { id: 6, nome: 'Lumen · Indexação', sistema: 'Lumen', host: 'lumen.boreal.example', caminho: '/v1/health', perfil: 'online', ms: 410 },
  { id: 7, nome: 'Lumen · Classificação', sistema: 'Lumen', host: 'lumen.boreal.example', caminho: '/v1/classificar/health', perfil: 'online', ms: 520 },
];
const INTERVALOS = [5, 10, 15, 30, 60];

/**
 * @param {{ fluxos: ReturnType<typeof import('./fluxos.js').criarFluxos> }} dep
 */
export function criarServicos(dep) {
  const agora = emSP(Date.now());
  /** @type {{ projeto: string, escopo: string, ano: number, mes: number, valor: number, unidade: string }[]} */
  const metas = ['negativos', 'certidoes', 'inventarios'].map((escopo) => ({
    projeto: 'atlas', escopo, ano: agora.ano, mes: agora.mes, valor: Math.max(10, Math.round((dep.fluxos.projecao(escopo) * 1.08) / 10) * 10), unidade: 'pastas',
  }));
  const metaDe = (/** @type {string} */ inst) => {
    const a = emSP(Date.now());
    return metas.find((m) => m.escopo === inst && m.ano === a.ano && m.mes === a.mes)?.valor ?? null;
  };

  let seqAtividade = 20;
  const atividades = [
    { id: 19, em: minutosAtras(12), quem: 'Marina Costa', sistema: false, acao: 'meta.definida', alvo: `Meta de ${String(agora.mes).padStart(2, '0')}/${agora.ano}`, onde: 'atlas · certidoes' },
    { id: 18, em: minutosAtras(38), quem: 'Sistema', sistema: true, acao: 'atualizou', alvo: 'Espelho do Captura', onde: 'atlas' },
    { id: 17, em: minutosAtras(64), quem: 'Tiago Ramos', sistema: false, acao: 'relatorio.gerado', alvo: 'Controle de Qualidade · hoje', onde: 'atlas · negativos' },
    { id: 16, em: minutosAtras(95), quem: 'Marina Costa', sistema: false, acao: 'monitor.intervalo', alvo: 'A cada 15 min', onde: 'boreal · monitoramento' },
    { id: 15, em: minutosAtras(180), quem: 'Sistema', sistema: true, acao: 'sinalizou o gargalo', alvo: 'Validação', onde: 'atlas · negativos' },
    { id: 14, em: minutosAtras(260), quem: 'Tiago Ramos', sistema: false, acao: 'relatorio.gerado', alvo: 'Finalizado · últimos 7 dias', onde: 'atlas · inventarios' },
    { id: 13, em: minutosAtras(410), quem: 'Marina Costa', sistema: false, acao: 'meta.definida', alvo: `Meta de ${String(agora.mes).padStart(2, '0')}/${agora.ano}`, onde: 'atlas · negativos' },
  ];

  /** @type {any[]|null} */
  let notificacoes = null;
  async function listaDeNotificacoes() {
    if (notificacoes) return notificacoes;
    const [g] = await dep.fluxos.gargalosGerais();
    notificacoes = [
      ...(g ? [{ id: 6, tipo: 'alerta', titulo: `Gargalo em ${g.nome}`, texto: `${g.pastas} pastas paradas em ${NOME_FLUXO[g.instancia]} (${String(g.pctParadas).replace(".", ",")}% do fluxo).`, criadoEm: minutosAtras(9), lida: false,
        destino: { rota: `/atlas/${g.instancia}/fluxograma`, foco: { instancia: g.instancia, fasId: g.fasId } } }] : []),
      { id: 5, tipo: 'erro', titulo: 'API fora do ar', texto: 'Inscrição Online · Emissão de boletos não responde (HTTP 503).', criadoEm: minutosAtras(27), lida: false, destino: { rota: '/boreal/monitoramento' } },
      { id: 4, tipo: 'alerta', titulo: 'Divergência no envio', texto: '1 pasta com divergência na conferência do Bridge.', criadoEm: minutosAtras(52), lida: false, destino: { rota: '/envio' } },
      { id: 3, tipo: 'sucesso', titulo: 'Meta de Certidões em 80%', texto: 'O fluxo passou de 80% da meta mensal.', criadoEm: minutosAtras(140), lida: true, destino: { rota: '/atlas/certidoes' } },
      { id: 2, tipo: 'info', titulo: 'Sincronização concluída', texto: 'O espelho do Captura foi atualizado.', criadoEm: minutosAtras(200), lida: true, destino: null },
    ];
    return notificacoes;
  }

  // ---------------------------------------------------------------- envio (Bridge)
  /** @param {string} instancia @param {number} horas */
  function resumoEnvio(instancia, horas) {
    const t = Date.now();
    const vazio = { geradoEm: iso(t), cartoes: { enviadasHoje: 0, pendentes: 0, divergenciasAbertas: 0, taxaConferenciaPct: 100 }, funil: { naFila: 0, enviando: 0, conferindo: 0, concluida: 0, divergente: 0, erro: 0 }, vazao: [], recentes: [], heartbeat: { ultimoTs: null, versao: null, atrasado: null } };
    if (instancia.includes('novo')) return vazio;
    const r = aleatorio(semente(`${instancia}|${emSP(t).data}`));
    const a = emSP(t);
    const fracao = Math.min(1, Math.max(0.05, (a.hora + a.minuto / 60 - 7) / 11));
    const enviadasHoje = Math.max(3, Math.round(entre(r, 180, 260) * fracao));
    const divergencias = entre(r, 1, 2);
    const escala = horas <= 6 ? 0.35 : horas <= 24 ? 1 : horas <= 72 ? 2.6 : 5.4;
    const passo = (horas * 3600000) / 24;
    const vazao = Array.from({ length: 24 }, (_, i) => {
      const ts = t - (23 - i) * passo;
      const h = emSP(ts).hora;
      const trabalho = h >= 7 && h < 19;
      const arquivosMin = trabalho ? entre(r, 22, 64) : entre(r, 0, 3);
      return { t: iso(ts), arquivosMin, mbSeg: Number((arquivosMin * (0.03 + r() * 0.02)).toFixed(2)) };
    });
    const recentes = Array.from({ length: 20 }, (_, i) => {
      const inst = INSTANCIAS[entre(r, 0, INSTANCIAS.length - 1)];
      const pasta = `${inst.slice(0, 3).toUpperCase()}-${a.data.replace(/-/g, '').slice(2)}${String(400 - i * 7).padStart(4, '0')}`;
      const evento = { pasta, fluxo: inst, status: 'concluida', resultado: 'ok', eventoTs: iso(t - (i * 6 + entre(r, 1, 5)) * 60000) };
      if (i === 3) return { ...evento, status: 'divergente', resultado: 'divergente' };
      if (i === 8) return { ...evento, status: 'erro', resultado: 'erro', mensagem: `[ALERTA] A pasta ${pasta} chegou sem o arquivo de índice; reenviar pelo Bridge.` };
      return evento;
    });
    const atrasado = instancia.includes('atrasado');
    return {
      geradoEm: iso(t),
      cartoes: { enviadasHoje, pendentes: entre(r, 2, 9), divergenciasAbertas: divergencias, taxaConferenciaPct: Number((100 - (divergencias / enviadasHoje) * 100).toFixed(1)) },
      funil: { naFila: entre(r, 1, 6), enviando: entre(r, 0, 2), conferindo: entre(r, 0, 3), concluida: Math.round(enviadasHoje * escala), divergente: divergencias, erro: 1 },
      vazao, recentes,
      heartbeat: { ultimoTs: iso(t - (atrasado ? 50 * 60000 : 70000)), versao: '1.4.2', atrasado },
    };
  }

  // ---------------------------------------------------------------- monitor de APIs
  let intervaloMin = 15;
  /** @type {Map<number, number>} último teste manual (limite de 1 a cada 10 s) */
  const ultimoTeste = new Map();
  /** @param {typeof APIS[number]} a @param {() => number} r */
  const verificar = (a, r) => {
    if (a.perfil === 'falha') return { s: 'f', ms: null };
    const ms = Math.round(a.ms * (0.7 + r() * 0.6));
    return { s: a.perfil === 'lenta' || ms > 2000 ? 'l' : 'o', ms };
  };
  /** @type {Map<number, { s: string, ms: number|null, em: string }[]>} */
  const historicos = new Map(APIS.map((a) => {
    const r = aleatorio(semente(`api|${a.id}`));
    return [a.id, Array.from({ length: 30 }, (_, i) => {
      const v = a.perfil === 'falha' && i < 22 ? { s: 'o', ms: entre(r, 300, 700) } : verificar(a, r);
      return { ...v, em: minutosAtras((29 - i) * intervaloMin + 1) };
    })];
  }));
  const ESTADO = { o: 'online', l: 'lenta', f: 'falha' };
  /** @param {typeof APIS[number]} a */
  function apiNativa(a) {
    const h = /** @type {any[]} */ (historicos.get(a.id));
    const ult = h[h.length - 1];
    return {
      id: a.id, nome: a.nome, sistema: a.sistema, url: endereco(a.host, a.caminho), host: a.host,
      estado: ESTADO[/** @type {'o'|'l'|'f'} */ (ult.s)], latenciaMs: ult.ms, verificadoEm: ult.em,
      log: ult.s === 'f' ? 'HTTP 503 · Service Unavailable' : ult.s === 'l' ? `Resposta lenta (${ult.ms} ms)` : 'HTTP 200 · OK', historico: h,
    };
  }
  function listaNativa() {
    const apis = APIS.map(apiNativa);
    const todas = [...historicos.values()].flat();
    const comMs = todas.filter((v) => v.ms !== null);
    return {
      intervaloMin, ultimaVerificacao: minutosAtras(1), proximaVerificacao: iso(Date.now() + (intervaloMin - 1) * 60000),
      resumo: {
        online: apis.filter((x) => x.estado !== 'falha').length, total: apis.length,
        latenciaMediaMs: Math.round(comMs.reduce((s, v) => s + Number(v.ms), 0) / Math.max(1, comMs.length)),
        disponibilidadePct: Number(((todas.filter((v) => v.s !== 'f').length / todas.length) * 100).toFixed(1)),
      },
      apis,
    };
  }
  const apiGas = (/** @type {typeof APIS[number]} */ a) => {
    const n = apiNativa(a);
    return { funcao_api: a.nome, status_api: n.estado === 'falha' ? 'Offline' : 'Online', log_api: n.log, link_api: n.url, hora_disparo: n.verificadoEm };
  };

  /**
   * @param {{ metodo: string, caminho: string, query: URLSearchParams, corpo: any, usuario: import('./base.js').UsuarioDemo }} req
   * @returns {Promise<import('./base.js').Resposta>}
   */
  async function rota({ metodo, caminho, query, corpo, usuario }) {
    const c = corpo || {};
    const admin = usuario.tipo === 'admin';
    if (caminho === '/metas' && metodo === 'GET') {
      const ano = Number(query.get('ano')); const mes = Number(query.get('mes'));
      return ok(metas.filter((m) => (!ano || m.ano === ano) && (!mes || m.mes === mes)));
    }
    if (caminho === '/metas' && metodo === 'PUT') {
      if (!admin) return falha(403, 'Apenas administradores definem metas.');
      if (!Number.isInteger(c.valor) || c.valor < 1 || c.valor > 10000000) return falha(400, 'Campo "valor" deve ser um inteiro de 1 a 10.000.000.');
      const i = metas.findIndex((m) => m.projeto === c.projeto && m.escopo === c.escopo && m.ano === c.ano && m.mes === c.mes);
      const meta = { projeto: String(c.projeto), escopo: String(c.escopo), ano: Number(c.ano), mes: Number(c.mes), valor: c.valor, unidade: String(c.unidade || 'pastas') };
      if (i >= 0) metas[i] = meta; else metas.push(meta);
      atividades.unshift({ id: ++seqAtividade, em: iso(Date.now()), quem: usuario.nome, sistema: false, acao: 'meta.definida', alvo: `Meta de ${String(meta.mes).padStart(2, '0')}/${meta.ano}`, onde: `${meta.projeto} · ${meta.escopo}` });
      return ok(meta);
    }
    if (caminho === '/atividades' && metodo === 'GET') {
      const projeto = query.get('projeto');
      const limite = Math.min(50, Number(query.get('limite')) || 10);
      return ok(atividades.filter((a) => !projeto || a.onde.startsWith(projeto)).slice(0, limite));
    }
    if (caminho === '/gargalos' && metodo === 'GET') return ok(await dep.fluxos.gargalosGerais());
    if (caminho === '/painel/resumo' && metodo === 'GET') {
      /** @type {Record<string, any>} */
      const instancias = {};
      for (const inst of INSTANCIAS) instancias[inst] = await dep.fluxos.resumoPainel(inst);
      return ok({ geradoEm: iso(Date.now()), instancias });
    }
    if (caminho === '/notificacoes' && metodo === 'GET') {
      const itens = await listaDeNotificacoes();
      return ok({ naoLidas: itens.filter((n) => !n.lida).length, itens });
    }
    if (caminho === '/notificacoes/lidas' && metodo === 'POST') { (await listaDeNotificacoes()).forEach((n) => { n.lida = true; }); return ok({}); }
    const mn = /^\/notificacoes\/(\d+)\/lida$/.exec(caminho);
    if (mn && metodo === 'POST') {
      const n = (await listaDeNotificacoes()).find((x) => x.id === Number(mn[1]));
      if (!n) return falha(404, 'Notificação não encontrada.');
      n.lida = true;
      return ok(n);
    }
    if (caminho === '/envio/resumo' && metodo === 'GET') {
      const instancia = String(query.get('instancia') || '');
      if (!instancia) return falha(400, 'Parâmetro "instancia" é obrigatório.');
      if (!/^[a-z0-9-]{3,60}$/.test(instancia)) return falha(400, 'Parâmetro "instancia" inválido.');
      const horas = Math.min(168, Math.max(1, Number(query.get('horas')) || 24));
      return ok(resumoEnvio(instancia, horas));
    }
    if (caminho === '/monitoramento/apis' && metodo === 'GET') return ok(listaNativa());
    const mt = /^\/monitoramento\/apis\/(\d+)\/testar$/.exec(caminho);
    if (mt && metodo === 'POST') {
      const a = APIS.find((x) => x.id === Number(mt[1]));
      if (!a) return falha(404, 'API não encontrada.');
      const antes = ultimoTeste.get(a.id) || 0;
      if (Date.now() - antes < 10000) return falha(429, 'Aguarde alguns segundos antes de testar esta API de novo.');
      ultimoTeste.set(a.id, Date.now());
      const h = /** @type {any[]} */ (historicos.get(a.id));
      const nova = { ...verificar(a, Math.random), em: iso(Date.now()) };
      h.push(nova); h.splice(0, Math.max(0, h.length - 30));
      return ok({ ...apiNativa(a), historico: [nova] });
    }
    if (caminho === '/monitoramento/intervalo' && metodo === 'PUT') {
      if (!admin) return falha(403, 'Apenas administradores alteram o intervalo.');
      if (!INTERVALOS.includes(Number(c.minutos))) return falha(400, 'Intervalo inválido.');
      intervaloMin = Number(c.minutos);
      return ok({ intervaloMin });
    }
    return naoEncontrada();
  }

  /** Reserva do Monitoramento (Apps Script): mesmo formato da planilha. @param {URLSearchParams} query */
  function rotaGas(query) {
    const acao = query.get('action');
    if (acao === 'testSingle') {
      const a = APIS[Number(query.get('index'))];
      return a ? { status: 200, corpo: { status: 'success', data: apiGas(a) } } : { status: 200, corpo: { status: 'error', message: 'Índice inválido.' } };
    }
    if (acao === 'setTrigger') { if (INTERVALOS.includes(Number(query.get('minutes')))) intervaloMin = Number(query.get('minutes')); return { status: 200, corpo: { status: 'success' } }; }
    return { status: 200, corpo: { status: 'success', triggerInterval: intervaloMin, data: APIS.map(apiGas) } };
  }

  return { rota, rotaGas, metaDe };
}
