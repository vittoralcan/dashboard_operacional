import { test, expect } from './fixtures.mjs';

/** Fluxograma: zoom, ajuste, minimapa, modal da fase e foco vindo de uma notificação. */

test('zoom por botão e teclado, "Ajustar à tela" e minimapa', async ({ page, abrir }) => {
  await abrir('#/atlas/negativos/fluxograma');
  await expect(page.locator('.fnode').first()).toBeVisible();
  const pct = () => page.locator('[data-pct]').innerText();
  await page.locator('[data-z="fit"]').click();
  const antes = parseInt(await pct(), 10);
  await page.locator('[data-z="in"]').click();
  await expect.poll(async () => parseInt(await pct(), 10)).toBeGreaterThan(antes);
  await page.locator('[data-z="out"]').click();
  await page.locator('[data-z="out"]').click();
  await expect.poll(async () => parseInt(await pct(), 10)).toBeLessThan(antes);
  await page.keyboard.press('0'); // ajustar
  await expect.poll(async () => parseInt(await pct(), 10)).toBe(antes);
  await expect(page.locator('[data-mmap] .mm-n').first()).toBeVisible();
});

test('clicar numa fase abre o modal com o nome dela; Esc fecha e devolve o foco ao nó', async ({ page, abrir }) => {
  await abrir('#/atlas/negativos/fluxograma');
  const no = page.locator('.fnode').first();
  await expect(no).toBeVisible();
  await no.click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});

test('notificação de gargalo abre o fluxograma da instância com a fase em destaque', async ({ page, abrir }) => {
  await abrir('#/projetos');
  await page.locator('#btnNotif .badge-count').waitFor();
  await page.locator('#btnNotif').click();
  await page.locator('.notif-pop .notif').first().click();
  await expect(page).toHaveURL(/#\/atlas\/certidoes\/fluxograma$/);
  await expect(page.locator('.fnode.focus')).toHaveCount(1);
});
