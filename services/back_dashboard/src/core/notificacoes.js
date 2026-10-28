// GET/POST /api/notificacoes. Leitura é por usuário via
// painel.notificacao_leitura — a notificação em si é global (gerada por job,
// não implementado nesta leva: fica pronta pra quando o notificador existir).
const express = require('express');
const { rota } = require('./rota');

const LIMITE_PADRAO = 30;
const LIMITE_MAXIMO = 100;

function paraResposta(linha) {
    return {
        id: Number(linha.id),
        tipo: linha.tipo,
        titulo: linha.titulo,
        texto: linha.texto,
        criadoEm: new Date(linha.criado_em).toISOString(),
        lida: linha.lida,
        ...(linha.destino ? { destino: linha.destino } : {}),
    };
}

function criarNotificacoesRouter({ dbPainel }) {
    const router = express.Router();

    router.get('/notificacoes', rota('Erro ao listar notificações', async (req, res) => {
        const limite = Math.min(Math.max(Number(req.query.limite) || LIMITE_PADRAO, 1), LIMITE_MAXIMO);
        const vejaAdmin = req.usuario.tipo === 'admin';

        const { rows } = await dbPainel.query(
            `SELECT n.id, n.tipo, n.titulo, n.texto, n.destino, n.criado_em,
                    (nl.usuario_id IS NOT NULL) AS lida
               FROM painel.notificacao n
               LEFT JOIN painel.notificacao_leitura nl
                      ON nl.notificacao_id = n.id AND nl.usuario_id = $1
              WHERE n.expira_em > now() AND (n.so_admin = false OR $2)
              ORDER BY n.criado_em DESC
              LIMIT $3`,
            [req.usuario.id, vejaAdmin, limite]
        );

        res.json({
            success: true,
            data: {
                naoLidas: rows.filter((r) => !r.lida).length,
                itens: rows.map(paraResposta),
            },
        });
    }));

    // Idempotente — marcar de novo uma já lida não é erro (ON CONFLICT DO NOTHING).
    router.post('/notificacoes/:id/lida', rota('Erro ao marcar notificação como lida', async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'Id inválido.' });

        await dbPainel.query(
            `INSERT INTO painel.notificacao_leitura (notificacao_id, usuario_id)
             VALUES ($1, $2)
             ON CONFLICT (notificacao_id, usuario_id) DO NOTHING`,
            [id, req.usuario.id]
        );
        res.json({ success: true });
    }));

    // Marca todas as visíveis ao usuário (respeitando so_admin) de uma vez.
    router.post('/notificacoes/lidas', rota('Erro ao marcar notificações como lidas', async (req, res) => {
        const vejaAdmin = req.usuario.tipo === 'admin';
        await dbPainel.query(
            `INSERT INTO painel.notificacao_leitura (notificacao_id, usuario_id)
             SELECT n.id, $1
               FROM painel.notificacao n
              WHERE n.expira_em > now() AND (n.so_admin = false OR $2)
             ON CONFLICT (notificacao_id, usuario_id) DO NOTHING`,
            [req.usuario.id, vejaAdmin]
        );
        res.json({ success: true });
    }));

    return router;
}

module.exports = { criarNotificacoesRouter };
