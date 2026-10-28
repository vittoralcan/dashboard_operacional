import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Liberação controlada da nova versão (Onda 9): `.htaccess` (CSP em modo relatório, cabeçalhos, cache) coerente com o código,
 * migração completa (endereços antigos só redirecionam) e CI que barra o deploy.
 */

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ler = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');
const HTACCESS = ler('public', 'app', '.htaccess');
const CSP = (/Header always set (Content-Security-Policy(?:-Report-Only)?) "([^"]+)"/.exec(HTACCESS) || []);
const diretivas = Object.fromEntries((CSP[2] || '').split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [n, ...v] = d.split(/\s+/); return [n, v]; }));

test('CSP do .htaccess: política estrita, em modo RELATÓRIO até o "enforce" da Onda 10', () => {
  assert.equal(CSP[1], 'Content-Security-Policy-Report-Only', 'em relatório até a rodada limpa de homologação');
  assert.deepEqual(diretivas['default-src'], ["'self'"]);
  assert.deepEqual(diretivas['script-src'], ["'self'"], 'sem unsafe-inline nem unsafe-eval em scripts');
  assert.deepEqual(diretivas['style-src'], ["'self'"]);
  assert.deepEqual(diretivas['style-src-attr'], ["'unsafe-inline'"], 'só os style="--i" pontuais');
  assert.deepEqual(diretivas['object-src'], ["'none'"]);
  assert.deepEqual(diretivas['base-uri'], ["'none'"]);
  assert.deepEqual(diretivas['frame-ancestors'], ["'none'"]);
  assert.deepEqual(diretivas['form-action'], ["'self'"]);
  assert.ok('upgrade-insecure-requests' in diretivas);
  for (const d of ['script-src', 'style-src', 'default-src']) assert.ok(!diretivas[d].some((v) => /unsafe-eval|\*$|^https?:$/.test(v)), `${d} sem curinga`);
});

test('CSP: connect-src libera exatamente as origens que js/config.js usa (e nada de localhost em produção)', () => {
  const cfg = ler('public', 'app', 'js', 'config.js');
  const esperadas = new Set();
  // bases de API de PRODUÇÃO, o túnel do BOREAL e o Apps Script do Monitoramento
  for (const m of cfg.matchAll(/'(https:\/\/[^']+)'/g)) esperadas.add(new URL(m[1]).origin);
  const liberadas = new Set(diretivas['connect-src'].filter((v) => v.startsWith('https://')));
  for (const o of esperadas) assert.ok(liberadas.has(o), `config.js usa ${o}, mas connect-src não libera`);
  assert.ok(liberadas.has('https://script.googleusercontent.com'), 'o Apps Script redireciona a resposta para esta origem');
  assert.ok(![...diretivas['connect-src']].some((v) => /localhost|127\.0\.0\.1/.test(v)), 'APIs locais só no modo DEV');
});

test('.htaccess: cabeçalhos de segurança e cache (HTML/JS/CSS revalidam; vendor versionado é imutável)', () => {
  for (const h of ['X-Content-Type-Options "nosniff"', 'X-Frame-Options "DENY"', 'Referrer-Policy "strict-origin-when-cross-origin"']) assert.ok(HTACCESS.includes(h), h);
  assert.match(HTACCESS, /Permissions-Policy "camera=\(self\)/, 'câmera só para o scanner');
  assert.match(HTACCESS, /FilesMatch "\\\.\(html\|js\|mjs\|css\|json\|svg\)\$"[\s\S]*?Cache-Control "no-cache"/);
  assert.match(HTACCESS, /xlsx\|html5-qrcode[\s\S]*?immutable/);
  assert.match(HTACCESS, /mod_deflate/);
  assert.ok(!/immutable[\s\S]{0,80}woff2/.test(HTACCESS), 'fonte sem versão no nome não pode ser immutable');
  // tudo dentro de <IfModule>: sem o módulo a diretiva é ignorada (nunca erro 500)
  const fora = HTACCESS.replace(/<IfModule[\s\S]*?<\/IfModule>/g, '').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  assert.deepEqual(fora, [], 'nada fora de <IfModule>: `Options` exige AllowOverride Options e daria erro 500 em /app/ se o servidor não permitir');
});

test('index.html carrega o registrador de CSP antes de qualquer outro recurso, como script externo síncrono', () => {
  const t = ler('public', 'app', 'index.html');
  const i = t.indexOf('js/csp-relato.js');
  assert.ok(i > 0 && i < t.indexOf('js/anti-fouc.js') && i < t.indexOf('rel="stylesheet"') && i < t.indexOf('type="module"'));
  assert.doesNotMatch(t.match(/<script[^>]*csp-relato[^>]*>/)[0], /defer|async|module/);
  const js = ler('public', 'app', 'js', 'csp-relato.js');
  assert.match(js, /securitypolicyviolation/);
  assert.doesNotMatch(js, /\bfetch\b|XMLHttpRequest|sendBeacon/, 'nada sai do navegador');
});

// ---------------------------------------------------------------- migração completa (cutover): o sistema antigo virou redirecionamento
const PUBLIC = path.join(REPO, 'public');
function htmlsAntigos(dir = PUBLIC, saida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'app') htmlsAntigos(p, saida); } else if (e.name.endsWith('.html')) saida.push(p);
  }
  return saida;
}

// No showcase não há endereços antigos: só a raiz (public/index.html), que leva ao app/.
test('raiz: public/index.html só redireciona para o app/', () => {
  const t = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  assert.ok(t.length < 1500, 'deve ser só um redirecionamento');
  assert.match(t, /http-equiv="refresh" content="0;url=app\//);
});

test('cutover: não sobrou nada do modelo antigo (scripts, CSS, Tailwind, "Experimentar"/"Voltar à versão anterior")', () => {
  for (const f of ['auth.js', 'settings-panel.js', 'theme.css', 'custom-cursor.js', 'tv-mode.js', 'macro-view.js']) {
    assert.ok(!fs.existsSync(path.join(PUBLIC, f)), `${f} deveria ter sido removido`);
  }
  const todos = [...htmlsAntigos(), ...fs.readdirSync(path.join(PUBLIC, 'app', 'js', 'features', 'shell')).map((n) => path.join(PUBLIC, 'app', 'js', 'features', 'shell', n))];
  for (const f of todos) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /Experimentar a nova versão|Voltar à versão anterior|experimentar-nova-versao/, path.relative(REPO, f));
});

test('o painel novo não tem mais "Voltar à versão anterior" (nem no menu, nem na paleta)', () => {
  assert.doesNotMatch(ler('public', 'app', 'js', 'features', 'shell', 'menus.js'), /data-k="voltar"|aoVoltar/);
  const casca = ler('public', 'app', 'js', 'features', 'shell', 'casca.js');
  assert.doesNotMatch(casca, /Voltar à versão|legadoDe|aoVoltar/);
});

test('CI: o deploy do front só roda depois da verificação; a verificação cobre unitários, orçamentos, segurança e E2E', () => {
  const deploy = ler('.github', 'workflows', 'deploy-frontend.yml');
  assert.match(deploy, /verificar:\s*\n\s*uses: \.\/\.github\/workflows\/verificar-frontend\.yml/);
  assert.match(deploy, /deploy:\s*\n\s*needs: verificar/);
  const v = ler('.github', 'workflows', 'verificar-frontend.yml');
  for (const trecho of ['pull_request:', 'workflow_call:', 'node --test "tests/app/*.test.js"', 'scripts/app-orcamentos.mjs', 'estatico.test.js', 'npx playwright install --with-deps chromium', 'npx playwright test']) assert.ok(v.includes(trecho), trecho);
  assert.ok(fs.existsSync(path.join(REPO, 'tests', 'e2e', 'package-lock.json')), 'npm ci precisa do lockfile');
});

test('E2E: o servidor de teste aplica a CSP do .htaccess em bloqueio e há specs para acesso, teclado, RN-008, CSP e axe', () => {
  const srv = ler('tests', 'e2e', 'servidor.mjs');
  assert.match(srv, /'content-security-policy': csp/);
  const specs = fs.readdirSync(path.join(REPO, 'tests', 'e2e')).filter((n) => n.endsWith('.spec.mjs'));
  assert.deepEqual(specs.sort(), ['acessibilidade.spec.mjs', 'acesso.spec.mjs', 'blocos.spec.mjs', 'cadastros-operacionais.spec.mjs', 'csp.spec.mjs', 'envio.spec.mjs', 'fluxograma.spec.mjs', 'navegacao.spec.mjs', 'regras-de-negocio.spec.mjs', 'relatorio-operacional.spec.mjs', 'responsivo.spec.mjs', 'tablet.spec.mjs']);
  const regras = ler('tests', 'e2e', 'regras-de-negocio.spec.mjs');
  for (const rn of ['RN-008']) assert.ok(regras.includes(rn), rn);
});
