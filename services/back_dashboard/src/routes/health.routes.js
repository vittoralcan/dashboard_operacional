const express = require('express');
const { buscarSincronizacao } = require('../core/sincronizacao');

// Público (monitoramento/keep-alive). Dado atrasado não derruba o health — a API continua
// servindo o último retrato bom; só sinaliza em "espelho".
function criarHealthRouter({ db, espelhos }) {
    const router = express.Router();

    router.get('/health', async (req, res) => {
        try {
            const espelho = await Promise.all(
                espelhos.map(async (e) => ({ ...e, ...(await buscarSincronizacao(db, e)) }))
            );
            res.json({ status: 'ok', service: 'back-dashboard', database: 'connected', espelho, timestamp: new Date().toISOString() });
        } catch (erro) {
            console.error('Health — banco indisponível:', erro.message);
            res.status(503).json({ status: 'error', service: 'back-dashboard', database: 'disconnected' });
        }
    });

    return router;
}

module.exports = { criarHealthRouter };
