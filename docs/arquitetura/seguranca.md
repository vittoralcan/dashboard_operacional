# Segurança

> Controles implementados no código. Os IDs (`FE-`, `BE-`, `OPS-`) vêm da revisão de segurança do projeto original e aparecem em comentários do código. Este showcase documenta **o que foi feito**; o inventário de pendências do ambiente real não faz parte dele.

## Frontend

| ID | Controle |
|---|---|
| FE-01/03/04 · RNB-004 | **XSS impedido por construção.** Todo HTML dinâmico passa pela *template tag* `html` (`core/html.js`), que escapa por padrão; `raw()` só para HTML confiável. Um teste estático (`tests/app/estatico.test.js`) reprova `innerHTML` com interpolação fora dela, handlers inline, `eval`, `new Function` e `document.write` |
| FE-05 · RNB-014 | **Nenhum terceiro em tempo de execução.** Fontes, sprite de ícones e bibliotecas (`xlsx`, `html5-qrcode`) ficam em `public/app/`, com a versão no nome e hash SRI conferido por teste |
| FE-05b | **CSP versionada** no `.htaccess` (`default-src 'self'`, `script-src 'self'`, `connect-src` só com as bases de API). O E2E aplica essa mesma política **em modo bloqueio**, e qualquer violação reprova o teste. Também `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` e COOP |
| FE-06 | **O token só vai para as APIs do projeto.** O cliente HTTP anexa `Authorization` apenas a URLs que começam com as bases de `js/config.js`; o Apps Script do monitor legado nunca recebe o token |
| FE-11 | Exportação XLSX com SheetJS fixado (versão sem a CVE conhecida) e CSV protegido contra injeção de fórmula |

## Backend

| ID | Controle |
|---|---|
| BE-01 | Rate limit no login por IP e por login (`429` + `Retry-After`), log de falhas, hash *dummy* do bcrypt contra enumeração de usuário por tempo de resposta |
| BE-02 | Algoritmo do JWT fixado em todo `jwt.verify`; o `back_auth` revalida `tipo` e `ativo` no banco a cada requisição |
| BE-03 · BE-07 | Handler de erro final sem stack, `x-powered-by` desligado, `NODE_ENV=production` na unit, `/health` sem mensagem do driver |
| BE-04 | Relatório limitado a 92 dias e sem data futura; pools com timeout de conexão e de ociosidade; `statement_timeout` de 30 s |
| BE-09 | `helmet` em todos os serviços |
| BE-10 | Política de senha: mínimo de 12 caracteres, teto de 72 bytes, diferente do login e da senha atual, fora de uma lista de senhas óbvias |
| BE-13 | Os serviços escutam só em `127.0.0.1` (variável `HOST`); o acesso externo passa pelo Nginx |
| RO-006 · RA-010 | Segredos só por `requireEnv()`, que falha no boot se a variável faltar (sem valor padrão); `CORS_ORIGIN` sempre lista explícita, nunca `*` |
| — | SQL sempre parametrizado (verificado nos testes de aceite); ações sensíveis do operacional exigem confirmação de senha e ficam na auditoria |
| — | Monitor de APIs com defesa contra SSRF: só `GET`, só http/https, IP privado recusado após resolver o DNS, sem seguir redirecionamento, URLs só por cadastro de admin |
| — | Credencial de serviço do Bridge com escopo mínimo, só escrita e bloqueada fora de `/envio/*` |

## Infraestrutura e CI

| ID | Controle |
|---|---|
| OPS-05/06 | Workflows com `permissions: contents: read` (menor privilégio) |
| — | Testes do frontend em runner **hospedado** (nunca self-hosted) e obrigatórios antes do deploy |
| — | Segredos de produção ficam em `/etc/dashboard/*.env` (root, `chmod 600`); o pipeline nunca os lê |
| — | `ufw` (`deploy/firewall/ufw.sh`): entram só SSH com limite, 80/443 e a interface da VPN; as portas dos serviços ficam em loopback |
| — | Hardening das units systemd: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `MemoryMax` |
| — | Backup diário dos bancos operacionais (`deploy/backup/`), com restauração testada |

## Dados pessoais (LGPD)

O espelho só traz da origem o id e o nome de quem aparece na produção filtrada. A auditoria guarda login (finalidade: segurança e operação, com retenção declarada de 180 dias) e nunca senha, token ou e-mail no `detalhe`. Na vertente operacional, nomes individuais não ficam expostos a terceiros na tela do tablet.

## Limites conhecidos do desenho

O JWT é HS256 com segredo compartilhado entre `back_auth` e `back_dashboard`, e o token (8 h) fica no `localStorage`. Revogação imediata, refresh token rotativo e chave assimétrica (RS256/EdDSA) estão desenhados como evolução, mas não implementados.
