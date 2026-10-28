// @ts-check
import { uid } from '../core/dom.js';

/**
 * Leitor de QR code / código de barras pela câmera (RCX-06). Usa o `BarcodeDetector` do navegador quando existe
 * (Chrome/Android — leve, nativo) e, senão, o `html5-qrcode` HOSPEDADO em `vendor/` (versão fixa + SRI), carregado só
 * ao abrir o leitor. Sem permissão/câmera o chamador mostra a mensagem e deixa o campo de digitação sempre disponível.
 */

export const HTML5_QRCODE_ARQUIVO = 'vendor/html5-qrcode-2.3.8.min.js';
/** SHA-384 do arquivo acima (conferido por `tests/app/scanner.test.js`; o navegador recusa o script se divergir). */
export const HTML5_QRCODE_SRI = 'sha384-c9d8RFSL+u3exBOJ4Yp3HUJXS4znl9f+z66d1y54ig+ea249SpqR+w1wyvXz/lk+';

/** Formatos de código de caixa/mesa que o `BarcodeDetector` precisa ler (os que o aparelho suportar). */
const FORMATOS = ['qr_code', 'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'itf', 'codabar', 'upc_a', 'upc_e', 'data_matrix'];

/** Mensagem legível para a falha da câmera. @param {any} e */
export function mensagemDeErroCamera(e) {
  const n = e && (e.name || e.message || String(e));
  if (/NotAllowed|PermissionDenied|Permission/i.test(String(n))) return 'Permissão da câmera negada. Libere o acesso nas configurações do navegador ou digite o código.';
  if (/NotFound|DevicesNotFound|Overconstrained|Requested device not found/i.test(String(n))) return 'Nenhuma câmera encontrada neste aparelho. Digite o código.';
  if (/NotReadable|TrackStart|in use/i.test(String(n))) return 'A câmera está em uso por outro aplicativo. Feche-o e tente de novo, ou digite o código.';
  if (e && e.semCameraSegura) return 'A câmera só funciona em conexão segura (HTTPS). Digite o código.';
  return 'Não foi possível acessar a câmera. Digite o código.';
}

/** A câmera pode ser usada aqui? (exige contexto seguro: HTTPS ou localhost). */
export const cameraDisponivel = () => !!(globalThis.isSecureContext && globalThis.navigator && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');

/** @type {Promise<any>|null} */
let carregando = null;
/** Carrega o html5-qrcode uma única vez (script do próprio site, com SRI). */
export function carregarHtml5Qrcode() {
  if (/** @type {any} */ (globalThis).Html5Qrcode) return Promise.resolve(/** @type {any} */ (globalThis).Html5Qrcode);
  if (carregando) return carregando;
  carregando = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HTML5_QRCODE_ARQUIVO;
    s.integrity = HTML5_QRCODE_SRI;
    s.async = true;
    s.onload = () => (/** @type {any} */ (globalThis).Html5Qrcode ? resolve(/** @type {any} */ (globalThis).Html5Qrcode) : reject(new Error('Leitor indisponível.')));
    s.onerror = () => { carregando = null; s.remove(); reject(new Error('Não foi possível carregar o leitor de códigos.')); };
    document.head.appendChild(s);
  });
  return carregando;
}

/** @param {HTMLElement} el @param {(texto: string) => void} aoLer */
async function viaBarcodeDetector(el, aoLer) {
  const BD = /** @type {any} */ (globalThis).BarcodeDetector;
  const suportados = await BD.getSupportedFormats();
  const formatos = FORMATOS.filter((f) => suportados.includes(f));
  if (!formatos.length) throw Object.assign(new Error('sem formatos'), { semSuporte: true });
  const detector = new BD({ formats: formatos });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  const v = document.createElement('video');
  v.setAttribute('playsinline', ''); v.muted = true; v.srcObject = stream; v.autoplay = true; v.className = 'cam-video';
  el.appendChild(v);
  let ativo = true;
  /** @type {any} */ let timer = null;
  const parar = () => { ativo = false; clearTimeout(timer); stream.getTracks().forEach((t) => t.stop()); v.remove(); };
  v.play().catch(() => { /* `muted` + `playsinline` permitem iniciar sozinho; sem quadro, o `detect` só tenta de novo */ });
  const ciclo = async () => {
    if (!ativo) return;
    try {
      const r = await detector.detect(v);
      if (ativo && r && r[0] && r[0].rawValue) { parar(); aoLer(String(r[0].rawValue)); return; }
    } catch (e) { /* quadro sem código: tenta de novo */ }
    if (ativo) timer = setTimeout(ciclo, 120);
  };
  ciclo();
  return { parar };
}

/** @param {HTMLElement} el @param {(texto: string) => void} aoLer */
async function viaHtml5(el, aoLer) {
  const Lib = await carregarHtml5Qrcode();
  const alvo = document.createElement('div');
  alvo.id = uid('leitor');
  el.appendChild(alvo);
  const q = new Lib(alvo.id, { verbose: false });
  let ativo = true;
  const limpar = () => { try { q.clear(); } catch (e) { /* já limpo */ } alvo.remove(); };
  const parar = () => {
    if (!ativo) return;
    ativo = false;
    let fim = Promise.resolve();
    try { fim = Promise.resolve(q.stop()); } catch (e) { /* ainda não estava rodando */ }
    fim.catch(() => {}).finally(limpar);
  };
  try {
    await q.start({ facingMode: 'environment' }, { fps: 10 }, (/** @type {string} */ texto) => { if (!ativo) return; parar(); aoLer(String(texto)); }, () => {});
  } catch (e) { ativo = false; limpar(); throw e; } // falhou ao abrir: não há o que parar — preserva o erro ORIGINAL (permissão, câmera…)
  return { parar };
}

/**
 * Abre a câmera dentro de `el` e chama `aoLer(texto)` UMA vez (já parando a câmera). `aoErro(mensagem)` para qualquer falha.
 * Devolve `{ parar }` (idempotente) — chamar ao sair da tela.
 * @param {HTMLElement} el @param {{ aoLer: (texto: string) => void, aoErro: (mensagem: string) => void }} o
 * @returns {Promise<{ parar: () => void }>}
 */
export async function iniciarLeitor(el, o) {
  let parado = false;
  /** @type {{ parar: () => void }|null} */
  let ativo = null;
  const parar = () => { parado = true; ativo?.parar(); };
  try {
    if (!cameraDisponivel()) throw { semCameraSegura: true };
    const lido = (/** @type {string} */ t) => { if (!parado) { parado = true; o.aoLer(t); } };
    try {
      ativo = 'BarcodeDetector' in globalThis ? await viaBarcodeDetector(el, lido) : await viaHtml5(el, lido);
    } catch (e) {
      if (!(/** @type {any} */ (e) && /** @type {any} */ (e).semSuporte)) throw e;
      ativo = await viaHtml5(el, lido); // o aparelho tem `BarcodeDetector` mas não lê os formatos: usa o html5-qrcode
    }
    if (parado) ativo?.parar();
  } catch (e) {
    console.error('Leitor de código:', e);
    if (!parado) o.aoErro(mensagemDeErroCamera(e));
    parado = true;
  }
  return { parar };
}
