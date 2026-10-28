const express = require('express');
const {
    buscarPerfilPorId,
    atualizarNome,
    atualizarPreferencias,
} = require('../queries/usuarios.queries');

const router = express.Router();

const MACRO_INTERVALOS_VALIDOS = [5, 8, 10, 15, 30];
const VALIDADORES_PREFERENCIA = {
    tema: (v) => v === 'dark' || v === 'light',
    sidebarRecolhida: (v) => typeof v === 'boolean',
    macroIntervaloSeg: (v) => MACRO_INTERVALOS_VALIDOS.includes(v),
};
const MENSAGENS_PREFERENCIA = {
    tema: 'Preferência inválida: tema deve ser "dark" ou "light".',
    sidebarRecolhida: 'Preferência inválida: sidebarRecolhida deve ser verdadeiro ou falso.',
    macroIntervaloSeg: `Preferência inválida: macroIntervaloSeg deve ser ${MACRO_INTERVALOS_VALIDOS.join(', ')}.`,
};

// Chaves desconhecidas são ignoradas de propósito (api_noir.md A4) — um
// frontend mais novo que o backend não quebra a chamada por mandar uma
// preferência que este backend ainda não conhece.
function validarPatchPreferencias(corpo) {
    const patch = {};
    for (const [chave, valor] of Object.entries(corpo || {})) {
        const validador = VALIDADORES_PREFERENCIA[chave];
        if (!validador) continue;
        if (!validador(valor)) return { erro: MENSAGENS_PREFERENCIA[chave] };
        patch[chave] = valor;
    }
    return { patch };
}

// Formato de resposta de A2/A3 (api_noir.md) — nunca inclui senha_hash;
// datas em ISO 8601 (mesmo padrão já usado em todo o painel, ver
// back_dashboard/src/core/sincronizacao.js).
function paraRespostaPerfil(perfil) {
    return {
        id: perfil.id,
        nome: perfil.nome,
        login: perfil.login,
        email: perfil.email,
        tipo: perfil.tipo,
        cargo: perfil.cargo,
        precisaTrocarSenha: perfil.precisa_trocar_senha,
        ultimoLoginEm: perfil.ultimo_login_em ? new Date(perfil.ultimo_login_em).toISOString() : null,
        criadoEm: new Date(perfil.criado_em).toISOString(),
        preferencias: perfil.preferencias ?? {},
    };
}

// GET /api/auth/me — fonte única para menu, perfil e configurações (A2).
router.get('/auth/me', async (req, res) => {
    try {
        const perfil = await buscarPerfilPorId(req.usuario.id);
        // Revalida contra o banco (BE-06 parcial): um token ainda válido de
        // uma conta desativada depois do login para de servir este endpoint.
        if (!perfil || !perfil.ativo) {
            return res.status(401).json({ success: false, message: 'Token de autenticação inválido.' });
        }
        return res.status(200).json({ success: true, data: paraRespostaPerfil(perfil) });
    } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao buscar perfil.' });
    }
});

// PATCH /api/auth/me — v1: só `nome` (A3). E-mail/login/tipo/cargo não são
// editáveis aqui (cargo é A7, exclusivo de admin, ainda não implementado).
router.patch('/auth/me', async (req, res) => {
    try {
        const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim() : '';
        if (nome.length < 2 || nome.length > 150) {
            return res.status(400).json({ success: false, message: 'Nome é obrigatório e deve ter ao menos 2 caracteres.' });
        }

        const perfil = await atualizarNome(req.usuario.id, nome);
        if (!perfil) return res.status(401).json({ success: false, message: 'Token de autenticação inválido.' });
        return res.status(200).json({ success: true, data: paraRespostaPerfil(perfil) });
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao atualizar perfil.' });
    }
});

// PATCH /api/auth/me/preferencias — atualização parcial (A4): só as chaves
// enviadas mudam, o resto permanece como estava (merge no próprio Postgres).
router.patch('/auth/me/preferencias', async (req, res) => {
    try {
        const { erro, patch } = validarPatchPreferencias(req.body);
        if (erro) return res.status(400).json({ success: false, message: erro });

        const preferencias = await atualizarPreferencias(req.usuario.id, patch);
        return res.status(200).json({ success: true, data: preferencias });
    } catch (error) {
        console.error('Erro ao atualizar preferências:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao atualizar preferências.' });
    }
});

module.exports = router;
