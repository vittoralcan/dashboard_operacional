import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requisitosSenha, forcaSenha, validarNovaSenha, sugerirLogin, validarNovoUsuario, campoDoConflito, SENHA_MIN, SENHA_MAX_BYTES, bytesUtf8 } from '../../public/app/js/core/senha.js';

test('requisitos: tamanho (12), caixa, número e símbolo', () => {
  const ok = (s) => Object.fromEntries(requisitosSenha(s).map((r) => [r.id, r.ok]));
  assert.deepEqual(ok(''), { tam: false, caixa: false, num: false, simb: false });
  assert.deepEqual(ok('abcdefghijkl'), { tam: true, caixa: false, num: false, simb: false });
  assert.deepEqual(ok('abcdefgh'), { tam: false, caixa: false, num: false, simb: false }, '8 caracteres já não bastam (BE-10)');
  assert.deepEqual(ok('Abcdefghi1!z'), { tam: true, caixa: true, num: true, simb: true });
  assert.equal(ok('ÁÉÍóúab12').caixa, true);
  assert.equal(ok('abc 1234').simb, false, 'espaço não é símbolo');
});

test('força: vazia = 0; curta nunca passa de "Muito fraca"', () => {
  assert.equal(forcaSenha('').nivel, 0);
  assert.equal(forcaSenha('').rotulo, '');
  assert.deepEqual([forcaSenha('Aa1!').nivel, forcaSenha('Aa1!').rotulo], [1, 'Muito fraca']);
  assert.equal(forcaSenha('Abcdefg1!xy').nivel, 1, '11 caracteres: abaixo do mínimo');
});

test('força: cresce com os requisitos e com o comprimento', () => {
  assert.equal(forcaSenha('abcdefghijkl').nivel, 1);
  assert.equal(forcaSenha('abcdefghijk1').nivel, 1);
  assert.equal(forcaSenha('Abcdefghijk1').nivel, 2);
  assert.equal(forcaSenha('Abcdefghi1!z').nivel, 3);
  assert.deepEqual([forcaSenha('Abcdefghijk1!xyz').nivel, forcaSenha('Abcdefghijk1!xyz').rotulo], [4, 'Forte']);
  for (const s of ['a', 'abcdefgh', 'Abc123!@#xyzXYZ']) assert.ok(forcaSenha(s).nivel >= 1 && forcaSenha(s).nivel <= 4);
});

test('bloqueantes: ≥ 12 caracteres, ≤ 72 bytes e igualdade', () => {
  assert.deepEqual(validarNovaSenha('12345678901', '12345678901'), { campo: 'senha', mensagem: 'A senha deve ter no mínimo 12 caracteres.' });
  assert.deepEqual(validarNovaSenha('123456789012', '12345678901x'), { campo: 'repita', mensagem: 'As senhas não coincidem. Digite novamente.' });
  assert.equal(validarNovaSenha('abcdefghijkl', 'abcdefghijkl'), null, 'fraca mas válida: o servidor decide a política (senha óbvia, igual ao login…)');
  const longa = 'a'.repeat(73);
  assert.equal(validarNovaSenha(longa, longa).campo, 'senha');
  assert.equal(validarNovaSenha('a'.repeat(72), 'a'.repeat(72)), null, '72 bytes ainda vale');
  assert.equal(validarNovaSenha('é'.repeat(37), 'é'.repeat(37)).campo, 'senha', 'acento pesa 2 bytes: 37 × 2 = 74');
  assert.deepEqual([SENHA_MIN, SENHA_MAX_BYTES, bytesUtf8('é')], [12, 72, 2]);
});

test('sugerirLogin: nome.sobrenome sem acento', () => {
  assert.equal(sugerirLogin('João da Silva Souza'), 'joao.souza');
  assert.equal(sugerirLogin('  Maria   Conceição '), 'maria.conceicao');
  assert.equal(sugerirLogin('Ana'), 'ana');
  assert.equal(sugerirLogin(''), '');
  assert.equal(sugerirLogin("D'Ávila Neto"), 'davila.neto');
  assert.equal(sugerirLogin('Zé Çedilha-Xavier'), 'ze.cedilhaxavier');
  assert.ok(sugerirLogin('a'.repeat(40) + ' ' + 'b'.repeat(40)).length <= 50);
});

test('validação do novo usuário (mensagens da spec)', () => {
  const bom = { nome: 'Paulo Moura', login: 'paulo.moura', email: 'paulo@example.com', tipo: 'standard' };
  assert.deepEqual(validarNovoUsuario(bom), {});
  assert.equal(validarNovoUsuario({ ...bom, nome: 'João' }).nome, 'Informe o nome completo.');
  assert.equal(validarNovoUsuario({ ...bom, login: 'ab' }).login, 'Use ao menos 3 caracteres, sem espaços.');
  assert.equal(validarNovoUsuario({ ...bom, login: 'com espaço' }).login, 'Use ao menos 3 caracteres, sem espaços.');
  assert.equal(validarNovoUsuario({ ...bom, login: 'Júlia.Moura' }).login, 'Use ao menos 3 caracteres, sem espaços.', 'acento não passa na regex do servidor');
  assert.equal(validarNovoUsuario({ ...bom, email: 'paulo@' }).email, 'Informe um e-mail válido.');
  assert.equal(validarNovoUsuario({ ...bom, tipo: 'root' }).tipo, 'Escolha o tipo de usuário.');
  assert.deepEqual(validarNovoUsuario({ ...bom, tipo: 'turno' }), {}, 'conta de turno (tablet)');
  assert.equal(validarNovoUsuario({ ...bom, tipo: '' }).tipo, 'Escolha o tipo de usuário.');
  assert.equal(Object.keys(validarNovoUsuario({ nome: '', login: '', email: '', tipo: '' })).length, 4);
  assert.equal(validarNovoUsuario({ ...bom, cargo: 'x'.repeat(101) }).cargo, 'O cargo deve ter no máximo 100 caracteres.');
  assert.deepEqual(validarNovoUsuario({ ...bom, cargo: 'Supervisor de Produção' }), {}, 'cargo é opcional');
});

test('login em maiúsculas é aceito (o servidor normaliza)', () => {
  assert.deepEqual(validarNovoUsuario({ nome: 'A B', login: 'JOAO.X', email: 'a@b.co', tipo: 'admin' }), {});
});

test('campoDoConflito (409)', () => {
  assert.equal(campoDoConflito('Este login já está em uso.'), 'login');
  assert.equal(campoDoConflito('Este e-mail já está cadastrado.'), 'email');
});
