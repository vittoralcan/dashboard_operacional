const express = require('express');

// GET /api/<projeto>/macro-view/summary — um bloco por instância que tenha resumo, chaveado
// pelo instanceId. Cada bloco falha sozinho (vem null), sem derrubar os demais (RA-015).
function criarMacroViewRouter(instancias) {
    const router = express.Router();
    const comResumo = instancias.filter((i) => i.resumoMacroView);

    router.get('/macro-view/summary', async (req, res) => {
        const resultados = await Promise.allSettled(comResumo.map((i) => i.resumoMacroView()));
        const data = Object.fromEntries(
            resultados.map((r, idx) => {
                if (r.status === 'rejected') console.error(`Macro View — bloco ${comResumo[idx].instanceId} falhou:`, r.reason?.message);
                return [comResumo[idx].instanceId, r.status === 'fulfilled' ? r.value : null];
            })
        );
        res.json({ success: true, data });
    });

    return router;
}

module.exports = { criarMacroViewRouter };
