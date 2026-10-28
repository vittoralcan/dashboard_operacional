// Lógica pura de verificação de uma API monitorada (B10) — sem Express, sem banco.
// Reaproveitada tanto pela rota de teste manual (core/monitoramento.js) quanto pelo
// job agendado (jobs/monitor.js), pra não ter duas implementações do mesmo cheque.

const dns = require('dns').promises;
const net = require('net');

// Defesa contra SSRF: mesmo a URL sendo só gerenciada por
// admin/seed (nunca por entrada de usuário comum — não há endpoint de escrita
// pra monitor_api.url), confere a resolução do host antes de buscar, pra um
// cadastro errado/comprometido não virar uma sonda contra a própria rede da VM.
function enderecoPrivadoOuLocal(endereco) {
    if (net.isIPv4(endereco)) {
        const [a, b] = endereco.split('.').map(Number);
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 0) return true;
        return false;
    }
    const minusculo = endereco.toLowerCase();
    if (minusculo === '::1') return true;
    if (minusculo.startsWith('fc') || minusculo.startsWith('fd')) return true; // fc00::/7 (ULA)
    if (minusculo.startsWith('fe80')) return true; // link-local
    return false;
}

async function validarUrlSegura(urlTexto) {
    const url = new URL(urlTexto);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`esquema não permitido: ${url.protocol}`);
    }
    const enderecos = await dns.lookup(url.hostname, { all: true });
    for (const { address } of enderecos) {
        if (enderecoPrivadoOuLocal(address)) {
            throw new Error(`"${url.hostname}" resolve para um endereço privado/local (${address})`);
        }
    }
    return url;
}

// Verifica uma API uma vez; nunca lança — todo caminho de erro vira
// `{ estado: 'f', ... }` com o motivo em `log`, pra quem chama só gravar o
// resultado sem precisar de try/catch próprio.
async function verificarApi(api) {
    const inicio = Date.now();
    try {
        await validarUrlSegura(api.url);

        const controlador = new AbortController();
        const temporizador = setTimeout(() => controlador.abort(), api.timeout_ms);
        let resposta;
        try {
            // `redirect: 'manual'` — não segue redirecionamento (poderia apontar
            // pra dentro da rede local mesmo com a URL cadastrada sendo externa).
            resposta = await fetch(api.url, { method: 'GET', signal: controlador.signal, redirect: 'manual' });
        } finally {
            clearTimeout(temporizador);
        }

        const latenciaMs = Date.now() - inicio;

        if (resposta.status >= 300 && resposta.status < 400) {
            return { estado: 'f', latenciaMs, httpStatus: resposta.status, log: `HTTP ${resposta.status} — redirecionamento não seguido.` };
        }
        if (!resposta.ok) {
            return { estado: 'f', latenciaMs, httpStatus: resposta.status, log: `HTTP ${resposta.status} ${resposta.statusText}`.trim() };
        }

        const lenta = latenciaMs > api.limiar_lento_ms;
        return {
            estado: lenta ? 'l' : 'o',
            latenciaMs,
            httpStatus: resposta.status,
            log: lenta ? `Respondeu em ${latenciaMs} ms (acima do limiar de ${api.limiar_lento_ms} ms).` : null,
        };
    } catch (erro) {
        const latenciaMs = Date.now() - inicio;
        const motivo = erro.name === 'AbortError' ? `tempo limite de ${(api.timeout_ms / 1000).toFixed(0)} s excedido` : erro.message;
        return { estado: 'f', latenciaMs: null, httpStatus: null, log: `Falha — ${motivo}` };
    }
}

module.exports = { verificarApi, validarUrlSegura, enderecoPrivadoOuLocal };
