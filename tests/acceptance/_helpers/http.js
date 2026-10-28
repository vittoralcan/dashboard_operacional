// Utilitários dos testes de aceite do back_dashboard: sobe um router Express numa porta efêmera,
// com o usuário autenticado simulado, e fala com ele por HTTP real (fetch). Os pacotes (express,
// jsonwebtoken…) vêm do node_modules do serviço, porque a raiz do repositório não tem dependências.
const path = require('node:path');
const http = require('node:http');

const BACK = path.resolve(__dirname, '../../../services/back_dashboard');
const requireBack = (modulo) => require(require.resolve(modulo, { paths: [BACK] }));
const express = requireBack('express');

/**
 * @param {(app: import('express').Express) => void} montar  registra os routers em /api
 * @param {object|null} usuario  o que o middleware de autenticação poria em req.usuario
 */
async function subir(montar, usuario) {
  const app = express();
  app.use((req, _res, next) => { if (usuario) req.usuario = usuario; next(); });
  montar(app);
  const servidor = http.createServer(app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  async function chamar(metodo, caminho, corpo) {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: corpo === undefined ? {} : { 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* corpo não JSON */ }
    return { status: r.status, json, texto, headers: r.headers };
  }
  return {
    get: (c) => chamar('GET', c),
    post: (c, b) => chamar('POST', c, b ?? {}),
    put: (c, b) => chamar('PUT', c, b ?? {}),
    patch: (c, b) => chamar('PATCH', c, b ?? {}),
    delete: (c) => chamar('DELETE', c),
    fechar: () => new Promise((ok) => servidor.close(ok)),
  };
}

/**
 * Banco simulado: `regras` é uma lista de [regex-do-SQL, (params, sql) => ({ rows, rowCount })].
 * A primeira regra que casa responde; SQL sem regra lança erro (o teste enxerga consulta inesperada).
 * `chamadas` guarda { sql, params } de tudo que foi executado.
 */
function bancoSimulado(regras = []) {
  const chamadas = [];
  return {
    chamadas,
    async query(sql, params = []) {
      chamadas.push({ sql, params });
      for (const [padrao, resposta] of regras) {
        if (padrao.test(sql)) {
          const r = await resposta(params, sql);
          return { rows: r?.rows ?? [], rowCount: r?.rowCount ?? (r?.rows?.length ?? 0) };
        }
      }
      throw new Error(`consulta inesperada: ${sql.replace(/\s+/g, ' ').slice(0, 80)}`);
    },
  };
}

const exigirAdmin = (req, res, next) => (req.usuario?.tipo === 'admin'
  ? next()
  : res.status(403).json({ success: false, message: 'Acesso restrito a administradores.' }));

module.exports = { BACK, requireBack, subir, bancoSimulado, exigirAdmin };
