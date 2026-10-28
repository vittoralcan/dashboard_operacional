// Valida e normaliza o config de uma instância do flow-viewer (vindo do manifesto).
// Falha no boot com mensagem clara — um manifesto errado nunca chega a responder requisição.

const FONTE_VALIDA = /^[a-z][a-z0-9_]{0,30}$/;
// "espera": fase de estacionamento deliberado (não é erro nem processo) — ex: pastas de uma
// tipologia fora de tratamento no momento, num fluxo que mistura mais de uma (ver RAM-005/RAM-006
// de docs/arquitetura/regras-de-arquitetura.md — aqui documentado como "padrão de fluxo com tipologias mistas").
const TIPOS_DE_FASE = new Set(['entrada', 'processo', 'erro', 'reprocessamento', 'terminal', 'espera']);
// RA-017 de docs/arquitetura/regras-de-arquitetura.md: estilo visual é parâmetro de apresentação, não fork de módulo.
const VISUAL_STYLES_VALIDOS = new Set(['gradient-diagonal', 'flat-orthogonal']);

function validarConfig(config, instanceId) {
    const erro = (msg) => new Error(`flow-viewer "${instanceId}": ${msg}`);
    const inteiro = Number.isInteger;

    if (!FONTE_VALIDA.test(config.fonte ?? '')) throw erro('fonte inválida (ex: "atlas").');
    if (!inteiro(config.fluId)) throw erro('fluId deve ser inteiro.');
    if (!Array.isArray(config.fases) || config.fases.length === 0) throw erro('fases deve ser uma lista não vazia.');

    for (const fase of config.fases) {
        if (!inteiro(fase.fasId) || typeof fase.nome !== 'string' || !TIPOS_DE_FASE.has(fase.tipo)) {
            throw erro(`fase inválida: ${JSON.stringify(fase)}`);
        }
    }

    const fasIds = config.fases.map((f) => f.fasId);
    if (new Set(fasIds).size !== fasIds.length) throw erro('fasId repetido em fases.');
    const pertence = (fasId) => fasIds.includes(fasId);

    if (!pertence(config.faseFinal)) throw erro('faseFinal precisa estar em fases.');
    if (!Array.isArray(config.kpiFases) || !config.kpiFases.every(pertence)) throw erro('kpiFases precisa ser subconjunto de fases.');
    if (config.macroView !== undefined && !inteiro(config.macroView.fasId)) throw erro('macroView.fasId deve ser inteiro.');

    // RN-009 (gargalo) — opcional; sobrescreve só as chaves informadas, o resto
    // fica no padrão (piso 20, minParticipacao 0.2, minRazao 2 — ver gargalo.js).
    if (config.gargalo !== undefined) {
        if (typeof config.gargalo !== 'object' || config.gargalo === null) throw erro('gargalo deve ser um objeto.');
        for (const chave of ['piso', 'minParticipacao', 'minRazao', 'vazaoMinPct', 'minEstoque']) {
            if (config.gargalo[chave] !== undefined && typeof config.gargalo[chave] !== 'number') {
                throw erro(`gargalo.${chave} deve ser numérico.`);
            }
        }
        const { vazaoMinPct, minEstoque } = config.gargalo;
        if (vazaoMinPct !== undefined && (vazaoMinPct < 0 || vazaoMinPct > 1)) throw erro('gargalo.vazaoMinPct deve estar entre 0 e 1.');
        if (minEstoque !== undefined && minEstoque < 0) throw erro('gargalo.minEstoque deve ser >= 0.');
    }

    // Regra C — lotes que não são produção (ex.: "teste"); opcional, lista de nomes de lote (lot_nome).
    if (config.lotesIgnorados !== undefined) {
        if (!Array.isArray(config.lotesIgnorados) || !config.lotesIgnorados.every((n) => typeof n === 'string' && n.trim())) {
            throw erro('lotesIgnorados deve ser uma lista de nomes de lote (texto não vazio).');
        }
    }

    // B2 (api_noir.md) — tudo abaixo é opcional e só serve a tela de fluxo genérica
    // (apresentação + grafo); nenhuma instância existente (ATLAS já migrado, BOREAL
    // arquivado) deixa de validar por não ter esses campos (RNB-B1: aditivo).
    if (config.visualStyle !== undefined && !VISUAL_STYLES_VALIDOS.has(config.visualStyle)) {
        throw erro(`visualStyle inválido: ${config.visualStyle}`);
    }

    if (config.apresentacao !== undefined) {
        const a = config.apresentacao;
        if (typeof a !== 'object' || a === null) throw erro('apresentacao deve ser um objeto.');
        if (typeof a.nome !== 'string' || !a.nome) throw erro('apresentacao.nome é obrigatório.');
        if (a.sub !== undefined && typeof a.sub !== 'string') throw erro('apresentacao.sub deve ser string.');
        if (a.grupo !== undefined && (typeof a.grupo !== 'object' || a.grupo === null || typeof a.grupo.id !== 'string' || typeof a.grupo.nome !== 'string')) {
            throw erro('apresentacao.grupo deve ser { id, nome }.');
        }
        if (a.aValidar !== undefined && typeof a.aValidar !== 'boolean') throw erro('apresentacao.aValidar deve ser booleano.');
        if (a.passo !== undefined) {
            for (const chave of ['cw', 'ch', 'nw', 'nh']) {
                if (!inteiro(a.passo[chave]) || a.passo[chave] <= 0) throw erro(`apresentacao.passo.${chave} deve ser inteiro positivo.`);
            }
        }
    }

    if (config.gestaoColunas !== undefined) {
        if (!Array.isArray(config.gestaoColunas)) throw erro('gestaoColunas deve ser uma lista.');
        for (const coluna of config.gestaoColunas) {
            if (!pertence(coluna.fasId)) throw erro(`gestaoColunas: fasId ${coluna.fasId} não existe em fases.`);
            if (!config.kpiFases.includes(coluna.fasId)) throw erro(`gestaoColunas: fasId ${coluna.fasId} precisa estar em kpiFases.`);
            if (typeof coluna.titulo !== 'string' || !coluna.titulo) throw erro(`gestaoColunas: titulo inválido para fasId ${coluna.fasId}.`);
        }
    }

    if (config.grafo !== undefined) {
        const g = config.grafo;
        if (!Array.isArray(g.nos) || !Array.isArray(g.juncoes) || !Array.isArray(g.arestas)) {
            throw erro('grafo deve ter nos/juncoes/arestas como listas.');
        }
        for (const no of g.nos) {
            if (!pertence(no.fasId)) throw erro(`grafo.nos: fasId ${no.fasId} não existe em fases.`);
            if (!inteiro(no.x) || no.x < 0 || !inteiro(no.y) || no.y < 0) throw erro(`grafo.nos: x/y inválidos para fasId ${no.fasId}.`);
        }
        const idsDeJuncao = new Set();
        for (const juncao of g.juncoes) {
            if (typeof juncao.id !== 'string') throw erro(`grafo.juncoes: id inválido: ${JSON.stringify(juncao)}`);
            if (!inteiro(juncao.x) || juncao.x < 0 || !inteiro(juncao.y) || juncao.y < 0) throw erro(`grafo.juncoes: x/y inválidos para ${juncao.id}.`);
            idsDeJuncao.add(juncao.id);
        }
        const idsValidos = new Set([...fasIds, ...idsDeJuncao]);
        for (const aresta of g.arestas) {
            if (!idsValidos.has(aresta.de) || !idsValidos.has(aresta.para)) {
                throw erro(`grafo.arestas: referência inválida (${JSON.stringify(aresta)}).`);
            }
        }
    }

    return {
        schema: `captura_${config.fonte}`,
        fonte: config.fonte,
        fluId: config.fluId,
        fasIds,
        faseFinal: config.faseFinal,
        kpiFases: config.kpiFases,
        // Regra de "primeira passagem" de cada fase de KPI (ver queries.js): entrada | processo | final.
        modoPassagem: (fasId) => fasId === config.faseFinal ? 'final'
            : config.fases.find((f) => f.fasId === fasId)?.tipo === 'entrada' ? 'entrada' : 'processo',
        // Lotes (lot_nome, minúsculos) fora de toda contagem de produção/ocupação — regra C.
        lotesIgnorados: (config.lotesIgnorados ?? []).map((n) => n.trim().toLowerCase()),
        faseMacroView: config.macroView?.fasId ?? null,
        // Opcional, aditivo (default false — nenhuma instância hoje existente muda de
        // comportamento): quebra "Top 2 + Outros" por estado da federação em cada kpiFase do
        // /gestao, hoje só usada pela instância "digitalizacao" do BOREAL (ver estados.js).
        estadosDaFederacao: Boolean(config.estadosDaFederacao),
        // nome/tipo de cada fase, preservados do manifesto (RN-009 precisa — status-fases
        // só devolve números, por RAM-005; este mapa é o que dá nome/tipo a cada FAS_ID).
        fasesPorId: new Map(config.fases.map((f) => [f.fasId, { nome: f.nome, tipo: f.tipo }])),
        gargalo: config.gargalo ?? {},
        // B2 — servidos em /config quase como vieram do manifesto, só sem os campos
        // internos (fluId/fonte/schema nunca saem numa resposta HTTP).
        visualStyle: config.visualStyle ?? null,
        apresentacao: config.apresentacao ?? null,
        gestaoColunas: config.gestaoColunas ?? null,
        grafo: config.grafo ?? null,
        fases: config.fases,
    };
}

module.exports = { validarConfig };
