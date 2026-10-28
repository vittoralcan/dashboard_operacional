-- ==============================================================================
-- Aditivo ao db_dashboard — integração com o Bridge (etapa de envio ao
-- ownCloud, pós-esteira do ATLAS). Ver docs/api/envio-bridge.md
-- §3/§9. Rodar UMA vez, depois de 00-db-dashboard.sql já ter sido aplicado:
--
--   psql -d db_dashboard -f 01-db-dashboard-envio.sql
--
-- Não editar 00-db-dashboard.sql (bootstrap já aplicado em produção) — toda
-- mudança aditiva ao schema `painel` entra num arquivo novo como este.
-- ==============================================================================

SET ROLE usr_dashboard_app;

-- Eventos de envio reportados pelo Bridge. Cada linha = um estado de uma
-- caixa. D-10: hoje o Bridge só manda os estados terminais (concluida,
-- divergente, erro) — na_fila/enviando/conferindo existem no CHECK para
-- quando ele mandar granularidade maior, sem precisar de nova migração.
CREATE TABLE painel.envio_caixa (
    id          BIGSERIAL PRIMARY KEY,
    instancia   VARCHAR(60)  NOT NULL,          -- qual Bridge/site enviou (ex.: 'bridge-cliente-x')
    projeto     VARCHAR(30),                    -- 'atlas' (opcional — o Bridge pode não saber)
    fluxo       VARCHAR(30),                    -- 'negativos' | 'certidoes' | 'inventarios' | 'cartografia' (opcional)
    pasta       VARCHAR(120) NOT NULL,          -- nome da caixa, casa com a pasta do Captura
    status      VARCHAR(20)  NOT NULL CHECK (status IN ('na_fila', 'enviando', 'conferindo', 'concluida', 'divergente', 'erro')),
    arquivos    INTEGER,
    bytes       BIGINT,
    duracao_s   INTEGER,
    resultado   VARCHAR(20)  CHECK (resultado IN ('ok', 'divergente', 'erro') OR resultado IS NULL),
    mensagem    VARCHAR(500),                   -- detalhe de erro/divergência; nunca stack trace (RNB-B5)
    evento_ts   TIMESTAMPTZ NOT NULL,           -- quando aconteceu de verdade, no relógio do Bridge
    recebido_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (instancia, pasta, status, evento_ts) -- reenviar o mesmo evento (retry) não duplica
);
CREATE INDEX ON painel.envio_caixa (pasta);
CREATE INDEX ON painel.envio_caixa (evento_ts DESC);
CREATE INDEX ON painel.envio_caixa (instancia, recebido_ts DESC);

-- Último sinal de vida de cada instância do Bridge — alimenta o alerta "sem
-- contato há X" (B14, campo heartbeat.atrasado).
CREATE TABLE painel.envio_heartbeat (
    instancia VARCHAR(60) PRIMARY KEY,
    ultimo_ts TIMESTAMPTZ NOT NULL,
    versao    VARCHAR(20)
);

RESET ROLE;

-- Retenção (BD-18) — jobs/retencao.js ainda não existe para nenhuma tabela de
-- painel.* (não é lacuna específica desta tabela). Quando existir, adicionar
-- à mesma rotina diária que já cobre notificacao/auditoria/monitor_verificacao:
--   DELETE FROM painel.envio_caixa WHERE recebido_ts < now() - interval '180 days';
