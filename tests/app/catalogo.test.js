import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { secoesSidebar, projetoAtual, itemAtivo, migalhas, acordes, itensPaletaCatalogo, carregarCatalogo } from '../../public/app/js/core/catalogo.js';
import { ROTAS } from '../../public/app/js/rotas.js';
import { caminhoDoHash, resolver } from '../../public/app/js/core/router.js';

const CAT = JSON.parse(fs.readFileSync(new URL('../../public/app/config/projetos.json', import.meta.url), 'utf8'));

test('carregarCatalogo lê config/projetos.json e falha em resposta ruim', async () => {
  const ok = await carregarCatalogo(async (u) => { assert.equal(u, 'config/projetos.json'); return { ok: true, json: async () => CAT }; });
  assert.equal(ok.projetos.length, 3);
  await assert.rejects(carregarCatalogo(async () => ({ ok: false, status: 404 })), /404/);
});

test('seções da sidebar: ordem, rótulo do projeto e itens', () => {
  const s = secoesSidebar(CAT);
  assert.deepEqual(s.map((x) => x.secao), ['Geral', 'Projetos', 'Fluxos', 'Operação']);
  assert.equal(s[2].extra, 'ATLAS');
  assert.deepEqual(s[2].itens.map((i) => i.rotulo), ['Negativos', 'Certidões', 'Inventários', 'Cartografia']);
});

test('seção Operação: Hora a hora, Caixas ao vivo e Correções (para qualquer perfil)', () => {
  for (const o of [{}, { admin: true }]) {
    const op = secoesSidebar(CAT, o).find((s) => s.secao === 'Operação');
    assert.deepEqual(op.itens.map((i) => i.rotulo), ['Hora a hora', 'Caixas ao vivo', 'Correções']);
    assert.deepEqual(op.itens.map((i) => i.rota), ['/operacional/relatorios', '/operacional/caixas', '/operacional/correcoes']);
  }
});

test('COBALTO aparece desabilitado com selo "Em breve" e sem rota', () => {
  const cn = secoesSidebar(CAT)[1].itens.find((i) => i.rotulo === 'COBALTO');
  assert.equal(cn.desabilitado, true);
  assert.equal(cn.selo, 'Em breve');
  assert.equal(cn.rota, undefined);
});

test('Inventários é "grafo a validar" (RA-017)', () => {
  const f = secoesSidebar(CAT)[2].itens;
  assert.deepEqual(f.filter((i) => i.aValidar).map((i) => i.rotulo), ['Inventários']);
});

test('administração só para admin; "Gestão de usuários" é "Em breve" (recurso auth.usuarios)', () => {
  assert.ok(!secoesSidebar(CAT, { admin: false }).some((s) => s.secao === 'Administração'));
  const adm = secoesSidebar(CAT, { admin: true }).find((s) => s.secao === 'Administração');
  assert.equal(adm.itens[0].rota, '/usuarios/novo');
  assert.equal(adm.itens[1].rota, '/metas', 'tela de metas mensais (admin)');
  assert.equal(adm.itens[2].emBreve, 'auth.usuarios');
  assert.equal(adm.itens[2].desabilitado, true);
});

test('projetoAtual por caminho', () => {
  assert.equal(projetoAtual('/boreal/monitoramento', CAT), 'BOREAL');
  assert.equal(projetoAtual('/atlas/inventarios/fluxograma', CAT), 'ATLAS');
  assert.equal(projetoAtual('/cobalto', CAT), 'COBALTO');
  assert.equal(projetoAtual('/projetos', CAT), 'Todos');
  assert.equal(projetoAtual('/borealX', CAT), 'Todos');
});

test('itemAtivo: hub só na rota exata; módulo também nas subtelas', () => {
  assert.equal(itemAtivo({ rota: '/atlas', exato: true }, '/atlas'), true);
  assert.equal(itemAtivo({ rota: '/atlas', exato: true }, '/atlas/inventarios'), false);
  assert.equal(itemAtivo({ rota: '/atlas/inventarios' }, '/atlas/inventarios/fluxograma'), true);
  assert.equal(itemAtivo({ rota: '/atlas/inventarios' }, '/atlas/inventarios2'), false);
  assert.equal(itemAtivo({ rotulo: 'x' }, '/'), false);
});

test('migalhas', () => {
  const m = (c, t = 'T') => migalhas(c, CAT, t).map((x) => x[0]);
  assert.deepEqual(m('/projetos'), ['Projetos']);
  assert.deepEqual(m('/'), ['Projetos']);
  assert.deepEqual(m('/macro-view'), ['Projetos', 'Macro View']);
  assert.deepEqual(m('/boreal/monitoramento'), ['Projetos', 'BOREAL', 'Monitoramento de APIs']);
  assert.deepEqual(m('/atlas/inventarios'), ['Projetos', 'ATLAS', 'Papel', 'Inventários']);
  assert.deepEqual(m('/atlas/negativos'), ['Projetos', 'ATLAS', 'Negativos']);
  assert.deepEqual(m('/atlas/negativos/fluxograma'), ['Projetos', 'ATLAS', 'Negativos', 'Fluxograma']);
  assert.deepEqual(m('/perfil'), ['Projetos', 'Meu perfil']);
  assert.deepEqual(m('/usuarios/novo', 'Criar novo usuário'), ['Projetos', 'Administração', 'Criar novo usuário']);
  assert.deepEqual(m('/qualquer', 'Página não encontrada'), ['Projetos', 'Página não encontrada']);
});

test('migalhas: último item nunca tem link; os anteriores com rota têm', () => {
  const l = migalhas('/atlas/negativos/fluxograma', CAT, 'T');
  assert.equal(l[l.length - 1][1], null);
  assert.equal(l[1][1], '/atlas');
  assert.equal(l[2][1], '/atlas/negativos');
  assert.equal(migalhas('/atlas', CAT, 'T')[1][1], null);
});

test('acordes G + letra: das letras do catálogo; G U só para admin; COBALTO fora', () => {
  const a = acordes(CAT);
  assert.deepEqual(a, { p: '/projetos', m: '/macro-view', b: '/envio', s: '/boreal/monitoramento', e: '/atlas', o: '/boreal/monitoramento' });
  assert.equal(acordes(CAT, { admin: true }).u, '/usuarios/novo');
  assert.equal(a.u, undefined);
});

test('atalhos do catálogo não colidem', () => {
  const letras = Object.keys(acordes(CAT, { admin: true }));
  assert.equal(new Set(letras).size, letras.length);
});

test('o catálogo não aponta mais para páginas do sistema antigo (migração completa)', () => {
  for (const p of CAT.projetos) for (const i of [p, ...p.modulos, ...p.fluxos]) assert.equal(i.legado, undefined, `${i.rota} ainda tem "legado"`);
});

test('paleta: itens do catálogo, "Em breve" de fluxo a validar e ação admin', () => {
  const it = itensPaletaCatalogo(CAT, () => {}, { admin: true });
  assert.ok(it.some((i) => i.id === 'mod.monitoramento' && i.grupo === 'Módulos' && i.sub === 'BOREAL · Inscrição Online'));
  assert.ok(it.some((i) => i.id === 'flx.inventarios' && i.sub === 'ATLAS · grafo a validar'));
  assert.ok(it.some((i) => i.id === 'adm.novo'));
  assert.ok(!itensPaletaCatalogo(CAT, () => {}).some((i) => i.id === 'adm.novo'));
  assert.ok(!it.some((i) => i.id === 'nav.cobalto'), 'COBALTO não é destino navegável');
});

test('paleta executa a navegação', () => {
  let ido = null;
  itensPaletaCatalogo(CAT, (r) => { ido = r; }).find((i) => i.id === 'mod.monitoramento').aoExecutar();
  assert.equal(ido, '/boreal/monitoramento');
});

test('toda rota do catálogo existe na tabela de rotas', () => {
  const rotas = ROTAS.filter((r) => !r.dev);
  for (const p of CAT.projetos) for (const i of [p, ...p.modulos, ...p.fluxos]) {
    assert.ok(resolver(caminhoDoHash(i.rota), rotas), i.rota);
    assert.ok(resolver(caminhoDoHash(`${i.rota}/fluxograma`), rotas) || !/(digitalizacao|indexacao|negativos|certidoes|inventarios|cartografia)$/.test(i.rota), `${i.rota}/fluxograma`);
  }
});

test('rotas: "/" redireciona para /projetos; admin só em /usuarios/novo e /metas; títulos únicos por caminho', () => {
  assert.equal(ROTAS.find((r) => r.caminho === '/').redireciona, '/projetos');
  assert.deepEqual(ROTAS.filter((r) => r.acesso === 'admin').map((r) => r.caminho), ['/metas', '/operacional/cadastros', '/usuarios/novo']);
  const caminhos = ROTAS.map((r) => r.caminho);
  assert.equal(new Set(caminhos).size, caminhos.length);
  for (const r of ROTAS) assert.ok(r.carregar || r.redireciona, r.caminho);
});
