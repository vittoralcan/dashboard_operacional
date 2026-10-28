const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO = path.resolve(__dirname, '../../services/back_dashboard/ops/03-db-dashboard-snapshot.sql');
const lerSql = () => fs.readFileSync(ARQUIVO, 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
const corpoDaTabela = (sql, nome) => new RegExp(`create table (?:if not exists )?painel\\.${nome} \\((.*?)\\) ?;`).exec(sql)?.[1] ?? null;

test('CA1: o arquivo existe, roda como usr_dashboard_app e cria painel.snapshot_fase', () => {
  assert.ok(fs.existsSync(ARQUIVO), 'ops/03-db-dashboard-snapshot.sql não existe');
  const sql = lerSql();
  assert.match(sql, /^set role usr_dashboard_app;/);
  assert.match(sql, /reset role;$/);
  assert.ok(corpoDaTabela(sql, 'snapshot_fase'), 'painel.snapshot_fase não encontrada');
});

test('CA2: colunas e restrições do contrato', () => {
  const corpo = corpoDaTabela(lerSql(), 'snapshot_fase');
  assert.ok(corpo, 'tabela ausente');
  const padroes = [
    /id bigserial primary key/,
    /projeto varchar\(30\) not null/,
    /instancia varchar\(40\) not null/,
    /fas_id integer not null/,
    /tipo varchar\(20\) not null check ?\(tipo in \('entrada', ?'processo', ?'reprocessamento', ?'erro', ?'espera', ?'terminal'\)\)/,
    /momento timestamptz not null/,
    /estoque_pastas integer not null check ?\(estoque_pastas >= 0\)/,
    /estoque_imagens bigint not null default 0/,
    /finalizadas_total integer not null check ?\(finalizadas_total >= 0\)/,
    /suspensas integer not null default 0/,
    /unique ?\(projeto, instancia, fas_id, momento\)/,
  ];
  for (const p of padroes) assert.match(corpo, p, `falta ${p}`);
});

test('CA3: índice por projeto, instância e momento decrescente', () => {
  assert.match(lerSql(), /create index [^;]*on painel\.snapshot_fase ?\(projeto, instancia, momento desc\)/);
});

test('CA4: só aditivo e só painel.snapshot_fase', () => {
  const sql = lerSql();
  for (const proibido of [/\bdrop\b/, /\balter table\b/, /\bdelete\b/, /\btruncate\b/]) assert.doesNotMatch(sql, proibido);
  for (const [, nome] of sql.matchAll(/painel\.([a-z_]+)/g)) assert.equal(nome, 'snapshot_fase', `painel.${nome} fora do escopo`);
});
