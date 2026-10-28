// Tablet do turno: Nova caixa → bip → nome → cronômetro → segundo bip → "Caixa concluída". Servidor simulado só aqui.
import { test, expect } from './fixtures.mjs';
import { instalar, jwt } from './mock-api.mjs';

const TURNO = { id: 90, nome: 'Matutino 1', login: 'matutino1', tipo: 'turno', precisaTrocarSenha: false };
const COLABORADORES = [
  { id: 12, nome: 'Zélia Prado', funcao: null, avatar: null },
  { id: 11, nome: 'Ana Lima', funcao: null, avatar: null },
  { id: 13, nome: 'Bruno Reis', funcao: null, avatar: null },
];

test('turno bipa uma caixa, escolhe o nome, vê o cronômetro e conclui no segundo bip', async ({ page }, testInfo) => {
  await instalar(page, { usuario: null });
  /** @type {any[]} */
  const abertas = [];
  await page.route(/localhost:3010\/api\/operacional\//, async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname.replace(/^\/api\/operacional\/terminal/, '');
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const json = (o, s = 200) => route.fulfill({ status: s, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const corpo = req.postDataJSON?.() ?? null;
    if (p === '/colaboradores') return json({ success: true, data: COLABORADORES });
    if (p === '/estado') return json({ success: true, data: { agora: new Date().toISOString(), abertas } });
    if (p === '/bip') {
      const aberta = abertas.find((c) => c.codigo === corpo.codigo);
      if (!aberta) return json({ success: true, data: { acao: 'iniciar', codigo: corpo.codigo } });
      abertas.splice(abertas.indexOf(aberta), 1);
      return json({ success: true, data: { acao: 'finalizar', codigo: corpo.codigo, duracaoS: 75 } });
    }
    if (p === '/caixas') {
      const c = COLABORADORES.find((x) => x.id === corpo.colaboradorId);
      abertas.push({ id: 1, codigo: corpo.codigo, colaboradorId: c.id, colaboradorNome: c.nome, mesaId: null, inicioEm: new Date().toISOString() });
      return json({ success: true, data: { id: 1 } }, 201);
    }
    return json({ success: false, message: 'Rota não encontrada.' }, 404);
  });
  await page.addInitScript(([t, usuario]) => {
    localStorage.setItem('dsn-auth-token', t);
    localStorage.setItem('dsn-auth-usuario', JSON.stringify(usuario));
  }, [jwt(TURNO), TURNO]);
  await page.setViewportSize({ width: 1024, height: 768 });

  await page.goto('/app/index.html#/tablet');
  await expect(page.getByRole('heading', { name: 'Matutino 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('01-inicial.png') });

  await page.getByRole('button', { name: 'Nova caixa' }).click();
  await page.locator('[data-codigo]').fill('AC-000123');
  await page.locator('[data-codigo]').press('Enter');
  await expect(page.getByRole('button', { name: 'Ana Lima' })).toBeVisible();
  const nomes = await page.locator('[data-colab]').allTextContents();
  expect(nomes).toEqual(['Ana Lima', 'Bruno Reis', 'Zélia Prado']);
  await page.screenshot({ path: testInfo.outputPath('02-lista-de-nomes.png') });

  await page.getByRole('button', { name: 'Bruno Reis' }).click();
  await expect(page.locator('.tab-cron')).toHaveCount(0); // o operador não vê tempo
  await expect(page.locator('.tab-caixa')).toContainText('AC-000123');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath('03-cronometro.png') });

  await page.locator('[data-codigo]').fill('AC-000123');
  await page.locator('[data-codigo]').press('Enter');
  await expect(page.locator('[data-faixa]')).toContainText('Caixa concluída');
  await page.screenshot({ path: testInfo.outputPath('04-concluida.png') });
});
