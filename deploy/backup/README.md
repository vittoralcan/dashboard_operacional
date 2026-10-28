# Backup do PostgreSQL

Dump diário (`pg_dump -Fc`) de `db_auth` e `db_dashboard` em `/var/backups/dashboard`,
retenção de 14 dias, arquivos `600`. `db_espelho` não entra (o ETL recria).

## Instalação (VM, uma vez)

```bash
sudo install -d -m 700 -o postgres -g postgres /var/backups/dashboard
sudo chmod +x /opt/dashboard/deploy/backup/backup-postgres.sh
sudo cp /opt/dashboard/deploy/backup/backup-postgres.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now backup-postgres.timer
sudo systemctl start backup-postgres.service   # teste manual
journalctl -u backup-postgres -n 30; sudo ls -l /var/backups/dashboard
```

Credenciais: o serviço roda como `postgres` (peer local, sem senha). Se `db_auth` estiver
em outro host (ex.: Postgres gerenciado) ou com usuário próprio, crie `/etc/dashboard/backup-postgres.env`
(`chmod 600`) com `PGHOST_DB_AUTH`, `PGUSER_DB_AUTH`, `PGPASSWORD`, ou use `~postgres/.pgpass`.
Nada de senha no script.

## Restauração

```bash
# para um banco novo (seguro)
sudo -u postgres createdb db_dashboard_restore
sudo -u postgres pg_restore --no-owner -d db_dashboard_restore /var/backups/dashboard/db_dashboard_AAAAMMDD-HHMMSS.dump

# sobre o banco real (pare back_dashboard/back_auth antes; --clean apaga objetos existentes)
sudo -u postgres pg_restore --clean --if-exists --no-owner -d db_dashboard /var/backups/dashboard/db_dashboard_AAAAMMDD-HHMMSS.dump
```

## Teste de restauração (mensal)

```bash
f=$(sudo ls -t /var/backups/dashboard/db_dashboard_*.dump | head -1)
sudo -u postgres createdb teste_restore
sudo -u postgres pg_restore --no-owner -d teste_restore "$f"
sudo -u postgres psql -d teste_restore -c '\dt painel.*'
sudo -u postgres dropdb teste_restore
```

## Cópia para fora da VM

Backup na mesma VM não protege contra perda da VM. Copie periodicamente para outro local
(ex.: `rsync -a /var/backups/dashboard/ usuario@outro-host:/backups/dashboard/` via VPN,
ou bucket/NAS), de preferência puxado pela máquina de destino.
