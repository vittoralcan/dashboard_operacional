// Fixtures comuns: instala as APIs simuladas e VIGIA, em todo teste, o que não pode acontecer em produção —
// violação de CSP, erro de JavaScript não tratado, requisição a domínio de terceiros (RNB-014).
import { test as base, expect } from '@playwright/test';
import { instalar } from './mock-api.mjs';

const HOSTS_OK = new Set(['127.0.0.1', 'localhost', 'script.google.com']);

export const test = base.extend({
  /** Problemas vistos na página; o teste termina reprovado se sobrar algum (um teste que PROVOCA um problema o limpa). */
  problemas: [async ({ page }, use) => {
    const lista = [];
    page.on('pageerror', (e) => lista.push(`erro de JavaScript: ${e.message}`));
    page.on('console', (m) => { const t = m.text(); if (/^\[CSP\]|Content Security Policy|Refused to/i.test(t)) lista.push(`CSP: ${t.slice(0, 200)}`); });
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (/^(data|blob|about):/.test(u.protocol)) return;
      if (!HOSTS_OK.has(u.hostname)) lista.push(`requisição externa: ${r.url()}`);
    });
    await use(lista);
    expect(lista, 'o painel não pode gerar erro de JS, violação de CSP nem chamada a terceiros').toEqual([]);
  }, { auto: true }],

  /** `abrir('#/projetos', { usuario: 'maria' | null, … })` instala as APIs, abre a rota e devolve o "servidor" (`st`). */
  abrir: async ({ page }, use) => {
    await use(async (hash = '#/projetos', opcoes = {}) => {
      if (opcoes.tema) await page.addInitScript((t) => { try { if (!sessionStorage.getItem('__e2e-tema')) { sessionStorage.setItem('__e2e-tema', '1'); localStorage.setItem('dsn-theme', t); } } catch { /* sem armazenamento */ } }, opcoes.tema); // só na 1ª carga da aba: recarregar tem de manter o que o usuário escolheu
      if (opcoes.envioInstancia) await page.addInitScript((i) => { try { if (!localStorage.getItem('dsn-envio-instancia')) localStorage.setItem('dsn-envio-instancia', i); } catch { /* sem armazenamento */ } }, opcoes.envioInstancia);
      const st = await instalar(page, opcoes);
      await page.goto(`/app/index.html${hash}`);
      return st;
    });
  },
});

export { expect };
