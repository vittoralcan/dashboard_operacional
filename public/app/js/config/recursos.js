// @ts-check
/**
 * Registro central dos recursos que dependem do backend NOVO (RNB-007 revisada).
 *
 *   'em-breve' → a tela mostra o bloco/valor marcado "Em breve" e NÃO faz requisição.
 *   'ativo'    → a tela usa o provider real (core/sources.js) e o selo some.
 *
 * Para ligar um recurso: (1) o backend entrega e confirma o contrato de api_noir.md;
 * (2) trocar `estado` para 'ativo' AQUI; (3) trocar o stub do provider pelo `api.get` real;
 * (4) teste de contrato; (5) conferir que o selo sumiu. Um recurso por PR.
 *
 * @typedef {'em-breve'|'ativo'} EstadoRecurso
 * @typedef {{ nome: string, estado: EstadoRecurso, api: string, funcoes: string[] }} Recurso
 */

import { store, CHAVES } from '../core/store.js';

/** @type {Record<string, Recurso>} */
export const RECURSOS = {
  'auth.me':            { nome: 'Perfil e permissões completos',   estado: 'ativo',    api: 'GET /auth/me',                        funcoes: ['USR-02', 'USR-03'] },
  'auth.preferencias':  { nome: 'Preferências na conta',           estado: 'ativo',    api: 'PATCH /auth/me/preferencias',         funcoes: ['USR-05'] },
  'envio':              { nome: 'Acompanhamento de envio (Bridge)', estado: 'ativo', api: 'GET /envio/resumo',                  funcoes: ['ENV-01'] },
  'catalogo':           { nome: 'Catálogo de projetos e fluxos',   estado: 'em-breve', api: 'GET /catalogo',                       funcoes: ['NAV-10'] },
  'fluxo.config':       { nome: 'Configuração dos fluxos',         estado: 'ativo',    api: 'GET /:projeto/:instancia/config',     funcoes: ['FLX-05'] },
  'gestao.resumo':      { nome: 'Resumo e variação mensal',        estado: 'ativo',    api: 'campo `resumo` em /:projeto/:instancia/gestao', funcoes: ['HUB-04', 'FLX-02', 'HIG-02'] },
  'painel.resumo':      { nome: 'Resumo geral dos projetos',       estado: 'ativo',    api: 'GET /painel/resumo',                  funcoes: ['HUB-01'] },
  'metas':              { nome: 'Metas mensais',                   estado: 'ativo',    api: 'GET/PUT /metas',                      funcoes: ['HUB-04', 'FLX-02'] },
  'gargalos':           { nome: 'Gargalos agora',                  estado: 'ativo',    api: 'GET /gargalos',                       funcoes: ['NTF-05', 'FLX-06'] },
  'atividades':         { nome: 'Atividade recente',               estado: 'ativo',    api: 'GET /atividades',                     funcoes: ['NTF-02'] },
  'notificacoes':       { nome: 'Central de notificações',         estado: 'ativo',    api: 'GET /notificacoes',                   funcoes: ['NTF-01'] },
  'monitor.nativo':     { nome: 'Monitor de APIs com histórico',   estado: 'ativo',    api: 'GET /monitoramento/*',                funcoes: ['MON-01', 'MON-02'] },
  'boreal.mesas.criar':   { nome: 'Adicionar mesa',                  estado: 'em-breve', api: 'POST /producao/higienizacao/mesas',   funcoes: ['HIG-07'] },
  'boreal.mesa.existe':   { nome: 'Validação de mesa inexistente',   estado: 'em-breve', api: 'campo `existe` em /mesa/:id/status',  funcoes: ['RCX-02'] },
  'boreal.sincronizacao': { nome: 'Sincronização do Lumen e AIPs',    estado: 'em-breve', api: 'sincronização Lumen/AIPs',             funcoes: ['IDX-05'] },
  'auth.sessao':        { nome: 'Sessão longa para TV e logout',   estado: 'em-breve', api: 'refresh/logout/credencial de TV',     funcoes: ['AUT-12', 'AUT-13', 'MAC-06'] },
  'boreal.resumo':        { nome: 'Meta e variação do BOREAL',      estado: 'em-breve', api: 'resumo mensal do BOREAL (o back_boreal não calcula; a migração foi descartada)', funcoes: ['HUB-04', 'HIG-02'] },
  'atividades.boreal':    { nome: 'Atividade do BOREAL',            estado: 'em-breve', api: 'fonte de Higienização em /atividades (não implementada)', funcoes: ['NTF-02'] },
  'auth.usuarios':      { nome: 'Gestão de usuários',              estado: 'em-breve', api: 'gestão de usuários (A7)',             funcoes: ['USR-07'] },
  'boreal.aips.serie':    { nome: 'AIPs dos últimos 7 dias',        estado: 'em-breve', api: 'série `serie7d` em /aips/dados',      funcoes: ['AIP-01'] },
  'boreal.indexacao.resumo': { nome: 'Meta e variação mensal da Indexação', estado: 'em-breve', api: 'campos `meta` e `variacaoPct` em /indexacao-ia/total-mes', funcoes: ['IDX-01'] },
  'boreal.exportacao':    { nome: 'Exportação completa',             estado: 'em-breve', api: 'exportação no servidor',              funcoes: ['IDX-06'] },
};

/**
 * Recursos que o servidor respondeu 404 NESTA sessão (backend mais antigo que o front, rota ainda não publicada): voltam a ser
 * "Em breve" sem quebrar a tela (RNB-007 — "a resposta 404 é o sinal"). Vive em `sessionStorage`; um novo login tenta de novo.
 * @type {Set<string>}
 */
const AUSENTES = new Set(store.json(CHAVES.ausentes, /** @type {string[]} */ ([]), 'sessao'));

/** Marca o recurso como ausente no servidor. @param {string} id */
export function marcarAusente(id) {
  recurso(id);
  if (AUSENTES.has(id)) return;
  AUSENTES.add(id);
  store.gravarJson(CHAVES.ausentes, [...AUSENTES], 'sessao');
}

/** Esquece as ausências (novo login, testes). */
export function limparAusentes() { AUSENTES.clear(); store.remover(CHAVES.ausentes, 'sessao'); }

/** Se o erro for um 404 do servidor, marca o recurso como ausente e devolve `true` (a tela mostra "Em breve"). @param {string} id @param {any} erro */
export function ausenteSe404(id, erro) {
  if (erro && erro.status === 404) { marcarAusente(id); return true; }
  return false;
}

/** Busca o recurso; id inexistente é erro de programação (typo), não "desligado". @param {string} id */
export function recurso(id) {
  const r = RECURSOS[id];
  if (!r) throw new Error(`Recurso desconhecido: "${id}" (ver js/config/recursos.js).`);
  return r;
}

/** O recurso já está ligado ao backend? @param {string} id */
export const ativo = (id) => recurso(id).estado === 'ativo' && !AUSENTES.has(id);

/** O recurso ainda é "Em breve"? @param {string} id */
export const emBreve = (id) => !ativo(id);
