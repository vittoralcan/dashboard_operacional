// Projeto com a mesma rota do seu único módulo (BOREAL): um item na barra lateral e migalhas com o módulo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.resolve(__dirname, '../..');
const CAT = JSON.parse(fs.readFileSync(path.join(RAIZ, 'public/app/config/projetos.json'), 'utf8'));
const catalogo = () => import(pathToFileURL(path.join(RAIZ, 'public/app/js/core/catalogo.js')).href);
const itens = (secoes) => secoes.flatMap((s) => s.itens);

test('CA1: a barra lateral tem um só item para /boreal/monitoramento e nenhuma seção "Módulos" vazia', async () => {
  const { secoesSidebar } = await catalogo();
  const s = secoesSidebar(CAT);
  assert.equal(itens(s).filter((i) => i.rota === '/boreal/monitoramento').length, 1);
  assert.ok(!s.some((x) => x.secao === 'Módulos' && x.itens.length === 0));
});

test('CA2: o item que sobrou herda a chave "monitoramento" (contador da barra) e mantém o rótulo do projeto', async () => {
  const { secoesSidebar } = await catalogo();
  const it = itens(secoesSidebar(CAT)).find((i) => i.rota === '/boreal/monitoramento');
  assert.equal(it.chave, 'monitoramento');
  assert.equal(it.rotulo, 'BOREAL');
});

test('CA3: as migalhas de /boreal/monitoramento voltam a ter o nível do módulo; as de ATLAS não mudam', async () => {
  const { migalhas } = await catalogo();
  const m = (c) => migalhas(c, CAT, 'T').map((x) => x[0]);
  assert.deepEqual(m('/boreal/monitoramento'), ['Projetos', 'BOREAL', 'Monitoramento de APIs']);
  assert.deepEqual(m('/atlas'), ['Projetos', 'ATLAS']);
  assert.deepEqual(m('/atlas/negativos'), ['Projetos', 'ATLAS', 'Negativos']);
  const ultima = migalhas('/boreal/monitoramento', CAT, 'T').at(-1);
  assert.equal(ultima[1], null, 'o último item nunca tem link');
});

test('CA4: um projeto cujo módulo tem rota diferente continua com as duas entradas (regra só vale para rota igual)', async () => {
  const { secoesSidebar } = await catalogo();
  const cat = { projetos: [{ id: 'x', sigla: 'XX', nome: 'X', status: 'ativo', icone: 'buildings', rota: '/x', modulos: [{ id: 'm', nome: 'Mod', icone: 'pulse', rota: '/x/mod' }], fluxos: [] }] };
  const rotas = itens(secoesSidebar(cat)).map((i) => i.rota);
  assert.ok(rotas.includes('/x') && rotas.includes('/x/mod'));
});
