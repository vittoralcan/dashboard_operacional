// Acesso por tipo de conta (turno, gestão), menu "Operação"/"Cadastros operacionais" e camada do tablet no roteador.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.resolve(__dirname, '../..');
const CAT = JSON.parse(fs.readFileSync(path.join(RAIZ, 'public/app/config/projetos.json'), 'utf8'));
const carregar = (f) => import(pathToFileURL(path.join(RAIZ, 'public/app/js/core', f)).href);
const R = (acesso, caminho = '/x') => ({ acesso, caminho });
const OPC = { telaLogin: true, telaPrimeiroAcesso: true };
const turno = { tipo: 'turno' };
const admin = { tipo: 'admin' };
const gestor = { tipo: 'standard' };
const itens = (secoes) => secoes.flatMap((s) => s.itens);

test('CA1: conta de turno só entra em rotas "turno"; qualquer outra rota e o /login mandam para /tablet', async () => {
  const { decidirAcesso } = await carregar('acesso.js');
  assert.equal(decidirAcesso(R('turno', '/tablet'), turno, OPC), true);
  for (const a of ['logado', 'admin', 'gestao']) assert.deepEqual(decidirAcesso(R(a, '/projetos'), turno, OPC).para, '/tablet', a);
  assert.deepEqual(decidirAcesso(R('publica', '/login'), turno, OPC).para, '/tablet');
  assert.equal(decidirAcesso(R('publica', '/login'), null, OPC), true);
});

test('CA2: rota "turno" aceita admin; gestor comum volta a /projetos com aviso; sem sessão vai ao login', async () => {
  const { decidirAcesso } = await carregar('acesso.js');
  assert.equal(decidirAcesso(R('turno', '/tablet'), admin, OPC), true);
  const g = decidirAcesso(R('turno', '/tablet'), gestor, OPC);
  assert.equal(g.para, '/projetos');
  assert.ok(g.aviso);
  assert.deepEqual(decidirAcesso(R('turno', '/tablet'), null, OPC), { para: '/login' });
});

test('CA3: rota "gestao" libera admin e standard, bloqueia turno e exige login; as regras antigas não mudam', async () => {
  const { decidirAcesso } = await carregar('acesso.js');
  assert.equal(decidirAcesso(R('gestao', '/operacional/relatorios'), admin, OPC), true);
  assert.equal(decidirAcesso(R('gestao', '/operacional/relatorios'), gestor, OPC), true);
  assert.deepEqual(decidirAcesso(R('gestao', '/operacional/relatorios'), null, OPC), { para: '/login' });
  assert.equal(decidirAcesso(R('logado', '/projetos'), gestor, OPC), true);
  assert.equal(decidirAcesso(R('admin', '/metas'), admin, OPC), true);
  assert.equal(decidirAcesso(R('admin', '/metas'), gestor, OPC).para, '/projetos');
});

test('CA4: a barra lateral mostra "Hora a hora" (seção Operação) a todo gestor e "Cadastros operacionais" só ao admin', async () => {
  const { secoesSidebar } = await carregar('catalogo.js');
  const comum = secoesSidebar(CAT);
  const op = comum.find((s) => s.secao === 'Operação');
  assert.ok(op, 'seção Operação');
  assert.ok(op.itens.some((i) => i.rota === '/operacional/relatorios' && i.rotulo === 'Hora a hora'));
  assert.ok(!itens(comum).some((i) => i.rota === '/operacional/cadastros'));
  const adm = secoesSidebar(CAT, { admin: true });
  const cad = itens(adm).find((i) => i.rota === '/operacional/cadastros');
  assert.ok(cad);
  assert.equal(cad.rotulo, 'Cadastros operacionais');
  assert.equal(adm.find((s) => s.secao === 'Administração').itens.includes(cad), true);
});

test('CA5: migalhas das telas novas e itens da paleta (cadastros só para admin)', async () => {
  const { migalhas, itensPaletaCatalogo } = await carregar('catalogo.js');
  const m = (c, t) => migalhas(c, CAT, t).map((x) => x[0]);
  assert.deepEqual(m('/operacional/relatorios', 'Relatório hora a hora'), ['Projetos', 'Operação', 'Relatório hora a hora']);
  assert.deepEqual(m('/operacional/cadastros', 'Cadastros operacionais'), ['Projetos', 'Administração', 'Cadastros operacionais']);
  assert.equal(migalhas('/operacional/cadastros', CAT, 'X').at(-1)[1], null);
  const ids = (o) => itensPaletaCatalogo(CAT, () => {}, o).map((i) => i.id);
  assert.ok(ids({}).includes('op.relatorios'));
  assert.ok(!ids({}).includes('op.cadastros'));
  assert.ok(ids({ admin: true }).includes('op.cadastros'));
});

test('CA6: o roteador resolve a camada "tablet" para o contêiner #tablet', () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'public/app/js/core/router.js'), 'utf8');
  assert.match(fonte, /'tablet'/);
  assert.match(fonte, /#tablet/);
  assert.match(fonte, /'turno'/);
  assert.match(fonte, /'gestao'/);
});
