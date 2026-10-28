# Integrações com sistemas externos

> Cada conexão com o mundo de fora: direção, protocolo, credencial e o que acontece quando ela falha. Nomes de produtos de terceiros foram trocados por nomes genéricos ou fictícios.

## Resumo

| Sistema externo | Direção | Como | Credencial | Se cair |
|---|---|---|---|---|
| **Sistema de captura** (SQL Server do cliente) | painel ← cliente | ETL `mssql` a cada 10 min, por VPN | Login SQL só leitura, `SELECT` apenas nas 8 tabelas | O painel segue com o último retrato; a tela mostra "dado de HH:MM" e o notificador avisa ETL atrasado |
| **Bridge** (app desktop no cliente que envia as pastas ao ownCloud) | cliente → painel | HTTPS `POST /api/envio/eventos` e `/heartbeat` | Credencial de serviço de longa duração, escopo `envio` | O painel mostra "sem contato com o Bridge"; o envio real nunca é bloqueado (RN-016) |
| **APIs monitoradas** | painel → terceiros | `GET` periódico pelo job `monitor.js` | Nenhuma (só URLs cadastradas por admin) | A API muda de estado e vira notificação (`erro` ao cair, `sucesso` ao voltar) |
| **Google Apps Script** (monitor legado, em retirada) | navegador → Google | `fetch` sem token | Nenhuma (o token do painel nunca vai ao Google) | Só a tela de Monitoramento legado fica sem dado |
| **SMTP** (e-mail transacional) | `back_auth` → SMTP | `nodemailer`, TLS | Usuário + senha de app | A criação de usuário não falha: devolve a senha temporária na resposta (`emailEnviado: false`) |
| **Leitor de código** (câmera do tablet) | navegador | `html5-qrcode` (vendorizado) ou leitor USB que digita o código | — | Digitação manual continua disponível |

## 1. Sistema de captura → espelho (entrada principal)

O sistema de captura é o software de digitalização em que a produção acontece (importação, controle de qualidade, indexação, exportação). Ele roda num SQL Server dentro da rede de cada cliente. Nada no painel consulta esse banco ao vivo: o ETL (`services/etl/captura/`) copia as tabelas de produção para `db_espelho` (ver [banco de dados](banco-de-dados.md) §2).

Pontos de projeto:

- **Uma instalação de origem por cliente.** Uma "fonte" (`ETL_FONTE=atlas`) é uma instância do ETL, com arquivo de ambiente e schema próprios (`captura_atlas`). Dentro da fonte, `FLU_ID` separa os fluxos de trabalho (`CAPTURA_FLU_IDS=4,8,9,10`).
- **Datas como texto ISO** na extração (`CONVERT(varchar(23), …, 126)`), porque o relógio da origem é horário local sem fuso.
- **Timeouts explícitos** no driver: a tabela de histórico de passagens é grande e o padrão de 15 s do driver não basta através da VPN.
- **Mínimo privilégio dos dois lados**: o login SQL só lê as 8 tabelas; no Postgres o ETL escreve com um papel e a API lê com outro.

## 2. Bridge → `/envio/*` (pós-esteira)

Depois que uma caixa é finalizada no sistema de captura, o **Bridge** (aplicativo desktop instalado no cliente, mantido em outro repositório) envia as pastas para o ownCloud e relata cada estado ao painel.

```text
Bridge ──POST /api/envio/eventos  { instancia, eventos: [{ pasta, fluxo, status, resultado, eventoTs, mensagem? }] }──► painel.envio_caixa
       ──POST /api/envio/heartbeat { instancia, versao }───────────────────────────────────────────────────────────► painel.envio_heartbeat
SPA   ──GET  /api/envio/resumo?instancia=…&horas=24 ──► cartões, funil (na fila → enviando → conferindo → concluída), vazão por minuto, eventos recentes
```

- **Credencial de serviço** emitida por um admin em `POST /auth/sessao-servico` (`back_auth`): longa duração, escopo mínimo `envio`, só escrita, atrelada a uma `instancia`. O `back_dashboard` bloqueia essa credencial em qualquer rota fora de `/envio/*` e confere que a `instancia` do corpo bate com a do token.
- **Idempotência**: `UNIQUE (instancia, pasta, status, evento_ts)`. O Bridge pode reenviar sem duplicar.
- **Nunca bloqueante** (RN-016): o relato é só observação. Do lado do Bridge a chamada é assíncrona, com fila local de reintento; nenhuma falha do painel atrasa ou reverte um envio.
- **Alertas que exigem ação humana** chegam como evento de erro cuja `mensagem` começa com `[ALERTA]`; só nesse caso o texto é devolvido à tela (sempre escapado).
- **Sinal de vida**: sem heartbeat há mais de 15 min, o resumo marca `atrasado` e a tela mostra "Sem contato com o Bridge".

## 3. Monitor nativo de APIs

`jobs/monitor.js` (timer de 5 min; respeita o intervalo configurado de 5, 10, 15, 30 ou 60 min) faz `GET` em cada API ativa de `painel.monitor_api`, classifica como online, lenta ou fora, grava o histórico e gera notificação na transição. O botão "Fazer teste" chama `POST /monitoramento/apis/:id/testar`, limitado a 1 por API a cada 10 s.

Defesa contra SSRF: as URLs só entram por cadastro de admin, nunca por entrada livre de usuário. Só `GET`, só `http`/`https`, o DNS é resolvido antes e IPs privados, de loopback e link-local são recusados, e o job não segue redirecionamento.

## 4. Notificações geradas pelo painel

`jobs/notificador.js` (5 min) cria notificações deduplicadas por `chave_unica`:

| Tipo | Gatilho | Chave |
|---|---|---|
| `alerta` | Gargalo detectado numa fase (RN-009) | `gargalo:{projeto}/{instancia}/{fasId}:{AAAA-MM-DD}` |
| `alerta` | ETL de uma fonte atrasado (> 30 min) | `etl-atrasado:{fonte}:{AAAA-MM-DD}` |
| `sucesso` | Meta do mês atingida pela primeira vez | `meta:{projeto}/{escopo}:{AAAA-MM}` |
| `erro` / `sucesso` | API monitorada cai / volta (pelo `monitor.js`) | `api-fora:{id}:{AAAA-MM-DDTHH}` / `api-volta:…` |

O texto é montado no servidor, em português e sem HTML; o front ainda escapa tudo. `destino` leva a rota e o foco (por exemplo, a fase do gargalo no fluxograma).

## 5. E-mail transacional

Ao criar um usuário (`POST /auth/usuarios`, só admin), o `back_auth` gera uma senha temporária e a envia por e-mail (texto e HTML). A troca é obrigatória no primeiro acesso. Se o SMTP não estiver configurado ou falhar, a API devolve a senha na resposta para o admin repassar. A conta nunca deixa de ser criada por causa do e-mail.
