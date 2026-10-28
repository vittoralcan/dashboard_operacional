const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const mod = () => import(pathToFileURL(path.resolve(__dirname, '../../public/app/js/core/cadastros-op.js')).href);

test('recurso desconhecido lança erro claro', async () => {
  const { validarCadastro } = await mod();
  assert.throws(() => validarCadastro('nada', {}, { completo: true }), /desconhecido/);
});

test('texto acima do limite do projeto e número fracionário são recusados', async () => {
  const { validarCadastro } = await mod();
  assert.ok(validarCadastro('projetos', { slug: 'ok', nome: 'x'.repeat(101) }, { completo: true }).erros.nome);
  assert.ok(validarCadastro('metas', { projetoId: 1, etapa: 'cq', valorDia: '1.5', unidade: 'caixas' }, { completo: true }).erros.valorDia);
});

test('edição: obrigatório esvaziado é erro e meta não leva id na URL', async () => {
  const { validarCadastro, urlCadastro } = await mod();
  assert.ok(validarCadastro('mesas', { codigo: '  ' }, { completo: false }).erros.codigo);
  assert.equal(urlCadastro('metas', 3), '/operacional/admin/metas');
});
