import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.mjs';

/**
 * Acessibilidade: axe-core em TODAS as telas, nos DOIS temas.
 * Reprova com qualquer violação grave ou crítica (WCAG 2.0/2.1 A e AA + boas práticas); as leves/moderadas ficam como anotação.
 * Movimento reduzido ligado: as entradas animadas não deixam elementos semitransparentes durante a medição de contraste.
 */

const TELAS = [
  ['login', '#/login', '#form', { usuario: null }],
  ['projetos', '#/projetos', '[data-proj="atlas"] [data-k=kpi]:not(:empty)'],
  ['monitoramento', '#/boreal/monitoramento', '.api-row'],
  ['hub ATLAS', '#/atlas', '[data-mod="inventarios"]'],
  ['negativos (análise)', '#/atlas/negativos', '.crumbs .cur'],
  ['negativos (fluxograma)', '#/atlas/negativos/fluxograma', '.fnode'],
  ['COBALTO', '#/cobalto', '.crumbs .cur'],
  ['meu perfil', '#/perfil', '[data-v="email"]'],
  ['metas mensais', '#/metas', '.metas-lin'],
  ['envio (Bridge)', '#/envio', '.hbar.funil', { envioInstancia: 'bridge-cliente-x' }],
  ['envio (Bridge) com alerta', '#/envio', '.envio-detalhe', { envioInstancia: 'bridge-alerta' }],
  ['criar usuário', '#/usuarios/novo', '.crumbs .cur'],
  ['macro view', '#/macro-view', '#macro:not([hidden])'],
];

for (const tema of ['dark', 'light']) {
  for (const [nome, hash, pronto, opcoes = {}] of TELAS) {
    test(`axe · ${nome} · tema ${tema}`, async ({ page, abrir }, info) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await abrir(hash, { ...opcoes, tema });
      await expect(page.locator(pronto).first()).toBeVisible({ timeout: 20_000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);
      await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
      const resumo = (v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0].target.join(' ')} — ${(v.nodes[0].failureSummary || '').split('\n')[1] || ''}`;
      const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      for (const v of r.violations.filter((x) => !graves.includes(x))) info.annotations.push({ type: 'axe-leve', description: resumo(v) });
      expect(graves.map(resumo), 'violações graves/críticas de acessibilidade').toEqual([]);
    });
  }
}

test('teste do teste: o axe de fato acusa uma imagem sem texto alternativo e um texto sem contraste', async ({ page, abrir }) => {
  await abrir('#/projetos');
  await expect(page.locator('.bento .card').first()).toBeVisible();
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" id="sem-alt"><p id="baixo" style="color:#777;background:#888;position:fixed;top:0;left:0">texto ilegível</p>');
  });
  const r = await new AxeBuilder({ page }).include('#sem-alt').include('#baixo').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual(expect.arrayContaining(['image-alt', 'color-contrast']));
});
