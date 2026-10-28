-- ==============================================================================
-- Aditivo ao db_dashboard — retratos de fase por virada de turno (07h e 19h).
-- Base do cálculo de vazão do gargalo por vazão (RF-52, RF-53; RN-009).
-- Rodar UMA vez, depois de 00-db-dashboard.sql já ter sido aplicado:
--
--   psql -d db_dashboard -f 03-db-dashboard-snapshot.sql
--
-- Não editar 00-db-dashboard.sql (bootstrap já aplicado em produção) — toda
-- mudança aditiva ao schema `painel` entra num arquivo novo como este.
-- ==============================================================================

SET ROLE usr_dashboard_app;

-- Retrato, por fase de cada fluxo, do estoque e do acumulado finalizado no
-- instante `momento` (virada de turno). A vazão entre dois retratos é a
-- diferença de `finalizadas_total` (RN-017: primeira passagem por pasta).
-- UNIQUE: reexecutar o job do mesmo turno não duplica.
CREATE TABLE painel.snapshot_fase (
    id                 BIGSERIAL PRIMARY KEY,
    projeto            VARCHAR(30)  NOT NULL,   -- 'atlas'
    instancia          VARCHAR(40)  NOT NULL,   -- site/instância do Captura
    fas_id             INTEGER      NOT NULL,   -- FAS_ID da fase no fluxo
    tipo               VARCHAR(20)  NOT NULL CHECK (tipo IN ('entrada', 'processo', 'reprocessamento', 'erro', 'espera', 'terminal')), -- RN-009
    momento            TIMESTAMPTZ  NOT NULL,   -- instante do retrato, alinhado à virada de turno
    estoque_pastas     INTEGER      NOT NULL CHECK (estoque_pastas >= 0),
    estoque_imagens    BIGINT       NOT NULL DEFAULT 0,
    finalizadas_total  INTEGER      NOT NULL CHECK (finalizadas_total >= 0), -- acumulado de passagens finalizadas (RN-017)
    suspensas          INTEGER      NOT NULL DEFAULT 0,  -- pastas suspensas (RF-55)
    UNIQUE (projeto, instancia, fas_id, momento)
);
CREATE INDEX ON painel.snapshot_fase (projeto, instancia, momento DESC);

RESET ROLE;
