#!/usr/bin/env bash
# Backup lógico diário de db_auth e db_dashboard (pg_dump -Fc).
# db_espelho fica de fora de propósito: o ETL recria o espelho a partir do Captura.
#
# Credenciais: NUNCA neste arquivo. Use ~/.pgpass do usuário que roda o script
# (chmod 600) ou as variáveis PGHOST/PGPORT/PGUSER/PGPASSWORD no ambiente
# (ex.: EnvironmentFile do systemd). Para host/usuário diferentes por banco,
# defina PGHOST_DB_AUTH / PGUSER_DB_AUTH / PGPORT_DB_AUTH (e *_DB_DASHBOARD) — opcional.
#
# Variáveis opcionais: BACKUP_DIR (padrão /var/backups/dashboard),
# RETENCAO_DIAS (padrão 14), BANCOS (padrão "db_auth db_dashboard").
# Saída: 0 = tudo certo; 1 = ao menos um banco falhou.
set -uo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/dashboard}"
RETENCAO_DIAS="${RETENCAO_DIAS:-14}"
BANCOS="${BANCOS:-db_auth db_dashboard}"
LOG="${LOG_FILE:-$BACKUP_DIR/backup.log}"
DATA="$(date +%Y%m%d-%H%M%S)"

umask 077
mkdir -p "$BACKUP_DIR" || { echo "não foi possível criar $BACKUP_DIR" >&2; exit 1; }
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }

total=0
falhas=0
for banco in $BANCOS; do
    total=$((total + 1))
    sufixo="$(echo "$banco" | tr 'a-z-' 'A-Z_')"
    host_var="PGHOST_${sufixo}"; user_var="PGUSER_${sufixo}"; port_var="PGPORT_${sufixo}"

    # Variáveis por banco valem só para este dump (subshell via env).
    destino="$BACKUP_DIR/${banco}_${DATA}.dump"
    tmp="${destino}.partial"
    log "iniciando dump de $banco"
    if env ${!host_var:+PGHOST="${!host_var}"} ${!user_var:+PGUSER="${!user_var}"} ${!port_var:+PGPORT="${!port_var}"} \
        pg_dump -Fc --no-owner -d "$banco" -f "$tmp" 2>>"$LOG"; then
        chmod 600 "$tmp"
        mv "$tmp" "$destino"
        log "ok: $destino ($(du -h "$destino" | cut -f1))"
    else
        rm -f "$tmp"
        log "ERRO: pg_dump de $banco falhou"
        falhas=$((falhas + 1))
    fi
done

# Retenção: só apaga dumps antigos se ao menos um banco foi salvo agora
# (evita esvaziar o diretório quando o Postgres está fora do ar).
if [ "$falhas" -lt "$total" ]; then
    find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' -mtime +"$RETENCAO_DIAS" -print -delete 2>>"$LOG" \
        | while read -r f; do log "removido (retenção ${RETENCAO_DIAS}d): $f"; done
fi

if [ "$falhas" -gt 0 ]; then
    log "terminou com $falhas falha(s)"
    exit 1
fi
log "backup concluído"
exit 0
