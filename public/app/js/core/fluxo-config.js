// @ts-check
import { validarGrafo } from './fluxo.js';

/**
 * Configuração de um fluxo Captura (`ConfigFluxo`, definido em `fluxo-prod.js`): grafo no formato do motor do fluxograma e
 * validação. Vive à parte porque só a tela de fluxo precisa disso — a seleção de projetos e os hubs não pagam o motor.
 */

const TIPOS = ['entrada', 'processo', 'erro', 'reprocessamento', 'espera', 'terminal'];

/** Grafo no formato do motor do fluxograma. @param {import('./fluxo-prod.js').ConfigFluxo} cfg */
export function grafoDeConfig(cfg) {
  return {
    ...cfg.passo,
    nos: cfg.grafo.nos.map((n) => ({ id: n.fasId, x: n.x, y: n.y })),
    juncoes: cfg.grafo.juncoes || [],
    arestas: cfg.grafo.arestas.map((a) => ({ from: a.de, to: a.para, bidirectional: !!a.bidirecional, suspensao: !!a.erro })),
  };
}

/** Confere a configuração do fluxo: erro vira mensagem legível, não desenho quebrado. @param {any} cfg @returns {{ ok: boolean, erros: string[] }} */
export function validarConfigFluxo(cfg) {
  /** @type {string[]} */
  const erros = [];
  if (!cfg || typeof cfg !== 'object') return { ok: false, erros: ['Configuração do fluxo ausente.'] };
  for (const k of ['instancia', 'nome', 'projeto', 'rota']) if (typeof cfg[k] !== 'string' || !cfg[k]) erros.push(`Campo "${k}" ausente.`);
  if (cfg.fonte !== 'atlas' && cfg.fonte !== 'boreal') erros.push('Campo "fonte" deve ser "atlas" ou "boreal".');
  if (!Array.isArray(cfg.fases) || !cfg.fases.length) erros.push('O fluxo precisa de fases.');
  if (!cfg.grafo || !Array.isArray(cfg.grafo.nos) || !Array.isArray(cfg.grafo.arestas)) erros.push('Grafo ausente ou incompleto.');
  if (!Array.isArray(cfg.gestaoColunas) || !cfg.gestaoColunas.length) erros.push('Colunas da análise de produção ausentes.');
  if (erros.length) return { ok: false, erros };

  const ids = new Set();
  for (const f of cfg.fases) {
    if (!f || !Number.isInteger(f.fasId) || typeof f.nome !== 'string' || !TIPOS.includes(f.tipo)) { erros.push(`Fase inválida: ${JSON.stringify(f)}.`); continue; }
    if (ids.has(f.fasId)) erros.push(`Fase repetida: ${f.fasId}.`);
    ids.add(f.fasId);
  }
  if (cfg.fases.filter((/** @type {import('./fluxo-prod.js').Fase} */ f) => f && f.tipo === 'entrada').length !== 1) erros.push('Deve haver exatamente uma fase de entrada.');
  if (!cfg.fases.some((/** @type {import('./fluxo-prod.js').Fase} */ f) => f && f.fasId === cfg.faseFinal && f.tipo === 'terminal')) erros.push('A fase final deve existir e ser do tipo "terminal".');
  for (const n of cfg.grafo.nos) if (!ids.has(n && n.fasId)) erros.push(`O nó ${n && n.fasId} não está na lista de fases.`);
  for (const c of cfg.gestaoColunas) if (!c || !ids.has(c.fasId) || typeof c.titulo !== 'string') erros.push(`Coluna da análise inválida: ${JSON.stringify(c)}.`);
  if (!erros.length) erros.push(...validarGrafo(grafoDeConfig(cfg)).erros);
  return { ok: !erros.length, erros };
}


/**
 * Configuração que vem do servidor (`GET /:projeto/:instancia/config`, B2) por cima da local: o que o backend manda (nome, grafo, fases,
 * colunas, passo, fase final, "a validar") **vale mais**; o que é só do front (rota, projeto, fonte, `sub` de exibição) fica da local.
 * Campo que o servidor não manda (ou manda com tipo errado) NÃO apaga o da local.
 * @param {import('./fluxo-prod.js').ConfigFluxo} local @param {any} srv
 * @returns {import('./fluxo-prod.js').ConfigFluxo}
 */
export function mesclarConfigServidor(local, srv) {
  if (!srv || typeof srv !== 'object') return local;
  const o = { ...local };
  if (typeof srv.nome === 'string' && srv.nome) o.nome = srv.nome;
  if (typeof srv.aValidar === 'boolean') o.aValidar = srv.aValidar;
  if (Number.isInteger(srv.faseFinal)) o.faseFinal = srv.faseFinal;
  if (srv.passo && ['cw', 'ch', 'nw', 'nh'].every((k) => Number.isFinite(srv.passo[k]))) o.passo = { cw: srv.passo.cw, ch: srv.passo.ch, nw: srv.passo.nw, nh: srv.passo.nh };
  if (Array.isArray(srv.gestaoColunas) && srv.gestaoColunas.length) o.gestaoColunas = srv.gestaoColunas;
  if (Array.isArray(srv.fases) && srv.fases.length) o.fases = srv.fases;
  if (srv.grafo && Array.isArray(srv.grafo.nos) && Array.isArray(srv.grafo.arestas)) o.grafo = { nos: srv.grafo.nos, juncoes: Array.isArray(srv.grafo.juncoes) ? srv.grafo.juncoes : [], arestas: srv.grafo.arestas };
  return o;
}
