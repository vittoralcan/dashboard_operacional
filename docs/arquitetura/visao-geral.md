# Arquitetura: visão geral

> Resumo do sistema em cinco minutos. Detalhes em [backend](backend.md), [banco de dados](banco-de-dados.md), [integrações](integracoes.md), [segurança](seguranca.md), [regras de arquitetura](regras-de-arquitetura.md) e [CI/CD e infraestrutura](ci-cd.md).
>
> Todos os nomes de clientes, sistemas comerciais, pessoas e domínios deste showcase são fictícios.

## 1. Mapa dos componentes

```text
 Navegador (SPA, JS puro)  ── https://app.example.com/app/   (hospedagem estática, deploy por SFTP)
        │  Authorization: Bearer <JWT de 8 h>
        ├──► https://auth.example.com/api     back_auth        (VM Linux, Nginx + systemd)  → db_auth       (Postgres)
        └──► https://painel.example.com/api   back_dashboard   (VM Linux, 127.0.0.1:3010)   → db_espelho    (só leitura)
                                                                                           → db_dashboard  (escrita do painel)

 VM Linux:  etl-captura@atlas.timer (10 min)  ──►  db_espelho.captura_atlas  ◄──  SQL Server do sistema de captura (rede do cliente, via VPN)
            back-dashboard-{monitor,notificador}.timer (5 min) · retencao (diário) · snapshot (07h e 19h)

 Bridge (app desktop no cliente, outro repositório) ──► POST /api/envio/* do back_dashboard (credencial de serviço)
```

| Componente | Pasta | Papel |
|---|---|---|
| Frontend (SPA) | `public/app/` | Painel de gestão, Macro View para TVs e telas operacionais (tablet) |
| Modo demonstração | `public/app/demo.html`, `public/app/demo/` | Mesmo app com API simulada no navegador (só no showcase) |
| `back_auth` | `services/back_auth/` | Identidade: login, perfil, preferências, senha, criação de usuário, credencial de serviço |
| `back_dashboard` | `services/back_dashboard/` | API única do painel: fluxos, metas, gargalos, notificações, monitor de APIs, envio, módulo operacional |
| ETL do sistema de captura | `services/etl/captura/` | Copia as tabelas de produção do SQL Server do cliente para o espelho Postgres |
| Jobs | `services/back_dashboard/jobs/` | Monitor de APIs, notificador, retenção e retrato de fases na virada de turno |

## 2. Decisões que moldam o desenho

1. **Backend único por painel, não um por projeto.** Cada cliente tem o seu sistema de captura em rede própria. Em vez de um backend por cliente preso a essa rede, um ETL traz os dados para um espelho Postgres local e um só `back_dashboard` atende todos os projetos. O `back_auth` fica separado de propósito (serve vários projetos e tem banco próprio).
2. **Fonte lenta ou fora do nosso controle nunca é consultada ao vivo** (RA-007). O ETL copia, a API só lê do espelho. A defasagem esperada é de até ~10 min, e a tela mostra a idade do dado.
3. **Escrita do painel em outro banco.** Metas, notificações, auditoria, monitor, envio e o módulo operacional vivem em `db_dashboard` (schema `painel`), com outro papel de banco. O espelho continua só leitura para a API, por permissão e não só por convenção.
4. **Configuração em dado, não em código.** Cada projeto tem um manifesto JSON (`services/back_dashboard/projects/<projeto>.json`) que declara as instâncias do módulo `flow-viewer`, as fases, o grafo do fluxograma e os parâmetros de gargalo. Um fluxo novo é configuração, não tela nova.
5. **Sem Docker.** Node direto com systemd, Nginx e certbot. Jobs são processos *oneshot* com timer do systemd.
6. **Frontend sem framework e sem bundler.** Módulos ES nativos, CSS por tokens, gráficos SVG próprios, nenhuma dependência de terceiros em tempo de execução. Detalhes em [arquitetura do frontend](../frontend/arquitetura-frontend.md).
7. **Autenticação por JWT HS256 de 8 h**, assinado pelo `back_auth`. O `back_dashboard` valida com a mesma `JWT_SECRET`, e o papel do usuário (`admin`, `standard`, `turno`) vem no token.

## 3. Duas vertentes do produto

| Vertente | Público | Telas |
|---|---|---|
| **Gestão** | Coordenadores, supervisores e gerentes | Seleção de projetos, hub do projeto, fluxograma por fluxo, análise de produção, relatórios XLSX/CSV, metas, notificações, Macro View, envio (Bridge), monitoramento, relatórios e correções operacionais |
| **Operacional** | Operadores de higienização, digitalização e controle de qualidade | Tablet do turno com bipagem de caixas, digitalização. Telas simples, botões grandes, retorno visual imediato e nenhum dado individual exposto a terceiros |

## 4. Fluxo de dados da produção (o caminho principal)

```text
SQL Server do sistema de captura (cliente)
   │  ETL oneshot a cada 10 min, uma transação por ciclo, só o que mudou
   ▼
db_espelho.captura_<fonte>    (cópia fiel de 8 tabelas, sem agregação)
   │  SELECT com regras de negócio na consulta (deduplicação, primeira passagem, gargalo)
   ▼
back_dashboard · flow-viewer  (uma instância por fluxo: negativos, certidoes, inventarios, cartografia)
   │  JSON { success, data } com ETag e cache em processo de ~30 s
   ▼
SPA (fluxograma, KPIs, Macro View, relatórios)
```

As regras de negócio (deduplicação, "primeira passagem por fase", gargalo, variação, projeção) rodam **na consulta**, nunca no ETL. Assim o espelho fica fiel à origem e uma regra nova não exige recarga.
