# Backend

> Serviços Node.js + Express com SQL cru (sem ORM). Contratos em [../api/](../api/), bancos em [banco-de-dados.md](banco-de-dados.md), regras de código em [regras-de-arquitetura.md](regras-de-arquitetura.md).

## 1. Serviços

| Serviço | Porta | Bancos | Papel |
|---|---|---|---|
| `services/back_auth` | 3002 | `db_auth` | Identidade: login, perfil, preferências, senha, criação de usuário, credencial de serviço |
| `services/back_dashboard` | 3010 (só `127.0.0.1`, Nginx na frente) | `db_espelho` (leitura) + `db_dashboard` (escrita) | API única do painel para todos os projetos |
| `services/etl/captura` | — (oneshot) | SQL Server da origem → `db_espelho` | Sincroniza o espelho a cada 10 min |

Só `GET /api/health` e `POST /auth/login` são abertos. Antes de qualquer rota, o `back_dashboard` aplica `exigirAutenticacao`, `bloquearServicoForaDeEnvio` (credencial do Bridge só em `/envio/*`) e `bloquearTurnoForaDeOperacional` (perfil `turno` só no terminal).

## 2. Estrutura do `back_dashboard`

```text
services/back_dashboard/
├── projects/atlas.json            manifesto do projeto: instâncias do flow-viewer, fases, grafo, gargalo
├── src/
│   ├── app.js                     monta helmet, requestId, CORS, autenticação e os routers
│   ├── server.js                  boot: valida env (requireEnv), testa os pools, sobe em 127.0.0.1
│   ├── core/                      recursos de painel (metas, notificações, auditoria, gargalos, resumo,
│   │                              catálogo, monitoramento, envio), pools, cache e middleware de auth
│   ├── modules/base/flow-viewer/  módulo genérico de fluxo (queries, gargalo, período, tipologia, estados)
│   ├── operacional/               módulo operacional (terminal, bip, pausa, correções, relatórios, cadastros)
│   └── routes/                    health e Macro View
├── jobs/                          monitor, notificador, retencao, snapshot (oneshot + timer systemd)
├── ops/                           DDL numerado do schema painel
├── systemd/  nginx/               units e reverse proxy versionados
└── tests/                         node --test (CORS e envio, com banco simulado ou Postgres de teste)
```

### O manifesto e o `flow-viewer`

O `flow-viewer` é um módulo `base`: serve qualquer projeto e não conhece nenhum. `core/manifestos.js` lê todos os `projects/*.json`; para cada instância, `validarConfig()` confere fases, grafo e parâmetros **no boot** (configuração incoerente derruba o serviço antes de servir dado errado), e o módulo monta as rotas em `/api/<projeto>/<instancia>/`.

```json
{
  "projectId": "atlas",
  "modules": [{
    "moduleId": "base/flow-viewer",
    "instanceId": "negativos",
    "config": {
      "fonte": "atlas", "fluId": 4, "faseFinal": 12, "kpiFases": [7, 16, 12],
      "fases": [{ "fasId": 50, "nome": "Importação", "tipo": "entrada" }, "…"],
      "grafo": { "nos": [{ "fasId": 50, "x": 0, "y": 1 }, "…"], "juncoes": [], "arestas": [{ "de": 50, "para": 60 }, "…"] },
      "gargalo": { "piso": 20, "minParticipacao": 0.2, "minRazao": 2 }
    }
  }]
}
```

Tipos de fase: `entrada`, `processo`, `reprocessamento`, `erro` (suspensões, em vermelho no fluxograma), `espera` (estacionamento deliberado, fora dos contadores) e `terminal`. O backend devolve **só números** por fase; o desenho (nós, junções, arestas, estilo) vive na configuração (RAM-005).

**Regra de promoção (RAM-003):** todo módulo nasce `custom` e só vira `base` quando um segundo projeto precisa do mesmo padrão e as diferenças cabem em parâmetros de configuração.

## 3. Princípios (RNB-B)

| ID | Regra |
|---|---|
| **RNB-B1** | Mudança aditiva: endpoint existente só ganha campos opcionais |
| **RNB-B2** | Contrato neutro de projeto: as mesmas rotas valem para qualquer projeto do manifesto |
| **RNB-B3** | O espelho continua só leitura; tabelas novas ficam em outro banco, com outro papel |
| **RNB-B4** | Configuração em dado, não em código (grafo, colunas de gestão, gargalo) |
| **RNB-B5** | Nunca devolver `details` ou stack do driver; mensagem genérica em pt-BR, detalhe só no log |
| **RNB-B6** | Tudo que escreve, audita (`painel.auditoria`) |
| **RNB-B7** | Limites explícitos: relatório ≤ 92 dias, listas com `limite`, `statement_timeout` de 30 s, rate limit em login e rotas pesadas |

## 4. Jobs

Todos são processos *oneshot* com timer do systemd, usam `requireEnv()` e `statement_timeout` e saem com código ≠ 0 em falha (o `journalctl` registra).

| Job | Frequência | Faz |
|---|---|---|
| `jobs/monitor.js` | 5 min (respeita o intervalo configurado) | Verifica as APIs cadastradas e notifica transições |
| `jobs/notificador.js` | 5 min | Gargalo, ETL atrasado, meta atingida ([integrações](integracoes.md) §4) |
| `jobs/retencao.js` | diário | Apaga o que passou do prazo de retenção |
| `jobs/snapshot.js` | 07h e 19h | Retrato das fases na virada de turno (`painel.snapshot_fase`, 180 dias) |

## 5. Testes

- `services/back_dashboard/tests/`: CORS e o contrato do Bridge, com banco simulado. Com `PG_TESTE_URL`, roda também contra um Postgres descartável, como faz o CI.
- `tests/acceptance/`: ~190 testes de aceite que sobem os routers Express reais numa porta efêmera, com um **banco simulado por regex de SQL** (`_helpers/http.js`). Eles conferem status HTTP, formato de resposta, autorização por perfil e que os valores vão sempre como parâmetros, nunca concatenados no SQL.

```bash
cd services/back_dashboard && npm ci && cd ../..
npm run test:back
npm run test:aceite
```
