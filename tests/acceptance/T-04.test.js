const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '../..');
const SEED = path.join(raiz, 'services/back_auth/ops/seed-admin.js');

function arquivos(dir, aceita, saida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivos(p, aceita, saida);
    else if (aceita(e.name)) saida.push(p);
  }
  return saida;
}

test('CA1: o extrator legado foi removido', () => {
  assert.equal(fs.existsSync(path.join(raiz, 'services/back_dashboard/ops/extrair-grafo-atlas.js')), false);
});

test('CA2: ninguém mais referencia o extrator', () => {
  const alvos = arquivos(path.join(raiz, 'services'), (n) => /\.(js|mjs|cjs|json|service|timer)$/.test(n) && n !== 'package-lock.json');
  alvos.push(path.join(raiz, 'package.json'));
  for (const f of alvos) assert.ok(!fs.readFileSync(f, 'utf8').includes('extrair-grafo-atlas'), `${path.relative(raiz, f)} ainda cita o extrator`);
});

test('CA3: o admin do seed nasce com troca de senha obrigatória', () => {
  const src = fs.readFileSync(SEED, 'utf8');
  const insert = /INSERT INTO usuarios \(([^)]*)\)\s*VALUES \(([^)]*)\)/.exec(src);
  assert.ok(insert, 'INSERT não encontrado');
  const colunas = insert[1].split(',').map((s) => s.trim());
  const valores = insert[2].split(',').map((s) => s.trim());
  assert.equal(colunas.length, valores.length);
  assert.equal(valores[colunas.indexOf('precisa_trocar_senha')], 'true');
  assert.equal(valores[colunas.indexOf('tipo')], "'admin'");
});

test('CA4: exige os 4 argumentos e senha de 12+ caracteres', () => {
  const src = fs.readFileSync(SEED, 'utf8');
  assert.match(src, /!nome \|\| !login \|\| !email \|\| !senha/);
  assert.match(src, /senha\.length < 12/);
  assert.doesNotMatch(src, /senha\.length < 8/);
});
