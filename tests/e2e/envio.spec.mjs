import { test, expect } from './fixtures.mjs';

/** Acompanhamento do Bridge (#/envio): instância lembrada, cartões, funil, vazão, eventos recentes, sinal de vida e estados degradados. */

const acompanhar = async (page, instancia) => {
  await page.fill('#instancia', instancia);
  await page.getByRole('button', { name: 'Acompanhar' }).click();
};

test('sem instância: pede o identificador e não consulta o servidor; instância inválida é recusada na tela', async ({ page, abrir }) => {
  const st = await abrir('#/envio');
  await expect(page.getByRole('heading', { name: 'Informe a instância do Bridge.' })).toBeVisible();
  expect(st.envioConsultas).toEqual([]);
  await acompanhar(page, 'a');
  await expect(page.locator('#instancia-msg')).toContainText('3 a 60 caracteres');
  expect(st.envioConsultas).toEqual([]);
});

test('mostra cartões, funil, vazão e eventos; lembra a instância depois de recarregar', async ({ page, abrir }) => {
  const st = await abrir('#/envio');
  await acompanhar(page, 'Bridge-Cliente-X');
  await expect(page.locator('section', { has: page.locator('#k-env') })).toContainText('24', { timeout: 15_000 });
  await expect(page.locator('.envio-sinal.ok')).toContainText('Bridge ativo');
  await expect(page.locator('.envio-sinal.ok')).toContainText('1.0.1');
  await expect(page.locator('section', { has: page.locator('#k-div') })).toContainText('1');
  await expect(page.locator('section', { has: page.locator('#k-tax') })).toContainText('95,8%');
  await expect(page.locator('.hbar.funil')).toHaveCount(6);
  await expect(page.locator('.hbar.funil', { hasText: 'Concluída' })).toContainText('20');
  await expect(page.locator('#grafico-vazao svg')).toBeVisible();
  await expect(page.locator('#tabela-recentes tbody tr')).toHaveCount(3);
  await expect(page.locator('#tabela-recentes')).toContainText('Certidões'); // id do servidor → nome do catálogo
  expect(st.envioConsultas.at(-1)).toBe('bridge-cliente-x');
  await page.reload();
  await expect(page.locator('#instancia')).toHaveValue('bridge-cliente-x');
  await expect(page.locator('.hbar.funil').first()).toBeVisible({ timeout: 15_000 });
});

test('texto vindo do servidor é escapado (nome de pasta com HTML não vira elemento)', async ({ page, abrir }) => {
  await abrir('#/envio');
  await acompanhar(page, 'bridge-cliente-x');
  await expect(page.locator('#tabela-recentes tbody tr')).toHaveCount(3, { timeout: 15_000 });
  await expect(page.locator('#tabela-recentes img')).toHaveCount(0);
  await expect(page.locator('#tabela-recentes')).toContainText('<img src=x onerror=alert(1)>');
});

test('alerta ("[ALERTA] …"): selo próprio de atenção, texto sem o prefixo e escapado; contagens intactas', async ({ page, abrir }) => {
  await abrir('#/envio');
  await acompanhar(page, 'bridge-alerta');
  const linha = page.locator('#tabela-recentes tbody tr', { hasText: 'lixo' });
  await expect(linha).toBeVisible({ timeout: 15_000 });
  await expect(linha.locator('.selo.warn')).toContainText('Alerta');
  await expect(linha.locator('.selo.err')).toHaveCount(0);
  await expect(linha.locator('.envio-detalhe')).toHaveText('Pasta "lixo" na entrega não casa com o padrão <b>x</b>'); // sem o prefixo, e o HTML vira texto
  await expect(linha.locator('.envio-detalhe b')).toHaveCount(0);
  await expect(page.locator('#tabela-recentes tbody tr', { hasText: '<img' }).locator('.selo.err')).toContainText('Erro'); // erro comum segue como erro
  await expect(page.locator('section', { has: page.locator('#k-env') })).toContainText('24');
  await expect(page.locator('.hbar.funil', { hasText: 'Concluída' })).toContainText('20');
});

test('troca a janela (consulta com ?horas=) e a grandeza da vazão (arquivos/min ↔ MB/s)', async ({ page, abrir }) => {
  const st = await abrir('#/envio');
  await acompanhar(page, 'bridge-cliente-x');
  await expect(page.locator('#grafico-vazao svg')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: '7 dias' }).click();
  await expect.poll(() => st.chamadas.filter((c) => c.caminho === '/envio/resumo').length).toBeGreaterThan(1);
  await expect(page.locator('section', { has: page.locator('#t-funil') })).toContainText('últimas 7 dias');
  await page.getByRole('tab', { name: 'MB/s' }).click();
  await expect(page.getByRole('tab', { name: 'MB/s' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#grafico-vazao svg')).toBeVisible();
});

test('Bridge sem contato (heartbeat atrasado) mostra o alerta âmbar', async ({ page, abrir }) => {
  await abrir('#/envio');
  await acompanhar(page, 'bridge-atrasado');
  await expect(page.locator('.envio-sinal.warn')).toContainText('Sem contato com o Bridge', { timeout: 15_000 });
});

test('instância nova (nenhum evento, nenhum sinal): estado vazio claro, não erro', async ({ page, abrir }) => {
  await abrir('#/envio');
  await acompanhar(page, 'bridge-novo');
  await expect(page.getByRole('heading', { name: 'Nenhum dado de envio ainda.' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.envio-sinal.info')).toContainText('ainda não enviou sinal de vida');
  await expect(page.locator('.hbar.funil')).toHaveCount(0);
});

test('falha do servidor (500) fica no bloco, com "Tentar novamente"; some quando o servidor volta', async ({ page, abrir }) => {
  const st = await abrir('#/envio');
  st.falhas.add('/envio');
  await acompanhar(page, 'bridge-cliente-x');
  await expect(page.getByRole('heading', { name: 'Não foi possível carregar o envio' })).toBeVisible({ timeout: 15_000 });
  st.falhas.clear();
  await page.getByRole('button', { name: /Tentar novamente/ }).click();
  await expect(page.locator('.hbar.funil').first()).toBeVisible({ timeout: 15_000 });
});

test('backend antigo (404): a tela vira "Em breve" em vez de quebrar', async ({ page, abrir }) => {
  await abrir('#/envio', { semBackendNovo: true });
  await acompanhar(page, 'bridge-cliente-x');
  await expect(page.locator('.embreve-pag')).toContainText('Acompanhamento de envio', { timeout: 15_000 });
});

test('está no menu lateral, na paleta e no atalho G B', async ({ page, abrir }) => {
  await abrir('#/projetos');
  await expect(page.locator('.sb-item', { hasText: 'Envio (Bridge)' })).toBeVisible();
  await page.keyboard.press('g'); await page.keyboard.press('b');
  await expect(page).toHaveURL(/#\/envio$/);
  await expect(page.locator('.crumbs .cur')).toHaveText(/Envio/);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Paleta de comandos' })).toBeVisible();
  await page.keyboard.type('bridge');
  await expect(page.getByRole('dialog', { name: 'Paleta de comandos' })).toContainText('Envio (Bridge)');
});

/** Nenhum bloco nem texto se sobrepõe (caixas dos cartões/faixas e texto das folhas), em todas as larguras e nos estados com conteúdo. */
const sobreposicoes = () => {
  const caixa = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }; };
  const choca = (A, C, tol) => Math.min(A.r, C.r) - Math.max(A.l, C.l) > tol && Math.min(A.b, C.b) - Math.max(A.t, C.t) > tol;
  const out = [];
  const blocos = [...document.querySelectorAll('#conteudo .card, #conteudo .envio-sinal, #conteudo .sec-h')];
  for (let i = 0; i < blocos.length; i++) for (let j = i + 1; j < blocos.length; j++) if (choca(caixa(blocos[i]), caixa(blocos[j]), 1)) out.push(`bloco "${(blocos[i].querySelector('.card-t') || blocos[i]).textContent.trim().slice(0, 20)}" × "${(blocos[j].querySelector('.card-t') || blocos[j]).textContent.trim().slice(0, 20)}"`);
  const folhas = [...document.querySelectorAll('#view *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().width > 0);
  const texto = (e) => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }; };
  for (let i = 0; i < folhas.length; i++) for (let j = i + 1; j < folhas.length; j++) {
    if (folhas[i].contains(folhas[j]) || folhas[j].contains(folhas[i])) continue;
    if (choca(texto(folhas[i]), texto(folhas[j]), 2)) out.push(`texto "${folhas[i].textContent.trim().slice(0, 20)}" × "${folhas[j].textContent.trim().slice(0, 20)}"`);
  }
  return out;
};

for (const [instancia, pronto] of [['bridge-cliente-x', '.hbar.funil'], ['bridge-atrasado', '.envio-sinal.warn'], ['bridge-novo', '.empty'], ['bridge-alerta', '.envio-detalhe']]) {
  for (const largura of [1920, 1440, 1024, 768, 390]) {
    test(`sem sobreposição de blocos ou textos · ${instancia} · ${largura}px`, async ({ page, abrir }) => {
      await page.setViewportSize({ width: largura, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await abrir('#/envio', { envioInstancia: instancia });
      await expect(page.locator(pronto).first()).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(500);
      expect(await page.evaluate(sobreposicoes)).toEqual([]);
    });
  }
}
