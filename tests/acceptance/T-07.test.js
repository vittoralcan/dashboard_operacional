const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const existe = (rel) => fs.existsSync(path.join(RAIZ, rel));
const e2e = () => fs.readdirSync(path.join(RAIZ, 'tests/e2e')).filter((f) => /\.(mjs|md)$/.test(f));

test('CA1: módulos puros do BOREAL e seus testes unitários foram removidos', () => {
  for (const n of ['higienizacao', 'indexacao', 'rcx', 'aips']) {
    assert.ok(!existe(`public/app/js/core/${n}.js`), `core/${n}.js deveria ter saído`);
    assert.ok(!existe(`tests/app/${n}.test.js`), `tests/app/${n}.test.js deveria ter saído`);
  }
});

test('CA2: os testes E2E não citam o host do tunel-reverso nem mockam o back_boreal', () => {
  for (const f of e2e()) assert.doesNotMatch(ler(`tests/e2e/${f}`), /tunel-reverso/i, `${f} ainda cita tunel-reverso`);
  assert.doesNotMatch(ler('tests/e2e/mock-api.mjs'), /handler\('boreal'\)/);
});

test('CA3: os testes E2E não navegam mais para as telas removidas do BOREAL', () => {
  const removidas = /\/boreal\/(higienizacao|digitalizacao|indexacao|aips|registro-caixas)|['"`]\/boreal['"`]|#\/boreal\b(?!\/monitoramento)/;
  for (const f of e2e()) assert.doesNotMatch(ler(`tests/e2e/${f}`), removidas, `${f} ainda usa rota removida`);
});

test('CA4: o E2E mantém a navegação do Monitoramento de APIs', () => {
  assert.ok(e2e().some((f) => /boreal\/monitoramento/.test(ler(`tests/e2e/${f}`)) || /monitoramento/i.test(ler(`tests/e2e/${f}`))));
});
