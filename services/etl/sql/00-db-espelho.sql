-- ==============================================================================
-- Bootstrap do db_espelho (VM centralizada). Rodar UMA vez, como superusuário, com as
-- senhas passadas como variáveis do psql — nunca escritas neste arquivo:
--
--   sudo -u postgres psql -v senha_etl='...' -v senha_leitura='...' -f 00-db-espelho.sql
--
-- Depois, para cada fonte: node --env-file=<fonte>.env app.js --preparar (cria as tabelas).
--
-- O espelho é descartável — qualquer tabela pode ser apagada e reconstruída pela próxima
-- carga completa do ETL. Por isso fica fora da rotina de backup (diferente do db_dashboard,
-- que guarda dado operacional).
-- ==============================================================================

CREATE ROLE usr_etl_espelho LOGIN PASSWORD :'senha_etl';
CREATE ROLE usr_dashboard_leitura LOGIN PASSWORD :'senha_leitura';

CREATE DATABASE db_espelho;
REVOKE CONNECT ON DATABASE db_espelho FROM PUBLIC;
GRANT CONNECT ON DATABASE db_espelho TO usr_etl_espelho, usr_dashboard_leitura;

\connect db_espelho

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Um schema por fonte, de dono o ETL (ele cria e evolui as próprias tabelas via --preparar).
CREATE SCHEMA etl AUTHORIZATION usr_etl_espelho;
CREATE SCHEMA captura_atlas AUTHORIZATION usr_etl_espelho;

-- A API só lê (RN-001 garantida por permissão, não só por convenção) — vale também para
-- tabelas que o ETL criar no futuro.
GRANT USAGE ON SCHEMA etl, captura_atlas TO usr_dashboard_leitura;
ALTER DEFAULT PRIVILEGES FOR ROLE usr_etl_espelho IN SCHEMA etl, captura_atlas
    GRANT SELECT ON TABLES TO usr_dashboard_leitura;

SET ROLE usr_etl_espelho;

-- Uma linha por ciclo de cada ETL. É daqui que o back_dashboard tira o "atualizado às HH:MM"
-- e o alerta de dado velho. Cada ETL apaga as próprias linhas com mais de 30 dias.
CREATE TABLE etl.execucao (
    id          bigserial PRIMARY KEY,
    processo    text        NOT NULL,
    fonte       text        NOT NULL,
    inicio      timestamptz NOT NULL DEFAULT now(),
    fim         timestamptz,
    status      text        NOT NULL CHECK (status IN ('executando', 'sucesso', 'erro', 'interrompido')),
    detalhes    jsonb,
    erro        text
);
CREATE INDEX idx_execucao_processo_fonte_inicio ON etl.execucao (processo, fonte, inicio DESC);

RESET ROLE;
