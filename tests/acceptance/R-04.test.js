// Correções só para a gestão, com confirmação de senha. App real (criarApp), bancos simulados, JWT de verdade.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const BACK = path.resolve(__dirname, '../../services/back_dashboard');
const doBack = (m) => require(require.resolve(m, { paths: [BACK] }));
process.env.JWT_SECRET = 'segredo-de-teste-r-04';
const jwt = doBack('jsonwebtoken');
const { criarApp } = require(path.join(BACK, 'src/app'));
const auth = require(path.join(BACK, 'src/core/auth.middleware'));

const REG = { id: 7, projeto_id: 5, turno_id: 8, colaborador_id: 1, mesa_id: null, etapa: 'higienizacao', codigo: 'CX-7', status: 'concluida', inicio_em: '2026-10-20T10:00:00.000Z', fim_em: '2026-10-20T10:05:00.000Z', duracao_s: 300 };
const chamadas = [];
const dbPainel = {
  async query(sql, params = []) {
    chamadas.push({ sql, params });
    if (/^\s*(UPDATE painel\.op_pausa|SELECT\s+COALESCE\(SUM)/i.test(sql)) return { rows: [{ pausado_s: 0 }] };
    if (/INSERT INTO painel\.auditoria/i.test(sql)) return { rows: [] };
    if (/DELETE FROM painel\.op_caixa_registro/i.test(sql)) return { rows: [REG], rowCount: 1 };
    if (/FROM painel\.op_caixa_registro/i.test(sql)) return { rows: /ORDER BY/i.test(sql) ? [] : [REG] };
    if (/painel\.op_turno/.test(sql)) return { rows: [] };
    if (/painel\.meta/.test(sql)) return { rows: [] };
    throw new Error(`consulta inesperada: ${sql.replace(/\s+/g, ' ').slice(0, 60)}`);
  },
};
const db = { query: async () => ({ rows: [] }) };
const derivado = crypto.createHmac('sha256', process.env.JWT_SECRET).update('confirmacao-senha').digest('hex');
const sessao = (p) => jwt.sign(p, process.env.JWT_SECRET, { expiresIn: '1h' });
const TOK = {
  admin: sessao({ sub: 1, login: 'chefe', tipo: 'admin' }),
  standard: sessao({ sub: 2, login: 'sup', tipo: 'standard' }),
  turno: sessao({ sub: 7, login: 'equipe1', tipo: 'turno' }),
};
const conf = (sub, opcoes = { expiresIn: '2m' }, segredo = derivado) => jwt.sign({ sub, login: 'x' }, segredo, opcoes);

let servidor; let base;
before(async () => {
  const app = criarApp({ db, dbPainel, manifestos: [], corsOrigins: ['http://localhost'] });
  servidor = http.createServer(app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});
after(() => new Promise((ok) => servidor.close(ok)));
async function ir(quem, metodo, caminho, confirmacao) {
  chamadas.length = 0;
  const headers = { authorization: `Bearer ${TOK[quem]}`, 'content-type': 'application/json' };
  if (confirmacao) headers['x-confirmacao-senha'] = confirmacao;
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers, body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify({ colaboradorId: 2 }) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const C = '/operacional/correcoes';

test('CA1: conta de turno recebe 403 nas correções, sem tocar no banco, mesmo com confirmação', async () => {
  for (const [m, c] of [['GET', `${C}/caixas`], ['DELETE', `${C}/caixas/7`], ['PATCH', `${C}/caixas/7/colaborador`]]) {
    const r = await ir('turno', m, c, conf(7));
    assert.equal(r.status, 403, `${m} ${c}`);
    assert.equal(chamadas.length, 0, `${m} ${c} não pode consultar o banco`);
  }
});

test('CA2: admin e standard leem a lista sem confirmação', async () => {
  for (const quem of ['admin', 'standard']) {
    const r = await ir(quem, 'GET', `${C}/caixas`);
    assert.equal(r.status, 200, `${quem}: ${JSON.stringify(r.json)}`);
  }
});

test('CA3: alterar sem confirmação válida dá 403 "confirmacao", sem tocar no banco', async () => {
  const tentativas = [
    undefined,
    'lixo',
    conf(2, { expiresIn: '-10s' }),
    conf(1),                                                  // de outro usuário (o chamador é o 2)
    jwt.sign({ sub: 2, login: 'sup', tipo: 'standard' }, process.env.JWT_SECRET), // token de sessão comum
  ];
  for (const t of tentativas) {
    for (const [m, c] of [['DELETE', `${C}/caixas/7`], ['PATCH', `${C}/caixas/7/colaborador`], ['POST', `${C}/caixas/7/fechar`]]) {
      const r = await ir('standard', m, c, t);
      assert.equal(r.status, 403, `${m} ${c} com ${String(t).slice(0, 12)}`);
      assert.equal(r.json.codigo, 'confirmacao');
      assert.equal(r.json.success, false);
      assert.equal(chamadas.length, 0);
    }
  }
});

test('CA4: com o token de confirmação do próprio usuário a exclusão é feita e auditada', async () => {
  const r = await ir('standard', 'DELETE', `${C}/caixas/7`, conf(2));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(chamadas.some((c) => /DELETE FROM painel\.op_caixa_registro/i.test(c.sql)), 'DELETE feito');
  assert.ok(chamadas.some((c) => /INSERT INTO painel\.auditoria/i.test(c.sql)), 'auditado');
});

test('CA5: bloquearTurnoForaDeOperacional barra o turno em correções e mantém o terminal', () => {
  const passar = (caminho) => {
    let status = null; let seguiu = false;
    auth.bloquearTurnoForaDeOperacional({ usuario: { tipo: 'turno' }, path: caminho }, { status(s) { status = s; return this; }, json() { return this; } }, () => { seguiu = true; });
    return { status, seguiu };
  };
  assert.deepEqual(passar('/operacional/terminal/bip'), { status: null, seguiu: true });
  assert.equal(passar('/operacional/correcoes').status, 403);
  assert.equal(passar('/operacional/correcoes/caixas/7').seguiu, false);
  assert.equal(typeof auth.exigirConfirmacaoSenha, 'function');
});
