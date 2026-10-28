// @ts-check
/**
 * Catálogo de projetos, módulos e fluxos e tudo que se deriva dele:
 * seções da barra lateral, migalhas, itens da paleta, atalhos `G + letra` e atalhos.
 * Hoje vem só de `config/projetos.json`; quando `GET /catalogo` existir (recurso `catalogo`)
 * o resultado dele é mesclado por cima (RNB-007). Funções puras — sem DOM.
 *
 * @typedef {{ id: string, nome: string, sub?: string, icone: string, rota: string, atalho?: string,
 *             grupo?: string, aValidar?: boolean }} ItemCatalogo
 * @typedef {{ id: string, sigla: string, nome: string, status: 'ativo'|'em-breve', icone: string, rota: string, atalho?: string,
 *             modulos: ItemCatalogo[], fluxos: ItemCatalogo[] }} Projeto
 * @typedef {{ projetos: Projeto[] }} Catalogo
 */

/** Carrega o catálogo local. @param {(url: string) => Promise<Response>} [buscar] */
export async function carregarCatalogo(buscar = (u) => fetch(u)) {
  const res = await buscar('config/projetos.json');
  if (!res.ok) throw new Error(`projetos.json: ${res.status}`);
  return /** @type {Catalogo} */ (await res.json());
}

/** @param {Catalogo} cat @param {string} id */
export const projetoPorId = (cat, id) => cat.projetos.find((p) => p.id === id) || null;

/**
 * @typedef {object} ItemNav
 * @property {string} rotulo
 * @property {string} icone
 * @property {string} [rota]
 * @property {string} [atalho]
 * @property {boolean} [exato]       só ativo na rota exata (hubs)
 * @property {boolean} [desabilitado]
 * @property {string} [selo]         texto de selo fixo (ex.: "Em breve" do COBALTO)
 * @property {string} [emBreve]      id de recurso do backend ainda não entregue
 * @property {boolean} [aValidar]
 * @property {string} [dica]
 * @property {string} [chave]         id da instância/módulo que alimenta o contador da barra (NAV-10)
 */

/**
 * Seções da barra lateral. "Módulos" e "Fluxos" mostram o rótulo do projeto à direita.
 * @param {Catalogo} cat @param {{ admin?: boolean }} [o]
 * @returns {{ secao: string, extra?: string, itens: ItemNav[] }[]}
 */
export function secoesSidebar(cat, o = {}) {
  /** @type {{ secao: string, extra?: string, itens: ItemNav[] }[]} */
  const s = [];
  s.push({ secao: 'Geral', itens: [
    { rotulo: 'Projetos', icone: 'squares-four', rota: '/projetos', atalho: 'G P', exato: true },
    { rotulo: 'Macro View', icone: 'monitor-play', rota: '/macro-view', atalho: 'G M' },
    { rotulo: 'Envio (Bridge)', icone: 'arrow-fat-line-up', rota: '/envio', atalho: 'G B', dica: 'Envio ao ownCloud (Bridge)' },
  ] });
  s.push({ secao: 'Projetos', itens: cat.projetos.map((p) => {
    if (p.status !== 'ativo') return { rotulo: p.sigla, icone: p.icone, desabilitado: true, selo: 'Em breve', dica: `${p.sigla} · projeto ainda não iniciado` };
    // Módulo com a mesma rota do projeto não repete na barra: o item do projeto herda a chave dele (contador, NAV-10).
    const mesmo = p.modulos.find((m) => m.rota === p.rota);
    return { rotulo: p.sigla, icone: p.icone, rota: p.rota, atalho: p.atalho, exato: true, ...(mesmo && { chave: mesmo.id }) };
  }) });
  for (const p of cat.projetos.filter((x) => x.status === 'ativo')) {
    const modulos = p.modulos.filter((m) => m.rota !== p.rota);
    if (modulos.length) s.push({ secao: 'Módulos', extra: p.sigla, itens: modulos.map((m) => ({ rotulo: m.nome, icone: m.icone, rota: m.rota, atalho: m.atalho, chave: m.id })) });
    if (p.fluxos.length) {
      s.push({ secao: 'Fluxos', extra: p.sigla, itens: p.fluxos.map((f) => ({
        rotulo: f.nome, icone: f.icone, rota: f.rota, atalho: f.atalho, chave: f.id, aValidar: !!f.aValidar, dica: f.aValidar ? `${f.nome} · grafo a validar` : f.nome,
      })) });
    }
  }
  s.push({ secao: 'Operação', itens: [
    { rotulo: 'Hora a hora', icone: 'clock', rota: '/operacional/relatorios' },
    { rotulo: 'Caixas ao vivo', icone: 'package', rota: '/operacional/caixas' },
    { rotulo: 'Correções', icone: 'wrench', rota: '/operacional/correcoes' },
  ] });
  if (o.admin) {
    s.push({ secao: 'Administração', itens: [
      { rotulo: 'Criar novo usuário', icone: 'user-plus', rota: '/usuarios/novo', atalho: 'G U' },
      { rotulo: 'Metas mensais', icone: 'target', rota: '/metas' },
      { rotulo: 'Gestão de usuários', icone: 'users', desabilitado: true, emBreve: 'auth.usuarios', dica: 'Gestão de usuários' },
      { rotulo: 'Cadastros operacionais', icone: 'table', rota: '/operacional/cadastros' },
    ] });
  }
  return s;
}

/** Projeto (sigla) a que um caminho pertence, ou 'Todos'. @param {string} caminho @param {Catalogo} cat */
export function projetoAtual(caminho, cat) {
  const p = cat.projetos.find((x) => caminho === x.rota || caminho.startsWith(`${x.rota}/`));
  return p ? p.sigla : 'Todos';
}

/** O item de navegação está ativo neste caminho? @param {ItemNav} item @param {string} caminho */
export function itemAtivo(item, caminho) {
  if (!item.rota) return false;
  return caminho === item.rota || (!item.exato && caminho.startsWith(`${item.rota}/`));
}

/**
 * Migalhas de pão: `Projetos › BOREAL › Higienização › Fluxograma`. `[rótulo, href|null, ícone?]`.
 * O último item nunca tem link.
 * @param {string} caminho @param {Catalogo} cat @param {string} tituloRota
 * @returns {[string, string|null, string?][]}
 */
export function migalhas(caminho, cat, tituloRota) {
  /** @type {[string, string|null, string?][]} */
  const base = [['Projetos', '/projetos', 'squares-four']];
  if (caminho === '/' || caminho === '/projetos') return [['Projetos', null, 'squares-four']];
  if (caminho === '/macro-view') return [...base, ['Macro View', null, 'monitor-play']];
  if (caminho === '/perfil') return [...base, ['Meu perfil', null, 'user-circle']];
  if (caminho === '/envio') return [...base, ['Envio (Bridge)', null, 'arrow-fat-line-up']];
  if (caminho === '/metas') return [...base, ['Administração', null], [tituloRota, null, 'target']];
  if (caminho === '/operacional/relatorios') return [...base, ['Operação', null], [tituloRota, null, 'clock']];
  if (caminho === '/operacional/caixas') return [...base, ['Operação', null], [tituloRota, null, 'package']];
  if (caminho === '/operacional/correcoes') return [...base, ['Operação', null], [tituloRota, null, 'wrench']];
  if (caminho === '/operacional/cadastros') return [...base, ['Administração', null], [tituloRota, null, 'table']];
  if (caminho.startsWith('/usuarios')) return [...base, ['Administração', null], [tituloRota, null, 'user-plus']];
  for (const p of cat.projetos) {
    if (caminho !== p.rota && !caminho.startsWith(`${p.rota}/`)) continue;
    const lista = /** @type {[string, string|null, string?][]} */ ([...base, [p.sigla, caminho === p.rota ? null : p.rota, p.icone]]);
    if (caminho === p.rota) {
      const mesmo = p.modulos.find((m) => m.rota === p.rota);
      if (mesmo) lista.push([mesmo.nome, null, mesmo.icone]);
      return lista;
    }
    const item = [...p.modulos, ...p.fluxos].find((i) => caminho === i.rota || caminho.startsWith(`${i.rota}/`));
    if (!item) return [...lista.slice(0, -1), [p.sigla, p.rota, p.icone], [tituloRota, null]];
    const sub = caminho.slice(item.rota.length).replace(/^\//, '');
    if (p.fluxos.includes(item) && item.grupo && item.grupo !== item.nome) lista.push([item.grupo, null]);
    lista.push([item.nome, sub ? item.rota : null, item.icone]);
    if (sub) lista.push([sub === 'fluxograma' ? 'Fluxograma' : tituloRota, null]);
    return lista;
  }
  return [...base, [tituloRota, null]];
}

/**
 * Atalhos `G + letra` → rota. Letras vêm do campo `atalho` ("G H") do catálogo; mais os fixos.
 * `G U` só para admin.
 * @param {Catalogo} cat @param {{ admin?: boolean }} [o]
 * @returns {Record<string, string>}
 */
export function acordes(cat, o = {}) {
  /** @type {Record<string, string>} */
  const m = { p: '/projetos', m: '/macro-view', b: '/envio' };
  for (const p of cat.projetos) {
    for (const i of [p, ...p.modulos, ...p.fluxos]) {
      const mt = /^G ([A-Z])$/.exec(i.atalho || '');
      if (mt && !(p.status === 'em-breve' && i === p)) m[mt[1].toLowerCase()] = i.rota;
    }
  }
  if (o.admin) m.u = '/usuarios/novo';
  return m;
}

/**
 * Itens da paleta que vêm do catálogo: navegação, módulos, fluxos.
 * @param {Catalogo} cat @param {(rota: string) => void} ir @param {{ admin?: boolean }} [o]
 * @returns {import('./paleta.js').ItemPaleta[]}
 */
export function itensPaletaCatalogo(cat, ir, o = {}) {
  /** @type {import('./paleta.js').ItemPaleta[]} */
  const it = [
    { id: 'nav.projetos', grupo: 'Navegação', titulo: 'Seleção de projetos', icone: 'squares-four', atalho: 'G P', aoExecutar: () => ir('/projetos') },
    { id: 'nav.macro', grupo: 'Navegação', titulo: 'Macro View', icone: 'monitor-play', atalho: 'G M', palavras: 'tv painel gigante tela cheia', aoExecutar: () => ir('/macro-view') },
    { id: 'nav.envio', grupo: 'Navegação', titulo: 'Envio (Bridge)', sub: 'Pós-esteira · ownCloud', icone: 'arrow-fat-line-up', atalho: 'G B', palavras: 'bridge owncloud envio upload transferencia pasta caixa', aoExecutar: () => ir('/envio') },
  ];
  for (const p of cat.projetos) {
    if (p.status === 'ativo') it.push({ id: `nav.${p.id}`, grupo: 'Navegação', titulo: p.sigla, sub: p.nome, icone: p.icone, atalho: p.atalho, aoExecutar: () => ir(p.rota) });
    for (const m of p.modulos) it.push({ id: `mod.${m.id}`, grupo: 'Módulos', titulo: m.nome, sub: `${p.sigla} · ${m.sub || ''}`.replace(/ · $/, ''), icone: m.icone, atalho: m.atalho, aoExecutar: () => ir(m.rota) });
    for (const f of p.fluxos) {
      it.push({ id: `flx.${f.id}`, grupo: 'Fluxos', titulo: f.nome, sub: `${p.sigla}${f.aValidar ? ' · grafo a validar' : ''}`, icone: f.icone, aoExecutar: () => ir(f.rota) });
    }
  }
  it.push({ id: 'op.relatorios', grupo: 'Navegação', titulo: 'Hora a hora', sub: 'Operação', icone: 'clock', palavras: 'operacao relatorio producao hora', aoExecutar: () => ir('/operacional/relatorios') });
  if (o.admin) {
    it.push({ id: 'op.cadastros', grupo: 'Ações', titulo: 'Cadastros operacionais', sub: 'Administração', icone: 'table', palavras: 'operacional cadastro turno meta', aoExecutar: () => ir('/operacional/cadastros') });
    it.push({ id: 'adm.novo', grupo: 'Ações', titulo: 'Criar novo usuário', icone: 'user-plus', atalho: 'G U', aoExecutar: () => ir('/usuarios/novo') });
    it.push({ id: 'adm.metas', grupo: 'Ações', titulo: 'Metas mensais', sub: 'Administração', icone: 'target', palavras: 'meta objetivo mensal definir', aoExecutar: () => ir('/metas') });
  }
  return it;
}
