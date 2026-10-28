#!/usr/bin/env bash
# Regras UFW da VM do dashboard. Idempotente: pode rodar várias vezes.
#
# Política: deny incoming / allow outgoing.
# Abertas: SSH (ANTES de habilitar), 80/443 (Nginx) e tudo que chega pela interface vpn0.
# NÃO abertas de propósito: 3010 (back_dashboard) e 3002 (back_auth) escutam só em 127.0.0.1 e
# são alcançadas pelo Nginx via loopback (UFW não filtra lo); 5432 (PostgreSQL) idem.
#
# Uso: sudo SSH_PORT=22 ./ufw.sh        (SSH_PORT padrão: 22)
# Leia o README.md antes: mantenha uma segunda sessão SSH aberta.
set -euo pipefail

SSH_PORT="${SSH_PORT:-22}"
VPN_IFACE="${VPN_IFACE:-vpn0}"

if [ "$(id -u)" -ne 0 ]; then
    echo "execute como root (sudo)." >&2
    exit 1
fi
command -v ufw >/dev/null || { echo "ufw não instalado (apt install ufw)." >&2; exit 1; }

ufw default deny incoming
ufw default allow outgoing

# SSH primeiro — nunca habilite o firewall sem esta regra.
# "limit" = allow + bloqueio de força bruta (6 conexões/30s por IP).
ufw limit "${SSH_PORT}/tcp" comment 'SSH'

# Nginx (painel.example.com, auth.example.com e certbot/ACME HTTP-01 na 80).
ufw allow 80/tcp comment 'Nginx HTTP'
ufw allow 443/tcp comment 'Nginx HTTPS'

# VPN: tráfego entrante pela interface da tailnet (ex.: acesso administrativo).
ufw allow in on "${VPN_IFACE}" comment 'VPN'

# --force evita o prompt interativo ("pode interromper conexões SSH").
ufw --force enable
ufw status verbose
