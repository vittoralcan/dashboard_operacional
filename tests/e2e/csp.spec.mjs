import { test, expect } from './fixtures.mjs';

/** CSP e terceiros (RNB-014): o servidor de teste aplica a política do .htaccess em modo BLOQUEIO. */

test('a casca e a seleção de projetos carregam sem nenhuma violação de CSP (política do .htaccess em bloqueio)', async ({ page, abrir }) => {
  await abrir('#/projetos');
  await expect(page.locator('.bento .card').first()).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('dsn-csp'))).toBeNull();
});

test('os cabeçalhos de segurança do .htaccess chegam em /app/', async ({ request }) => {
  const r = await request.get('/app/index.html');
  const h = r.headers();
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['content-security-policy']).toContain("script-src 'self'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy']).toContain('camera=(self)');
});

test('o registrador de violações funciona: um recurso de terceiro bloqueado é anotado em dsn-csp', async ({ page, abrir, problemas }) => {
  await abrir('#/projetos');
  await expect(page.locator('.bento .card').first()).toBeVisible();
  await page.evaluate(() => { const i = new Image(); i.src = 'https://exemplo-terceiro.test/pixel.png'; document.body.append(i); });
  await expect.poll(() => page.evaluate(() => (JSON.parse(sessionStorage.getItem('dsn-csp') || '[]')).length)).toBeGreaterThan(0);
  const item = await page.evaluate(() => JSON.parse(sessionStorage.getItem('dsn-csp'))[0]);
  expect(item.diretiva).toBe('img-src');
  expect(item.bloqueado).toBe(true);
  problemas.length = 0; // este teste PROVOCOU a violação de propósito
});

const carregar = (page, arquivo, global) => page.evaluate(([a, g]) => new Promise((ok, falha) => {
  const el = document.createElement('script');
  el.src = a; el.onload = () => ok(typeof window[g]); el.onerror = () => falha(new Error('não carregou')); document.head.append(el);
}), [arquivo, global]);

test('as bibliotecas hospedadas (planilha XLSX e leitor de QR) rodam sob a CSP, sem eval nem terceiros', async ({ page, abrir }) => {
  await abrir('#/projetos');
  await expect(page.locator('.bento .card').first()).toBeVisible();
  expect(await carregar(page, 'vendor/xlsx-0.20.3.full.min.js', 'XLSX')).toBe('object');
  expect(await carregar(page, 'vendor/html5-qrcode-2.3.8.min.js', 'Html5Qrcode')).toBe('function');
  // gerar uma planilha de verdade (é o que o botão Exportar faz) também não pode violar a política
  const bytes = await page.evaluate(() => { const ws = window.XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2]]); const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, 'T'); return window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' }).byteLength; });
  expect(bytes).toBeGreaterThan(100);
});
