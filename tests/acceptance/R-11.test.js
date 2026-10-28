// Criar usuário: opção "Conta de turno".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const APP = path.resolve(__dirname, '../..', 'public/app');
const tela = () => fs.readFileSync(path.join(APP, 'js/features/usuarios/criar-usuario.js'), 'utf8');
const bom = { nome: 'Equipe Um', login: 'equipe.um', email: 'e1@example.com' };

test('CA1: validarNovoUsuario aceita turno e recusa tipos inválidos', async () => {
  const { validarNovoUsuario } = await import(pathToFileURL(path.join(APP, 'js/core/senha.js')).href);
  for (const tipo of ['turno', 'admin', 'standard']) assert.deepEqual(validarNovoUsuario({ ...bom, tipo }), {}, tipo);
  for (const tipo of ['root', '', 'Turno ']) assert.equal(validarNovoUsuario({ ...bom, tipo }).tipo, 'Escolha o tipo de usuário.', tipo);
});

test('CA2: o seletor tem as três opções, incluindo "Conta de turno"', () => {
  const s = tela();
  for (const t of ['admin', 'standard', 'turno']) assert.match(s, new RegExp(`data-tipo="${t}"`), t);
  assert.match(s, /Conta de turno/);
});

test('CA3: a opção explica que é a conta do tablet do turno', () => {
  assert.match(tela(), /tablet/i);
});

test('CA4: o tipo escolhido é o enviado e o texto de sucesso não depende só de admin/standard', () => {
  const s = tela();
  assert.match(s, /criarUsuario\(\{[^}]*\btipo\b/);
  assert.match(s, /tipo\s*=\s*\/\*\*[^*]*\*\/\s*\(op\.dataset\.tipo\)|tipo\s*=\s*.*dataset\.tipo/);
});
