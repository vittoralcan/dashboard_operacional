// GET/PUT /api/metas (api_noir.md B7). Rota global do painel — não pertence a
// um projeto/instância específico (por isso mora em core/, não em modules/).
const express = require('express');
const { rota } = require('./rota');
const { registrarAuditoria } = require('./auditoria');

const UNIDADES_VALIDAS = new Set(['pastas', 'caixas', 'documentos']);

function validarMeta(corpo) {
    const { projeto, escopo, ano, mes, valor, unidade } = corpo || {};
    if (typeof projeto !== 'string' || !projeto.trim()) return 'Campo "projeto" é obrigatório.';
    if (typeof escopo !== 'string' || !escopo.trim()) return 'Campo "escopo" é obrigatório.';
    if (!Number.isInteger(ano) || ano < 2024 || ano > 2100) return 'Campo "ano" deve ser um inteiro entre 2024 e 2100.';
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) return 'Campo "mes" deve ser um inteiro entre 1 e 12.';
    if (!Number.isInteger(valor) || valor < 1 || valor > 10_000_000) return 'Campo "valor" deve ser um inteiro entre 1 e 10.000.000.';
    if (!UNIDADES_VALIDAS.has(unidade)) return `Campo "unidade" deve ser um de: ${[...UNIDADES_VALIDAS].join(', ')}.`;
    return null;
}

function criarMetasRouter({ dbPainel, exigirAdmin }) {
    const router = express.Router();

    // Só este router lê corpo de requisição (PUT /metas) — mantém o resto do
    // back_dashboard sem express.json() global (BE-03/docs/arquitetura/seguranca.md).
    router.use(express.json());

    // Qualquer usuário logado pode ver as metas do mês (não é dado sensível).
    router.get('/metas', rota('Erro ao listar metas', async (req, res) => {
        const agora = new Date();
        const ano = Number(req.query.ano) || agora.getFullYear();
        const mes = Number(req.query.mes) || agora.getMonth() + 1;
        const { rows } = await dbPainel.query(
            `SELECT projeto, escopo, ano, mes, valor, unidade
               FROM painel.meta
              WHERE ano = $1 AND mes = $2
              ORDER BY projeto, escopo`,
            [ano, mes]
        );
        res.json({ success: true, data: rows });
    }));

    // Upsert — só admin (RNB-B7/B.7 do contrato). Validação antes de qualquer
    // escrita; grava em painel.auditoria depois do upsert (RNB-B6).
    router.put('/metas', exigirAdmin, rota('Erro ao gravar meta', async (req, res) => {
        const erroValidacao = validarMeta(req.body);
        if (erroValidacao) return res.status(400).json({ success: false, message: erroValidacao });

        const { projeto, escopo, ano, mes, valor, unidade } = req.body;
        const projetoNorm = projeto.trim();
        const escopoNorm = escopo.trim();

        await dbPainel.query(
            `INSERT INTO painel.meta (projeto, escopo, ano, mes, valor, unidade, atualizado_por)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (projeto, escopo, ano, mes)
             DO UPDATE SET valor = EXCLUDED.valor, unidade = EXCLUDED.unidade,
                           atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now()`,
            [projetoNorm, escopoNorm, ano, mes, valor, unidade, req.usuario.id]
        );

        await registrarAuditoria(dbPainel, {
            usuarioId: req.usuario.id,
            usuarioLogin: req.usuario.login,
            acao: 'meta.definida',
            alvo: `Meta de ${String(mes).padStart(2, '0')}/${ano}`,
            onde: `${projetoNorm} · ${escopoNorm}`,
            detalhe: { valor, unidade },
        });

        res.json({ success: true, data: { projeto: projetoNorm, escopo: escopoNorm, ano, mes, valor, unidade } });
    }));

    return router;
}

module.exports = { criarMetasRouter };
