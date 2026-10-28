# CI/CD e infraestrutura

## 1. Workflows (`.github/workflows/`)

| Workflow | Gatilho | Runner | Faz |
|---|---|---|---|
| `verificar-frontend.yml` | PR em `public/**`, `tests/**`, `scripts/app-*` (e chamado pelo deploy) | `ubuntu-latest` | Testes unitários (`node --test`), orçamentos de desempenho, greps de segurança estática, E2E com Playwright + axe com a CSP em modo bloqueio |
| `verificar-backend.yml` | PR em `services/back_dashboard/**`, `tests/**` | `ubuntu-latest` + Postgres 16 de serviço | Testes do `back_dashboard` (com Postgres descartável) e a suíte de aceite |
| `deploy-frontend.yml` | **manual no showcase** (em produção: push na `main` em `public/**`) | `ubuntu-latest` | Chama `verificar-frontend` (`needs: verificar`) e publica `public/*` por SFTP |
| `deploy-back-dashboard.yml` | **manual no showcase** (em produção: push na `main` em `services/back_dashboard/**`) | self-hosted na VM | `git reset --hard origin/main` no clone → `npm ci` → `systemctl restart` → `curl` no `/api/health` local |

No showcase os dois deploys ficam só com `workflow_dispatch`: eles dependem de segredos e de um runner que um fork não tem.

## 2. Pipeline do backend (sem Docker)

O clone git na VM **é** o artefato: deploy = `reset --hard` na `main` + `npm ci` + restart + verificação de saúde. O runner é self-hosted porque a VM só aceita 80/443 de entrada (o runner faz conexão de saída). Os segredos não passam pelo pipeline; ficam em `/etc/dashboard/back-dashboard.env`. O usuário do runner é dedicado e tem uma única permissão de root:

```text
runner-dashboard ALL=(root) NOPASSWD: /usr/bin/systemctl restart back-dashboard
```

Rollback: `git revert` na `main` e o pipeline roda de novo.

## 3. Onde cada peça roda

| Peça | Onde | Como |
|---|---|---|
| Frontend | Hospedagem estática (Apache/cPanel) | SFTP; o `.htaccess` em `public/app/` define CSP, cabeçalhos e cache |
| `back_auth` | VM Linux, `auth.example.com` | systemd + Nginx + certbot |
| `back_dashboard` | VM Linux, `painel.example.com` → `127.0.0.1:3010` | systemd (`User=dashboard`), Nginx (`services/back_dashboard/nginx/`) |
| ETL e jobs | mesma VM | Timers do systemd (`services/*/systemd/`) |
| Postgres | mesma VM | `db_auth`, `db_espelho`, `db_dashboard` |
| Sistema de captura | rede do cliente | Alcançado por VPN |

## 4. Operação

```bash
systemctl list-timers 'etl-captura@*' 'back-dashboard-*'   # última e próxima execução
journalctl -u etl-captura@atlas -n 50                       # log dos últimos ciclos do ETL
sudo systemctl start etl-captura@atlas                      # rodar um ciclo agora
curl -fsS http://127.0.0.1:3010/api/health                  # saúde do back_dashboard e idade do espelho
```

Atualizar à mão: `git reset --hard origin/main`, **sempre** `npm ci` e só então `systemctl restart`. Sem o `npm ci`, uma dependência nova derruba o serviço em *crash loop*.

## 5. Scripts de operação versionados

- `deploy/backup/`: `pg_dump` diário de `db_auth` e `db_dashboard` (timer systemd, retenção de 14 dias). O espelho fica fora, porque é reconstruível.
- `deploy/firewall/ufw.sh`: política padrão *deny*; libera SSH com limite, 80/443 e a interface da VPN.
- `services/back_dashboard/systemd/` e `services/etl/captura/systemd/`: units e timers com hardening.
