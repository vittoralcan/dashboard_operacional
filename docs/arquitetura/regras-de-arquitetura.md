# Regras de arquitetura e de código

> Os IDs `RO-`, `RA-` e `RAM-` aparecem nos comentários do código. Em conflito, vale a ordem: segurança > arquitetura > negócio > comportamento. Regras do frontend (`RNB-0xx`) em [../frontend/arquitetura-frontend.md](../frontend/arquitetura-frontend.md); princípios do backend (`RNB-B`) em [backend.md](backend.md).

## Convenções de código

| ID | Regra |
|---|---|
| **RO-001** | Resposta de API: `{ success: true, data }` ou `{ success: false, message }` |
| **RO-002** | Sem ORM: SQL cru direto nos drivers (`pg`, `mssql`) |
| **RO-003** | Sem framework de UI nem bundler no frontend (módulos ES nativos e CSS por tokens) |
| **RO-004** | Conectores de banco testam a conexão na inicialização |
| **RO-005 / RA-007** | Fonte externa lenta, instável ou fora do nosso controle não é consultada ao vivo: ETL separado → Postgres local → a API só faz `SELECT` |
| **RO-006 / RA-010** | Credencial nunca tem valor padrão no código (`requireEnv()`); `CORS_ORIGIN` nunca `*` |
| **RO-007** | Dado externo nunca entra em `innerHTML` sem escapar (imposto pela *template tag* `html` e por teste) |
| **RO-008** | Senha nunca é logada, gravada em texto puro nem devolvida; `bcryptjs` sempre |
| **RA-002** | Rotas de API sob `/api/` |
| **RA-004** | Relatórios recebem datas em `YYYY-MM-DD` |
| **RA-009** | Consultas que só variam um identificador saem de uma **função geradora** aplicada a uma lista. Depois de uma CTE que deduplica, colunas de tabelas sem chave única comprovada vêm por subconsulta correlacionada, nunca por `JOIN` |
| **RA-015** | Macro View resiliente por bloco: `Promise.allSettled`, bloco que falha mostra "—" e a rotação continua |
| **RA-016** | `back_auth` é o único serviço de identidade: JWT HS256 de 8 h como Bearer, `bcryptjs` custo 12, contas criadas só por admin com troca de senha no primeiro acesso, `login`/`email` normalizados |
| **RA-017** | Estilo visual do fluxograma é parâmetro de apresentação, não cópia de módulo |

## Regras de módulo

| ID | Regra |
|---|---|
| **RAM-001** | Um módulo nunca conhece o projeto que o usa: nenhum id de fluxo ou nome de negócio no código; tudo chega pela `config` do manifesto |
| **RAM-003** | Regra de promoção: nasce `custom`, vira `base` só quando um segundo projeto precisa e as diferenças cabem em parâmetros |
| **RAM-004** | O gerador de consultas preserva RA-009 |
| **RAM-005** | O backend devolve só números por fase; o grafo vive na configuração |
| **RAM-006** | Estilo visual é parâmetro, nunca dois módulos |

## Fluxo de trabalho

- Mudança em módulo `base` exige validação de paridade (mesmos números, mesmo fluxograma, mesmo relatório), porque afeta todo projeto que o usa.
- Contratos de API são aditivos; o front tolera campos novos e ausentes (RNB-013).
- Documentação muda no mesmo PR do código que ela descreve.
