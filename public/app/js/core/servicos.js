// @ts-check
import { instanteDe } from './format.js';
import { fluxoDoCatalogo } from './gargalos.js';

/**
 * Normalização das respostas do `back_dashboard` de atividades e notificações e a resolução segura do destino
 * de uma notificação. (Metas e gargalos têm módulos próprios: `metas.js`, `gargalos.js`.) Funções puras: o que o servidor não manda vira
 * `null`/vazio (nunca um valor inventado) e rotas de destino vindas do servidor SÓ viram navegação depois de conferidas contra o
 * catálogo e a tabela de rotas.
 */

const txt = (/** @type {unknown} */ v) => String(v ?? '');
const lista = (/** @type {any} */ d) => (Array.isArray(d) ? d : []);

// ---------------------------------------------------------------- atividades (B8)

/** O servidor grava o CÓDIGO da ação (`meta.definida`); a frase em português é do front. */
const ACOES = /** @type {Record<string, string>} */ ({
  'meta.definida': 'definiu a meta',
  'relatorio.gerado': 'gerou um relatório',
  'monitor.intervalo': 'alterou o intervalo do monitor',
});

/** @param {string} acao */
export const textoDaAcao = (acao) => ACOES[acao] || acao.replace(/[._]/g, ' ');

/** `GET /atividades`. @param {any} data */
export function normalizarAtividades(data) {
  return lista(data).filter((a) => a && a.acao).map((a) => ({
    id: Number(a.id), ts: instanteDe(a.em), quem: txt(a.quem) || 'Sistema', sistema: !!a.sistema,
    acao: textoDaAcao(txt(a.acao)), alvo: txt(a.alvo), onde: txt(a.onde),
  }));
}

// ---------------------------------------------------------------- notificações (B9)

/** @typedef {{ rota: string, foco?: { instancia: string, fasId: number } }} Destino */
/** @typedef {{ id: number, tipo: 'erro'|'alerta'|'sucesso'|'info', titulo: string, texto: string, ts: number, lida: boolean, destino: Destino|null }} Notificacao */

/** `GET /notificacoes` → `{ naoLidas, itens }`. @param {any} data @returns {{ naoLidas: number, itens: Notificacao[] }} */
export function normalizarNotificacoes(data) {
  const itens = lista(data && data.itens).filter((n) => n && Number.isInteger(Number(n.id))).map((n) => {
    const d = n.destino && typeof n.destino.rota === 'string' ? n.destino : null;
    return /** @type {Notificacao} */ ({
      id: Number(n.id), tipo: ['erro', 'alerta', 'sucesso', 'info'].includes(n.tipo) ? n.tipo : 'info', titulo: txt(n.titulo), texto: txt(n.texto),
      ts: instanteDe(n.criadoEm), lida: !!n.lida,
      destino: d ? { rota: d.rota, ...(d.foco && Number.isInteger(Number(d.foco.fasId)) ? { foco: { instancia: txt(d.foco.instancia), fasId: Number(d.foco.fasId) } } : {}) } : null,
    });
  });
  return { naoLidas: itens.filter((n) => !n.lida).length, itens };
}

/**
 * Rota segura para o destino de uma notificação. O servidor monta `/<projeto>/<instância>[/fluxograma]` com o ID da instância
 * (`/atlas/certidoes`), que não é a rota do front (`/atlas/certidoes`): primeiro resolve pelo catálogo; senão só aceita
 * rota que o front conhece. Qualquer outra coisa (outro site, rota inexistente) → `null` (não navega).
 * @param {Destino|null} destino @param {import('./catalogo.js').Catalogo} cat @param {(rota: string) => boolean} rotaConhecida
 * @returns {string|null}
 */
export function resolverDestino(destino, cat, rotaConhecida) {
  if (!destino || typeof destino.rota !== 'string' || !destino.rota.startsWith('/') || destino.rota.startsWith('//')) return null;
  const m = /^\/([a-z0-9-]+)\/([a-z0-9-]+)(\/fluxograma)?\/?$/.exec(destino.rota);
  if (m) {
    const f = fluxoDoCatalogo(cat, m[1], m[2]);
    if (f) return `${f.rota}${m[3] ? '/fluxograma' : ''}`;
  }
  return rotaConhecida(destino.rota) ? destino.rota : null;
}
