import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirAcesso, ehAdmin } from '../../public/app/js/core/acesso.js';
import { textoVivo } from '../../public/app/js/core/vivo.js';

const R = (acesso, caminho = '/x') => ({ acesso, caminho });
const admin = { tipo: 'admin' };
const comum = { tipo: 'standard' };

test('rota pública sempre liberada (sem usuário)', () => assert.equal(decidirAcesso(R('publica', '/login'), null), true));

test('logado em /login vai para /projetos; com primeiro acesso pendente e a tela existindo, vai a ela', () => {
  assert.deepEqual(decidirAcesso(R('publica', '/login'), comum), { para: '/projetos' });
  assert.deepEqual(decidirAcesso(R('publica', '/login'), { tipo: 'standard', precisaTrocarSenha: true }), { para: '/projetos' });
  assert.deepEqual(decidirAcesso(R('publica', '/login'), { tipo: 'standard', precisaTrocarSenha: true }, { telaPrimeiroAcesso: true }), { para: '/primeiro-acesso' });
});

test('sem sessão: vai ao login quando a tela existe; antes disso deixa passar (rota comum)', () => {
  assert.deepEqual(decidirAcesso(R('logado'), null, { telaLogin: true }), { para: '/login' });
  assert.equal(decidirAcesso(R('logado'), null), true);
});

test('rota de admin: standard e visitante são recusados com aviso; admin passa', () => {
  const recusa = { para: '/projetos', aviso: 'Acesso restrito a administradores.' };
  assert.deepEqual(decidirAcesso(R('admin'), comum), recusa);
  assert.deepEqual(decidirAcesso(R('admin'), null), recusa);
  assert.equal(decidirAcesso(R('admin'), admin), true);
});

test('primeiro acesso pendente força a tela de troca de senha em qualquer rota (quando existe)', () => {
  const u = { tipo: 'admin', precisaTrocarSenha: true };
  assert.deepEqual(decidirAcesso(R('logado', '/atlas'), u, { telaPrimeiroAcesso: true }), { para: '/primeiro-acesso' });
  assert.equal(decidirAcesso(R('logado', '/primeiro-acesso'), u, { telaPrimeiroAcesso: true }), true);
  assert.equal(decidirAcesso(R('logado', '/atlas'), u), true);
});

test('ehAdmin', () => {
  assert.equal(ehAdmin(admin), true);
  assert.equal(ehAdmin(comum), false);
  assert.equal(ehAdmin(null), false);
});

test('textoVivo: idade do dado, nunca contador inventado (RNB-010)', () => {
  assert.equal(textoVivo(null), 'aguardando dados');
  assert.equal(textoVivo(undefined), 'aguardando dados');
  assert.equal(textoVivo(1000, 13000), 'atualizado há 12 s');
  assert.equal(textoVivo(0, 5 * 60000), 'atualizado há 5 min');
  assert.equal(textoVivo(5000, 1000), 'atualizado há 0 s');
});
