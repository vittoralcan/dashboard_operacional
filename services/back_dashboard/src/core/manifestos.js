const fs = require('fs');
const path = require('path');

const ID_VALIDO = /^[a-z][a-z0-9-]*$/;
// Rotas que o app monta direto sob /api/<projeto>/ — não podem virar instanceId.
const INSTANCIAS_RESERVADAS = new Set(['macro-view']);
// Rotas globais do painel, montadas direto sob /api/ (core/metas.js,
// core/atividades.js, core/notificacoes.js) — um projectId com um desses
// nomes colidiria com elas (ex: /api/metas seria a rota global OU o projeto).
const PROJETOS_RESERVADOS = new Set(['health', 'metas', 'atividades', 'notificacoes', 'gargalos', 'painel', 'catalogo', 'monitoramento']);

function validarManifesto(manifesto, arquivo) {
    const erro = (msg) => new Error(`Manifesto ${arquivo}: ${msg}`);

    if (!ID_VALIDO.test(manifesto.projectId ?? '')) throw erro('projectId inválido.');
    if (PROJETOS_RESERVADOS.has(manifesto.projectId)) throw erro(`projectId reservado: ${manifesto.projectId}`);
    if (typeof manifesto.displayName !== 'string') throw erro('displayName obrigatório.');
    if (!Array.isArray(manifesto.modules)) throw erro('modules deve ser uma lista.');

    const vistos = new Set();
    for (const modulo of manifesto.modules) {
        if (!ID_VALIDO.test(modulo.instanceId ?? '')) throw erro(`instanceId inválido: ${modulo.instanceId}`);
        if (INSTANCIAS_RESERVADAS.has(modulo.instanceId)) throw erro(`instanceId reservado: ${modulo.instanceId}`);
        if (vistos.has(modulo.instanceId)) throw erro(`instanceId repetido: ${modulo.instanceId}`);
        vistos.add(modulo.instanceId);
        if (typeof modulo.moduleId !== 'string') throw erro(`moduleId obrigatório em ${modulo.instanceId}.`);
        if (typeof modulo.config !== 'object' || modulo.config === null) throw erro(`config obrigatório em ${modulo.instanceId}.`);
    }
    return manifesto;
}

function carregarManifestos(diretorio) {
    return fs
        .readdirSync(diretorio)
        .filter((arquivo) => arquivo.endsWith('.json'))
        .sort()
        .map((arquivo) => validarManifesto(JSON.parse(fs.readFileSync(path.join(diretorio, arquivo), 'utf8')), arquivo));
}

module.exports = { carregarManifestos };
