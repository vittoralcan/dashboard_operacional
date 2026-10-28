# Documentação do showcase

> Documentação técnica do Painel Operacional na versão de apresentação. Todos os nomes de clientes, sistemas comerciais, pessoas e domínios são fictícios. Para uma visão rápida, comece pelo [README da raiz](../README.md).

## Comece por aqui

| Quero… | Leia |
|---|---|
| Entender o sistema em cinco minutos | [arquitetura/visao-geral.md](arquitetura/visao-geral.md) |
| Ver como os dados entram, onde ficam e quem escreve | [arquitetura/banco-de-dados.md](arquitetura/banco-de-dados.md) |
| Entender as conexões com sistemas externos | [arquitetura/integracoes.md](arquitetura/integracoes.md) |
| Mexer no backend | [arquitetura/backend.md](arquitetura/backend.md) |
| Chamar a API | [api/back-dashboard.md](api/back-dashboard.md) · [api/auth.md](api/auth.md) · [api/envio-bridge.md](api/envio-bridge.md) |
| Mexer no frontend | [frontend/arquitetura-frontend.md](frontend/arquitetura-frontend.md) · [frontend/catalogo-de-funcoes.md](frontend/catalogo-de-funcoes.md) |
| Entender as regras de negócio | [produto/regras-de-negocio.md](produto/regras-de-negocio.md) · [decisoes.md](decisoes.md) |
| Segurança | [arquitetura/seguranca.md](arquitetura/seguranca.md) |
| Regras de código | [arquitetura/regras-de-arquitetura.md](arquitetura/regras-de-arquitetura.md) |
| CI/CD, deploy e operação | [arquitetura/ci-cd.md](arquitetura/ci-cd.md) |
| Rodar a demonstração | [modo-demonstracao.md](modo-demonstracao.md) |

## Convenção de IDs citados no código

| Prefixo | Significado | Onde |
|---|---|---|
| `RN-0xx` | Regra de negócio | [produto/regras-de-negocio.md](produto/regras-de-negocio.md) |
| `RA-`, `RO-`, `RAM-` | Regra de arquitetura, de execução e de módulo | [arquitetura/regras-de-arquitetura.md](arquitetura/regras-de-arquitetura.md) |
| `RNB-0xx` / `RNB-B*` | Regras do frontend / princípios do backend | [frontend/arquitetura-frontend.md](frontend/arquitetura-frontend.md) / [arquitetura/backend.md](arquitetura/backend.md) |
| `FE-`, `BE-`, `OPS-` | Controle de segurança | [arquitetura/seguranca.md](arquitetura/seguranca.md) |
| `AUT NAV PRD USR THM NTF HUB MAC FLX MON CMP ENV` + nº | Função do produto | [frontend/catalogo-de-funcoes.md](frontend/catalogo-de-funcoes.md) |
| `A1…A9`, `B1…B14` | Endpoint do `back_auth` / `back_dashboard` | [api/](api/) |
| `RF-`, `RNF-`, `F0-…`, `R-…`, `T-…` | Requisito ou tarefa de origem de um teste de aceite | `tests/acceptance/` |

Alguns comentários citam seções de especificações internas do projeto original (por exemplo `frontend_spec.md §8.2`, `api_noir.md` ou `design_system.md`). Esses documentos não fazem parte do showcase; o conteúdo relevante deles está resumido aqui.
