import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Verificações estáticas do frontend novo: segurança (RNB-004/005/014),
 * integridade do sprite de ícones e ausência de terceiros em tempo de execução.
 */

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'app');

function arquivos(dir, ext, saida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor') arquivos(p, ext, saida); } else if (ext.some((x) => e.name.endsWith(x))) saida.push(p);
  }
  return saida;
}
const rel = (p) => path.relative(RAIZ, p).replace(/\\/g, '/');
const ler = (p) => fs.readFileSync(p, 'utf8');
const JS = arquivos(RAIZ, ['.js']);
const CSS = arquivos(RAIZ, ['.css']);
const HTML = arquivos(RAIZ, ['.html']);

test('RNB-004: nenhum innerHTML recebe template literal puro com interpolação (use html`…`)', () => {
  const ruins = [];
  for (const f of JS) {
    ler(f).split('\n').forEach((linha, i) => {
      if (/\.innerHTML\s*[+]?=\s*`[^`]*\$\{/.test(linha)) ruins.push(`${rel(f)}:${i + 1}`);
      if (/\.innerHTML\s*[+]?=\s*[^;]*\+\s*\w/.test(linha) && !/\.toString\(\)/.test(linha)) ruins.push(`${rel(f)}:${i + 1} (concatenação)`);
    });
  }
  assert.deepEqual(ruins, []);
});

test('RNB-004: nada de insertAdjacentHTML, document.write, eval, new Function, outerHTML=', () => {
  const ruins = [];
  for (const f of JS) {
    const t = ler(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const re of [/insertAdjacentHTML\s*\(/, /document\.write\s*\(/, /\beval\s*\(/, /new Function\s*\(/, /\.outerHTML\s*=/]) {
      if (re.test(t)) ruins.push(`${rel(f)} → ${re}`);
    }
  }
  assert.deepEqual(ruins, []);
});

test('CSP: nenhum handler inline (onclick=…) em HTML nem em markup de JS', () => {
  const ruins = [];
  for (const f of [...HTML, ...JS]) {
    const t = ler(f);
    if (/\son[a-z]+\s*=\s*["'{]/i.test(t.replace(/\/\/.*$/gm, ''))) ruins.push(rel(f));
  }
  assert.deepEqual(ruins, []);
});

test('CSP: index.html sem <script> inline e sem <style> inline', () => {
  const t = ler(path.join(RAIZ, 'index.html'));
  assert.deepEqual(t.match(/<script(?![^>]*\bsrc=)[^>]*>/gi) || [], []);
  assert.deepEqual(t.match(/<style[\s>]/gi) || [], []);
});

test('CSP: nenhum <style> criado por JS (style-src \'self\')', () => {
  const ruins = JS.filter((f) => /createElement\(\s*['"]style['"]\s*\)/.test(ler(f))).map(rel);
  assert.deepEqual(ruins, []);
});

test('RNB-014: sem terceiros em runtime — nenhuma URL absoluta em HTML/CSS/JS além das APIs do projeto', () => {
  const permitidas = [/^https?:\/\/localhost[:/]/, /^https:\/\/(auth|painel)\.example\.com/,
    /^http:\/\/www\.w3\.org\/2000\/svg/, /^https:\/\/claude\.ai/,
    /^https:\/\/script\.google\.com\/macros\/s\//]; // GAS do Monitoramento: única chamada a terceiro, sem o token do painel (some com `monitor.nativo`)
  const ruins = [];
  for (const f of [...HTML, ...JS, ...CSS]) {
    const t = ler(f).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of t.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
      if (!permitidas.some((re) => re.test(m[0]))) ruins.push(`${rel(f)} → ${m[0]}`);
    }
  }
  assert.deepEqual(ruins, []);
});

test('RNB-014: nenhum <link>/<script> externo no index.html', () => {
  const t = ler(path.join(RAIZ, 'index.html'));
  assert.deepEqual([...t.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)].map((m) => m[0]), []);
});

test('RNB-005: sem cor hexadecimal fora de tokens.css (nem em JS)', () => {
  const ruins = [];
  for (const f of CSS.filter((p) => !p.endsWith('tokens.css'))) {
    const t = ler(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\("data:[^"]*"\)/g, '');
    for (const m of t.matchAll(/(^|[\s:,(])#([0-9a-fA-F]{3,8})(?![\w-])/g)) {
      // ignora seletores de id como "#tip" (não são hexadecimais válidos de cor se tiverem letras fora de a-f)
      if (/^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(m[2])) ruins.push(`${rel(f)} → #${m[2]}`);
    }
  }
  assert.deepEqual(ruins, []);
});

test('RNB-005: sem hexadecimal em estilos montados por JS (cores vêm de tokens)', () => {
  const ruins = [];
  for (const f of JS) {
    const t = ler(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of t.matchAll(/['"`]#[0-9a-fA-F]{6}['"`]/g)) ruins.push(`${rel(f)} → ${m[0]}`);
  }
  assert.deepEqual(ruins, []);
});

test('sprite de ícones: todo ic()/icf()/icone usado no código existe em assets/icons.svg', () => {
  const sprite = ler(path.join(RAIZ, 'assets', 'icons.svg'));
  const ids = new Set([...sprite.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map((m) => m[1]));
  const faltam = [];
  for (const f of JS) {
    const t = ler(f);
    for (const m of t.matchAll(/\bic\(\s*['"]([a-z0-9-]+)['"]/g)) if (!ids.has(m[1])) faltam.push(`${rel(f)} → ic('${m[1]}')`);
    for (const m of t.matchAll(/\bicf\(\s*['"]([a-z0-9-]+)['"]/g)) if (!ids.has(`${m[1]}-fill`)) faltam.push(`${rel(f)} → icf('${m[1]}')`);
    for (const m of t.matchAll(/\bicone:\s*['"]([a-z0-9-]+)['"]/g)) if (!ids.has(m[1])) faltam.push(`${rel(f)} → icone: '${m[1]}'`);
    for (const m of t.matchAll(/\bICONE\s*=[^;]*\{([^}]*)\}/g)) for (const n of m[1].matchAll(/:\s*'([a-z0-9-]+)'/g)) if (!ids.has(`${n[1]}-fill`)) faltam.push(`${rel(f)} → ICONE ${n[1]}`);
  }
  assert.deepEqual(faltam, []);
});

test('sprite de ícones: SVG sem script nem atributo de evento (vem de pacote de terceiros)', () => {
  const sprite = ler(path.join(RAIZ, 'assets', 'icons.svg'));
  assert.doesNotMatch(sprite, /<script|\son[a-z]+=|javascript:|<foreignObject|xlink:href="http/i);
});

test('arquivos de código respeitam o limite de 400 linhas', () => {
  const grandes = [...JS, ...CSS].map((f) => [rel(f), ler(f).split('\n').length]).filter(([, n]) => n > 400);
  assert.deepEqual(grandes, []);
});

test('fontes: Geist e Geist Mono hospedadas, dentro do orçamento (≤ 120 KB no total)', () => {
  const dir = path.join(RAIZ, 'assets', 'fonts');
  const woff = fs.readdirSync(dir).filter((n) => n.endsWith('.woff2'));
  assert.deepEqual(woff.sort(), ['Geist-Variable.woff2', 'GeistMono-Variable.woff2']);
  const total = woff.reduce((s, n) => s + fs.statSync(path.join(dir, n)).size, 0);
  assert.ok(total <= 120 * 1024, `fontes somam ${(total / 1024).toFixed(0)} KB`);
  assert.ok(fs.existsSync(path.join(dir, 'LICENSE-Geist-OFL.txt')), 'licença OFL junto das fontes');
});

test('sprite de ícones dentro do orçamento (≤ 25 KB com gzip)', async () => {
  const { gzipSync } = await import('node:zlib');
  const tam = gzipSync(fs.readFileSync(path.join(RAIZ, 'assets', 'icons.svg'))).length;
  assert.ok(tam <= 25 * 1024, `sprite gz = ${(tam / 1024).toFixed(1)} KB`);
});

test('todo import relativo aponta para um arquivo que existe', () => {
  const quebrados = [];
  for (const f of JS) {
    for (const m of ler(f).matchAll(/(?:from|import\()\s*['"](\.[^'"]+)['"]/g)) {
      if (!fs.existsSync(path.resolve(path.dirname(f), m[1]))) quebrados.push(`${rel(f)} → ${m[1]}`);
    }
  }
  assert.deepEqual(quebrados, []);
});

test('index.html referencia CSS, fontes e scripts que existem', () => {
  const t = ler(path.join(RAIZ, 'index.html'));
  const faltam = [];
  for (const m of t.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    if (/^(https?:|data:|#)/.test(m[1])) continue;
    if (!fs.existsSync(path.join(RAIZ, m[1]))) faltam.push(m[1]);
  }
  assert.deepEqual(faltam, []);
});

test('index.html: lang pt-BR, viewport, camadas e contêineres exigidos pelo código', () => {
  const t = ler(path.join(RAIZ, 'index.html'));
  assert.match(t, /<html lang="pt-BR"/);
  assert.match(t, /name="viewport"/);
  for (const id of ['topbar-progress', 'wipe', 'auth', 'shell', 'view', 'macro', 'modais', 'toasts', 'tip', 'chordHint']) assert.match(t, new RegExp(`id="${id}"`), id);
});
