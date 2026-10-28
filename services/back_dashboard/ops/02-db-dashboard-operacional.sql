-- ==============================================================================
-- Aditivo ao db_dashboard — módulo operacional (cadastros de projetos, turnos,
-- colaboradores, mesas, metas e registro de caixas higienizadas). Ver
-- docs/arquitetura/backend.md §3 e docs/decisoes.md. Rodar UMA vez, depois de
-- 00-db-dashboard.sql e 01-db-dashboard-envio.sql já terem sido aplicados:
--
--   psql -d db_dashboard -f 02-db-dashboard-operacional.sql
--
-- Não editar 00-db-dashboard.sql nem 01-db-dashboard-envio.sql (já aplicados em
-- produção) — toda mudança aditiva ao schema `painel` entra num arquivo novo como
-- este. Tudo aqui é `painel.op_*`; auditoria de correções/exclusões fica em
-- painel.auditoria (RNB-B6), não em tabela nova.
-- ==============================================================================

SET ROLE usr_dashboard_app;

-- Projeto (ex.: 'atlas'). codigo_regex é o formato do código de barras da caixa,
-- configurável por projeto (RN-07). integracoes lista as fontes ligadas ao projeto.
CREATE TABLE painel.op_projeto (
    id           SERIAL PRIMARY KEY,
    slug         VARCHAR(30)  NOT NULL UNIQUE,
    nome         VARCHAR(100) NOT NULL,
    codigo_regex VARCHAR(200),
    integracoes  JSONB        NOT NULL DEFAULT '[]'::jsonb,   -- ex.: ["captura","arca"]
    ativo        BOOLEAN      NOT NULL DEFAULT true,
    criado_em    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Turno de trabalho dentro de um projeto. usuario_auth_id aponta para o usuário
-- tipo='turno' no db_auth — bancos separados, por isso sem FK.
CREATE TABLE painel.op_turno (
    id              SERIAL PRIMARY KEY,
    projeto_id      INTEGER     NOT NULL REFERENCES painel.op_projeto(id),
    nome            VARCHAR(60) NOT NULL,
    usuario_auth_id INTEGER     UNIQUE,
    ativo           BOOLEAN     NOT NULL DEFAULT true,
    UNIQUE (projeto_id, nome)
);

CREATE TABLE painel.op_colaborador (
    id         SERIAL PRIMARY KEY,
    nome       VARCHAR(150) NOT NULL,
    funcao     VARCHAR(60),
    projeto_id INTEGER      NOT NULL REFERENCES painel.op_projeto(id),
    turno_id   INTEGER      REFERENCES painel.op_turno(id),
    avatar     VARCHAR(60),
    ativo      BOOLEAN      NOT NULL DEFAULT true
);

-- Mesa de trabalho: higienização (lavagem) ou remontagem da caixa.
CREATE TABLE painel.op_mesa (
    id         SERIAL PRIMARY KEY,
    projeto_id INTEGER     NOT NULL REFERENCES painel.op_projeto(id),
    codigo     VARCHAR(10) NOT NULL,
    tipo       VARCHAR(20) NOT NULL DEFAULT 'higienizacao' CHECK (tipo IN ('higienizacao', 'remontagem')),
    ativo      BOOLEAN     NOT NULL DEFAULT true,
    UNIQUE (projeto_id, codigo)
);

-- Meta diária por etapa. Unidade: caixas ou imagens (conforme a etapa).
CREATE TABLE painel.op_meta (
    id         SERIAL PRIMARY KEY,
    projeto_id INTEGER     NOT NULL REFERENCES painel.op_projeto(id),
    etapa      VARCHAR(30) NOT NULL CHECK (etapa IN ('higienizacao', 'scanner', 'cq')),
    valor_dia  INTEGER     NOT NULL CHECK (valor_dia > 0),
    unidade    VARCHAR(20) NOT NULL CHECK (unidade IN ('caixas', 'imagens')),
    UNIQUE (projeto_id, etapa)
);

-- Uma linha por caixa tratada numa etapa. status='aberta' até concluir ou cancelar.
CREATE TABLE painel.op_caixa_registro (
    id             BIGSERIAL PRIMARY KEY,
    projeto_id     INTEGER     NOT NULL REFERENCES painel.op_projeto(id),
    turno_id       INTEGER     NOT NULL REFERENCES painel.op_turno(id),
    colaborador_id INTEGER     NOT NULL REFERENCES painel.op_colaborador(id),
    mesa_id        INTEGER     REFERENCES painel.op_mesa(id),
    etapa          VARCHAR(30) NOT NULL DEFAULT 'higienizacao',
    codigo         VARCHAR(60) NOT NULL,                       -- código de barras da caixa
    status         VARCHAR(12) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'concluida', 'cancelada')),
    inicio_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    fim_em         TIMESTAMPTZ,
    duracao_s      INTEGER,
    criado_por     INTEGER,
    atualizado_por INTEGER,
    atualizado_em  TIMESTAMPTZ
);
-- Uma caixa só pode estar aberta uma vez por etapa.
CREATE UNIQUE INDEX uq_op_caixa_aberta ON painel.op_caixa_registro (projeto_id, etapa, codigo) WHERE status = 'aberta';
CREATE INDEX op_caixa_projeto_inicio_idx ON painel.op_caixa_registro (projeto_id, inicio_em DESC);
CREATE INDEX op_caixa_colaborador_inicio_idx ON painel.op_caixa_registro (colaborador_id, inicio_em DESC);

RESET ROLE;
