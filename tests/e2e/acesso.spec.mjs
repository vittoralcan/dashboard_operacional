import { test, expect } from './fixtures.mjs';

/** Login, guarda de rota, destino pós-login, papéis e saída. */

const entrar = async (page, login, senha) => {
  await page.fill('#login', login);
  await page.fill('#senha', senha);
  await page.click('#entrar');
};

test('login correto leva à seleção de projetos e guarda a sessão', async ({ page, abrir }) => {
  await abrir('#/login', { usuario: null });
  await entrar(page, 'rafael', 'Senha-Forte-123');
  await expect(page).toHaveURL(/#\/projetos$/, { timeout: 15_000 });
  await expect(page.locator('#shell')).toBeVisible();
  expect(await page.evaluate(() => !!localStorage.getItem('dsn-auth-token'))).toBe(true);
});

test('senha errada mostra a mensagem do servidor e continua no login', async ({ page, abrir }) => {
  await abrir('#/login', { usuario: null });
  await entrar(page, 'rafael', 'errada');
  await expect(page.locator('#erro-geral')).toContainText('Login ou senha inválidos', { timeout: 15_000 });
  await expect(page).toHaveURL(/#\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('dsn-auth-token'))).toBeNull();
});

test('429 (muitas tentativas) é explicado, sem travar o formulário para sempre', async ({ page, abrir }) => {
  await abrir('#/login', { usuario: null });
  await entrar(page, 'bloqueado', 'qualquer');
  await expect(page.locator('#erro-geral')).toContainText(/tentativas/i, { timeout: 15_000 });
});

test('usuário com senha temporária cai no primeiro acesso', async ({ page, abrir }) => {
  await abrir('#/login', { usuario: null });
  await entrar(page, 'novo', 'Temporaria-1');
  await expect(page).toHaveURL(/#\/primeiro-acesso$/, { timeout: 15_000 });
});

test('sem sessão, uma rota protegida manda ao login e VOLTA a ela depois de entrar', async ({ page, abrir }) => {
  await abrir('#/atlas/negativos', { usuario: null });
  await expect(page).toHaveURL(/#\/login$/);
  await entrar(page, 'rafael', 'Senha-Forte-123');
  await expect(page).toHaveURL(/#\/atlas\/negativos$/, { timeout: 15_000 });
});

test('usuário padrão não entra em tela de administrador', async ({ page, abrir }) => {
  await abrir('#/metas', { usuario: 'maria' });
  await expect(page.locator('#view')).toBeVisible();
  await expect(page).not.toHaveURL(/#\/metas$/);
  await expect(page.locator('.sb-item', { hasText: 'Metas mensais' })).toHaveCount(0);
});

test('administrador vê e abre a tela de Metas mensais', async ({ page, abrir }) => {
  await abrir('#/metas', { usuario: 'rafael' });
  await expect(page.locator('.metas-lin').first()).toBeVisible();
});

test('Sair encerra a sessão e volta ao login', async ({ page, abrir }) => {
  await abrir('#/projetos');
  await page.locator('#btnUser').click();
  await page.getByRole('menuitem', { name: /Sair/ }).click();
  await expect(page).toHaveURL(/#\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('dsn-auth-token'))).toBeNull();
});

test('token vencido no servidor (401) leva ao login com aviso', async ({ page, abrir }) => {
  const st = await abrir('#/projetos');
  await expect(page.locator('[data-proj="atlas"] [data-k=kpi]')).not.toHaveText('—', { timeout: 15_000 });
  st.status401 = true;
  await page.locator('#btnRefresh').click();
  await expect(page).toHaveURL(/#\/login$/, { timeout: 15_000 });
});
