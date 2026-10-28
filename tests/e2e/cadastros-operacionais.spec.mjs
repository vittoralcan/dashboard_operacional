import { test, expect } from './fixtures.mjs';
import { instalar } from './mock-api.mjs';

/** Cadastros operacionais (admin): criar um colaborador e vê-lo na lista; padrão não entra. */

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

async function servidor(page) {
  await instalar(page);
  const est = {
    projetos: [{ id: 1, slug: 'acervo', nome: 'Acervo Central', codigoRegex: null, integracoes: [], ativo: true }],
    turnos: [{ id: 1, projetoId: 1, nome: 'Manhã', usuarioAuthId: null, ativo: true }],
    colaboradores: [{ id: 1, projetoId: 1, nome: 'Bia Lima', funcao: 'Scanner', turnoId: 1, avatar: null, ativo: true }],
    mesas: [], metas: [], criados: [],
  };
  // registrada depois do mock-api: a última rota vence
  await page.route(/localhost:3010\/api\/operacional\/admin\//, async (route) => {
    const req = route.request();
    const recurso = new URL(req.url()).pathname.split('/')[4];
    const json = (o, s = 200) => route.fulfill({ status: s, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return json({ success: true, data: est[recurso] ?? [] });
    if (req.method() === 'POST') {
      const corpo = req.postDataJSON();
      const linha = { id: est[recurso].length + 1, funcao: null, turnoId: null, avatar: null, ativo: true, ...corpo };
      est[recurso].push(linha);
      est.criados.push(corpo);
      return json({ success: true, data: linha }, 201);
    }
    return json({ success: true, data: {} });
  });
  return est;
}

test('admin cria um colaborador e o vê na lista', async ({ page }) => {
  const est = await servidor(page);
  await page.goto('/app/index.html#/operacional/cadastros');
  await page.getByRole('button', { name: 'Colaboradores' }).click();
  await expect(page.getByRole('cell', { name: 'Bia Lima', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/cadastros-lista.png' });

  await page.getByRole('button', { name: 'Novo cadastro' }).click();
  await page.selectOption('#cad-projetoId', '1');
  await page.fill('#cad-nome', '  Ana Souza ');
  await page.fill('#cad-funcao', 'Higienização');
  await page.screenshot({ path: 'test-results/cadastros-formulario.png' });
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('cell', { name: 'Ana Souza', exact: true })).toBeVisible();
  expect(est.criados).toEqual([{ projetoId: 1, nome: 'Ana Souza', funcao: 'Higienização', ativo: true }]);
});

test('formulário aponta o campo obrigatório vazio sem chamar o servidor', async ({ page }) => {
  const est = await servidor(page);
  await page.goto('/app/index.html#/operacional/cadastros');
  await page.getByRole('button', { name: 'Novo cadastro' }).click();
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('#cad-nome-msg')).toBeVisible();
  expect(est.criados).toEqual([]);
});

test('usuário padrão é redirecionado para os projetos', async ({ page }) => {
  await instalar(page, { usuario: 'maria' });
  await page.goto('/app/index.html#/operacional/cadastros');
  await expect(page).toHaveURL(/#\/projetos$/);
});
