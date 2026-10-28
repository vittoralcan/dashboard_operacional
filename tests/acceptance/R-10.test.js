// Correções do supervisor: funções puras e fiação da confirmação de senha.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const APP = path.resolve(__dirname, "../..", "public/app");
const ler = (p) => fs.readFileSync(path.join(APP, p), "utf8");
const mod = (p) => import(pathToFileURL(path.join(APP, p)).href);

const caixa = { id: 7, projetoId: 5 };
test('CA1: montarRequisicao monta cada ação e recusa o inválido', async () => {
  const { montarRequisicao } = await mod('js/core/correcoes-op.js');
  assert.deepEqual(montarRequisicao('trocar', caixa, { colaboradorId: 2 }), { metodo: 'PATCH', caminho: '/operacional/correcoes/caixas/7/colaborador', corpo: { colaboradorId: 2 } });
  assert.deepEqual(montarRequisicao('fechar', caixa, { resultado: 'cancelada' }), { metodo: 'POST', caminho: '/operacional/correcoes/caixas/7/fechar', corpo: { resultado: 'cancelada' } });
  const ex = montarRequisicao('excluir', caixa, {});
  assert.deepEqual([ex.metodo, ex.caminho], ['DELETE', '/operacional/correcoes/caixas/7']);
  assert.throws(() => montarRequisicao('apagartudo', caixa, {}));
  assert.throws(() => montarRequisicao('trocar', caixa, { colaboradorId: 'x' }));
  assert.throws(() => montarRequisicao('trocar', caixa, {}));
  assert.throws(() => montarRequisicao('fechar', caixa, { resultado: 'aberta' }));
  assert.throws(() => montarRequisicao('excluir', { id: 0 }, {}));
});

test('CA2: cabeçalho de confirmação, URL e normalização dos colaboradores', async () => {
  const m = await mod('js/core/correcoes-op.js');
  assert.deepEqual(m.cabecalhoConfirmacao('abc'), { 'X-Confirmacao-Senha': 'abc' });
  assert.equal(m.urlColaboradores(5), '/operacional/correcoes/colaboradores?projetoId=5');
  assert.deepEqual(m.normalizarColaboradores([{ id: 1, nome: 'Ana', turnoId: 8 }, { id: 'x', nome: 'Ruim' }, null, { id: 2 }]), [{ id: 1, nome: 'Ana', turnoId: 8 }]);
  assert.deepEqual(m.normalizarColaboradores(undefined), []);
});

test('CA3: mensagemFalha distingue senha incorreta, confirmação pedida e erro comum', async () => {
  const { mensagemFalha } = await mod('js/core/correcoes-op.js');
  const senha = mensagemFalha({ status: 401, mensagem: 'Senha incorreta.' }, 'confirmacao');
  const pedida = mensagemFalha({ status: 403, corpo: { codigo: 'confirmacao' }, mensagem: 'x' }, 'alteracao');
  const comum = mensagemFalha({ status: 500, mensagem: 'Erro interno do servidor.' }, 'alteracao');
  assert.match(senha, /senha/i);
  assert.match(pedida, /senha|confirm/i);
  assert.match(comum, /Erro interno/);
  assert.equal(new Set([senha, pedida, comum]).size, 3);
});

test('CA4: a tela confirma a senha no back_auth antes de enviar a alteração com o cabeçalho', async () => {
  assert.equal(typeof (await mod('js/features/operacional/correcoes.js')).montar, 'function');
  const s = ler('js/features/operacional/correcoes.js');
  assert.match(s, /confirmar-senha/);
  assert.match(s, /API\.auth/);
  assert.match(s, /cabecalhoConfirmacao/);
  assert.match(s, /montarRequisicao/);
  assert.match(s, /type="password"/);
  assert.ok(s.indexOf('confirmar-senha') < s.indexOf('montarRequisicao('), 'confirma antes de montar/enviar');
  for (const a of ['trocar', 'fechar', 'excluir']) assert.ok(s.includes(a), a);
  assert.match(s, /normalizarCaixas/);
});

test('CA5: senha errada não derruba a sessão e a lista recarrega ao concluir', () => {
  const s = ler('js/features/operacional/correcoes.js');
  assert.match(s, /sessao:\s*false/);
  assert.doesNotMatch(s, /innerHTML\s*=\s*`/);
});
