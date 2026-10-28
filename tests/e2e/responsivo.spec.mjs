import { test, expect } from './fixtures.mjs';

/** Definição de Pronto (migration_plan §5): 1920, 1440, 1024, 768 e 390 px sem rolagem horizontal da PÁGINA em nenhuma tela. */

const LARGURAS = [[1920, 1080], [1440, 900], [1024, 768], [768, 1024], [390, 844]];
const TELAS = [
  ['#/projetos', '[data-proj="atlas"] [data-k=kpi]'],
  ['#/boreal/monitoramento', '.api-row'],
  ['#/atlas', '[data-mod="inventarios"]'],
  ['#/atlas/negativos', '.crumbs .cur'],
  ['#/perfil', '[data-v="email"]'],
  ['#/metas', '.metas-lin'],
  ['#/envio', '.hbar.funil'],
  ['#/usuarios/novo', '.crumbs .cur'],
];

for (const [largura, altura] of LARGURAS) {
  test(`sem rolagem horizontal da página em ${largura}×${altura}`, async ({ page, abrir }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await abrir('#/projetos', { envioInstancia: 'bridge-cliente-x' });
    const estouros = [];
    for (const [hash, pronto] of TELAS) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await expect(page.locator(pronto).first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(400);
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      if (sw > cw + 1) estouros.push(`${hash}: página com ${sw}px de largura numa janela de ${cw}px`);
    }
    expect(estouros).toEqual([]);
  });
}
