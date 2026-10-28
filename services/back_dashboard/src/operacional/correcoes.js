// Correções do supervisor (RF-17, RF-18): lista e corrige lançamentos de caixa, tudo auditado.
// Montado por operacional/index.js para conta de turno (req.turno) ou admin.
const express = require('express');
const { rota } = require('../core/rota');
const { registrarAuditoria } = require('../core/auditoria');
const { validarCodigo } = require('./bip');
const { encerrarPausasVencidas, fecharPausasEContar, COLUNAS_PAUSA } = require('./pausa');

const STATUS = ['aberta', 'concluida', 'cancelada'];
const LIMITE_PADRAO = 200;
const LIMITE_MAXIMO = 500;

const toIso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);

// Colunas relevantes do registro, em camelCase, para a resposta e para a auditoria.
function paraApi(r) {
    return {
        id: Number(r.id),
        codigo: r.codigo,
        colaboradorId: r.colaborador_id,
        colaboradorNome: r.colaborador_nome,
        mesaId: r.mesa_id,
        etapa: r.etapa,
        status: r.status,
        inicioEm: toIso(r.inicio_em),
        fimEm: toIso(r.fim_em),
        duracaoS: r.duracao_s,
        projetoId: r.projeto_id,
        turnoId: r.turno_id,
        imagens: r.imagens ?? null,
        fimSolicitadoEm: toIso(r.fim_solicitado_em),
        grampo: r.grampo ?? false,
        deteriorado: r.deteriorado ?? false,
        pausadoS: r.pausado_s ?? 0,
        pausaInicioEm: toIso(r.pausa_inicio_em),
        pausaAutomatica: r.pausa_automatica ?? false,
    };
}

function snapshot(r) {
    const { colaboradorNome, pausadoS, pausaInicioEm, pausaAutomatica, fimSolicitadoEm, ...resto } = paraApi(r);
    return resto;
}

function criarCorrecoesRouter({ dbPainel, agora = () => new Date() }) {
    const router = express.Router();

    const falha = (res, status, message) => res.status(status).json({ success: false, message });
    const idValido = (v) => (/^\d+$/.test(String(v)) && Number(v) >= 1 ? Number(v) : null);
    const auditar = (req, acao, id, antes, depois) =>
        registrarAuditoria(dbPainel, {
            usuarioId: req.usuario.id,
            usuarioLogin: req.usuario.login,
            acao,
            alvo: `op_caixa_registro:${id}`,
            detalhe: { antes: snapshot(antes), depois: depois ? snapshot(depois) : null },
        });

    // Valida o id, busca o registro (restrito ao projeto do turno) e chama o handler.
    // Responde 400/404 por conta própria; o handler recebe (req, res, id, registro).
    const sobRegistro = (mensagemErro, handler) => rota(mensagemErro, async (req, res) => {
        const id = idValido(req.params.id);
        if (id === null) return falha(res, 400, 'Id inválido.');
        const { rows } = req.turno
            ? await dbPainel.query('SELECT * FROM painel.op_caixa_registro WHERE id = $1 AND projeto_id = $2', [id, req.turno.projetoId])
            : await dbPainel.query('SELECT * FROM painel.op_caixa_registro WHERE id = $1', [id]);
        if (!rows.length) return falha(res, 404, 'Lançamento não encontrado.');
        return handler(req, res, id, rows[0]);
    });

    router.get('/colaboradores', rota('Erro ao listar colaboradores', async (req, res) => {
        const projeto = idValido(req.query.projetoId);
        if (projeto === null) return falha(res, 400, 'projetoId inválido.');
        const { rows } = await dbPainel.query(
            'SELECT id, nome, turno_id FROM painel.op_colaborador WHERE projeto_id = $1 AND ativo',
            [projeto],
        );
        const data = rows
            .map(({ id, nome, turno_id }) => ({ id, nome, turnoId: turno_id }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
        res.json({ success: true, data });
    }));

    router.get('/caixas', rota('Erro ao listar lançamentos', async (req, res) => {
        const { status, limite } = req.query;
        if (status !== undefined && !STATUS.includes(status)) return falha(res, 400, `Status deve ser um de: ${STATUS.join(', ')}.`);
        let lim = LIMITE_PADRAO;
        if (limite !== undefined) {
            lim = idValido(limite);
            if (lim === null) return falha(res, 400, 'Limite inválido.');
            lim = Math.min(lim, LIMITE_MAXIMO);
        }
        const params = [];
        const filtros = [];
        let projeto = null;
        if (req.turno) projeto = req.turno.projetoId;
        else if (req.query.projetoId !== undefined) {
            projeto = idValido(req.query.projetoId);
            if (projeto === null) return falha(res, 400, 'projetoId inválido.');
        }
        if (projeto !== null) { params.push(projeto); filtros.push(`r.projeto_id = $${params.length}`); }
        if (status !== undefined) { params.push(status); filtros.push(`r.status = $${params.length}`); }
        params.push(lim);
        await encerrarPausasVencidas(dbPainel, agora());
        const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
        const { rows } = await dbPainel.query(
            `SELECT r.*, c.nome AS colaborador_nome,${COLUNAS_PAUSA}
               FROM painel.op_caixa_registro r
               JOIN painel.op_colaborador c ON c.id = r.colaborador_id
               ${onde}
              ORDER BY r.inicio_em DESC
              LIMIT $${params.length}`,
            params
        );
        res.json({ success: true, data: rows.map(paraApi) });
    }));

    router.patch('/caixas/:id/colaborador', sobRegistro('Erro ao trocar colaborador', async (req, res, id, antes) => {
        const colaboradorId = req.body?.colaboradorId;
        if (!Number.isInteger(colaboradorId) || colaboradorId < 1) return falha(res, 400, 'Campo "colaboradorId" deve ser um inteiro maior ou igual a 1.');
        const colab = await dbPainel.query('SELECT id FROM painel.op_colaborador WHERE id = $1 AND projeto_id = $2', [colaboradorId, antes.projeto_id]);
        if (!colab.rows.length) return falha(res, 400, 'Colaborador inválido para o projeto do lançamento.');
        if (antes.status === 'aberta' && colaboradorId !== antes.colaborador_id) {
            const ocupado = await dbPainel.query(
                `SELECT codigo FROM painel.op_caixa_registro WHERE colaborador_id = $1 AND status = 'aberta' AND id <> $2 LIMIT 1`,
                [colaboradorId, id]
            );
            if (ocupado.rows.length) return falha(res, 409, `Esse colaborador já tem a caixa ${ocupado.rows[0].codigo} em andamento.`);
        }
        const { rows } = await dbPainel.query(
            `UPDATE painel.op_caixa_registro SET colaborador_id = $1, atualizado_por = $2, atualizado_em = $3
              WHERE id = $4 RETURNING *`,
            [colaboradorId, req.usuario.id, agora().toISOString(), id]
        );
        await auditar(req, 'caixa.trocar_colaborador', id, antes, rows[0]);
        res.json({ success: true, data: paraApi(rows[0]) });
    }));

    router.patch('/caixas/:id/horario', sobRegistro('Erro ao ajustar horário', async (req, res, id, antes) => {
        const corpo = req.body ?? {};
        const limiteAgora = agora().getTime();
        const inicio = typeof corpo.inicioEm === 'string' ? Date.parse(corpo.inicioEm) : NaN;
        if (Number.isNaN(inicio)) return falha(res, 400, 'Campo "inicioEm" deve ser uma data ISO válida.');
        if (inicio > limiteAgora) return falha(res, 400, 'O início não pode estar no futuro.');
        const temFim = corpo.fimEm !== undefined && corpo.fimEm !== null;
        let fim = null;
        if (antes.status === 'concluida') {
            fim = typeof corpo.fimEm === 'string' ? Date.parse(corpo.fimEm) : NaN;
            if (Number.isNaN(fim)) return falha(res, 400, 'Campo "fimEm" deve ser uma data ISO válida.');
            if (fim <= inicio) return falha(res, 400, 'O fim deve ser maior que o início.');
            if (fim > limiteAgora) return falha(res, 400, 'O fim não pode estar no futuro.');
        } else if (temFim) {
            return falha(res, 400, 'Caixa sem conclusão não tem fim: use fechar ou ajuste só o início.');
        }
        const sets = ['inicio_em = $1'];
        const params = [new Date(inicio).toISOString()];
        if (fim !== null) {
            params.push(new Date(fim).toISOString(), Math.floor((fim - inicio) / 1000));
            sets.push('fim_em = $2', 'duracao_s = $3');
        }
        params.push(req.usuario.id, agora().toISOString(), id);
        const n = params.length;
        const { rows } = await dbPainel.query(
            `UPDATE painel.op_caixa_registro SET ${sets.join(', ')}, atualizado_por = $${n - 2}, atualizado_em = $${n - 1}
              WHERE id = $${n} RETURNING *`,
            params
        );
        await auditar(req, 'caixa.ajustar_horario', id, antes, rows[0]);
        res.json({ success: true, data: paraApi(rows[0]) });
    }));

    router.patch('/caixas/:id/codigo', sobRegistro('Erro ao editar o código', async (req, res, id, antes) => {
        const { rows: projetos } = await dbPainel.query('SELECT codigo_regex FROM painel.op_projeto WHERE id = $1', [antes.projeto_id]);
        const valido = validarCodigo(req.body?.codigo, projetos[0]?.codigo_regex);
        if (!valido.ok) return falha(res, 400, 'Código de caixa inválido.');
        if (valido.codigo === antes.codigo) return falha(res, 400, 'O código é igual ao atual.');
        if (antes.status === 'aberta') {
            const { rows } = await dbPainel.query(
                `SELECT id FROM painel.op_caixa_registro
                  WHERE projeto_id = $1 AND codigo = $2 AND status = 'aberta' AND id <> $3`,
                [antes.projeto_id, valido.codigo, id]
            );
            if (rows.length) return falha(res, 409, 'Já existe uma caixa aberta com esse código.');
        }
        let atualizado;
        try {
            ({ rows: [atualizado] } = await dbPainel.query(
                `UPDATE painel.op_caixa_registro SET codigo = $1, atualizado_por = $2, atualizado_em = $3
                  WHERE id = $4 RETURNING *`,
                [valido.codigo, req.usuario.id, agora().toISOString(), id]
            ));
        } catch (erro) {
            if (erro.code === '23505') return falha(res, 409, 'Já existe uma caixa aberta com esse código.');
            throw erro;
        }
        await auditar(req, 'caixa.editar_codigo', id, antes, atualizado);
        res.json({ success: true, data: paraApi(atualizado) });
    }));

    router.post('/caixas/:id/fechar', sobRegistro('Erro ao fechar lançamento', async (req, res, id, antes) => {
        const resultado = req.body?.resultado;
        if (resultado !== 'concluida' && resultado !== 'cancelada') return falha(res, 400, 'Campo "resultado" deve ser concluida ou cancelada.');
        if (antes.status !== 'aberta') return falha(res, 409, 'O lançamento já está fechado.');
        // Digitalização que já parou o relógio fecha no instante em que parou.
        const fim = antes.fim_solicitado_em ? new Date(antes.fim_solicitado_em) : agora();
        await encerrarPausasVencidas(dbPainel, fim);
        const pausadoS = await fecharPausasEContar(dbPainel, id, fim);
        const duracao = resultado === 'concluida'
            ? Math.max(0, Math.floor((fim.getTime() - Date.parse(toIso(antes.inicio_em))) / 1000) - pausadoS)
            : null;
        const { rows } = await dbPainel.query(
            `UPDATE painel.op_caixa_registro SET status = $1, fim_em = $2, duracao_s = $3, atualizado_por = $4, atualizado_em = $5
              WHERE id = $6 RETURNING *`,
            [resultado, fim.toISOString(), duracao, req.usuario.id, fim.toISOString(), id]
        );
        await auditar(req, 'caixa.fechar', id, antes, rows[0]);
        res.json({ success: true, data: paraApi(rows[0]) });
    }));

    // Desfaz um fechamento errado: a caixa volta a andar e o intervalo entre o fechamento e agora entra
    // como pausa já encerrada, para não contar na duração. Continua no turno em que nasceu.
    router.post('/caixas/:id/reabrir', sobRegistro('Erro ao retomar lançamento', async (req, res, id, antes) => {
        if (antes.status === 'aberta') return falha(res, 409, 'O lançamento já está em andamento.');
        const duplicada = await dbPainel.query(
            `SELECT id FROM painel.op_caixa_registro
              WHERE projeto_id = $1 AND codigo = $2 AND status = 'aberta' AND id <> $3 LIMIT 1`,
            [antes.projeto_id, antes.codigo, id]
        );
        if (duplicada.rows.length) return falha(res, 409, `A caixa ${antes.codigo} foi bipada de novo e já está em andamento em outro lançamento.`);
        const ocupado = await dbPainel.query(
            `SELECT r.codigo, c.nome FROM painel.op_caixa_registro r
               JOIN painel.op_colaborador c ON c.id = r.colaborador_id
              WHERE r.colaborador_id = $1 AND r.status = 'aberta' AND r.id <> $2 LIMIT 1`,
            [antes.colaborador_id, id]
        );
        if (ocupado.rows.length) {
            return falha(res, 409, `${ocupado.rows[0].nome} já tem a caixa ${ocupado.rows[0].codigo} em andamento. Conclua essa ou troque o colaborador antes de retomar.`);
        }
        const momento = agora().toISOString();
        let reaberta;
        try {
            ({ rows: [reaberta] } = await dbPainel.query(
                `WITH reaberta AS (
                    UPDATE painel.op_caixa_registro
                       SET status = 'aberta', fim_em = NULL, duracao_s = NULL, fim_solicitado_em = NULL,
                           atualizado_por = $3, atualizado_em = $2
                     WHERE id = $4 AND status <> 'aberta'
                    RETURNING *
                 ), pausa AS (
                    INSERT INTO painel.op_pausa (registro_id, inicio_em, fim_em, criado_por)
                    SELECT id, $1::timestamptz, $2::timestamptz, $3 FROM reaberta WHERE $1::timestamptz IS NOT NULL
                 )
                 SELECT * FROM reaberta`,
                [antes.fim_em ? toIso(antes.fim_em) : null, momento, req.usuario.id, id]
            ));
        } catch (erro) {
            if (erro.code === '23505') return falha(res, 409, 'Já existe uma caixa aberta com esse código.');
            throw erro;
        }
        if (!reaberta) return falha(res, 409, 'O lançamento já está em andamento.');
        await auditar(req, 'caixa.reabrir', id, antes, reaberta);
        res.json({ success: true, data: paraApi(reaberta) });
    }));

    router.delete('/caixas/:id', sobRegistro('Erro ao excluir lançamento', async (req, res, id, antes) => {
        await dbPainel.query('DELETE FROM painel.op_caixa_registro WHERE id = $1 RETURNING *', [id]);
        await auditar(req, 'caixa.excluir', id, antes, null);
        res.json({ success: true, data: paraApi(antes) });
    }));

    return router;
}

module.exports = { criarCorrecoesRouter };
