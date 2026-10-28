// GET /api/catalogo (api_noir.md B1) — estrutura de projetos/instâncias a partir
// dos manifestos, pra alimentar menu, paleta de comandos e breadcrumbs do
// frontend novo. Dado estático (vem só do manifesto já carregado no boot — sem
// consulta ao banco), por isso não é async nem precisa de `rota()`.
const express = require('express');

function criarCatalogoRouter(manifestos, projetos) {
    const router = express.Router();

    router.get('/catalogo', (req, res) => {
        const projetosResposta = manifestos.map((manifesto) => {
            const { instancias } = projetos.find((p) => p.projectId === manifesto.projectId);

            const grupos = new Map();
            const instanciasResposta = [];

            for (const instancia of instancias) {
                if (!instancia.infoCatalogo) continue; // módulo futuro sem apresentação ainda
                const info = instancia.infoCatalogo;

                if (info.grupo) {
                    if (!grupos.has(info.grupo.id)) {
                        grupos.set(info.grupo.id, { id: info.grupo.id, nome: info.grupo.nome, instancias: [] });
                    }
                    grupos.get(info.grupo.id).instancias.push(instancia.instanceId);
                }

                instanciasResposta.push({
                    id: instancia.instanceId,
                    nome: info.nome,
                    sub: info.sub,
                    tipo: 'flow-viewer',
                    aValidar: info.aValidar,
                    fases: info.fases,
                });
            }

            return {
                id: manifesto.projectId,
                // O manifesto só guarda um nome (displayName) — sigla e nome completo
                // usam o mesmo valor até existir uma fonte confiável pro nome oficial
                // por extenso de cada projeto (não é dado que este backend deva inventar).
                sigla: manifesto.displayName,
                nome: manifesto.displayName,
                status: 'ativo',
                grupos: [...grupos.values()],
                instancias: instanciasResposta,
            };
        });

        res.set('Cache-Control', 'private, max-age=300');
        res.json({ success: true, data: { geradoEm: new Date().toISOString(), projetos: projetosResposta } });
    });

    return router;
}

module.exports = { criarCatalogoRouter };
