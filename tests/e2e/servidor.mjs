// Servidor estático de `public/` para os testes E2E (sem dependências).
// Faz o que a hospedagem estática faz com `public/app/.htaccess`: lê a CSP DE LÁ e a aplica em modo BLOQUEIO (`Content-Security-Policy`).
// Assim, qualquer violação (script inline, recurso externo, imagem de outro domínio…) quebra a tela no teste — em vez de aparecer só no console.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const PORTA = Number(process.env.E2E_PORTA || 4173);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };

/** Política de `/app/.htaccess` (linha `Header always set Content-Security-Policy-Report-Only "…"`). */
export function cspDoHtaccess() {
  const t = fs.readFileSync(path.join(RAIZ, 'app', '.htaccess'), 'utf8');
  const m = /Header always set Content-Security-Policy(?:-Report-Only)?\s+"([^"]+)"/.exec(t);
  if (!m) throw new Error('CSP não encontrada em public/app/.htaccess');
  return m[1];
}

/** Em teste as APIs são as locais do modo DEV (js/config.js) e o servidor serve em http: acrescenta-as e tira o upgrade de https. */
export function cspParaTeste() {
  return cspDoHtaccess()
    .replace(/connect-src /, `connect-src http://localhost:3002 http://localhost:3010 `)
    .replace(/;?\s*upgrade-insecure-requests/, '');
}

/** Cabeçalhos do .htaccess que o teste também confere (os de segurança). */
export function cabecalhosDoHtaccess() {
  const t = fs.readFileSync(path.join(RAIZ, 'app', '.htaccess'), 'utf8');
  const h = {};
  for (const m of t.matchAll(/Header always set (X-Content-Type-Options|X-Frame-Options|Referrer-Policy|Permissions-Policy|Cross-Origin-Opener-Policy)\s+"([^"]+)"/g)) h[m[1]] = m[2];
  return h;
}

export function criarServidor() {
  const csp = cspParaTeste();
  const cab = cabecalhosDoHtaccess();
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const arq = path.normalize(path.join(RAIZ, rel));
    if (!arq.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
    fs.readFile(arq, (e, dados) => {
      if (e) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404'); return; }
      const noApp = rel.startsWith('/app/'); // o .htaccess só vale em /app/; o legado (fora dele) não leva CSP
      res.writeHead(200, { 'content-type': MIME[path.extname(arq)] || 'application/octet-stream', 'cache-control': 'no-cache', ...(noApp ? { 'content-security-policy': csp, ...cab } : {}) });
      res.end(dados);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  criarServidor().listen(PORTA, '127.0.0.1', () => console.log(`E2E: http://127.0.0.1:${PORTA}/app/ (CSP do .htaccess em modo bloqueio)`));
}
