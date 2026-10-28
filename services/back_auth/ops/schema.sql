-- Schema do banco de credenciais (back_auth) — rodar uma única vez no
-- Postgres cloud (ex: Postgres gerenciado), via SQL Editor do provedor ou:
--   psql "postgresql://usuario:senha@host/banco?sslmode=require" -f back_auth/ops/schema.sql

CREATE TABLE IF NOT EXISTS usuarios (
    id                   SERIAL PRIMARY KEY,
    nome                 VARCHAR(150) NOT NULL,
    login                VARCHAR(50) UNIQUE,
    email                VARCHAR(255) NOT NULL UNIQUE,
    senha_hash           VARCHAR(255) NOT NULL,
    tipo                 VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (tipo IN ('admin', 'standard', 'turno')),
    precisa_trocar_senha BOOLEAN NOT NULL DEFAULT false,
    ativo                BOOLEAN NOT NULL DEFAULT true,
    criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================================================================
-- Migração para instâncias já existentes (criadas antes de login/tipo/
-- precisa_trocar_senha existirem) — idempotente, seguro rodar de novo.
-- `login` fica nullable na migração porque não sabemos se já existem
-- linhas antigas sem login; backfill de linhas antigas é manual, caso
-- existam (checar com `SELECT id, nome, email FROM usuarios WHERE login
-- IS NULL;` antes de assumir que não há nenhuma).
-- ===================================================================
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS login VARCHAR(50) UNIQUE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'standard';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS precisa_trocar_senha BOOLEAN NOT NULL DEFAULT false;

-- Bancos antigos têm a restrição com 2 tipos; recria com 'turno' (idempotente).
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_tipo_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_tipo_check CHECK (tipo IN ('admin', 'standard', 'turno'));

-- ===================================================================
-- Noir Bento — identidade e preferências (docs/arquitetura/backend.md §4.1). Aditivo: nenhuma coluna existente muda de
-- tipo/nome, páginas antigas que não leem estes campos continuam intactas.
-- ===================================================================
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(100);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS preferencias JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_login_em TIMESTAMPTZ;

-- ===================================================================
-- Sessões (docs/arquitetura/backend.md §4.1, F4) — hoje só o tipo
-- 'servico' é emitido de fato (A9, docs/api/envio-bridge.md,
-- credencial de longa duração do Bridge). Os tipos 'web'/'tv' (refresh token
-- rotativo) ficam para quando F4 for implementado — a tabela já nasce com os
-- 3 tipos no CHECK pra não precisar de uma segunda migração depois.
-- ===================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sessao (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    -- SHA-256 do token: refresh token quando F4 existir; o próprio JWT para
    -- 'servico' — não há refresh para esse tipo, de propósito (ver A9).
    token_hash  CHAR(64) NOT NULL UNIQUE,
    tipo        VARCHAR(10) NOT NULL DEFAULT 'web' CHECK (tipo IN ('web', 'tv', 'servico')),
    descricao   VARCHAR(200),                       -- só 'servico': identifica a instalação (ex.: "Bridge — cliente X")
    instancia   VARCHAR(60),                        -- só 'servico': casa com o claim `instancia` do JWT
    escopo      JSONB,                               -- só 'servico': ex. ["envio"]
    criada_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_em   TIMESTAMPTZ NOT NULL,
    revogada_em TIMESTAMPTZ,
    user_agent  VARCHAR(200)
);
CREATE INDEX IF NOT EXISTS sessao_usuario_id_idx ON sessao (usuario_id);
