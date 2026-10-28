const express = require('express');
const { rota } = require('../core/rota');

const INT_MAX = 2147483647;
const REGEX_DATA =/^\d{4}-\d{2}-\d{2}$/;

function inteiroPositivo(valor) {
    return typeof valor === 'string' && /^\d+$/.test(valor) && Number(valor) > 0 && Number(valor) <= INT_MAX ? Number(valor) : null;
}

function dataValida(valor) {
    if (typeof valor !== 'string' || !REGEX_DATA.test(valor)) return false;
    const d = new Date(`${valor}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

const ETAPAS = ['higienizacao', 'remontagem'];

// Sem etapa na consulta, usa higienização (comportamento anterior). Valor fora da lista é inválido.
function etapaValida(valor) {
    if (valor === undefined) return 'higienizacao';
    return ETAPAS.includes(valor) ? valor : null;
}

function criarRelatoriosRouter({ dbPainel }) {
    const router = express.Router();

    // Produção de higienização hora a hora (RF-41, RF-43): 24 horas + linha por colaborador.
    router.get('/hora-a-hora', rota('Erro ao carregar o relatório hora a hora.', async (req, res) => {
        const projetoId = inteiroPositivo(req.query.projetoId);
        const { data } = req.query;
        const turnoBruto = req.query.turnoId;
        const turnoId = turnoBruto === undefined ? null : inteiroPositivo(turnoBruto);
        const etapa = etapaValida(req.query.etapa);
        if (!projetoId || !dataValida(data) || (turnoBruto !== undefined && turnoId === null) || etapa === null) {
            return res.status(400).json({ success: false, message: 'Informe projetoId e data (AAAA-MM-DD) válidos; etapa deve ser higienizacao ou remontagem.' });
        }

        const { rows } = await dbPainel.query(
            `SELECT EXTRACT(HOUR FROM r.fim_em AT TIME ZONE 'America/Sao_Paulo')::int AS hora,
                    r.colaborador_id, c.nome, COUNT(*)::int AS caixas
               FROM painel.op_caixa_registro r
               JOIN painel.op_colaborador c ON c.id = r.colaborador_id
              WHERE r.projeto_id = $1
                AND r.status = 'concluida'
                AND r.etapa = $4
                AND (r.fim_em AT TIME ZONE 'America/Sao_Paulo')::date = $2::date
                AND ($3::int IS NULL OR r.turno_id = $3::int)
              GROUP BY 1, r.colaborador_id, c.nome
              ORDER BY c.nome, 1`,
            [projetoId, data, turnoId, etapa]
        );

        const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, caixas: 0 }));
        const porColaborador = new Map();
        let total = 0;
        for (const linha of rows) {
            const hora = Number(linha.hora);
            const caixas = Number(linha.caixas);
            horas[hora].caixas += caixas;
            total += caixas;
            if (!porColaborador.has(linha.colaborador_id)) {
                porColaborador.set(linha.colaborador_id, {
                    colaboradorId: linha.colaborador_id,
                    nome: linha.nome,
                    total: 0,
                    horas: new Array(24).fill(0),
                });
            }
            const colaborador = porColaborador.get(linha.colaborador_id);
            colaborador.horas[hora] += caixas;
            colaborador.total += caixas;
        }

        res.json({ success: true, data: { data, etapa, horas, total, colaboradores: [...porColaborador.values()] } });
    }));

    // Tempo médio por colaborador no intervalo (RF-44, higienização por padrão ou remontagem).
    router.get('/tempo-medio', rota('Erro ao carregar o tempo médio.', async (req, res) => {
        const projetoId = inteiroPositivo(req.query.projetoId);
        const { de, ate } = req.query;
        const etapa = etapaValida(req.query.etapa);
        if (!projetoId || !dataValida(de) || !dataValida(ate) || ate < de || etapa === null) {
            return res.status(400).json({ success: false, message: 'Informe projetoId, de e ate (AAAA-MM-DD) válidos; etapa deve ser higienizacao ou remontagem.' });
        }

        const { rows } = await dbPainel.query(
            `SELECT r.colaborador_id, c.nome, COUNT(*)::int AS caixas,
                    SUM(r.duracao_s) AS total_s, AVG(r.duracao_s) AS media_s
               FROM painel.op_caixa_registro r
               JOIN painel.op_colaborador c ON c.id = r.colaborador_id
              WHERE r.projeto_id = $1
                AND r.status = 'concluida'
                AND r.etapa = $4
                AND r.duracao_s IS NOT NULL
                AND (r.fim_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
              GROUP BY r.colaborador_id, c.nome
              ORDER BY c.nome`,
            [projetoId, de, ate, etapa]
        );

        const colaboradores = rows.map((linha) => ({
            colaboradorId: linha.colaborador_id,
            nome: linha.nome,
            caixas: Number(linha.caixas),
            totalS: Math.round(Number(linha.total_s)),
            mediaS: Math.round(Number(linha.media_s)),
        }));
        const caixas = colaboradores.reduce((soma, c) => soma + c.caixas, 0);
        const totalS = colaboradores.reduce((soma, c) => soma + c.totalS, 0);
        const mediaGeralS = caixas > 0 ? Math.round(totalS / caixas) : 0;

        res.json({ success: true, data: { de, ate, etapa, caixas, mediaGeralS, colaboradores } });
    }));

    // Projetos e turnos ativos para os filtros do relatório (sem dados de colaborador).
    router.get('/projetos', rota('Erro ao carregar os projetos.', async (req, res) => {
        const { rows: projetos } = await dbPainel.query(
            'SELECT id, slug, nome FROM painel.op_projeto WHERE ativo ORDER BY nome'
        );
        const { rows: turnos } = await dbPainel.query(
            'SELECT id, projeto_id, nome FROM painel.op_turno WHERE ativo ORDER BY nome'
        );

        const turnosPorProjeto = new Map();
        for (const turno of turnos) {
            if (!turnosPorProjeto.has(turno.projeto_id)) turnosPorProjeto.set(turno.projeto_id, []);
            turnosPorProjeto.get(turno.projeto_id).push({ id: turno.id, nome: turno.nome });
        }

        res.json({
            success: true,
            data: {
                projetos: projetos.map((projeto) => ({
                    id: projeto.id,
                    slug: projeto.slug,
                    nome: projeto.nome,
                    turnos: turnosPorProjeto.get(projeto.id) || [],
                })),
            },
        });
    }));

    return router;
}

module.exports = { criarRelatoriosRouter };
