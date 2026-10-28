// GET /api/gargalos (api_noir.md B5) — agregado de todas as instâncias com
// gargalo, pra um cartão "Gargalos agora" na tela de seleção/hub. Cada
// instância é independente (Promise.allSettled, RA-015): uma falhando não
// derruba as demais, só fica de fora do resultado.
const express = require('express');
const { rota } = require('./rota');
const { rotaCacheavel } = require('./cache-leitura');

function criarGargalosGlobaisRouter(projetos) {
    const router = express.Router();

    const instancias = [];
    for (const { projectId, instancias: doProjeto } of projetos) {
        for (const instancia of doProjeto) {
            if (instancia.buscarGargaloAtual) instancias.push({ projectId, instancia });
        }
    }

    // BD-13: agregado global, mesmo cache em processo (30s) + ETag das rotas
    // por instância (core/cache-leitura.js) — chave fixa, não há variação por
    // instância aqui (a rota já agrega todas).
    router.get('/gargalos', rota('Erro ao agregar gargalos', rotaCacheavel('gargalos:global', async () => {
        const resultados = await Promise.allSettled(instancias.map((i) => i.instancia.buscarGargaloAtual()));

        const data = [];
        resultados.forEach((resultado, indice) => {
            const { projectId, instancia } = instancias[indice];
            if (resultado.status === 'rejected') {
                console.error(`Gargalos — instância ${projectId}/${instancia.instanceId} falhou:`, resultado.reason?.message);
                return;
            }
            if (!resultado.value.gargalo) return;
            data.push({
                projeto: projectId,
                instancia: instancia.instanceId,
                // Nome de exibição "bonito" (ex.: "Negativos") depende do catálogo
                // (B1, apresentacao.nome do manifesto) — fora desta fatia; por ora o
                // id serve como nome, o frontend já sabe mapear id -> rótulo.
                instanciaNome: instancia.instanceId,
                projetoNome: projectId,
                ...resultado.value.gargalo,
            });
        });

        data.sort((a, b) => b.pastas - a.pastas);
        return data;
    })));

    return router;
}

module.exports = { criarGargalosGlobaisRouter };
