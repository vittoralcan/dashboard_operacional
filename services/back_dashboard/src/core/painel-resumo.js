// GET /api/painel/resumo — KPIs de todas as instâncias numa
// chamada só, pra seleção de projetos/hubs não precisarem de 8-10 requisições
// na abertura. Cada instância falha de forma independente (RA-015): uma
// indisponível vira `null`, nunca derruba as demais.
const express = require('express');
const { rota } = require('./rota');
const { rotaCacheavel } = require('./cache-leitura');

function criarPainelResumoRouter(projetos) {
    const router = express.Router();

    const instancias = [];
    for (const { instancias: doProjeto } of projetos) {
        for (const instancia of doProjeto) {
            if (instancia.buscarResumoPainel) instancias.push(instancia);
        }
    }

    // BD-13: mesmo cache em processo (30s) + ETag das demais rotas de leitura
    // (core/cache-leitura.js). `geradoEm` fica "congelado" pelos mesmos 30s —
    // aceitável, é só informativo (a idade real do dado já vem de `sincronizacao`
    // dentro de cada instância, RN-012).
    router.get('/painel/resumo', rota('Erro ao montar resumo do painel', rotaCacheavel('painel-resumo:global', async () => {
        const resultados = await Promise.allSettled(instancias.map((i) => i.buscarResumoPainel()));

        const porInstancia = {};
        resultados.forEach((resultado, indice) => {
            const { instanceId } = instancias[indice];
            if (resultado.status === 'rejected') {
                console.error(`Painel/resumo — instância ${instanceId} falhou:`, resultado.reason?.message);
                porInstancia[instanceId] = null;
                return;
            }
            porInstancia[instanceId] = resultado.value;
        });

        return { geradoEm: new Date().toISOString(), instancias: porInstancia };
    })));

    return router;
}

module.exports = { criarPainelResumoRouter };
