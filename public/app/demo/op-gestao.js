// @ts-check
import { emSP, ok, falha, naoEncontrada } from './base.js';
import { cadastros, caixas, nomeDe } from './op-dados.js';

/** Relatórios hora a hora / tempo médio e cadastros operacionais (admin) simulados, calculados das caixas em memória. */

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ETAPAS = ['higienizacao', 'remontagem', 'digitalizacao'];
const SLUG_RE = /^[a-z0-9-]{2,30}$/;

/** Caixas concluídas do projeto numa etapa e num intervalo de datas (São Paulo). @param {number} projetoId @param {string} etapa @param {string} de @param {string} ate @param {number|null} turnoId */
const concluidas = (projetoId, etapa, de, ate, turnoId) => caixas.filter((c) => {
  if (c.status !== 'concluida' || c.projetoId !== projetoId || c.etapa !== etapa || !c.fimEm) return false;
  if (turnoId && c.turnoId !== turnoId) return false;
  const d = emSP(Date.parse(c.fimEm)).data;
  return d >= de && d <= ate;
});

/** @param {URLSearchParams} q */
function rotaRelatorios(caminho, q) {
  if (caminho === '/projetos') {
    return ok({ projetos: cadastros.projetos.filter((p) => p.ativo).map((p) => ({ id: p.id, slug: p.slug, nome: p.nome,
      turnos: cadastros.turnos.filter((t) => t.projetoId === p.id && t.ativo).map((t) => ({ id: t.id, nome: t.nome })) })) });
  }
  const projetoId = Number(q.get('projetoId'));
  if (!Number.isInteger(projetoId) || projetoId < 1) return falha(400, 'Parâmetro "projetoId" inválido.');
  const etapa = q.get('etapa') || 'higienizacao';
  if (!ETAPAS.includes(etapa)) return falha(400, 'Parâmetro "etapa" inválido.');
  if (caminho === '/hora-a-hora') {
    const data = q.get('data') || '';
    if (!DATA_RE.test(data)) return falha(400, 'Parâmetro "data" inválido.');
    const turnoId = Number(q.get('turnoId')) || null;
    const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, caixas: 0 }));
    /** @type {Map<number, { colaboradorId: number, nome: string, total: number, horas: number[] }>} */
    const porColaborador = new Map();
    let total = 0;
    for (const c of concluidas(projetoId, etapa, data, data, turnoId)) {
      const h = emSP(Date.parse(/** @type {string} */ (c.fimEm))).hora;
      horas[h].caixas += 1; total += 1;
      const p = porColaborador.get(c.colaboradorId) || { colaboradorId: c.colaboradorId, nome: nomeDe(c.colaboradorId), total: 0, horas: new Array(24).fill(0) };
      p.horas[h] += 1; p.total += 1; porColaborador.set(c.colaboradorId, p);
    }
    return ok({ data, etapa, horas, total, colaboradores: [...porColaborador.values()] });
  }
  if (caminho === '/tempo-medio') {
    const de = q.get('de') || ''; const ate = q.get('ate') || '';
    if (!DATA_RE.test(de) || !DATA_RE.test(ate) || de > ate) return falha(400, 'Período inválido.');
    /** @type {Map<number, { colaboradorId: number, nome: string, caixas: number, totalS: number, mediaS: number }>} */
    const m = new Map();
    let n = 0; let soma = 0;
    for (const c of concluidas(projetoId, etapa, de, ate, null)) {
      const p = m.get(c.colaboradorId) || { colaboradorId: c.colaboradorId, nome: nomeDe(c.colaboradorId), caixas: 0, totalS: 0, mediaS: 0 };
      p.caixas += 1; p.totalS += c.duracaoS || 0; p.mediaS = Math.round(p.totalS / p.caixas); m.set(c.colaboradorId, p);
      n += 1; soma += c.duracaoS || 0;
    }
    return ok({ de, ate, etapa, caixas: n, mediaGeralS: n ? Math.round(soma / n) : 0, colaboradores: [...m.values()] });
  }
  return naoEncontrada();
}

/** Campos aceitos por recurso, com validação mínima (o formulário do front já valida; aqui é a segunda checagem, como no servidor). */
const CAMPOS = /** @type {Record<string, Record<string, (v: any) => string|null>>} */ ({
  projetos: {
    slug: (v) => (typeof v === 'string' && SLUG_RE.test(v) ? null : 'Campo "slug" deve casar com ^[a-z0-9-]{2,30}$.'),
    nome: (v) => (typeof v === 'string' && v.trim() && v.length <= 100 ? null : 'Campo "nome" deve ter de 1 a 100 caracteres.'),
    codigoRegex: (v) => { if (v === null) return null; try { new RegExp(v); return null; } catch { return 'Campo "codigoRegex" não é uma expressão regular válida.'; } },
    integracoes: (v) => (Array.isArray(v) && v.every((i) => ['captura', 'lumen', 'arca'].includes(i)) ? null : 'Campo "integracoes" inválido.'),
    ativo: (v) => (typeof v === 'boolean' ? null : 'Campo "ativo" deve ser verdadeiro ou falso.'),
  },
  turnos: {
    projetoId: (v) => (cadastros.projetos.some((p) => p.id === v) ? null : 'Referência inválida.'),
    nome: (v) => (typeof v === 'string' && v.trim() && v.length <= 60 ? null : 'Campo "nome" deve ter de 1 a 60 caracteres.'),
    usuarioAuthId: (v) => (v === null || (Number.isInteger(v) && v > 0) ? null : 'Campo "usuarioAuthId" inválido.'),
    ativo: (v) => (typeof v === 'boolean' ? null : 'Campo "ativo" deve ser verdadeiro ou falso.'),
  },
  colaboradores: {
    projetoId: (v) => (cadastros.projetos.some((p) => p.id === v) ? null : 'Referência inválida.'),
    nome: (v) => (typeof v === 'string' && v.trim() && v.length <= 150 ? null : 'Campo "nome" deve ter de 1 a 150 caracteres.'),
    funcao: (v) => (v === null || (typeof v === 'string' && v.length <= 60) ? null : 'Campo "funcao" inválido.'),
    turnoId: (v) => (v === null || cadastros.turnos.some((t) => t.id === v) ? null : 'Referência inválida.'),
    avatar: (v) => (v === null || (typeof v === 'string' && v.length <= 60) ? null : 'Campo "avatar" inválido.'),
    ativo: (v) => (typeof v === 'boolean' ? null : 'Campo "ativo" deve ser verdadeiro ou falso.'),
  },
  mesas: {
    projetoId: (v) => (cadastros.projetos.some((p) => p.id === v) ? null : 'Referência inválida.'),
    codigo: (v) => (typeof v === 'string' && v.trim() && v.length <= 10 ? null : 'Campo "codigo" deve ter de 1 a 10 caracteres.'),
    tipo: (v) => (['higienizacao', 'remontagem'].includes(v) ? null : 'Campo "tipo" deve ser higienizacao ou remontagem.'),
    ativo: (v) => (typeof v === 'boolean' ? null : 'Campo "ativo" deve ser verdadeiro ou falso.'),
  },
});
const OBRIGATORIOS = /** @type {Record<string, string[]>} */ ({ projetos: ['slug', 'nome'], turnos: ['projetoId', 'nome'], colaboradores: ['projetoId', 'nome'], mesas: ['projetoId', 'codigo', 'tipo'] });

/** @param {string} recurso @param {Record<string, any>} corpo @param {boolean} criando */
function validar(recurso, corpo, criando) {
  const campos = CAMPOS[recurso];
  /** @type {Record<string, any>} */
  const limpo = {};
  for (const [k, v] of Object.entries(corpo || {})) {
    if (!campos[k]) continue;
    const erro = campos[k](v);
    if (erro) return { erro };
    limpo[k] = typeof v === 'string' ? v.trim() : v;
  }
  if (criando) for (const k of OBRIGATORIOS[recurso]) if (limpo[k] === undefined) return { erro: `Campo "${k}" é obrigatório.` };
  if (!Object.keys(limpo).length) return { erro: 'Informe ao menos um campo para gravar.' };
  return { limpo };
}

/** @param {string} metodo @param {string} caminho @param {URLSearchParams} q @param {any} corpo */
function rotaCadastros(metodo, caminho, q, corpo) {
  const c = corpo || {};
  if (caminho === '/metas') {
    if (metodo === 'GET') return ok(cadastros.metas);
    if (metodo === 'PUT') {
      if (!cadastros.projetos.some((p) => p.id === c.projetoId)) return falha(400, 'Referência inválida.');
      if (!['higienizacao', 'scanner', 'cq'].includes(c.etapa)) return falha(400, 'Campo "etapa" deve ser um de: higienizacao, scanner, cq.');
      if (!Number.isInteger(c.valorDia) || c.valorDia < 1) return falha(400, 'Campo "valorDia" deve ser um inteiro maior ou igual a 1.');
      if (!['caixas', 'imagens'].includes(c.unidade)) return falha(400, 'Campo "unidade" deve ser caixas ou imagens.');
      const meta = { projetoId: c.projetoId, etapa: c.etapa, valorDia: c.valorDia, unidade: c.unidade };
      const i = cadastros.metas.findIndex((m) => m.projetoId === meta.projetoId && m.etapa === meta.etapa);
      if (i >= 0) cadastros.metas[i] = meta; else cadastros.metas.push(meta);
      return ok(meta);
    }
    return naoEncontrada();
  }
  const m = /^\/(projetos|turnos|colaboradores|mesas)(?:\/(\d+))?$/.exec(caminho);
  if (!m) return naoEncontrada();
  const lista = /** @type {any[]} */ (/** @type {any} */ (cadastros)[m[1]]);
  if (!m[2] && metodo === 'GET') {
    const projetoId = Number(q.get('projetoId')) || null;
    return ok(lista.filter((x) => !projetoId || x.projetoId === undefined || x.projetoId === projetoId));
  }
  if (!m[2] && metodo === 'POST') {
    const v = validar(m[1], c, true);
    if (v.erro) return falha(400, v.erro);
    if (m[1] === 'projetos' && lista.some((x) => x.slug === v.limpo.slug)) return falha(409, 'Já existe um cadastro com esses dados.');
    const base = /** @type {Record<string, any>} */ ({ projetos: { codigoRegex: null, integracoes: [] }, turnos: { usuarioAuthId: null }, colaboradores: { funcao: null, turnoId: null, avatar: null }, mesas: {} })[m[1]];
    const novo = { id: Math.max(0, ...lista.map((x) => x.id)) + 1, ...base, ativo: true, ...v.limpo };
    lista.push(novo);
    return ok(novo, 201);
  }
  if (m[2] && metodo === 'PUT') {
    const item = lista.find((x) => x.id === Number(m[2]));
    if (!item) return falha(404, 'Cadastro não encontrado.');
    const v = validar(m[1], c, false);
    if (v.erro) return falha(400, v.erro);
    Object.assign(item, v.limpo);
    return ok(item);
  }
  return naoEncontrada();
}

/**
 * `/operacional/relatorios/*` (gestão) e `/operacional/admin/*` (só admin).
 * @param {{ metodo: string, caminho: string, query: URLSearchParams, corpo: any, usuario: import('./base.js').UsuarioDemo }} req
 * @returns {import('./base.js').Resposta}
 */
export function rotaGestaoOperacional({ metodo, caminho, query, corpo, usuario }) {
  if (caminho.startsWith('/relatorios/')) return metodo === 'GET' ? rotaRelatorios(caminho.slice('/relatorios'.length), query) : naoEncontrada();
  if (caminho.startsWith('/admin/')) {
    if (usuario.tipo !== 'admin') return falha(403, 'Acesso restrito a administradores.');
    return rotaCadastros(metodo, caminho.slice('/admin'.length), query, corpo);
  }
  return naoEncontrada();
}
