const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO = path.resolve(__dirname, '../../.github/workflows/verificar-backend.yml');
const ler = () => fs.readFileSync(ARQUIVO, 'utf8');

test('CA1: dispara em pull_request com os caminhos certos e permissões mínimas', () => {
  assert.ok(fs.existsSync(ARQUIVO), 'verificar-backend.yml não existe');
  const y = ler();
  assert.match(y, /^on:\s*\n\s+pull_request:/m);
  for (const p of ['services/back_dashboard/**', 'tests/**', 'package.json', 'package-lock.json', '.github/workflows/verificar-backend.yml']) {
    assert.ok(y.includes(`'${p}'`) || y.includes(`"${p}"`), `paths sem ${p}`);
  }
  assert.match(y, /^permissions:\s*\n\s+contents: read\s*$/m);
  assert.doesNotMatch(y, /contents: write/);
});

test('CA2: Postgres de serviço e PG_TESTE_URL', () => {
  const y = ler();
  assert.match(y, /^\s+services:\s*\n\s+postgres:\s*\n\s+image: postgres/m);
  assert.match(y, /pg_isready/);
  assert.match(y, /PG_TESTE_URL:\s*postgres(?:ql)?:\/\/[^\s]+@(?:localhost|127\.0\.0\.1):5432\/\w+/);
});

test('CA3: aplica o DDL do Bridge sem SET ROLE e cria o schema painel', () => {
  const y = ler();
  assert.match(y, /01-db-dashboard-envio\.sql/);
  assert.match(y, /sed [^\n]*ROLE[^\n]*01-db-dashboard-envio\.sql|01-db-dashboard-envio\.sql[^\n]*sed [^\n]*ROLE/);
  assert.match(y, /create schema (?:if not exists )?painel/i);
  assert.match(y, /psql/);
});

test('CA4: instala dependências e roda as duas suítes no Node 24', () => {
  const y = ler();
  assert.match(y, /actions\/setup-node@v4/);
  assert.match(y, /node-version:\s*24/);
  assert.match(y, /npm ci[^\n]*(?:services\/back_dashboard)|working-directory:\s*services\/back_dashboard\s*\n\s+run:\s*npm ci/);
  assert.match(y, /npm ci[^\n]*(?:services\/back_auth)|working-directory:\s*services\/back_auth\s*\n\s+run:\s*npm ci/);
  assert.match(y, /working-directory:\s*services\/back_dashboard\s*\n\s+run:\s*npm test/);
  assert.match(y, /run:\s*npm run test:aceite/);
  const usos = [...y.matchAll(/uses:\s*([^\s@]+)@/g)].map((m) => m[1]);
  for (const u of usos) assert.match(u, /^actions\//, `ação de terceiros: ${u}`);
});
