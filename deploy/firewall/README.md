# Firewall (UFW) da VM

`ufw.sh` aplica: deny incoming, allow outgoing, SSH (com rate limit), 80/443 (Nginx) e a
interface `vpn0`. As portas do `back_dashboard` (3010) e do `back_auth` (3002) **não**
são abertas: ambos escutam só em `127.0.0.1` e o Nginx fala com eles por loopback.
PostgreSQL (5432) também fica fechado ao mundo.

## Ordem segura

1. Abra **duas** sessões SSH na VM e mantenha a segunda aberta até o fim.
2. Confirme a porta do SSH: `sudo ss -tlnp | grep sshd` (se não for 22, use `SSH_PORT=`).
3. Confirme que o back_dashboard/back_auth respondem em loopback:
   `ss -tlnp | grep -E '3010|3002'` deve mostrar `127.0.0.1`.
4. Execute: `sudo SSH_PORT=22 /opt/dashboard/deploy/firewall/ufw.sh`
5. Confira: `sudo ufw status verbose` e abra uma **terceira** sessão SSH nova para testar.
6. Teste `https://painel.example.com` e `https://auth.example.com` de fora da VM.

Se o painel/ETL acessa o SQL Server do Captura via VPN, o tráfego de **saída** é
liberado pela política padrão; nada a ajustar.

## Desfazer

```bash
sudo ufw disable                 # desliga imediatamente (regras ficam guardadas)
sudo ufw reset                   # apaga todas as regras
sudo ufw delete allow 443/tcp    # remove uma regra
```

Se perder o SSH: use o console da VM (hipervisor/provedor) e rode `sudo ufw disable`.
