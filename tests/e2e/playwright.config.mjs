import { defineConfig } from '@playwright/test';

const PORTA = Number(process.env.E2E_PORTA || 4173);

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    // Local: usa o Chrome instalado (sem baixar navegador). No CI: `npx playwright install --with-deps chromium`.
    ...(process.env.CI ? {} : { channel: 'chrome' }),
  },
  webServer: {
    command: 'node servidor.mjs',
    port: PORTA,
    reuseExistingServer: false,
    env: { E2E_PORTA: String(PORTA) },
  },
});
