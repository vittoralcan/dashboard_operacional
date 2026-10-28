// Correções (gestão): funções puras e fiação da confirmação de senha na tela.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const APP = path.resolve(__dirname, '../..', 'public/app');
const mod = (p) => import(pathToFileURL(path.join(APP, p)).href);

test('montarRequisicao valida ação e dados', async () => {
  const { montarRequisicao } = await mod('js/core/correcoes-op.js');
  assert.equal(montarRequisicao('fechar', { id: 3 }, { resultado: 'concluida' }).caminho, '/operacional/correcoes/caixas/3/fechar');
  assert.throws(() => montarRequisicao('trocar', { id: 3 }, { colaboradorId: 0 }));
  assert.throws(() => montarRequisicao('x', { id: 3 }, {}));
});

test('mensagemFalha: 401 só é "senha incorreta" na confirmação', async () => {
  const { mensagemFalha } = await mod('js/core/correcoes-op.js');
  assert.match(mensagemFalha({ status: 401, mensagem: 'x' }, 'confirmacao'), /senha incorreta/i);
  assert.equal(mensagemFalha({ status: 401, mensagem: 'Sessão expirou' }, 'alteracao'), 'Sessão expirou');
});

test('tela usa confirmar-senha, sessao:false e cabecalhoConfirmacao', () => {
  const s = fs.readFileSync(path.join(APP, 'js/features/operacional/correcoes.js'), 'utf8');
  assert.match(s, /confirmar-senha/);
  assert.match(s, /sessao:\s*false/);
  assert.match(s, /cabecalhoConfirmacao/);
});

test('montarRequisicao: editar o número da caixa', async () => {
  const { montarRequisicao } = await import('../../public/app/js/core/correcoes-op.js');
  assert.deepEqual(montarRequisicao('codigo', { id: 9 }, { codigo: '  CX-2\n' }), { metodo: 'PATCH', caminho: '/operacional/correcoes/caixas/9/codigo', corpo: { codigo: 'CX-2' } });
  assert.throws(() => montarRequisicao('codigo', { id: 9 }, { codigo: '   ' }), /número da caixa/);
});

test('montarRequisicao: retomar em andamento (D2)', async () => {
  const { montarRequisicao } = await import('../../public/app/js/core/correcoes-op.js');
  assert.deepEqual(montarRequisicao('reabrir', { id: 9 }), { metodo: 'POST', caminho: '/operacional/correcoes/caixas/9/reabrir', corpo: {} });
  assert.throws(() => montarRequisicao('reabrir', { id: 0 }));
});
