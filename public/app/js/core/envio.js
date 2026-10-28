// @ts-check
import { instanteDe } from './format.js';

/**
 * Acompanhamento do Bridge (envio das pastas ao ownCloud, pós-esteira). Funções puras sobre `GET /envio/resumo`
 * (`docs/api/envio-bridge.md` B14): normalização defensiva, estado do "sinal de vida" e as séries das telas.
 * O que o servidor não manda vira `null`/vazio — nunca um valor inventado (RNB-011).
 */

/** O servidor identifica o Bridge por `instancia` (A9: minúsculas, números e hífen, 3 a 60 caracteres). */
export const INSTANCIA_REGEX = /^[a-z0-9-]{3,60}$/;

/**
 * Alerta que exige ação humana: o Bridge manda como evento de erro cuja `mensagem` começa com este prefixo (não existe status
 * novo). A tela o distingue de um erro de envio comum só por isso; o servidor devolve `mensagem` apenas nesses eventos.
 */
export const PREFIXO_ALERTA = '[ALERTA]';

/** Janelas do funil, da vazão e dos recentes (`?horas=`; o servidor limita a 1–168). */
export const JANELAS = [{ horas: 6, rotulo: '6 h' }, { horas: 24, rotulo: '24 h' }, { horas: 72, rotulo: '3 dias' }, { horas: 168, rotulo: '7 dias' }];
export const JANELA_PADRAO = 24;

/** Etapas do funil na ordem do processo; `tom` é o do selo (`ok`/`warn`/`err`/`info`/'' neutro). */
export const ETAPAS = /** @type {const} */ ([
  { chave: 'naFila', status: 'na_fila', rotulo: 'Na fila', tom: '' },
  { chave: 'enviando', status: 'enviando', rotulo: 'Enviando', tom: 'info' },
  { chave: 'conferindo', status: 'conferindo', rotulo: 'Conferindo', tom: 'info' },
  { chave: 'concluida', status: 'concluida', rotulo: 'Concluída', tom: 'ok' },
  { chave: 'divergente', status: 'divergente', rotulo: 'Divergente', tom: 'warn' },
  { chave: 'erro', status: 'erro', rotulo: 'Erro', tom: 'err' },
]);

/** Texto de um alerta sem o prefixo (`''` se só havia o prefixo); `null` se a mensagem não é um alerta. @param {unknown} mensagem */
export function textoDoAlerta(mensagem) {
  if (typeof mensagem !== 'string' || !mensagem.startsWith(PREFIXO_ALERTA)) return null;
  return mensagem.slice(PREFIXO_ALERTA.length).trim();
}

/** Instância digitada: aparada e em minúsculas; `null` se não casar com o formato aceito pelo servidor. @param {unknown} texto */
export function instanciaValida(texto) {
  const t = String(texto ?? '').trim().toLowerCase();
  return INSTANCIA_REGEX.test(t) ? t : null;
}

/** Janela em horas válida (as da lista); qualquer outra coisa volta ao padrão. @param {unknown} h */
export const janelaValida = (h) => (JANELAS.some((j) => j.horas === Number(h)) ? Number(h) : JANELA_PADRAO);

const inteiro = (/** @type {unknown} */ v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; };
const numeroOuNulo = (/** @type {unknown} */ v) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/**
 * @typedef {{ pasta: string, fluxo: string|null, status: string, resultado: string|null, ts: number, alerta: boolean, detalhe: string|null }} EventoRecente
 * @typedef {{ ultimoTs: number|null, versao: string|null, atrasado: boolean|null }} Sinal
 * @typedef {{ geradoEm: number, cartoes: { enviadasHoje: number, pendentes: number, divergenciasAbertas: number, taxaConferenciaPct: number|null },
 *             funil: Record<string, number>, vazao: { ts: number, arquivosMin: number, mbSeg: number }[], recentes: EventoRecente[], sinal: Sinal }} ResumoEnvio
 */

/** `GET /envio/resumo` → modelo da tela. @param {any} data @returns {ResumoEnvio} */
export function normalizarResumoEnvio(data) {
  const d = data && typeof data === 'object' ? data : {};
  const c = d.cartoes || {};
  const f = d.funil || {};
  const h = d.heartbeat || {};
  const ultimo = h.ultimoTs ? instanteDe(h.ultimoTs) : 0;
  return {
    geradoEm: d.geradoEm ? instanteDe(d.geradoEm) : 0,
    cartoes: { enviadasHoje: inteiro(c.enviadasHoje), pendentes: inteiro(c.pendentes), divergenciasAbertas: inteiro(c.divergenciasAbertas), taxaConferenciaPct: numeroOuNulo(c.taxaConferenciaPct) },
    funil: Object.fromEntries(ETAPAS.map((e) => [e.chave, inteiro(f[e.chave])])),
    vazao: (Array.isArray(d.vazao) ? d.vazao : []).filter((v) => v && v.t).map((v) => ({ ts: instanteDe(v.t), arquivosMin: inteiro(v.arquivosMin), mbSeg: Math.max(0, Number(v.mbSeg) || 0) })).filter((v) => v.ts > 0).sort((a, b) => a.ts - b.ts),
    recentes: (Array.isArray(d.recentes) ? d.recentes : []).filter((r) => r && r.pasta).map((r) => {
      const texto = textoDoAlerta(r.mensagem);
      return {
        pasta: String(r.pasta), fluxo: r.fluxo ? String(r.fluxo) : null, status: String(r.status || ''), resultado: r.resultado ? String(r.resultado) : null, ts: instanteDe(r.eventoTs),
        alerta: texto !== null, detalhe: texto || null,
      };
    }),
    sinal: { ultimoTs: ultimo > 0 ? ultimo : null, versao: h.versao ? String(h.versao) : null, atrasado: typeof h.atrasado === 'boolean' ? h.atrasado : null },
  };
}

/** Ainda não chegou nenhum dado desta instância (nem evento, nem sinal de vida): Bridge novo, ainda sem configurar. @param {ResumoEnvio} r */
export const semDadosDeEnvio = (r) => r.sinal.ultimoTs === null && r.recentes.length === 0 && ETAPAS.every((e) => r.funil[e.chave] === 0) && r.cartoes.enviadasHoje === 0;

/**
 * Situação do Bridge pelo último sinal de vida: `atrasado` vem do servidor (limite dele, hoje 15 min); `null` = nunca mandou sinal
 * (sem dado não é "atrasado" — RNB-007). @param {Sinal} s @param {number} [agora]
 * @returns {{ nivel: 'ok'|'atrasado'|'sem-sinal', idadeSeg: number|null }}
 */
export function situacaoDoBridge(s, agora = Date.now()) {
  if (s.ultimoTs === null || s.atrasado === null) return { nivel: 'sem-sinal', idadeSeg: s.ultimoTs === null ? null : Math.max(0, (agora - s.ultimoTs) / 1000) };
  return { nivel: s.atrasado ? 'atrasado' : 'ok', idadeSeg: Math.max(0, (agora - s.ultimoTs) / 1000) };
}

/**
 * Taxa de conferência EXIBIDA: com nenhuma conclusão hoje o servidor devolve 100 (nada a divergir), mas isso não é "100 % conferido":
 * mostra `null` ("—"). @param {ResumoEnvio['cartoes']} c
 */
export const taxaExibida = (c) => (c.enviadasHoje === 0 ? null : c.taxaConferenciaPct);

/** Linhas do funil com a largura relativa à maior etapa (0–100) e o total. @param {Record<string, number>} funil */
export function linhasDoFunil(funil) {
  const maior = Math.max(1, ...ETAPAS.map((e) => funil[e.chave] || 0));
  return ETAPAS.map((e) => ({ ...e, total: funil[e.chave] || 0, rel: Math.round(((funil[e.chave] || 0) / maior) * 100) }));
}

/** Rótulo do estado de um evento (a API manda `concluida`, `na_fila`…). @param {string} status */
export function etapaDoStatus(status) {
  return ETAPAS.find((e) => e.status === status) || { chave: status, status, rotulo: status ? status.replace(/_/g, ' ') : '—', tom: '' };
}

/** Etapa exibida de um alerta: tom de atenção (âmbar), distinto do vermelho de um erro de envio comum. */
export const ETAPA_ALERTA = /** @type {const} */ ({ chave: 'alerta', status: 'alerta', rotulo: 'Alerta', tom: 'warn' });

/** Etapa exibida de um evento da lista: alerta (pelo prefixo da mensagem) ou o rótulo do status. @param {Pick<EventoRecente, 'status'|'alerta'>} e */
export const etapaDoEvento = (e) => (e.alerta ? ETAPA_ALERTA : etapaDoStatus(e.status));

/** Séries da vazão para o gráfico de linha. @param {ResumoEnvio['vazao']} vazao @param {'arquivos'|'mb'} grandeza */
export function serieDeVazao(vazao, grandeza) {
  const hora = (/** @type {number} */ ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return {
    valores: vazao.map((v) => (grandeza === 'mb' ? v.mbSeg : v.arquivosMin)),
    rotulos: vazao.map((v) => hora(v.ts)),
  };
}

/** Nome do fluxo para exibição (o servidor manda o id: `certidoes`). @param {string|null} id @param {import('./catalogo.js').Catalogo} cat */
export function nomeDoFluxo(id, cat) {
  if (!id) return '—';
  for (const p of cat.projetos) { const f = p.fluxos.find((x) => x.id === id); if (f) return f.nome; }
  return id;
}
