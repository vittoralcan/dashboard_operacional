# API: `back_auth`

> Base `https://auth.example.com/api` (local `http://localhost:3002/api`). Serviço de identidade compartilhado por todos os projetos, com banco próprio (`db_auth`).

| Rota | Quem | Faz |
|---|---|---|
| `POST /auth/login` | aberta | Login por `login` + `senha`. Devolve `{ token, usuario }` (JWT HS256 de 8 h). Rate limit por IP (10 por 15 min) e por login (5 por 15 min) → `429` + `Retry-After`. Resposta idêntica para login inexistente, senha errada e conta desativada |
| `GET /auth/me` | logado | Perfil completo (nome, login, e-mail, cargo, tipo, preferências, último login). Revalida `tipo` e `ativo` no banco a cada chamada |
| `PATCH /auth/me` | logado | Altera o nome |
| `PATCH /auth/me/preferencias` | logado | Tema, barra lateral recolhida e intervalo da Macro View. Chaves desconhecidas são ignoradas; máximo de 2 KB |
| `PATCH /auth/senha` | logado | Troca de senha (obrigatória no primeiro acesso) |
| `POST /auth/confirmar-senha` | logado | Confirma a senha atual e devolve um token curto de confirmação, exigido pelo `back_dashboard` nas correções operacionais (rate limit próprio) |
| `POST /auth/usuarios` | admin | Cria usuário com senha temporária gerada no servidor e enviada por e-mail (ou devolvida, se o e-mail falhar) |
| `POST /auth/sessao-servico` | admin | Emite a credencial de serviço do Bridge (escopo `envio`, atrelada a uma `instancia`). Só o hash SHA-256 do token fica no banco |
| `GET /health` | aberta | Saúde do serviço. Erros de banco não vazam detalhes |

## Política de senha

Mínimo de 12 caracteres e teto de 72 bytes (o bcrypt ignora o excedente). A senha tem de ser diferente do login e da senha atual e não pode estar numa lista de senhas óbvias. Hash com `bcryptjs`, custo 12. Senha em texto puro nunca é logada, gravada nem devolvida.

## Tipos de usuário

| `tipo` | Acesso |
|---|---|
| `admin` | Tudo, inclusive metas, cadastros, criação de usuário e credenciais de serviço |
| `standard` | Telas de gestão (leitura, relatórios, correções com confirmação de senha) |
| `turno` | Só as telas operacionais do tablet (`/operacional/terminal/*`); o resto da API recusa |
| `servico` | Não é pessoa: credencial do Bridge, aceita só em `/envio/*` |

O `back_dashboard` valida o mesmo JWT com a mesma `JWT_SECRET` e com o algoritmo fixado. Ele confia no `tipo` do token até a expiração (até 8 h); o `back_auth` revalida no banco a cada requisição.
