// Domínio do bip da caixa (RF-13 a RF-17, RF-20). Funções puras: sem banco,
// sem HTTP e sem relógio global — o tempo entra em `agora`.
const TAMANHO_MAX_CODIGO = 60; // VARCHAR(60) da coluna op_caixa_registro.codigo
const JANELA_DUPLICADO_S = 3;

function normalizarCodigo(texto) {
    return String(texto ?? '').trim();
}

function validarCodigo(texto, codigoRegex) {
    const codigo = normalizarCodigo(texto);
    if (!codigo) return { ok: false, motivo: 'vazio' };
    if (codigo.length > TAMANHO_MAX_CODIGO) return { ok: false, motivo: 'longo' };
    if (!codigoRegex) return { ok: true, codigo };

    let padrao;
    try {
        // O regex do projeto vale para o código inteiro.
        padrao = new RegExp('^(?:' + codigoRegex + ')$');
    } catch (erro) {
        throw new Error('Regex de código do projeto inválido: ' + erro.message);
    }
    if (!padrao.test(codigo)) return { ok: false, motivo: 'formato' };
    return { ok: true, codigo };
}

function duracaoSegundos(inicio, fim) {
    return Math.floor((new Date(fim).getTime() - new Date(inicio).getTime()) / 1000);
}

function decidirBip({ texto, codigoRegex, aberta, ultima, agora }) {
    const valido = validarCodigo(texto, codigoRegex);
    if (!valido.ok) return { acao: 'inexistente', motivo: valido.motivo };
    const { codigo } = valido;

    if (aberta) {
        if (duracaoSegundos(aberta.inicio_em, agora) <= JANELA_DUPLICADO_S) {
            return { acao: 'duplicado' };
        }
        return {
            acao: 'finalizar',
            registroId: aberta.id,
            duracaoS: duracaoSegundos(aberta.inicio_em, agora),
            codigo,
        };
    }

    if (ultima && ultima.status === 'concluida') {
        if (ultima.fim_em && duracaoSegundos(ultima.fim_em, agora) <= JANELA_DUPLICADO_S) {
            return { acao: 'duplicado' };
        }
        return { acao: 'ja_concluida' };
    }

    return { acao: 'iniciar', codigo };
}

module.exports = { normalizarCodigo, validarCodigo, decidirBip, duracaoSegundos, JANELA_DUPLICADO_S };
