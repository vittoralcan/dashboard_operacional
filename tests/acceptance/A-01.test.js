// Tablet: falha de rede só para falha de rede de verdade; após falha não-rede o bip antigo não é reenviado.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.resolve(__dirname, '../..');
const tablet = () => import(pathToFileURL(path.join(RAIZ, 'public/app/js/features/tablet/tablet.js')).href);
const api = () => import(pathToFileURL(path.join(RAIZ, 'public/app/js/core/api.js')).href);

test('CA1: após falha que não é de rede (com ou sem acao) o código do bip é zerado; em falha de rede é mantido', async () => {
  const { classificarFalha, codigoAposFalhaEscolher } = await tablet();
  const { ErroApi } = await api();
  const semAcao = classificarFalha(new ErroApi(500, 'Erro interno'));
  const comAcao = classificarFalha(new ErroApi(409, 'Conflito', { corpo: { acao: 'duplicado' } }));
  const rede = classificarFalha(new ErroApi(0, 'Sem conexão'));
  assert.equal(codigoAposFalhaEscolher(semAcao, 'AC-000123'), '');
  assert.equal(codigoAposFalhaEscolher(comAcao, 'AC-000123'), '');
  assert.equal(codigoAposFalhaEscolher(rede, 'AC-000123'), 'AC-000123');
});

test('CA2: só status 0 (ErroApi de rede) vira a mensagem de "sem conexão"; TypeError e erro sem status usam mensagem genérica', async () => {
  const { classificarFalha } = await tablet();
  const { ErroApi } = await api();
  const rede = classificarFalha(new ErroApi(0, 'Falha de rede', { tipo: 'rede' }));
  assert.equal(rede.rede, true);
  assert.match(rede.texto, /conex/i);
  for (const bug of [new TypeError("Cannot read properties of undefined (reading 'x')"), new Error('boom'), {}, null, undefined]) {
    const r = classificarFalha(bug);
    assert.equal(r.rede, false);
    assert.doesNotMatch(r.texto, /conex/i);
    assert.match(r.texto, /Não foi possível concluir/);
  }
  const http = classificarFalha(new ErroApi(500, 'Erro interno'));
  assert.equal(http.rede, false);
  assert.equal(http.texto, 'Erro interno');
});
