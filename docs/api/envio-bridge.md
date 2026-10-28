# API: acompanhamento do envio (Bridge)

> O Bridge é um aplicativo desktop, instalado no cliente e mantido em outro repositório. Ele envia ao ownCloud as pastas que saíram da esteira de digitalização e relata cada estado ao painel. Visão de integração em [../arquitetura/integracoes.md](../arquitetura/integracoes.md) §2.

| Rota | Quem | Corpo / parâmetros | Faz |
|---|---|---|---|
| `POST /auth/sessao-servico` (A9, `back_auth`) | admin | `{ instancia, descricao, escopo: "envio" }` | Emite a credencial de longa duração do Bridge (escopo `envio`) |
| `POST /envio/eventos` (B12) | credencial `servico` | `{ instancia, eventos: [{ pasta, status, eventoTs, resultado?, fluxo?, projeto?, mensagem?, arquivos?, bytes? }] }` | Grava eventos de forma idempotente. Evento com dado inválido é rejeitado sozinho e o lote segue; falha de infraestrutura sobe como 5xx para o Bridge reenviar |
| `POST /envio/heartbeat` (B13) | credencial `servico` | `{ instancia, versao }` | Sinal de vida da instalação |
| `GET /envio/resumo` (B14) | usuário do painel | `?instancia=…&horas=24` (1 a 168) | Cartões (enviadas hoje, pendentes, divergências, taxa de conferência), funil, vazão em baldes de 1 min, 5 min ou 1 h, eventos recentes e o heartbeat |

`status` ∈ `na_fila`, `enviando`, `conferindo`, `concluida`, `divergente`, `erro`. `instancia`: minúsculas, números e hífen, de 3 a 60 caracteres.

**Segurança:** a credencial só escreve e só em `/envio/*`; a `instancia` do corpo precisa bater com a do token; há rate limit em `/envio/eventos`; a mensagem só é devolvida à tela quando é um alerta (`[ALERTA] …`), e o front sempre escapa o texto.
