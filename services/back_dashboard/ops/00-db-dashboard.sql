-- ==============================================================================
-- Bootstrap do db_dashboard (VM centralizada). Rodar UMA vez, como superusuário:
--
--   sudo -u postgres psql -v senha_app='...' -f 00-db-dashboard.sql
--
-- Diferente do db_espelho (services/etl/sql/00-db-espelho.sql, descartável — só
-- leitura pela API, reconstruído a cada ciclo do ETL), este banco guarda **dado
-- operacional do painel** (metas, notificações, auditoria) e precisa entrar na
-- rotina de backup da VM (docs/arquitetura/backend.md §3).
--
-- ==============================================================================

CREATE ROLE usr_dashboard_app LOGIN PASSWORD :'senha_app';
CREATE DATABASE db_dashboard;
REVOKE CONNECT ON DATABASE db_dashboard FROM PUBLIC;
GRANT CONNECT ON DATABASE db_dashboard TO usr_dashboard_app;

\connect db_dashboard

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA painel AUTHORIZATION usr_dashboard_app;

SET ROLE usr_dashboard_app;

-- Metas mensais (editáveis por admin). Uma linha por (escopo, mês).
CREATE TABLE painel.meta (
    id             SERIAL PRIMARY KEY,
    projeto        VARCHAR(30)  NOT NULL,            -- 'boreal', 'atlas'
    escopo         VARCHAR(60)  NOT NULL,             -- instanceId ('certidoes') ou módulo ('higienizacao')
    ano            SMALLINT     NOT NULL CHECK (ano BETWEEN 2024 AND 2100),
    mes            SMALLINT     NOT NULL CHECK (mes BETWEEN 1 AND 12),
    valor          INTEGER      NOT NULL CHECK (valor > 0),
    unidade        VARCHAR(20)  NOT NULL,             -- 'pastas' | 'caixas' | 'documentos'
    atualizado_por INTEGER      NOT NULL,             -- usuarios.id do back_auth (sem FK: outro banco)
    atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (projeto, escopo, ano, mes)
);

-- Notificações globais; o estado "lida" é por usuário (tabela abaixo).
CREATE TABLE painel.notificacao (
    id          BIGSERIAL PRIMARY KEY,
    tipo        VARCHAR(10)  NOT NULL CHECK (tipo IN ('erro', 'alerta', 'sucesso', 'info')),
    titulo      VARCHAR(120) NOT NULL,
    texto       VARCHAR(400) NOT NULL,
    destino     JSONB,                                -- {"rota":"/boreal/digitalizacao/fluxograma","foco":{...}}
    chave_unica VARCHAR(160) NOT NULL UNIQUE,         -- deduplicação: 'gargalo:atlas/inventarios/1:2026-10-02'
    so_admin    BOOLEAN      NOT NULL DEFAULT false,
    criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expira_em   TIMESTAMPTZ  NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX ON painel.notificacao (criado_em DESC);

CREATE TABLE painel.notificacao_leitura (
    notificacao_id BIGINT  NOT NULL REFERENCES painel.notificacao(id) ON DELETE CASCADE,
    usuario_id     INTEGER NOT NULL,
    lida_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (notificacao_id, usuario_id)
);

-- Auditoria/atividade: quem fez o quê. Alimenta o feed "Atividade recente" (B8).
CREATE TABLE painel.auditoria (
    id            BIGSERIAL PRIMARY KEY,
    em            TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_id    INTEGER,                            -- NULL = Sistema
    usuario_login VARCHAR(50),
    acao          VARCHAR(40) NOT NULL,                -- 'relatorio.gerado' | 'meta.definida' | ...
    alvo          VARCHAR(120),                        -- 'Meta de 10/2026'
    onde          VARCHAR(120),                        -- 'atlas · negativos'
    detalhe       JSONB
);
CREATE INDEX ON painel.auditoria (em DESC);

-- Monitoramento nativo de APIs (B10) — substitui o Google Apps Script. `url` é
-- gerenciada só por admin/seed (sem endpoint de escrita pra ela — ver
-- core/monitoramento.js), nunca vem de entrada de usuário comum (SSRF).
CREATE TABLE painel.monitor_api (
    id              SERIAL PRIMARY KEY,
    sistema         VARCHAR(40)  NOT NULL,              -- 'BOREAL' | 'PortalDoc' | 'Lumen' | 'Inscrição Online'
    nome            VARCHAR(120) NOT NULL,
    url             VARCHAR(400) NOT NULL,
    metodo          VARCHAR(6)   NOT NULL DEFAULT 'GET' CHECK (metodo = 'GET'),
    limiar_lento_ms INTEGER      NOT NULL DEFAULT 1000,
    timeout_ms      INTEGER      NOT NULL DEFAULT 10000,
    ativo           BOOLEAN      NOT NULL DEFAULT true,
    ordem           SMALLINT     NOT NULL DEFAULT 0
);

CREATE TABLE painel.monitor_verificacao (
    id          BIGSERIAL PRIMARY KEY,
    api_id      INTEGER NOT NULL REFERENCES painel.monitor_api(id) ON DELETE CASCADE,
    em          TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado      CHAR(1) NOT NULL CHECK (estado IN ('o', 'l', 'f')),   -- online | lenta | falha
    latencia_ms INTEGER,
    http_status SMALLINT,
    log         VARCHAR(400),
    origem      VARCHAR(10) NOT NULL DEFAULT 'auto' CHECK (origem IN ('auto', 'manual'))
);
CREATE INDEX ON painel.monitor_verificacao (api_id, em DESC);

CREATE TABLE painel.monitor_config (                -- 1 linha só
    id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    intervalo_min SMALLINT NOT NULL DEFAULT 15 CHECK (intervalo_min IN (5, 10, 15, 30, 60)),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO painel.monitor_config DEFAULT VALUES;

RESET ROLE;

-- Seed de exemplo (ajustar sistema/nome/url reais antes de rodar — nenhum valor
-- aqui é inventado para produção, isto é só o molde):
--   SET ROLE usr_dashboard_app;
--   INSERT INTO painel.monitor_api (sistema, nome, url, ordem) VALUES
--     ('Lumen', 'Lumen — Indexação de Documentos', 'https://lumen.exemplo/api/health', 1);
--   RESET ROLE;

-- Retenção (RN-012/backend_spec.md §3.1) — rodar via cron/systemd timer diário,
-- não implementado nesta leva (sem job de retenção ainda):
--   DELETE FROM painel.notificacao WHERE criado_em < now() - interval '30 days';
--   DELETE FROM painel.auditoria   WHERE em        < now() - interval '180 days';
--   DELETE FROM painel.monitor_verificacao WHERE em < now() - interval '30 days';
