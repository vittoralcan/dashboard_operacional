// @ts-check
import { API, GAS_MONITOR } from '../js/config.js';
import { criarApiSimulada } from './api-simulada.js';

/**
 * Modo demonstração (só em `demo.html`): troca o `fetch` do navegador por um que responde às APIs do painel com dados fictícios,
 * em memória, e mostra a faixa "Demonstração". Qualquer outra URL (os JSON de `config/`, fontes, ícones) segue para a rede.
 * Carregado ANTES de `js/main.js` (módulos executam na ordem do documento), então o painel já nasce falando com a simulação.
 */

const fetchOriginal = globalThis.fetch.bind(globalThis);
const api = criarApiSimulada({
  bases: { auth: API.auth, painel: API.painel, gas: GAS_MONITOR },
  buscarArquivo: async (caminho) => {
    const r = await fetchOriginal(new URL(`../${caminho}`, import.meta.url));
    if (!r.ok) throw new Error(`Arquivo da demonstração indisponível: ${caminho}`);
    return r.json();
  },
});

/** Latência de rede plausível; respeita o cancelamento (`AbortSignal`) como um fetch de verdade. @param {AbortSignal|null|undefined} sinal */
function esperar(sinal) {
  return new Promise((ok, erro) => {
    const abortar = () => { clearTimeout(t); erro(new DOMException('A requisição foi cancelada.', 'AbortError')); };
    const t = setTimeout(() => { sinal?.removeEventListener('abort', abortar); ok(undefined); }, 100 + Math.random() * 200);
    if (sinal?.aborted) abortar(); else sinal?.addEventListener('abort', abortar, { once: true });
  });
}

/** Cabeçalhos em minúsculas, venham como objeto, `Headers` ou lista. @param {HeadersInit|undefined} h */
function cabecalhosDe(h) {
  /** @type {Record<string, string>} */
  const out = {};
  new Headers(h || {}).forEach((v, k) => { out[k.toLowerCase()] = v; });
  return out;
}

/** @param {RequestInfo | URL} entrada @param {RequestInit} [init] */
globalThis.fetch = async function fetchDemo(entrada, init = {}) {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  if (!api.atende(url)) return fetchOriginal(entrada, init);
  const req = entrada instanceof Request ? entrada : null;
  const metodo = String(init.method || req?.method || 'GET').toUpperCase();
  const cabecalhos = cabecalhosDe(init.headers || req?.headers);
  let corpo = null;
  if (typeof init.body === 'string' && init.body) { try { corpo = JSON.parse(init.body); } catch { corpo = null; } }
  await esperar(init.signal || req?.signal);
  let r;
  try {
    r = await api.responder({ metodo, url, corpo, cabecalhos });
  } catch (e) {
    console.error('[demo] falha na API simulada', e);
    r = { status: 500, corpo: { success: false, message: 'Erro interno da demonstração.' } };
  }
  const corpoTexto = r.status === 204 || r.corpo === undefined ? null : JSON.stringify(r.corpo);
  return new Response(corpoTexto, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...(r.cabecalhos || {}) } });
};

// A tela de Envio pede a instância do Bridge; na demonstração ela já vem preenchida (o usuário pode trocar).
try { if (!localStorage.getItem('dsn-envio-instancia')) localStorage.setItem('dsn-envio-instancia', 'bridge-atlas-01'); } catch { /* sem armazenamento */ }

// ---------------------------------------------------------------- faixa "Demonstração"
const CREDENCIAIS = [['gestor', 'gestor123', 'administrador'], ['operador', 'operador123', 'tablet do turno'], ['leitor', 'leitor123', 'somente leitura']];

function montarAviso() {
  const aviso = document.createElement('aside');
  aviso.className = 'demo-aviso';
  aviso.setAttribute('aria-label', 'Modo demonstração');
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'demo-aviso-botao';
  botao.setAttribute('aria-expanded', 'false');
  const ponto = document.createElement('span');
  ponto.className = 'demo-aviso-ponto';
  ponto.setAttribute('aria-hidden', 'true');
  botao.append(ponto, document.createTextNode('Demonstração · dados fictícios'));
  const detalhe = document.createElement('div');
  detalhe.className = 'demo-aviso-detalhe';
  detalhe.hidden = true;
  const titulo = document.createElement('p');
  titulo.textContent = 'Sem backend: as respostas são simuladas no navegador e voltam ao início ao recarregar.';
  const lista = document.createElement('ul');
  for (const [login, senha, papel] of CREDENCIAIS) {
    const li = document.createElement('li');
    const cod = document.createElement('code');
    cod.textContent = `${login} / ${senha}`;
    li.append(cod, document.createTextNode(` · ${papel}`));
    lista.append(li);
  }
  const dica = document.createElement('p');
  dica.textContent = 'No tablet, bipe um código no formato AC-000000 (ex.: AC-009001).';
  detalhe.append(titulo, lista, dica);
  aviso.append(botao, detalhe);

  const abrir = (/** @type {boolean} */ v) => { detalhe.hidden = !v; botao.setAttribute('aria-expanded', String(v)); };
  botao.addEventListener('click', () => abrir(detalhe.hidden));
  const noLogin = () => /^#?\/?(login)?$/.test(location.hash) || location.hash.startsWith('#/login');
  window.addEventListener('hashchange', () => abrir(noLogin()));
  abrir(noLogin());
  document.body.append(aviso);
}

if (document.body) montarAviso(); else document.addEventListener('DOMContentLoaded', montarAviso, { once: true });
