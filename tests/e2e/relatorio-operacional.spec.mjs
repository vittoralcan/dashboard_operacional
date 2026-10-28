// Relatório hora a hora (#/operacional/relatorios): gráfico, tabela por pessoa e tempo médio, em computador e celular.
import { test, expect } from './fixtures.mjs';
import { instalar } from './mock-api.mjs';

const zeros = (o) => Array.from({ length: 24 }, (_, h) => o[h] || 0);
const PROJETOS = [{ id: 5, slug: 'caixas', nome: 'Caixas', turnos: [{ id: 8, nome: 'Matutino' }, { id: 9, nome: 'Vespertino' }] }];
const HORA_A_HORA = {
  data: '2026-10-20', total: 6,
  horas: [{ hora: 8, caixas: 3 }, { hora: 10, caixas: 3 }],
  colaboradores: [
    { colaboradorId: 2, nome: 'Érica Dias', total: 1, horas: zeros({ 8: 1 }) },
    { colaboradorId: 1, nome: 'Ana Lima', total: 5, horas: zeros({ 8: 2, 10: 3 }) },
  ],
};
const TEMPO_MEDIO = {
  caixas: 6, mediaGeralS: 650,
  colaboradores: [
    { colaboradorId: 2, nome: 'Érica Dias', caixas: 1, totalS: 900, mediaS: 900 },
    { colaboradorId: 1, nome: 'Ana Lima', caixas: 5, totalS: 3000, mediaS: 600 },
  ],
};

async function instalarRelatorios(page, usuario, { vazio = false } = {}) {
  await instalar(page, { usuario });
  await page.route(/localhost:3010\/api\/operacional\/relatorios\//, async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const json = (o) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const p = new URL(req.url()).pathname;
    if (p.endsWith('/projetos')) return json({ success: true, data: { projetos: PROJETOS } });
    if (p.endsWith('/hora-a-hora')) return json({ success: true, data: vazio ? { data: '2026-10-20', total: 0, horas: [], colaboradores: [] } : HORA_A_HORA });
    if (p.endsWith('/tempo-medio')) return json({ success: true, data: vazio ? { caixas: 0, mediaGeralS: 0, colaboradores: [] } : TEMPO_MEDIO });
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
}

for (const usuario of ['maria', 'rafael']) {
  test(`${usuario} vê o relatório hora a hora no computador e no celular`, async ({ page }, testInfo) => {
    await instalarRelatorios(page, usuario);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/index.html#/operacional/relatorios');
    await expect(page.getByRole('heading', { name: 'Relatório hora a hora' })).toBeVisible();
    await expect(page.locator('.relop-col.pico')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('#tabela-pessoas tbody tr').first()).toContainText('Ana Lima');
    await expect(page.locator('#tabela-tempo tbody tr')).toHaveCount(2);
    await expect(page.locator('[data-media-geral]')).toHaveText('10 min 50 s');
    await page.screenshot({ path: testInfo.outputPath(`relatorio-${usuario}-1440.png`), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#tabela-pessoas')).toBeVisible();
    const sem = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(sem, 'a página não pode rolar na horizontal no celular').toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`relatorio-${usuario}-390.png`), fullPage: true });
  });
}

test('dia sem produção mostra o estado vazio', async ({ page }) => {
  await instalarRelatorios(page, 'maria', { vazio: true });
  await page.goto('/app/index.html#/operacional/relatorios');
  await expect(page.getByRole('heading', { name: 'Sem produção neste dia' })).toBeVisible({ timeout: 15_000 });
});
