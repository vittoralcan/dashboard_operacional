const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO = path.resolve(__dirname, '../../services/back_dashboard/ops/02-db-dashboard-operacional.sql');
const TABELAS = ['op_projeto', 'op_turno', 'op_colaborador', 'op_mesa', 'op_meta', 'op_caixa_registro'];

// SQL sem comentários de linha, em minúsculas e com espaços normalizados — os testes olham estrutura, não formatação.
const lerSql = () => fs.readFileSync(ARQUIVO, 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Corpo entre parênteses de `create table painel.<nome> ( ... );`, ou null. */
function corpoDaTabela(sql, nome) {
  const m = new RegExp(`create table (?:if not exists )?painel\\.${nome} \\((.*?)\\) ?;`).exec(sql);
  return m ? m[1] : null;
}

test('CA1: o arquivo existe, roda como usr_dashboard_app e cria as 6 tabelas', () => {
  assert.ok(fs.existsSync(ARQUIVO), 'ops/02-db-dashboard-operacional.sql não existe');
  const sql = lerSql();
  assert.match(sql, /^set role usr_dashboard_app;/);
  assert.match(sql, /reset role;$/);
  for (const t of TABELAS) assert.ok(corpoDaTabela(sql, t), `tabela painel.${t} não encontrada`);
});

test('CA2: colunas e restrições do contrato', () => {
  const sql = lerSql();
  const esperado = {
    op_projeto: [/slug varchar\(30\) not null unique/, /nome varchar\(100\) not null/, /codigo_regex varchar\(200\)/, /integracoes jsonb not null default '\[\]'::jsonb/, /ativo boolean not null default true/],
    op_turno: [/projeto_id integer not null references painel\.op_projeto ?\(id\)/, /nome varchar\(60\) not null/, /usuario_auth_id integer unique/, /unique ?\(projeto_id, nome\)/],
    op_colaborador: [/nome varchar\(150\) not null/, /funcao varchar\(60\)/, /projeto_id integer not null references painel\.op_projeto ?\(id\)/, /turno_id integer references painel\.op_turno ?\(id\)/, /avatar varchar\(60\)/],
    op_mesa: [/codigo varchar\(10\) not null/, /check ?\(tipo in \('higienizacao', ?'remontagem'\)\)/, /unique ?\(projeto_id, codigo\)/],
    op_meta: [/check ?\(etapa in \('higienizacao', ?'scanner', ?'cq'\)\)/, /valor_dia integer not null check ?\(valor_dia > 0\)/, /check ?\(unidade in \('caixas', ?'imagens'\)\)/, /unique ?\(projeto_id, etapa\)/],
    op_caixa_registro: [/id bigserial primary key/, /colaborador_id integer not null references painel\.op_colaborador ?\(id\)/, /mesa_id integer references painel\.op_mesa ?\(id\)/, /codigo varchar\(60\) not null/, /check ?\(status in \('aberta', ?'concluida', ?'cancelada'\)\)/, /inicio_em timestamptz not null default now\(\)/, /fim_em timestamptz/, /duracao_s integer/],
  };
  for (const [tabela, padroes] of Object.entries(esperado)) {
    const corpo = corpoDaTabela(sql, tabela);
    assert.ok(corpo, `tabela ${tabela} ausente`);
    for (const p of padroes) assert.match(corpo, p, `${tabela}: falta ${p}`);
  }
});

test('CA3: índice único parcial das caixas abertas e índices de consulta', () => {
  const sql = lerSql();
  assert.match(sql, /create unique index (?:if not exists )?uq_op_caixa_aberta on painel\.op_caixa_registro ?\(projeto_id, etapa, codigo\) where status = 'aberta'/);
  assert.match(sql, /create index [^;]*on painel\.op_caixa_registro ?\(projeto_id, inicio_em desc\)/);
  assert.match(sql, /create index [^;]*on painel\.op_caixa_registro ?\(colaborador_id, inicio_em desc\)/);
});

test('CA4: só aditivo e só painel.op_*', () => {
  const sql = lerSql();
  for (const proibido of [/\bdrop\b/, /\balter table\b/, /\bdelete\b/, /\btruncate\b/]) assert.doesNotMatch(sql, proibido);
  for (const [, nome] of sql.matchAll(/painel\.([a-z_]+)/g)) assert.match(nome, /^op_/, `painel.${nome} fora de painel.op_*`);
});
