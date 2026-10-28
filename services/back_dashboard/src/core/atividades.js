// GET /api/atividades (api_noir.md B8). Escopo desta leva: só a fonte
// `painel.auditoria` (RN-014, fonte 1) — relatório gerado, meta definida, etc.
// A fonte de Higienização (RN-014, fonte 2) lia TBL_REG_PRODUCAO via back_boreal;
// como o projeto BOREAL está em encerramento (ver docs/arquitetura/visao-geral.md
// e docs/arquitetura/regras-de-arquitetura.md), essa fonte não é implementada — "Atividade
// recente" mostra só o que o próprio painel registrou.
const express = require('express');
const { rota } = require('./rota');

const LIMITE_PADRAO = 20;
const LIMITE_MAXIMO = 50;

function criarAtividadesRouter({ dbPainel }) {
    const router = express.Router();

    router.get('/atividades', rota('Erro ao listar atividades', async (req, res) => {
        const limite = Math.min(Math.max(Number(req.query.limite) || LIMITE_PADRAO, 1), LIMITE_MAXIMO);
        const params = [limite];

        // `onde` é gravado como "<projeto> · <escopo>" por quem audita (ex.:
        // core/metas.js) — um prefixo dá um filtro por projeto honesto sem
        // precisar de uma coluna estruturada só para isto.
        let filtroProjeto = '';
        if (typeof req.query.projeto === 'string' && req.query.projeto.trim()) {
            params.push(`${req.query.projeto.trim()} ·%`);
            filtroProjeto = `AND onde ILIKE $${params.length}`;
        }

        const { rows } = await dbPainel.query(
            `SELECT id, em, usuario_login, acao, alvo, onde
               FROM painel.auditoria
              WHERE true ${filtroProjeto}
              ORDER BY em DESC
              LIMIT $1`,
            params
        );

        res.json({
            success: true,
            data: rows.map((r) => ({
                id: Number(r.id),
                em: new Date(r.em).toISOString(),
                // Mostra o login de quem fez (não o nome completo): o
                // back_dashboard não tem acesso à tabela de usuários do
                // back_auth, que vive num banco separado por desenho (RA-016).
                quem: r.usuario_login ?? 'Sistema',
                sistema: r.usuario_login === null,
                acao: r.acao,
                alvo: r.alvo,
                onde: r.onde,
            })),
        });
    }));

    return router;
}

module.exports = { criarAtividadesRouter };
