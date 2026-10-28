# Banco de dados: fluxo de trabalho

> Como os dados entram, onde ficam, quem lê e quem escreve. Integrações externas em [integracoes.md](integracoes.md); contrato de cada rota em [../api/](../api/).

## 1. Três bancos, três papéis

Todos são PostgreSQL na mesma VM, cada um com um papel de banco próprio e o mínimo de privilégio.

| Banco | Schema | Quem escreve | Quem lê | Natureza | Backup |
|---|---|---|---|---|---|
| `db_espelho` | `etl`, `captura_<fonte>` | ETL (`usr_etl_espelho`) | `back_dashboard` (`usr_dashboard_leitura`, só `SELECT`) | **Descartável**: a próxima carga completa o reconstrói | Não |
| `db_dashboard` | `painel` | `back_dashboard` (`usr_dashboard_app`) e jobs | `back_dashboard` | **Operacional**: metas, notificações, auditoria, módulo operacional | Diário (`pg_dump`, 14 dias) |
| `db_auth` | `public` | `back_auth` | `back_auth` | Credenciais e sessões de serviço | Diário |

O `back_dashboard` abre **dois pools** separados: `core/db-espelho.js` (leitura do espelho) e `core/db-painel.js` (escrita do painel). Ambos usam `statement_timeout = 30 s` e fuso `America/Sao_Paulo`.

## 2. Entrada: o ETL do sistema de captura

```text
                 ┌──────────────────────────── ciclo do ETL (timer systemd, 10 min) ───────────────────────────┐
SQL Server  ──►  │ 1. lê as 8 tabelas filtradas por FLU_ID (datas como texto ISO, sem deslocar fuso)          │
(cliente,        │ 2. abre UMA transação no Postgres                                                         │
 via VPN)        │ 3. INSERT … ON CONFLICT … WHERE linha IS DISTINCT FROM (só grava o que mudou)            │
                 │ 4. registra início/fim/contagens em etl.execucao; commit ou rollback do ciclo inteiro      │
                 └──────────────────────────────────────────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
                                    db_espelho.captura_<fonte>.tbl_*
```

| Característica | Como é |
|---|---|
| Código | Um só (`app.js`, `config.js`, `tabelas.js`, `sqlserver.js`, `postgres.js`), reaproveitado por fonte via arquivo de ambiente (`atlas.env`) |
| Execução | Processo *oneshot*; `etl-captura@<fonte>.timer` a cada 10 min; se o ciclo anterior ainda roda, o systemd não inicia outro. `TimeoutStartSec=8min`, `MemoryMax=512M` |
| Atomicidade | Uma transação por ciclo inteiro: ou o retrato inteiro entra, ou o anterior fica intacto |
| Escrita mínima | Ciclo sem mudança na origem gera zero escritas |
| Fonte única do schema | `tabelas.js` gera tanto o DDL do Postgres quanto o `SELECT` de extração, então os dois nunca divergem |
| Minimização de dado pessoal | Da tabela de usuários da origem só vêm o id e o nome de quem aparece na produção filtrada. Nunca hash de senha, documento, e-mail ou telefone |
| Observabilidade | `etl.execucao` alimenta `GET …/sincronizacao`, o `/api/health` e a notificação de ETL atrasado (> 30 min) |

**Tabelas espelhadas (8):** `tbl_projeto`, `tbl_fluxo`, `tbl_fase_fluxo`, `tbl_fase`, `tbl_lote`, `tbl_pasta`, `tbl_estatistica` (histórico de passagens por fase) e `tbl_usuario` (minimizada).

**Bootstrap:** `services/etl/sql/00-db-espelho.sql` (uma vez, como superusuário) cria o banco, os papéis e os schemas. Depois `node --env-file=atlas.env app.js --preparar` cria as tabelas.

## 3. Leitura: como o `flow-viewer` transforma o espelho em indicadores

O módulo `services/back_dashboard/src/modules/base/flow-viewer/` não conhece nenhum projeto (RAM-001). Tudo chega pela `config` da instância no manifesto.

1. **`queries.js`**: um gerador de consultas aplicado à lista de fases do manifesto (RA-009). Não há 20 consultas copiadas, há uma função geradora.
2. **CTE `passagem`** (RN-017): cada pasta conta **uma única vez por fase**, na data da primeira passagem que cumpre a regra do tipo da fase (entrada, processo ou final). É a mesma CTE para KPI do mês, série diária, variação, relatório e Macro View, por isso a soma da série é igual ao KPI.
3. **Deduplicação antes de exibir**: depois da CTE que deduplica o histórico, colunas de exibição de tabelas sem chave única comprovada (lote, fase) vêm por subconsulta correlacionada, nunca por `JOIN`. Um `JOIN` ali já multiplicou contagens.
4. **`gargalo.js`** (RN-009), **`periodo.js`** (variação e projeção, RN-010/011), **`tipologia.js`** (rótulo legível de projeto e lote) e **`estados.js`** (quebra por unidade da federação, opcional por instância).
5. **Cache em processo + `ETag`**: `status-fases`, `gestao`, `gargalos` e `painel/resumo` ficam ~30 s em memória, guardando a promessa em voo. Erro nunca fica em cache. O front faz polling só com a aba visível e recebe `304` quando nada mudou.

## 4. Escrita: o schema `painel`

DDL executável em `services/back_dashboard/ops/` (scripts numerados, aplicados à mão na ordem):

| Script | Tabelas | Para quê |
|---|---|---|
| `00-db-dashboard.sql` | `meta`, `notificacao`, `notificacao_leitura`, `auditoria`, `monitor_api`, `monitor_verificacao`, `monitor_config` | Metas mensais, central de notificações, trilha de auditoria, monitor nativo de APIs |
| `01-db-dashboard-envio.sql` | `envio_caixa`, `envio_heartbeat` | Eventos e sinal de vida do Bridge (idempotente por `UNIQUE (instancia, pasta, status, evento_ts)`) |
| `02-db-dashboard-operacional.sql` | `op_projeto`, `op_turno`, `op_colaborador`, `op_mesa`, `op_meta`, `op_caixa_registro` | Módulo operacional: cadastros e o registro de cada caixa por pessoa, etapa e tempo |
| `03-db-dashboard-snapshot.sql` | `snapshot_fase` | Retrato das fases na virada de turno (07h e 19h) |
| `04-db-dashboard-pausa-digitalizacao.sql` | `op_pausa` + colunas de digitalização | Pausas (manuais e automáticas) e dados da digitalização (imagens, grampo, papel deteriorado) |

Regras que valem para toda escrita:

- **Tudo que escreve, audita** (RNB-B6): `painel.auditoria` guarda quem, ação, alvo, onde e um `detalhe` JSONB sem senha, token ou e-mail. Alimenta a "Atividade recente".
- **Valores sempre parametrizados** (`$1, $2…`). Os testes de aceite conferem que nenhum valor de entrada aparece concatenado no SQL.
- **Retenção** (`jobs/retencao.js`, diário): notificações > 30 dias, verificações do monitor > 30, auditoria > 180, eventos de envio > 180.
- **Notificações deduplicadas** por `chave_unica` (`INSERT … ON CONFLICT DO NOTHING`), por exemplo um alerta de gargalo por fase por dia.

## 5. O fluxo de uma caixa no módulo operacional

```text
Operador bipa o código da caixa no tablet
   │  POST /api/operacional/terminal/bip   { codigo, etapa }
   ▼
decidirBip(): código no padrão do projeto?  ──não──► 422 "inexistente"
   │sim
   ├─ caixa nova           → "iniciar": a tela pede o colaborador → POST /terminal/caixas  (INSERT op_caixa_registro, status aberta)
   ├─ caixa aberta, mesma etapa → "finalizar": grava fim e duração líquida (descontando op_pausa)
   ├─ caixa aberta em outra etapa → "outra_etapa" (a tela avisa onde ela está)
   └─ digitalização          → "finalizar_pendente": para o relógio e pede imagens, grampo e papel deteriorado
                               POST /terminal/caixas/:id/concluir

Gestão acompanha em "Caixas ao vivo" e corrige em "Correções" (troca de colaborador, código, horário,
fechar, reabrir, excluir). Toda correção exige confirmação de senha e entra na auditoria.
Relatórios: produção hora a hora e tempo médio por etapa, a partir de op_caixa_registro.
```

Travas impostas pelo servidor, não só pela tela: um colaborador tem no máximo uma caixa aberta (409 com `ocupadoCom`); a mesma caixa não abre duas vezes; um bip repetido em até 3 s é tratado como duplicado; o código precisa casar **inteiro** com o regex do projeto.

## 6. Ordem de criação em um ambiente novo

1. `services/etl/sql/00-db-espelho.sql` e `node app.js --preparar` no ETL.
2. `services/back_dashboard/ops/00` a `04` em ordem; `services/back_auth/ops/schema.sql`.
3. Variáveis de ambiente de cada serviço (todas validadas no boot por `requireEnv()`, sem valor padrão para segredo).
4. `back_auth`, depois `back_dashboard` e os timers dos jobs.
5. Primeiro admin com `node ops/seed-admin.js` (troca de senha obrigatória no primeiro acesso).
6. Frontend por último: se uma rota ainda não existe no servidor (404), a tela mostra "Em breve" em vez de quebrar.
