// Tela mínima de cadastros operacionais (admin): regras do formulário (core/cadastros-op.js) e contrato da tela.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.resolve(__dirname, '../..');
const APP = path.join(RAIZ, 'public/app');
const mod = () => import(pathToFileURL(path.join(APP, 'js/core/cadastros-op.js')).href);

test('CA1: RECURSOS lista projetos, turnos, colaboradores, mesas e metas, cada um com rótulo e campos', async () => {
  const { RECURSOS } = await mod();
  assert.deepEqual(Object.keys(RECURSOS), ['projetos', 'turnos', 'colaboradores', 'mesas', 'metas']);
  for (const [nome, r] of Object.entries(RECURSOS)) {
    assert.ok(r.rotulo, nome);
    assert.ok(Array.isArray(r.campos) && r.campos.length >= 3, nome);
    for (const c of r.campos) assert.ok(c.nome && c.rotulo && c.tipo, `${nome}.${c.nome}`);
  }
});

test('CA2: validarCadastro (criação) apara textos, converte números e omite opcionais vazios', async () => {
  const { validarCadastro } = await mod();
  const r = validarCadastro('colaboradores', { projetoId: '5', nome: '  Ana Souza ', funcao: '', turnoId: '8' }, { completo: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.corpo, { projetoId: 5, nome: 'Ana Souza', turnoId: 8 });
  const m = validarCadastro('mesas', { projetoId: 5, codigo: ' M01 ', tipo: 'higienizacao' }, { completo: true });
  assert.deepEqual(m.corpo, { projetoId: 5, codigo: 'M01', tipo: 'higienizacao' });
});

test('CA3: validarCadastro recusa obrigatório ausente, texto longo, opção fora da lista e número inválido, por campo', async () => {
  const { validarCadastro } = await mod();
  const a = validarCadastro('colaboradores', { projetoId: '5', nome: '   ' }, { completo: true });
  assert.equal(a.ok, false);
  assert.ok(a.erros.nome);
  assert.ok(validarCadastro('mesas', { projetoId: 5, codigo: 'M0000000001', tipo: 'higienizacao' }, { completo: true }).erros.codigo);
  assert.ok(validarCadastro('mesas', { projetoId: 5, codigo: 'M1', tipo: 'outra' }, { completo: true }).erros.tipo);
  assert.ok(validarCadastro('colaboradores', { projetoId: 'abc', nome: 'X' }, { completo: true }).erros.projetoId);
  assert.ok(validarCadastro('metas', { projetoId: 5, etapa: 'higienizacao', valorDia: '0', unidade: 'caixas' }, { completo: true }).erros.valorDia);
});

test('CA4: projetos validam slug, expressão regular do código e integrações', async () => {
  const { validarCadastro } = await mod();
  const ok = validarCadastro('projetos', { slug: 'acervo', nome: 'Acervo Central', codigoRegex: '^AC-\\d{6}$', integracoes: ['captura'] }, { completo: true });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.corpo.codigoRegex, '^AC-\\d{6}$');
  assert.deepEqual(ok.corpo.integracoes, ['captura']);
  assert.ok(validarCadastro('projetos', { slug: 'Acervo Central!', nome: 'X' }, { completo: true }).erros.slug);
  assert.ok(validarCadastro('projetos', { slug: 'ok', nome: 'X', codigoRegex: '(' }, { completo: true }).erros.codigoRegex);
  assert.ok(validarCadastro('projetos', { slug: 'ok', nome: 'X', integracoes: ['nada'] }, { completo: true }).erros.integracoes);
});

test('CA5: na edição, campo opcional esvaziado vira null e só os campos informados seguem; ativo aceita booleano', async () => {
  const { validarCadastro } = await mod();
  const r = validarCadastro('colaboradores', { funcao: '', turnoId: '', ativo: false }, { completo: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.corpo, { funcao: null, turnoId: null, ativo: false });
  assert.equal(validarCadastro('colaboradores', {}, { completo: false }).ok, false, 'edição sem campo algum não grava');
});

test('CA6: urlCadastro monta os endereços de /operacional/admin, e metas grava por PUT sem id', async () => {
  const { urlCadastro } = await mod();
  assert.equal(urlCadastro('colaboradores'), '/operacional/admin/colaboradores');
  assert.equal(urlCadastro('colaboradores', 12), '/operacional/admin/colaboradores/12');
  assert.equal(urlCadastro('metas'), '/operacional/admin/metas');
});

test('CA7: a tela exporta montar(), usa o servidor do painel para listar e gravar e não concatena HTML', () => {
  const fonte = fs.readFileSync(path.join(APP, 'js/features/operacional/cadastros.js'), 'utf8');
  assert.match(fonte, /export\s+(async\s+)?function\s+montar\b/);
  assert.match(fonte, /API\.painel/);
  assert.match(fonte, /api\.post/);
  assert.match(fonte, /api\.put/);
  assert.doesNotMatch(fonte, /innerHTML\s*[+]?=\s*`[^`]*\$\{/);
  assert.ok(fs.existsSync(path.join(APP, 'css/screens/cadastros-op.css')));
});

test('CA8: existe o E2E dos cadastros com captura de tela', () => {
  const spec = fs.readFileSync(path.join(RAIZ, 'tests/e2e/cadastros-operacionais.spec.mjs'), 'utf8');
  assert.match(spec, /page\.screenshot/);
  assert.match(spec, /#\/operacional\/cadastros/);
});
