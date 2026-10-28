import { test, expect } from './fixtures.mjs';

/** RN-008 (contador do fluxograma), de ponta a ponta. */

test('RN-008: o contador "paradas no fluxo" do fluxograma sai do traço e mostra números depois da leitura das fases', async ({ page, abrir }) => {
  await abrir('#/atlas/negativos/fluxograma');
  await expect(page.locator('.fnode').first()).toBeVisible();
  await expect(page.locator('[data-par="pastas"]')).not.toHaveText('—', { timeout: 15_000 });
  await expect(page.locator('[data-par="imagens"]')).not.toHaveText('—');
});
