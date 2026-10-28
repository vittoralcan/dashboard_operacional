// @ts-check

/**
 * Cadastros do módulo operacional (admin): campos, limites e validação do formulário.
 * Espelha `services/back_dashboard/src/operacional/cadastros.js`; o servidor valida de novo.
 */

/** @typedef {{ nome: string, rotulo: string, tipo: 'texto'|'numero'|'opcao'|'booleano'|'lista', obrigatorio?: boolean, max?: number, min?: number, padrao?: RegExp, regex?: boolean, opcoes?: string[], ref?: 'projetos'|'turnos', dica?: string }} Campo */
/** @typedef {{ rotulo: string, campos: Campo[], semId?: boolean }} Recurso */

export const SLUG_RE = /^[a-z0-9-]{2,30}$/;
export const INTEGRACOES = ['captura', 'lumen', 'arca'];

/** @type {Campo} */
const PROJETO = { nome: 'projetoId', rotulo: 'Projeto', tipo: 'numero', obrigatorio: true, min: 1, ref: 'projetos' };
/** @type {Campo} */
const ATIVO = { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' };

/** @type {Record<string, Recurso>} */
export const RECURSOS = {
  projetos: {
    rotulo: 'Projetos',
    campos: [
      { nome: 'slug', rotulo: 'Identificador (slug)', tipo: 'texto', obrigatorio: true, padrao: SLUG_RE, dica: 'Minúsculas, números e hífen (2 a 30).' },
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, max: 100 },
      { nome: 'codigoRegex', rotulo: 'Expressão regular do código', tipo: 'texto', max: 200, regex: true },
      { nome: 'integracoes', rotulo: 'Integrações', tipo: 'lista', opcoes: INTEGRACOES },
      ATIVO,
    ],
  },
  turnos: {
    rotulo: 'Turnos',
    campos: [
      PROJETO,
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, max: 60 },
      { nome: 'usuarioAuthId', rotulo: 'Usuário (id no login)', tipo: 'numero', min: 1 },
      ATIVO,
    ],
  },
  colaboradores: {
    rotulo: 'Colaboradores',
    campos: [
      PROJETO,
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, max: 150 },
      { nome: 'funcao', rotulo: 'Função', tipo: 'texto', max: 60 },
      { nome: 'turnoId', rotulo: 'Turno', tipo: 'numero', min: 1, ref: 'turnos' },
      { nome: 'avatar', rotulo: 'Avatar', tipo: 'texto', max: 60 },
      ATIVO,
    ],
  },
  mesas: {
    rotulo: 'Mesas',
    campos: [
      PROJETO,
      { nome: 'codigo', rotulo: 'Código', tipo: 'texto', obrigatorio: true, max: 10 },
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'opcao', obrigatorio: true, opcoes: ['higienizacao', 'remontagem'] },
      ATIVO,
    ],
  },
  metas: {
    rotulo: 'Metas',
    semId: true,
    campos: [
      PROJETO,
      { nome: 'etapa', rotulo: 'Etapa', tipo: 'opcao', obrigatorio: true, opcoes: ['higienizacao', 'scanner', 'cq'] },
      { nome: 'valorDia', rotulo: 'Meta por dia', tipo: 'numero', obrigatorio: true, min: 1 },
      { nome: 'unidade', rotulo: 'Unidade', tipo: 'opcao', obrigatorio: true, opcoes: ['caixas', 'imagens'] },
    ],
  },
};

const vazio = (/** @type {unknown} */ v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/** Converte e valida um valor não vazio. @param {Campo} c @param {any} v @returns {{ valor: any } | { erro: string }} */
function converter(c, v) {
  switch (c.tipo) {
    case 'texto': {
      const t = typeof v === 'string' ? v.trim() : '';
      if (!t) return { erro: `Informe ${c.rotulo.toLowerCase()}.` };
      if (c.max && t.length > c.max) return { erro: `"${c.rotulo}" deve ter até ${c.max} caracteres.` };
      if (c.padrao && !c.padrao.test(t)) return { erro: `"${c.rotulo}" em formato inválido. ${c.dica || ''}`.trim() };
      if (c.regex) {
        try { new RegExp(t); } catch { return { erro: `"${c.rotulo}" não é uma expressão regular válida.` }; }
      }
      return { valor: t };
    }
    case 'numero': {
      const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN);
      const min = c.min ?? 1;
      if (!Number.isInteger(n) || n < min) return { erro: `"${c.rotulo}" deve ser um número inteiro maior ou igual a ${min}.` };
      return { valor: n };
    }
    case 'opcao':
      return (c.opcoes || []).includes(v) ? { valor: v } : { erro: `"${c.rotulo}" deve ser um de: ${(c.opcoes || []).join(', ')}.` };
    case 'booleano':
      return typeof v === 'boolean' ? { valor: v } : { erro: `"${c.rotulo}" deve ser verdadeiro ou falso.` };
    case 'lista':
      return Array.isArray(v) && v.every((i) => (c.opcoes || []).includes(i))
        ? { valor: [...v] }
        : { erro: `"${c.rotulo}" deve conter apenas: ${(c.opcoes || []).join(', ')}.` };
    default:
      return { erro: `Tipo de campo desconhecido em "${c.rotulo}".` };
  }
}

/**
 * Valida o formulário de um recurso. Criação (`completo`): omite opcionais vazios e exige os obrigatórios.
 * Edição: só segue o que veio, e opcional esvaziado vira `null` (lista vazia vira `[]`).
 * @param {string} recurso @param {Record<string, any>} valores @param {{ completo?: boolean }} [opcoes]
 * @returns {{ ok: true, corpo: Record<string, any> } | { ok: false, erros: Record<string, string> }}
 */
export function validarCadastro(recurso, valores, { completo = false } = {}) {
  const def = RECURSOS[recurso];
  if (!def) throw new Error(`Recurso de cadastro desconhecido: ${recurso}`);
  /** @type {Record<string, any>} */ const corpo = {};
  /** @type {Record<string, string>} */ const erros = {};
  for (const c of def.campos) {
    const v = valores ? valores[c.nome] : undefined;
    if (v === undefined && !completo) continue;
    if (vazio(v)) {
      if (c.obrigatorio) erros[c.nome] = `Informe ${c.rotulo.toLowerCase()}.`;
      else if (!completo) corpo[c.nome] = c.tipo === 'lista' ? [] : null;
      continue;
    }
    const r = converter(c, v);
    if ('erro' in r) erros[c.nome] = r.erro;
    else corpo[c.nome] = r.valor;
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  if (!completo && !Object.keys(corpo).length) return { ok: false, erros: { _geral: 'Informe ao menos um campo para gravar.' } };
  return { ok: true, corpo };
}

/** Endereço relativo do recurso (a tela prefixa com `API.painel`). Metas nunca levam id. @param {string} recurso @param {number|string} [id] */
export function urlCadastro(recurso, id) {
  const base = `/operacional/admin/${recurso}`;
  return id === undefined || id === null || RECURSOS[recurso]?.semId ? base : `${base}/${encodeURIComponent(String(id))}`;
}
