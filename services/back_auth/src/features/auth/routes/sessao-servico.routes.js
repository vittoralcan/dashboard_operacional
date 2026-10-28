const express = require('express');
const crypto = require('crypto');
const { exigirAdmin } = require('../middleware/auth.middleware');
const { assinarTokenServico } = require('../../../config/jwt');
const { criarSessaoServico } = require('../queries/sessao.queries');

const router = express.Router();

// Só "envio" existe hoje (Bridge). Lista pequena de propósito — cada escopo
// novo precisa de código novo no back_dashboard pra fazer algo com ele, então
// não há ganho em aceitar valores que nada ainda confere (D-09).
const ESCOPOS_VALIDOS = new Set(['envio']);
const VALIDADE_DIAS = 365;
const DESCRICAO_MAX_LENGTH = 200;
// Minúsculas/números/hífen — mesmo formato de um slug, pra poder aparecer em
// nome de arquivo de log/config do lado do Bridge sem escapar nada.
const INSTANCIA_REGEX = /^[a-z0-9-]{3,60}$/;

function validarSessaoServico({ descricao, instancia, escopo }) {
    if (typeof descricao !== 'string' || !descricao.trim() || descricao.trim().length > DESCRICAO_MAX_LENGTH) {
        return `Campo "descricao" é obrigatório (até ${DESCRICAO_MAX_LENGTH} caracteres).`;
    }
    if (typeof instancia !== 'string' || !INSTANCIA_REGEX.test(instancia.trim())) {
        return 'Campo "instancia" é obrigatório e deve conter apenas letras minúsculas, números e hífen (3 a 60 caracteres).';
    }
    if (!Array.isArray(escopo) || escopo.length === 0 || !escopo.every((item) => ESCOPOS_VALIDOS.has(item))) {
        return `Campo "escopo" deve ser uma lista não vazia contendo apenas: ${[...ESCOPOS_VALIDOS].join(', ')}.`;
    }
    return null;
}

// POST /api/auth/sessao-servico (A9, admin) — emite uma credencial de longa
// duração, só-escrita-de-envio, para uma instalação do Bridge
// (docs/api/envio-bridge.md). Mesmo espírito de uma futura
// /auth/sessao-tv (A8/F4), mas com escopo de escrita em vez de leitura.
router.post('/auth/sessao-servico', exigirAdmin, async (req, res) => {
    try {
        const { descricao, instancia, escopo } = req.body || {};
        const erroValidacao = validarSessaoServico({ descricao, instancia, escopo });
        if (erroValidacao) {
            return res.status(400).json({ success: false, message: erroValidacao });
        }

        const descricaoNorm = descricao.trim();
        const instanciaNorm = instancia.trim().toLowerCase();
        const expiresInSegundos = VALIDADE_DIAS * 24 * 60 * 60;
        const expiraEm = new Date(Date.now() + expiresInSegundos * 1000);

        // Gerado antes do token para poder incluí-lo como claim — permite, no
        // futuro (F4/A8), revogar por sessaoId sem decodificar o JWT inteiro.
        // A checagem de revogação em si não é feita hoje por nenhum serviço
        // (ver docs/README.md §3, BE-06).
        const sessaoId = crypto.randomUUID();
        const token = assinarTokenServico({ sessaoId, instancia: instanciaNorm, escopo, expiresInSegundos });
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        await criarSessaoServico({
            id: sessaoId,
            usuarioId: req.usuario.id,
            tokenHash,
            descricao: descricaoNorm,
            instancia: instanciaNorm,
            escopo,
            expiraEm,
        });

        // O token só aparece nesta resposta, uma única vez — nunca é
        // devolvido de novo nem logado (D-09; mesmo cuidado de FE-10 com a
        // senha temporária em usuarios.routes.js). O operador copia pro
        // config.toml do Bridge na hora da instalação.
        return res.status(201).json({
            success: true,
            data: { token, sessaoId, expiraEm: expiraEm.toISOString() },
        });
    } catch (error) {
        console.error('Erro ao emitir sessão de serviço:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao emitir sessão de serviço.' });
    }
});

module.exports = router;
