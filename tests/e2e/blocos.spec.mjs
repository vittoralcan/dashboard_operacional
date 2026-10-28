import { test, expect } from './fixtures.mjs';

/** Blocos que carregam sob demanda (RNB-015) e dependem do backend novo: continuam aparecendo, e o 404 os devolve a "Em breve". */

test('Home: "Gargalos agora" e "Atividade recente" aparecem; clicar no gargalo abre o fluxograma com a fase em foco', async ({ page, abrir }) => {
  await abrir('#/projetos');
  const gargalo = page.locator('.gargalo-i').first();
  await expect(gargalo).toContainText('Controle de Qualidade');
  await expect(page.locator('.atividade-home')).toContainText('definiu a meta');
  await gargalo.click();
  await expect(page).toHaveURL(/#\/atlas\/certidoes\/fluxograma$/);
  await expect(page.locator('.fnode.focus')).toHaveCount(1);
});

test('backend antigo (404 nas rotas novas): a Home segue funcionando e os blocos viram "Em breve"', async ({ page, abrir }) => {
  await abrir('#/projetos', { semBackendNovo: true });
  await expect(page.locator('[data-proj="atlas"] [data-k=kpi]')).not.toHaveText('—', { timeout: 15_000 });
  await expect(page.locator('.gargalos')).toContainText(/Em breve/i, { timeout: 15_000 });
  await expect(page.locator('.atividade-home')).toContainText(/Em breve/i);
});

test('barra lateral (NAV-10): "em andamento" por fluxo e online/total das APIs, com ponto vermelho quando há API fora', async ({ page, abrir }) => {
  await abrir('#/projetos', { apisOff: 1 });
  const item = (nome) => page.locator('.sb-item', { hasText: nome });
  await expect(item('Negativos').locator('[data-cnt]')).toHaveText('116', { timeout: 15_000 }); // 58 × 2 do mock de /painel/resumo
  await expect(item('Certidões').locator('[data-cnt]')).toHaveText('174');
  const monit = item('BOREAL');
  await expect(monit.locator('[data-cnt]')).toHaveText('5/6', { timeout: 15_000 });
  await expect(monit.locator('[data-cnt]')).toHaveClass(/err-t/);
  await expect(monit.locator('.mini-dot.err')).toBeVisible();
  await expect(item('Negativos').locator('.mini-dot.err')).toBeHidden();
});

test('barra lateral (NAV-10): tudo online → sem ponto vermelho; sair da conta apaga os contadores', async ({ page, abrir }) => {
  await abrir('#/projetos', { apisOff: 0 });
  const monit = page.locator('.sb-item', { hasText: 'BOREAL' });
  await expect(monit.locator('[data-cnt]')).toHaveText('6/6', { timeout: 15_000 });
  await expect(monit.locator('.mini-dot.err')).toBeHidden();
  await page.locator('#btnUser').click();
  await page.getByRole('menuitem', { name: /Sair/ }).click();
  await expect(page).toHaveURL(/#\/login$/);
  expect(await page.evaluate(() => document.querySelectorAll('[data-cnt]:not([hidden])').length)).toBe(0);
});

test('backend novo no ar, mas sem o banco (500 nas rotas novas): Home, hubs e fluxo seguem com os números; só os blocos novos mostram aviso', async ({ page, abrir }) => {
  const st = await abrir('#/projetos');
  for (const f of ['/metas', '/gargalos', '/atividades', '/notificacoes', '/painel/resumo', '/monitoramento', '/config', '/auth/me']) st.falhas.add(f);
  await page.reload();
  await expect(page.locator('[data-proj="atlas"] [data-k=kpi]')).not.toHaveText('—', { timeout: 15_000 }); // via composição por instância
  await expect(page.locator('.gargalos')).toContainText(/Não foi possível/i, { timeout: 15_000 });
  await expect(page.locator('.atividade-home')).toContainText(/Não foi possível/i);
  await page.goto('/app/index.html#/atlas/negativos/fluxograma'); // /config com 500 → configuração local
  await expect(page.locator('.fnode').first()).toBeVisible({ timeout: 15_000 });
  await page.goto('/app/index.html#/perfil');
  await expect(page.locator('#view')).toBeVisible();
  await page.goto('/app/index.html#/boreal/monitoramento'); // monitor nativo com 500 → Apps Script
  await expect(page.locator('.api-row').first()).toBeVisible({ timeout: 15_000 });
});
