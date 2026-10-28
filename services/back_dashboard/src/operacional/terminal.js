// Terminal do tablet (RF-13 a RF-16, RF-19), montado em /api/operacional/terminal
// por operacional/index.js, com `req.turno` já resolvido por resolverTurno.
const express = require('express');
const { rota } = require('../core/rota');
const { decidirBip, normalizarCodigo } = require('./bip');
const { encerrarPausasVencidas, fecharPausasEContar, COLUNAS_PAUSA } = require('./pausa');

const ETAPAS = ['higienizacao', 'remontagem', 'digitalizacao'];
const ETAPA_PADRAO = 'higienizacao';

// A digitalização tem tela própria: o bip de uma tela não conclui caixa aberta na etapa da outra.
const grupoDaEtapa = (e) => (e === 'digitalizacao' ? 'digitalizacao' : 'operacao');

const iso = (v) => (v == null ? null : new Date(v).toISOString());

// Etapa ausente vale higienizacao; presente e fora da lista é inválida (null, '', número também).
function lerEtapa(valor) {
    if (valor === undefined) return { etapa: ETAPA_PADRAO };
    if (!ETAPAS.includes(valor)) {
        return { erro: `Campo "etapa" deve ser um de: ${ETAPAS.join(', ')}.` };
    }
    return { etapa: valor };
}

// `id` é BIGSERIAL: o driver `pg` entrega bigint como texto ("42"), e o front só aceita número.
function registroCamel(r) {
    return {
        id: Number(r.id),
        codigo: r.codigo,
        colaboradorId: r.colaborador_id,
        mesaId: r.mesa_id,
        etapa: r.etapa,
        status: r.status,
        inicioEm: iso(r.inicio_em),
        fimEm: iso(r.fim_em),
        duracaoS: r.duracao_s,
        imagens: r.imagens ?? null,
        fimSolicitadoEm: iso(r.fim_solicitado_em),
        grampo: r.grampo ?? false,
        deteriorado: r.deteriorado ?? false,
    };
}

function criarTerminalRouter({ dbPainel, agora = () => new Date() }) {
    const router = express.Router();

    // Lê projeto, caixa aberta e última passagem e decide o bip (sem gravar).
    async function decidir(turno, texto, etapa, momento) {
        const codigo = normalizarCodigo(texto);
        const { rows: projetos } = await dbPainel.query(
            'SELECT id, codigo_regex FROM painel.op_projeto WHERE id = $1',
            [turno.projetoId],
        );
        const { rows: abertas } = await dbPainel.query(
            `SELECT id, inicio_em, etapa FROM painel.op_caixa_registro
              WHERE projeto_id = $1 AND codigo = $2 AND status = 'aberta'`,
            [turno.projetoId, codigo],
        );
        const { rows: ultimas } = await dbPainel.query(
            `SELECT id, status, fim_em FROM painel.op_caixa_registro
              WHERE projeto_id = $1 AND etapa = $3 AND codigo = $2
              ORDER BY id DESC LIMIT 1`,
            [turno.projetoId, codigo, etapa],
        );
        // Uma caixa física só está aberta em uma etapa por vez: o bip acha a aberta em qualquer etapa.
        const decisao = decidirBip({
            texto: codigo,
            codigoRegex: projetos[0]?.codigo_regex,
            aberta: abertas[0] ?? null,
            ultima: ultimas[0] ?? null,
            agora: momento,
        });
        return { ...decisao, abertaEtapa: abertas[0]?.etapa ?? null };
    }

    // Conclui a caixa: fecha pausa aberta e desconta o tempo pausado da duração.
    async function concluir(req, registroId, inicioEm, momento, extras = {}) {
        await encerrarPausasVencidas(dbPainel, momento);
        const pausadoS = await fecharPausasEContar(dbPainel, registroId, momento);
        const brutaS = Math.floor((momento.getTime() - new Date(inicioEm).getTime()) / 1000);
        const duracaoS = Math.max(0, brutaS - pausadoS);
        const { rows } = await dbPainel.query(
            `UPDATE painel.op_caixa_registro
                SET status = $8, fim_em = $1, duracao_s = $2, atualizado_por = $3, atualizado_em = $1,
                    imagens = COALESCE($5, imagens), grampo = COALESCE($6, grampo), deteriorado = COALESCE($7, deteriorado)
              WHERE id = $4 AND status = 'aberta'
              RETURNING *`,
            [momento, duracaoS, req.usuario.id, registroId, extras.imagens ?? null, extras.grampo ?? null, extras.deteriorado ?? null, 'concluida'],
        );
        return rows[0] ?? null;
    }

    const inexistente = (res, decisao) => res.status(422).json({
        success: false,
        acao: 'inexistente',
        motivo: decisao.motivo,
        message: 'Código de caixa inválido.',
    });

    router.get('/colaboradores', rota('Erro ao listar colaboradores', async (req, res) => {
        const { rows } = await dbPainel.query(
            'SELECT id, nome, funcao, avatar FROM painel.op_colaborador WHERE turno_id = $1 AND ativo',
            [req.turno.id],
        );
        const data = rows
            .map(({ id, nome, funcao, avatar }) => ({ id, nome, funcao, avatar }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
        res.json({ success: true, data });
    }));

    router.post('/bip', rota('Erro ao processar o bip', async (req, res) => {
        if (typeof req.body?.codigo !== 'string') {
            return res.status(400).json({ success: false, message: 'Campo "codigo" é obrigatório.' });
        }
        const { etapa, erro } = lerEtapa(req.body.etapa);
        if (erro) return res.status(400).json({ success: false, message: erro });
        const momento = agora();
        const decisao = await decidir(req.turno, req.body.codigo, etapa, momento);

        if (decisao.acao === 'inexistente') return inexistente(res, decisao);
        if (decisao.abertaEtapa && grupoDaEtapa(decisao.abertaEtapa) !== grupoDaEtapa(etapa)) {
            return res.json({ success: true, data: { acao: 'outra_etapa', codigo: decisao.codigo, etapa: decisao.abertaEtapa } });
        }
        if (decisao.acao === 'iniciar') {
            return res.json({ success: true, data: { acao: 'iniciar', codigo: decisao.codigo } });
        }
        if (decisao.acao === 'finalizar') {
            // Digitalização pede imagens e ocorrências antes de concluir: o bip só avisa.
            if (decisao.abertaEtapa === 'digitalizacao' || (!decisao.abertaEtapa && etapa === 'digitalizacao')) {
                const parada = await pararRelogio(decisao.registroId, momento);
                return res.json({
                    success: true,
                    data: { acao: 'finalizar_pendente', codigo: decisao.codigo, registroId: decisao.registroId, fimSolicitadoEm: iso(parada) },
                });
            }
            const { rows: abertas } = await dbPainel.query(
                'SELECT inicio_em FROM painel.op_caixa_registro WHERE id = $1 AND status = \'aberta\'',
                [decisao.registroId],
            );
            const registro = abertas[0] && await concluir(req, decisao.registroId, abertas[0].inicio_em, momento);
            if (!registro) return res.json({ success: true, data: { acao: 'duplicado' } });
            return res.json({
                success: true,
                data: {
                    acao: 'finalizar',
                    codigo: decisao.codigo,
                    duracaoS: registro.duracao_s,
                    registro: registroCamel(registro),
                },
            });
        }
        res.json({ success: true, data: { acao: decisao.acao } });
    }));

    router.post('/caixas', rota('Erro ao abrir a caixa', async (req, res) => {
        const { codigo, colaboradorId, mesaId } = req.body ?? {};
        if (typeof codigo !== 'string') {
            return res.status(400).json({ success: false, message: 'Campo "codigo" é obrigatório.' });
        }
        const { etapa, erro: erroEtapa } = lerEtapa(req.body.etapa);
        if (erroEtapa) return res.status(400).json({ success: false, message: erroEtapa });
        if (!Number.isInteger(colaboradorId) || colaboradorId < 1) {
            return res.status(400).json({ success: false, message: 'Campo "colaboradorId" deve ser um inteiro positivo.' });
        }
        if (mesaId != null && (!Number.isInteger(mesaId) || mesaId < 1)) {
            return res.status(400).json({ success: false, message: 'Campo "mesaId" deve ser um inteiro positivo.' });
        }

        const momento = agora();
        const decisao = await decidir(req.turno, codigo, etapa, momento);
        if (decisao.acao === 'inexistente') return inexistente(res, decisao);
        if (decisao.acao !== 'iniciar') {
            return res.status(409).json({ success: false, message: 'Caixa já está aberta.' });
        }

        const colab = await dbPainel.query(
            'SELECT id FROM painel.op_colaborador WHERE id = $1 AND turno_id = $2 AND ativo',
            [colaboradorId, req.turno.id],
        );
        if (!colab.rows.length) {
            return res.status(400).json({ success: false, message: 'Colaborador não pertence ao turno.' });
        }
        const ocupado = await dbPainel.query(
            `SELECT codigo, etapa, inicio_em FROM painel.op_caixa_registro WHERE colaborador_id = $1 AND status = 'aberta' LIMIT 1`,
            [colaboradorId],
        );
        if (ocupado.rows.length) {
            const { codigo: codigoAberto, etapa: etapaAberta, inicio_em: inicioAberto } = ocupado.rows[0];
            return res.status(409).json({
                success: false,
                motivo: 'colaborador_ocupado',
                ocupadoCom: { codigo: codigoAberto, etapa: etapaAberta ?? null, inicioEm: inicioAberto ? iso(inicioAberto) : null },
                message: `Este colaborador já tem a caixa ${codigoAberto} em andamento. Conclua antes de iniciar outra.`,
            });
        }
        if (mesaId != null) {
            const mesa = await dbPainel.query(
                'SELECT id FROM painel.op_mesa WHERE id = $1 AND projeto_id = $2 AND ativo',
                [mesaId, req.turno.projetoId],
            );
            if (!mesa.rows.length) {
                return res.status(400).json({ success: false, message: 'Mesa inválida.' });
            }
        }

        try {
            const { rows } = await dbPainel.query(
                `INSERT INTO painel.op_caixa_registro
                    (projeto_id, turno_id, colaborador_id, mesa_id, etapa, codigo, inicio_em, criado_por)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [req.turno.projetoId, req.turno.id, colaboradorId, mesaId ?? null, etapa, decisao.codigo, momento, req.usuario.id],
            );
            res.status(201).json({ success: true, data: registroCamel(rows[0]) });
        } catch (erro) {
            if (erro.code === '23505') {
                return res.status(409).json({ success: false, message: 'Caixa já está aberta.' });
            }
            throw erro;
        }
    }));

    // Para o relógio no instante pedido (bip ou botão Concluir); pedidos repetidos mantêm o primeiro instante.
    async function pararRelogio(registroId, momento) {
        const { rows } = await dbPainel.query(
            `UPDATE painel.op_caixa_registro SET fim_solicitado_em = COALESCE(fim_solicitado_em, $2)
              WHERE id = $1 AND status = 'aberta' RETURNING fim_solicitado_em`,
            [registroId, momento],
        );
        return rows[0]?.fim_solicitado_em ?? momento;
    }

    // Caixa aberta do turno (ou null), para pausar, retomar e concluir.
    async function abertaDoTurno(req, id) {
        if (!/^\d+$/.test(String(id))) return null;
        const { rows } = await dbPainel.query(
            `SELECT id, inicio_em, etapa, fim_solicitado_em FROM painel.op_caixa_registro
              WHERE id = $1 AND turno_id = $2 AND status = 'aberta'`,
            [Number(id), req.turno.id],
        );
        return rows[0] ?? null;
    }

    router.post('/caixas/:id/encerrando', rota('Erro ao parar o relógio', async (req, res) => {
        const caixa = await abertaDoTurno(req, req.params.id);
        if (!caixa) return res.status(404).json({ success: false, message: 'Caixa aberta não encontrada.' });
        const parada = await pararRelogio(caixa.id, agora());
        res.json({ success: true, data: { id: caixa.id, fimSolicitadoEm: iso(parada) } });
    }));

    // Desistiu de concluir: o relógio volta a contar.
    router.delete('/caixas/:id/encerrando', rota('Erro ao retomar o relógio', async (req, res) => {
        const caixa = await abertaDoTurno(req, req.params.id);
        if (!caixa) return res.status(404).json({ success: false, message: 'Caixa aberta não encontrada.' });
        await dbPainel.query(
            `UPDATE painel.op_caixa_registro SET fim_solicitado_em = NULL WHERE id = $1 AND status = 'aberta'`,
            [caixa.id],
        );
        res.json({ success: true, data: { id: caixa.id, fimSolicitadoEm: null } });
    }));

    router.post('/caixas/:id/pausar', rota('Erro ao pausar a caixa', async (req, res) => {
        const caixa = await abertaDoTurno(req, req.params.id);
        if (!caixa) return res.status(404).json({ success: false, message: 'Caixa aberta não encontrada.' });
        const momento = agora();
        await encerrarPausasVencidas(dbPainel, momento);
        try {
            const { rows } = await dbPainel.query(
                `INSERT INTO painel.op_pausa (registro_id, inicio_em, criado_por)
                 VALUES ($1, $2, $3) RETURNING id, inicio_em`,
                [caixa.id, momento, req.usuario.id],
            );
            res.status(201).json({ success: true, data: { id: caixa.id, pausada: true, pausaInicioEm: iso(rows[0].inicio_em) } });
        } catch (erro) {
            if (erro.code === '23505') return res.status(409).json({ success: false, message: 'Caixa já está pausada.' });
            throw erro;
        }
    }));

    router.post('/caixas/:id/retomar', rota('Erro ao retomar a caixa', async (req, res) => {
        const caixa = await abertaDoTurno(req, req.params.id);
        if (!caixa) return res.status(404).json({ success: false, message: 'Caixa aberta não encontrada.' });
        const momento = agora();
        await encerrarPausasVencidas(dbPainel, momento);
        const { rows } = await dbPainel.query(
            `UPDATE painel.op_pausa SET fim_em = $2 WHERE registro_id = $1 AND fim_em IS NULL RETURNING id`,
            [caixa.id, momento],
        );
        if (!rows.length) return res.status(409).json({ success: false, message: 'Caixa não está pausada.' });
        res.json({ success: true, data: { id: caixa.id, pausada: false } });
    }));

    // Conclusão da digitalização: nº de imagens e ocorrências por caixa.
    router.post('/caixas/:id/concluir', rota('Erro ao concluir a caixa', async (req, res) => {
        const { imagens, grampo, deteriorado } = req.body ?? {};
        if (!Number.isInteger(imagens) || imagens < 1) {
            return res.status(400).json({ success: false, message: 'Campo "imagens" deve ser um inteiro maior ou igual a 1.' });
        }
        for (const [campo, valor] of [['grampo', grampo], ['deteriorado', deteriorado]]) {
            if (valor !== undefined && typeof valor !== 'boolean') {
                return res.status(400).json({ success: false, message: `Campo "${campo}" deve ser verdadeiro ou falso.` });
            }
        }
        const caixa = await abertaDoTurno(req, req.params.id);
        if (!caixa) return res.status(404).json({ success: false, message: 'Caixa aberta não encontrada.' });
        if (caixa.etapa !== 'digitalizacao') {
            return res.status(400).json({ success: false, message: 'Só a digitalização conclui com imagens.' });
        }
        // O fim é o instante em que o relógio parou (bip/Concluir), não o da confirmação das imagens.
        const fim = caixa.fim_solicitado_em ? new Date(caixa.fim_solicitado_em) : agora();
        const registro = await concluir(req, caixa.id, caixa.inicio_em, fim, { imagens, grampo: grampo ?? false, deteriorado: deteriorado ?? false });
        if (!registro) return res.status(409).json({ success: false, message: 'Caixa já foi concluída.' });
        res.json({ success: true, data: { acao: 'finalizar', codigo: registro.codigo, duracaoS: registro.duracao_s, registro: registroCamel(registro) } });
    }));

    router.get('/estado', rota('Erro ao carregar o estado do turno', async (req, res) => {
        const momento = agora();
        await encerrarPausasVencidas(dbPainel, momento);
        const { rows } = await dbPainel.query(
            `SELECT r.id, r.codigo, r.colaborador_id, c.nome AS colaborador_nome, r.mesa_id, r.etapa, r.inicio_em, r.fim_solicitado_em,${COLUNAS_PAUSA}
               FROM painel.op_caixa_registro r
               JOIN painel.op_colaborador c ON c.id = r.colaborador_id
              WHERE r.turno_id = $1 AND r.status = 'aberta'
              ORDER BY r.inicio_em`,
            [req.turno.id],
        );
        res.json({
            success: true,
            data: {
                agora: iso(momento),
                abertas: rows.map((r) => ({
                    id: Number(r.id),
                    codigo: r.codigo,
                    colaboradorId: r.colaborador_id,
                    colaboradorNome: r.colaborador_nome,
                    mesaId: r.mesa_id,
                    etapa: r.etapa,
                    inicioEm: iso(r.inicio_em),
                    pausadoS: r.pausado_s ?? 0,
                    pausaInicioEm: iso(r.pausa_inicio_em),
                    pausaAutomatica: r.pausa_automatica ?? false,
                    fimSolicitadoEm: iso(r.fim_solicitado_em),
                })),
            },
        });
    }));

    return router;
}

module.exports = { criarTerminalRouter };
