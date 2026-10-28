const express = require('express');
const { checkDbConnection } = require('../config/db-postgres');

const router = express.Router();

// O Postgres deste serviço é um Postgres gerenciado free tier, que cobra/limita por hora de
// compute acordado (RA-016) — diferente do Postgres/SQL Server dos outros
// backends (self-hosted na VPS, sem esse tipo de cota). O PaaS bate neste
// endpoint com frequência própria de plataforma (healthCheckPath em
// arquivo de deploy do PaaS), fora de qualquer monitoramento externo; sem cache, cada uma
// dessas chamadas mantém o Postgres gerenciado acordado o tempo todo, esgotando a cota
// mensal mesmo sem tráfego real de login — já aconteceu uma vez. O TTL
// abaixo é menor que a janela padrão de auto-suspend do Postgres gerenciado, então o
// compute ainda consegue dormir entre checagens reais.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached = null;
let cachedAt = 0;

router.get('/health', async (req, res) => {
  const now = Date.now();

  if (!cached || now - cachedAt > CACHE_TTL_MS) {
    try {
      await checkDbConnection();
      cached = { status: 'ok', database: 'connected' };
    } catch (error) {
      // BE-07 (docs/arquitetura/seguranca.md): a mensagem crua do driver (ex.:
      // host/IP interno do Postgres gerenciado, motivo exato da falha de autenticação) não
      // deve vazar num endpoint público e sem login — só no log do servidor.
      console.error('Health — banco indisponível:', error.message);
      cached = { status: 'error', database: 'disconnected' };
    }
    cachedAt = now;
  }

  const statusCode = cached.status === 'ok' ? 200 : 500;
  return res.status(statusCode).json({
    ...cached,
    service: 'auth-api',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
