// /api/monitoramento/* (api_noir.md B10) — lista, teste manual e intervalo do
// verificador nativo de APIs. Rota global do painel (não pertence a um
// projeto/instância).
const express = require('express');
const { rota } = require('./rota');
const { registrarAuditoria } = require('./auditoria');
const { verificarApi } = require('./monitoramento-verificador');

const ESTADOS = { o: 'online', l: 'lenta', f: 'falha' };
const INTERVALOS_VALIDOS = new Set([5, 10, 15, 30, 60]);
const RATE_LIMIT_TESTE_MANUAL_MS = 10_000;

function hostnameSeguro(urlTexto) {
    try {
        return new URL(urlTexto).hostname;
    } catch {
        return null;
    }
}

function criarMonitoramentoRouter({ dbPainel, exigirAdmin }) {
    const router = express.Router();
    router.use(express.json());

    // Em memória, por processo — suficiente pra um painel de operação de um
    // deploy só (RNB-003 não exige isso sobreviver a um restart do serviço;
    // o pior caso é liberar um teste manual um pouco antes do previsto).
    const ultimoTesteManual = new Map();

    router.get('/monitoramento/apis', rota('Erro ao listar monitoramento', async (req, res) => {
        const [{ rows: apis }, { rows: [configuracao] }] = await Promise.all([
            dbPainel.query(
                `SELECT id, sistema, nome, url, limiar_lento_ms, timeout_ms
                   FROM painel.monitor_api
                  WHERE ativo
                  ORDER BY ordem, id`
            ),
            dbPainel.query(`SELECT intervalo_min FROM painel.monitor_config WHERE id = 1`),
        ]);

        const apisComHistorico = await Promise.all(apis.map(async (api) => {
            const { rows: historico } = await dbPainel.query(
                `SELECT estado, latencia_ms, http_status, log, em
                   FROM painel.monitor_verificacao
                  WHERE api_id = $1
                  ORDER BY em DESC
                  LIMIT 30`,
                [api.id]
            );
            const ultima = historico[0] ?? null;
            return {
                id: api.id,
                sistema: api.sistema,
                nome: api.nome,
                host: hostnameSeguro(api.url),
                url: api.url,
                estado: ultima ? ESTADOS[ultima.estado] : null,
                latenciaMs: ultima?.latencia_ms ?? null,
                verificadoEm: ultima ? new Date(ultima.em).toISOString() : null,
                log: ultima?.log ?? null,
                // histórico devolvido do mais antigo pro mais recente (igual à
                // ordem que a UI desenha a barra de uptime da esquerda pra direita).
                historico: [...historico].reverse().map((h) => ({ s: h.estado, ms: h.latencia_ms, em: new Date(h.em).toISOString() })),
            };
        }));

        const todasVerificacoes = apisComHistorico.flatMap((a) => a.historico);
        const online = apisComHistorico.filter((a) => a.estado === 'online').length;
        const latencias = apisComHistorico.map((a) => a.latenciaMs).filter((ms) => ms != null);
        const latenciaMediaMs = latencias.length ? Math.round(latencias.reduce((soma, ms) => soma + ms, 0) / latencias.length) : null;
        const disponibilidadePct = todasVerificacoes.length
            ? Number(((todasVerificacoes.filter((v) => v.s !== 'f').length / todasVerificacoes.length) * 100).toFixed(1))
            : null;

        const ultimaVerificacao = apisComHistorico.reduce((max, a) => (a.verificadoEm && (!max || a.verificadoEm > max) ? a.verificadoEm : max), null);
        const proximaVerificacao = ultimaVerificacao
            ? new Date(new Date(ultimaVerificacao).getTime() + configuracao.intervalo_min * 60_000).toISOString()
            : null;

        res.json({
            success: true,
            data: {
                intervaloMin: configuracao.intervalo_min,
                ultimaVerificacao,
                proximaVerificacao,
                resumo: { online, total: apisComHistorico.length, latenciaMediaMs, disponibilidadePct },
                apis: apisComHistorico,
            },
        });
    }));

    router.post('/monitoramento/apis/:id/testar', rota('Erro ao testar API', async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'Id inválido.' });

        const agora = Date.now();
        const ultimoTeste = ultimoTesteManual.get(id) ?? 0;
        const decorridoMs = agora - ultimoTeste;
        if (decorridoMs < RATE_LIMIT_TESTE_MANUAL_MS) {
            const retryAfterSeg = Math.ceil((RATE_LIMIT_TESTE_MANUAL_MS - decorridoMs) / 1000);
            res.set('Retry-After', String(retryAfterSeg));
            return res.status(429).json({ success: false, message: 'Aguarde antes de testar esta API de novo.', retryAfterSeg });
        }

        const { rows } = await dbPainel.query(
            `SELECT id, sistema, nome, url, limiar_lento_ms, timeout_ms FROM painel.monitor_api WHERE id = $1 AND ativo`,
            [id]
        );
        const api = rows[0];
        if (!api) return res.status(404).json({ success: false });

        ultimoTesteManual.set(id, agora);
        const resultado = await verificarApi(api);
        const { rows: [gravado] } = await dbPainel.query(
            `INSERT INTO painel.monitor_verificacao (api_id, estado, latencia_ms, http_status, log, origem)
             VALUES ($1, $2, $3, $4, $5, 'manual')
             RETURNING em`,
            [id, resultado.estado, resultado.latenciaMs, resultado.httpStatus, resultado.log]
        );

        res.json({
            success: true,
            data: {
                id: api.id,
                sistema: api.sistema,
                nome: api.nome,
                host: hostnameSeguro(api.url),
                url: api.url,
                estado: ESTADOS[resultado.estado],
                latenciaMs: resultado.latenciaMs,
                verificadoEm: new Date(gravado.em).toISOString(),
                log: resultado.log,
                historico: [{ s: resultado.estado, ms: resultado.latenciaMs, em: new Date(gravado.em).toISOString() }],
            },
        });
    }));

    router.put('/monitoramento/intervalo', exigirAdmin, rota('Erro ao atualizar intervalo', async (req, res) => {
        const minutos = req.body?.minutos;
        if (!INTERVALOS_VALIDOS.has(minutos)) {
            return res.status(400).json({ success: false, message: `minutos deve ser um de: ${[...INTERVALOS_VALIDOS].join(', ')}.` });
        }

        await dbPainel.query(`UPDATE painel.monitor_config SET intervalo_min = $1, atualizado_em = now() WHERE id = 1`, [minutos]);
        await registrarAuditoria(dbPainel, {
            usuarioId: req.usuario.id,
            usuarioLogin: req.usuario.login,
            acao: 'monitor.intervalo',
            alvo: `${minutos} min`,
        });

        res.json({ success: true, data: { intervaloMin: minutos } });
    }));

    return router;
}

module.exports = { criarMonitoramentoRouter };
