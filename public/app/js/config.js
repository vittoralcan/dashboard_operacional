// @ts-check
/**
 * Configuração única do front. Nenhum segredo aqui; nenhuma URL repetida em outro arquivo.
 * O ambiente sai do hostname: localhost → backends locais; qualquer outro → produção.
 */
const host = (globalThis.location && globalThis.location.hostname) || '';

/** Ambiente de desenvolvimento local (habilita a página `#/_ui`). */
export const DEV = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local');

// Portas locais: back_auth 3002 · back_dashboard 3010 (ver .env.example de cada serviço).
export const API = Object.freeze({
  auth: DEV ? 'http://localhost:3002/api' : 'https://auth.example.com/api',
  painel: DEV ? 'http://localhost:3010/api' : 'https://painel.example.com/api',
});

/** Piso da animação de login (RNB-009): nunca atrasa além disto de propósito. */
export const DURACAO_MIN_LOGIN_MS = 1200;

export const NOME_PRODUTO = 'Painel Operacional';

/**
 * Web App do Google Apps Script que mede as APIs (Monitoramento). NÃO entra em `API`: o token do
 * painel nunca deve ser enviado ao Google (FE-06). Some quando o monitor nativo existir (recurso `monitor.nativo`).
 */
export const GAS_MONITOR = 'https://script.google.com/macros/s/ID-FICTICIO-DO-APPS-SCRIPT/exec';
