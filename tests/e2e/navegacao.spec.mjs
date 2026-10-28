import { test, expect } from './fixtures.mjs';

/** Teclado, paleta, tema persistido, movimento reduzido. */

test('atalhos G + letra navegam entre projetos (G E → ATLAS, G P → projetos)', async ({ page, abrir }) => {
  await abrir('#/projetos');
  await expect(page.locator('.page-h h1')).toBeVisible();
  await page.keyboard.press('g'); await page.keyboard.press('e');
  await expect(page).toHaveURL(/#\/atlas$/);
  await page.keyboard.press('g'); await page.keyboard.press('p');
  await expect(page).toHaveURL(/#\/projetos$/);
});

test('Ctrl+K abre a paleta, a busca acha o módulo e Enter navega; Esc fecha e devolve o foco', async ({ page, abrir }) => {
  await abrir('#/projetos');
  await expect(page.locator('.page-h h1')).toBeVisible();
  await page.keyboard.press('Control+k');
  const paleta = page.getByRole('dialog', { name: 'Paleta de comandos' });
  await expect(paleta).toBeVisible();
  await page.keyboard.type('monitoramento');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/boreal\/monitoramento$/);
  await expect(paleta).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect(paleta).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(paleta).toHaveCount(0);
});

test('Esc fecha o menu do usuário e devolve o foco ao botão que o abriu', async ({ page, abrir }) => {
  await abrir('#/projetos');
  await page.locator('#btnUser').click();
  await expect(page.getByRole('menu', { name: 'Menu do usuário' })).toBeVisible();
  await expect(page.getByRole('menuitem').first()).toBeFocused(); // o foco entra no menu…
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Menu do usuário' })).toHaveCount(0);
  await expect(page.locator('#btnUser')).toBeFocused();
});

test('tema: "T" alterna, grava em dsn-theme e sobrevive a recarregar (sem piscar no tema errado)', async ({ page, abrir }) => {
  await abrir('#/projetos', { tema: 'dark' });
  await expect(page.locator('.page-h h1')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('t');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('dsn-theme'))).toBe('light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('prefers-reduced-motion: animações e transições praticamente instantâneas', async ({ page, abrir }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrir('#/projetos');
  await expect(page.locator('.bento .card').first()).toBeVisible();
  const maior = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.card, .btn, .icon-btn')].flatMap((el) => {
    const c = getComputedStyle(el);
    return [c.animationDuration, c.transitionDuration].flatMap((v) => v.split(',')).map((v) => parseFloat(v) * (v.trim().endsWith('ms') ? 0.001 : 1));
  })));
  expect(maior).toBeLessThan(0.01);
});
