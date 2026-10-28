-- ==============================================================================
-- Aditivo ao db_dashboard — pausa da caixa (almoço no meio da caixa) e dados da
-- digitalização (nº de imagens, grampo, papel deteriorado). Rodar UMA vez, depois
-- de 02-db-dashboard-operacional.sql:
--
--   psql -v ON_ERROR_STOP=1 -1 -d db_dashboard -f 04-db-dashboard-pausa-digitalizacao.sql
--
-- A etapa `digitalizacao` não precisa de DDL: op_caixa_registro.etapa é texto livre.
-- ==============================================================================

SET ROLE usr_dashboard_app;

ALTER TABLE painel.op_caixa_registro
    ADD COLUMN imagens     INTEGER CHECK (imagens IS NULL OR imagens >= 0),
    ADD COLUMN grampo      BOOLEAN NOT NULL DEFAULT false,   -- caixa com muito grampo
    ADD COLUMN deteriorado BOOLEAN NOT NULL DEFAULT false,   -- caixa com papel deteriorado
    -- Digitalização: instante do 2º bip ou do clique em Concluir. O relógio para aqui; a caixa só fecha
    -- quando o nº de imagens é informado, e o fim gravado é este instante, não o da confirmação.
    ADD COLUMN fim_solicitado_em TIMESTAMPTZ;

-- Pausas de uma caixa. O tempo pausado não conta na duração. Pausa esquecida é
-- encerrada na virada de turno (07h/19h de São Paulo) com auto_encerrada = true,
-- e a caixa fica sinalizada para correção.
CREATE TABLE painel.op_pausa (
    id              BIGSERIAL PRIMARY KEY,
    registro_id     BIGINT      NOT NULL REFERENCES painel.op_caixa_registro(id) ON DELETE CASCADE,
    inicio_em       TIMESTAMPTZ NOT NULL,
    fim_em          TIMESTAMPTZ,
    auto_encerrada  BOOLEAN     NOT NULL DEFAULT false,
    criado_por      INTEGER
);
-- No máximo uma pausa aberta por caixa.
CREATE UNIQUE INDEX uq_op_pausa_aberta ON painel.op_pausa (registro_id) WHERE fim_em IS NULL;
CREATE INDEX op_pausa_registro_idx ON painel.op_pausa (registro_id);

RESET ROLE;
