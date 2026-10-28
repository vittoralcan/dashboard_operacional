# API: `back_dashboard`

> Base `https://painel.example.com/api` (local `http://localhost:3010/api`). Toda rota exige `Authorization: Bearer <JWT>`, exceto `GET /health`. Formato: `{ "success": true, "data": … }` ou `{ "success": false, "message": "…" }`. Um 500 traz só mensagem genérica, nunca o erro do driver (RNB-B5). Autenticação em [auth.md](auth.md), Bridge em [envio-bridge.md](envio-bridge.md).

## Convenções

| Tema | Regra |
|---|---|
| Mudança de contrato | **Aditiva** (RNB-B1): endpoint existente só ganha campos opcionais; o que quebra vira endpoint novo |
| Cache | `ETag` + `If-None-Match` → `304` nas leituras pesadas; cache em processo de ~30 s |
| Paginação | `?limite&offset` com total em `X-Total-Count` (padrão 500, máximo 5000) |
| CORS | Lista explícita de origens (`CORS_ORIGIN`), nunca `*`; expõe `X-Total-Count`, `ETag`, `Retry-After`, `X-Request-Id` |
| Rastreio | Todo pedido ganha `X-Request-Id`, que aparece no log do servidor |
| Limites | Relatório ≤ 92 dias e sem data futura; rate limit em `/relatorio` (30 por 5 min por IP) e `/envio/eventos` |
| Perfis | `admin` (tudo), `standard` (gestão, leitura), `turno` (só `/operacional/terminal/*`), `servico` (só `/envio/*`) |

## 1. Fluxos de produção (`flow-viewer`), por instância

Cada fluxo declarado no manifesto `projects/<projeto>.json` vira um conjunto de rotas em `/api/<projeto>/<instancia>/`. No showcase: `/api/atlas/{negativos,certidoes,inventarios,cartografia}/`.

| Rota | Devolve |
|---|---|
| `GET /status-fases` | Retrato atual por fase: `{ "<fasId>": { pastas, imagens } }`, com todas as fases do manifesto (zeros quando vazias) |
| `GET /fase/:id/pastas` | Pastas paradas na fase (modal do fluxograma): `[{ Fase, Projeto, Lote, Pasta, Documentos, Imagens }]` |
| `GET /fase/:id/pastas-por-lote` | O mesmo universo agrupado por lote (alimenta as fases de espera) |
| `GET /gestao` | Para cada fase de KPI: `totaisMes`, `grafico7Dias` (7 números), `graficoMes`, `porTipo`, `regra`; e `resumo` com `finalizadasMes`, `metaPastas`, `variacaoPct`, `projecaoMes`, `mesAnterior` |
| `GET /relatorio?faseId&dataInicio&dataFim` | Produção da fase no período (`YYYY-MM-DD`, inclusivo, ≤ 92 dias): `{ lista, totais }`. Gera auditoria `relatorio.gerado` |
| `GET /sincronizacao` | Idade do espelho: `{ ultimaSincronizacao, atrasado }` (atrasado após 30 min) |
| `GET /gargalos` | Gargalo da instância (RN-009) e o total de pastas paradas no fluxo (RN-008) |
| `GET /config` | Configuração do fluxograma (fases, grafo, colunas de gestão, apresentação), derivada do manifesto |

Também por projeto: `GET /api/<projeto>/macro-view/summary` (imagens de hoje por instância, para a Macro View).

## 2. Recursos de painel (globais)

| Rota | Para quê |
|---|---|
| `GET /painel/resumo` | Home em uma chamada: por instância, `emAndamento`, `finalizadosTotal`, `finalizadasMes`, `metaPastas`, `variacaoPct`, `projecaoMes`, `serie7Dias`, `sincronizacao`. Instância que falha vira `null` sem derrubar as outras |
| `GET /catalogo` | Catálogo de projetos e fluxos (o front usa a configuração local) |
| `GET /gargalos` | Gargalos de todas as instâncias (`Promise.allSettled`) |
| `GET /metas?ano&mes` · `PUT /metas` (admin) | Metas mensais por projeto e escopo; `PUT` audita `meta.definida` |
| `GET /atividades?limite&projeto` | Atividade recente a partir da auditoria (máx. 50) |
| `GET /notificacoes?limite` · `POST /notificacoes/:id/lida` · `POST /notificacoes/lidas` | Central de notificações com contagem de não lidas por usuário |
| `GET /monitoramento/apis` · `POST /monitoramento/apis/:id/testar` · `PUT /monitoramento/intervalo` (admin) | Monitor nativo de APIs: resumo, histórico, teste manual, intervalo |
| `GET /envio/resumo?instancia&horas` | Acompanhamento do Bridge ([envio-bridge.md](envio-bridge.md)) |
| `GET /health` (aberta) | Saúde do serviço, do banco e da idade de cada espelho |

## 3. Módulo operacional (`/api/operacional/*`)

| Grupo | Quem | Rotas |
|---|---|---|
| `terminal` (tablet) | perfil `turno` | `GET /colaboradores`, `GET /estado` (caixas abertas do turno), `POST /bip`, `POST /caixas`, `POST /caixas/:id/{pausar,retomar,concluir}`, `POST`/`DELETE /caixas/:id/encerrando` (para e retoma o relógio da digitalização) |
| `correcoes` | gestão, com confirmação de senha | `GET /colaboradores`, `GET /caixas?status&limite`, `PATCH /caixas/:id/{colaborador,horario,codigo}`, `POST /caixas/:id/{fechar,reabrir}`, `DELETE /caixas/:id`. Tudo auditado |
| `relatorios` | gestão | `GET /hora-a-hora`, `GET /tempo-medio`, `GET /projetos` |
| `admin` (cadastros) | admin | CRUD de `projetos`, `turnos`, `colaboradores`, `mesas` e `GET`/`PUT /metas` operacionais |

Respostas do `POST /bip`: `iniciar`, `finalizar` (com `duracaoS`), `finalizar_pendente` (digitalização: pede imagens, grampo e papel deteriorado), `outra_etapa`, `duplicado` (bip repetido em até 3 s), `ja_concluida` ou `422 inexistente` (código fora do padrão do projeto). Fluxo completo em [banco de dados](../arquitetura/banco-de-dados.md) §5.
