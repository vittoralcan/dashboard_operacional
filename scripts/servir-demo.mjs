// Servidor estático do modo demonstração (sem dependências): serve `public/` e aplica a CSP de `public/app/.htaccess` em modo
// BLOQUEIO, como no E2E. Os dados são fictícios e simulados no navegador (`public/app/demo/`): nenhum backend é necessário.
//   node scripts/servir-demo.mjs          → http://localhost:4173/app/demo.html
//   DEMO_PORTA=8080 node scripts/servir-demo.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORTA = Number(process.env.DEMO_PORTA || 4173);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
};

/** CSP e cabeçalhos de segurança de `/app/.htaccess` (a mesma fonte que a hospedagem usa). Em http local, sem o upgrade para https. */
function cabecalhosDoApp() {
  const t = fs.readFileSync(path.join(RAIZ, 'app', '.htaccess'), 'utf8');
  const m = /Header always set Content-Security-Policy(?:-Report-Only)?\s+"([^"]+)"/.exec(t);
  /** @type {Record<string, string>} */
  const h = {};
  if (m) h['content-security-policy'] = m[1].replace(/connect-src /, 'connect-src http://localhost:3002 http://localhost:3010 ').replace(/;?\s*upgrade-insecure-requests/, '');
  for (const x of t.matchAll(/Header always set (X-Content-Type-Options|X-Frame-Options|Referrer-Policy|Permissions-Policy|Cross-Origin-Opener-Policy)\s+"([^"]+)"/g)) h[x[1].toLowerCase()] = x[2];
  return h;
}

const cabApp = cabecalhosDoApp();

http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const arq = path.normalize(path.join(RAIZ, rel));
  if (!arq.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
  fs.readFile(arq, (e, dados) => {
    if (e) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('não encontrado'); return; }
    res.writeHead(200, { 'content-type': MIME[/** @type {keyof typeof MIME} */ (path.extname(arq))] || 'application/octet-stream', 'cache-control': 'no-cache', ...(rel.startsWith('/app/') ? cabApp : {}) });
    res.end(dados);
  });
}).listen(PORTA, '127.0.0.1', () => {
  console.log(`\nPainel Operacional · demonstração com dados fictícios\n\n  Abra: http://localhost:${PORTA}/app/demo.html\n`);
  console.log('  gestor / gestor123      administrador: projetos, fluxogramas, Macro View, metas, envio, operacional');
  console.log('  operador / operador123  conta de turno: tablet (higienização/remontagem) e digitalização');
  console.log('  leitor / leitor123      somente leitura\n\nCtrl+C para parar.');
});
