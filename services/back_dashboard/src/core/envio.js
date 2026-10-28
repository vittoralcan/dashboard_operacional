// POST /envio/eventos, POST /envio/heartbeat, GET /envio/resumo
// (B12-B14, docs/api/envio-bridge.md) — espelho de observação da
// etapa de envio ao ownCloud (pós-esteira do ATLAS, fora deste repositório).
// RN-016: nenhuma falha deste lado pode bloquear/atrasar o envio real do
// Bridge; isto é só leitura/gravação de apoio, mesma natureza de
// painel.meta/painel.notificacao (RN-001 — sistema analítico, não-transacional).
const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { rota } = require('./rota');

const STATUS_VALIDOS = new Set(['na_fila', 'enviando', 'conferindo', 'concluida', 'divergente', 'erro']);
const RESULTADOS_VALIDOS = new Set(['ok', 'divergente', 'erro']);
const PASTA_MAX_LENGTH = 120;
const MENSAGEM_MAX_LENGTH = 500;
// Colunas `projeto` e `fluxo` de painel.envio_caixa são VARCHAR(30).
const FLUXO_PROJETO_MAX_LENGTH = 30;
// Teto de alertas dentro dos RECENTES_LIMITE: uma rajada de alertas (ex.: várias pastas fora do padrão)
// não pode empurrar todos os eventos normais para fora da lista.
const ALERTAS_RECENTES_MAX = 10;
// Alerta que exige ação humana: o Bridge o manda como status "erro" com a mensagem iniciada por este
// prefixo (sem status novo). Só nesse caso `recentes` devolve a `mensagem`, truncada.
const PREFIXO_ALERTA = '[ALERTA]';
const ALERTA_TEXTO_MAX_LENGTH = 300;
// Q-17 (integracao_bridge.md §11): padrão adotado enquanto ninguém decidir.
const LIMITE_ATRASO_HEARTBEAT_MIN = 15;
const RECENTES_LIMITE = 20;
// Colunas instancia (VARCHAR(60)) e envio_heartbeat.versao (VARCHAR(20)).
const INSTANCIA_MAX_LENGTH = 60;
const VERSAO_MAX_LENGTH = 20;

// BD-14 (docs/arquitetura/backend.md §7.2, risco 3 de integracao_bridge.md
// §7): chave por `instancia` (não por IP) — é um cliente automatizado atrás
// de uma única credencial, então um Bridge com bug não deve conseguir travar
// outro cliente que compartilhe a mesma rede/IP de saída.
const limitadorEventos = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    // ipKeyGenerator normaliza IPv6 (um /56 inteiro pode ser um único cliente
    // atrás de NAT66) — exigido pelo express-rate-limit sempre que o IP entra
    // num keyGenerator customizado, mesmo só como fallback.
    keyGenerator: (req) => req.usuario?.instancia || ipKeyGenerator(req.ip),
    message: { success: false, message: 'Muitas requisições. Tente novamente em alguns minutos.' },
});

function validarInstancia(instancia) {
    if (typeof instancia !== 'string' || !instancia.trim()) {
        return 'Campo "instancia" é obrigatório.';
    }
    if (instancia.trim().length > INSTANCIA_MAX_LENGTH) {
        return `Campo "instancia" deve ter no máximo ${INSTANCIA_MAX_LENGTH} caracteres.`;
    }
    return null;
}

// O heartbeat é só o "sinal de vida": um `versao` fora do formato nunca pode virar 500 (o Bridge pareceria
// "sem contato"). Texto acima de VERSAO_MAX_LENGTH é cortado; o que não for texto é ignorado.
function versaoParaGravar(versao) {
    if (typeof versao !== 'string' || !versao.trim()) return null;
    return versao.trim().slice(0, VERSAO_MAX_LENGTH);
}

function validarEvento(evento) {
    if (!evento || typeof evento !== 'object') {
        return 'Cada evento deve ser um objeto.';
    }
    const { pasta, status, resultado, eventoTs } = evento;
    if (typeof pasta !== 'string' || !pasta.trim() || pasta.trim().length > PASTA_MAX_LENGTH) {
        return `Campo "pasta" é obrigatório (até ${PASTA_MAX_LENGTH} caracteres).`;
    }
    if (!STATUS_VALIDOS.has(status)) {
        return `Campo "status" deve ser um de: ${[...STATUS_VALIDOS].join(', ')}.`;
    }
    if (resultado !== undefined && resultado !== null && !RESULTADOS_VALIDOS.has(resultado)) {
        return `Campo "resultado" deve ser um de: ${[...RESULTADOS_VALIDOS].join(', ')}.`;
    }
    if (typeof eventoTs !== 'string' || Number.isNaN(Date.parse(eventoTs))) {
        return 'Campo "eventoTs" é obrigatório e deve ser uma data válida (ISO 8601).';
    }
    if (evento.mensagem != null && (typeof evento.mensagem !== 'string' || evento.mensagem.length > MENSAGEM_MAX_LENGTH)) {
        return `Campo "mensagem" deve ter no máximo ${MENSAGEM_MAX_LENGTH} caracteres.`;
    }
    // Sem isto o INSERT estoura (VARCHAR(30)) e a rota responde 500 para o LOTE inteiro: o Bridge
    // reenviaria o mesmo lote para sempre, travando os eventos seguintes.
    for (const campo of ['fluxo', 'projeto']) {
        const valor = evento[campo];
        if (valor != null && (typeof valor !== 'string' || valor.length > FLUXO_PROJETO_MAX_LENGTH)) {
            return `Campo "${campo}" deve ser texto de até ${FLUXO_PROJETO_MAX_LENGTH} caracteres.`;
        }
    }
    return null;
}

// Erro de DADO do evento (SQLSTATE classe 22 "data exception" — texto longo, número fora da faixa,
// data inválida — ou classe 23 "integrity constraint"): só este evento é ruim, o lote segue.
// Qualquer outro erro (conexão, timeout, pool, tabela ausente…) NÃO é culpa do evento: sobe como 5xx
// para o Bridge tentar de novo. Lista de permitidos (e não de proibidos) para nunca engolir indisponibilidade.
function erroDeDadoDoEvento(erro) {
    return typeof erro?.code === 'string' && /^(22|23)[0-9A-Z]{3}$/.test(erro.code);
}

// B12/B13 (D-09): só uma credencial de serviço com o escopo certo, emitida
// para ESTA instancia, pode escrever — nunca um JWT de usuário comum, mesmo
// admin. Mensagem genérica em todo caso de recusa, nunca revelando o motivo.
function exigirCredencialServico(escopoNecessario) {
    return (req, res, next) => {
        const usuario = req.usuario;
        const instanciaCorpo = typeof req.body?.instancia === 'string' ? req.body.instancia.trim() : '';
        const autorizado =
            usuario?.tipo === 'servico' &&
            Array.isArray(usuario.escopo) &&
            usuario.escopo.includes(escopoNecessario) &&
            instanciaCorpo &&
            instanciaCorpo === usuario.instancia;
        if (!autorizado) {
            return res.status(403).json({ success: false, message: 'Acesso restrito a administradores.' });
        }
        return next();
    };
}

// B14: leitura é para usuário comum do painel (standard/admin) — uma
// credencial de serviço nunca lê nada, só escreve (D-09, §7 risco 1).
function exigirUsuarioComum(req, res, next) {
    if (req.usuario?.tipo === 'servico') {
        return res.status(403).json({ success: false, message: 'Acesso restrito a usuários do painel.' });
    }
    return next();
}

// `Array.from` corta por caractere (não parte um par substituto ao meio).
function truncarAlerta(texto) {
    const caracteres = Array.from(texto);
    return caracteres.length <= ALERTA_TEXTO_MAX_LENGTH ? texto : `${caracteres.slice(0, ALERTA_TEXTO_MAX_LENGTH - 1).join('')}…`;
}

function criarEnvioRouter({ dbPainel }) {
    const router = express.Router();

    // Só POST lê corpo — mesmo cuidado de core/metas.js (BE-03): o resto do
    // back_dashboard não liga express.json() global.
    router.use(express.json());

    router.post('/envio/eventos', limitadorEventos, exigirCredencialServico('envio'), rota('Erro ao registrar eventos de envio', async (req, res) => {
        const { instancia, eventos } = req.body || {};
        const erroInstancia = validarInstancia(instancia);
        if (erroInstancia) return res.status(400).json({ success: false, message: erroInstancia });
        if (!Array.isArray(eventos) || eventos.length === 0) {
            return res.status(400).json({ success: false, message: 'Campo "eventos" deve ser uma lista não vazia.' });
        }

        const instanciaNorm = instancia.trim();
        const rejeitados = [];
        let aceitos = 0;

        for (let indice = 0; indice < eventos.length; indice += 1) {
            const evento = eventos[indice];
            const erroEvento = validarEvento(evento);
            if (erroEvento) {
                rejeitados.push({ indice, motivo: erroEvento });
                continue; // um item ruim nunca derruba o lote inteiro (D-10/§4 B12)
            }

            const { pasta, projeto, fluxo, status, arquivos, bytes, duracaoS, resultado, mensagem, eventoTs } = evento;
            try {
                // ON CONFLICT DO NOTHING: reenviar o mesmo evento (retry do Bridge
                // depois de falha de rede) não duplica nem dá erro (idempotência).
                await dbPainel.query(
                    `INSERT INTO painel.envio_caixa
                        (instancia, projeto, fluxo, pasta, status, arquivos, bytes, duracao_s, resultado, mensagem, evento_ts)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                     ON CONFLICT (instancia, pasta, status, evento_ts) DO NOTHING`,
                    [
                        instanciaNorm,
                        projeto ?? null,
                        fluxo ?? null,
                        pasta.trim(),
                        status,
                        Number.isInteger(arquivos) ? arquivos : null,
                        Number.isInteger(bytes) ? bytes : null,
                        Number.isInteger(duracaoS) ? duracaoS : null,
                        resultado ?? null,
                        mensagem ?? null,
                        eventoTs,
                    ]
                );
            } catch (erro) {
                if (!erroDeDadoDoEvento(erro)) throw erro; // indisponibilidade etc.: 5xx, o Bridge reenvia
                // RNB-B5: o motivo devolvido é genérico; o detalhe do driver fica só no log.
                console.error(`[${req.id ?? '-'}] POST /envio/eventos — evento ${indice} rejeitado pelo banco (${erro.code}):`, erro.message);
                rejeitados.push({ indice, motivo: 'Evento não pôde ser gravado (dados inválidos).' });
                continue;
            }
            aceitos += 1;
        }

        res.json({ success: true, data: { aceitos, rejeitados } });
    }));

    router.post('/envio/heartbeat', exigirCredencialServico('envio'), rota('Erro ao registrar heartbeat', async (req, res) => {
        const { instancia, versao } = req.body || {};
        const erroInstancia = validarInstancia(instancia);
        if (erroInstancia) return res.status(400).json({ success: false, message: erroInstancia });

        await dbPainel.query(
            `INSERT INTO painel.envio_heartbeat (instancia, ultimo_ts, versao)
             VALUES ($1, now(), $2)
             ON CONFLICT (instancia) DO UPDATE SET ultimo_ts = now(), versao = EXCLUDED.versao`,
            [instancia.trim(), versaoParaGravar(versao)]
        );

        res.json({ success: true });
    }));

    router.get('/envio/resumo', exigirUsuarioComum, rota('Erro ao obter resumo de envio', async (req, res) => {
        const instancia = typeof req.query.instancia === 'string' ? req.query.instancia.trim() : '';
        if (!instancia) {
            return res.status(400).json({ success: false, message: 'Parâmetro "instancia" é obrigatório.' });
        }
        // Janela de tempo de funil/vazão/recentes; "enviadasHoje" é sempre o
        // dia corrente (ver cartoesPromise), independente deste parâmetro.
        const horas = Math.min(Math.max(Number(req.query.horas) || 24, 1), 168);
        const baldeSegundos = horas <= 6 ? 60 : horas <= 24 ? 300 : 3600;

        const [cartoesResult, funilResult, vazaoResult, recentesResult, heartbeatResult] = await Promise.all([
            dbPainel.query(
                // Tudo aqui é por PASTA (último evento dela), nunca por evento: o Bridge manda
                // vários eventos por caixa (na_fila→enviando→conferindo→concluida) e também
                // reenvios; contar linhas somaria a mesma caixa várias vezes.
                `WITH ultimo AS (
                    SELECT DISTINCT ON (pasta) pasta, status, resultado, evento_ts
                      FROM painel.envio_caixa
                     WHERE instancia = $1
                     ORDER BY pasta, evento_ts DESC
                 )
                 SELECT
                    -- caixas distintas que concluíram hoje (um reenvio no mesmo dia não conta de novo)
                    (SELECT count(DISTINCT pasta) FROM painel.envio_caixa
                      WHERE instancia = $1 AND status = 'concluida'
                        AND evento_ts >= date_trunc('day', now())) AS enviadas_hoje,
                    -- conferidas hoje, pelo resultado mais recente de cada pasta
                    count(*) FILTER (WHERE status IN ('concluida', 'divergente')
                                       AND evento_ts >= date_trunc('day', now())) AS conferidas_hoje,
                    count(*) FILTER (WHERE status = 'concluida' AND resultado = 'ok'
                                       AND evento_ts >= date_trunc('day', now())) AS ok_hoje,
                    -- "divergente aberta": a última ocorrência da pasta ainda é divergente
                    count(*) FILTER (WHERE status = 'divergente') AS divergencias_abertas,
                    -- pendente = último estado da pasta ainda é intermediário (não terminou);
                    -- limitado a 7 dias para um evento órfão antigo não ficar pendente para sempre
                    count(*) FILTER (WHERE status IN ('na_fila', 'enviando', 'conferindo')
                                       AND evento_ts >= now() - interval '7 days') AS pendentes
                   FROM ultimo`,
                [instancia]
            ),
            dbPainel.query(
                // funil: quantas pastas estão em cada estado, pelo último evento DENTRO da janela
                `SELECT status, count(*) AS total FROM (
                    SELECT DISTINCT ON (pasta) pasta, status
                      FROM painel.envio_caixa
                     WHERE instancia = $1 AND evento_ts >= now() - ($2 || ' hours')::interval
                     ORDER BY pasta, evento_ts DESC
                 ) u GROUP BY status`,
                [instancia, horas]
            ),
            dbPainel.query(
                // Série preenchida (generate_series): minutos/horas sem evento viram 0, em vez de
                // sumirem e o gráfico ligar dois pontos distantes como se fosse uma taxa constante.
                // Balde maior para janelas maiores (6 h: 1 min; 24 h: 5 min; 7 dias: 1 h).
                // Continua sendo "arquivos das caixas conferidas no balde", não taxa de upload.
                `SELECT g.t AS minuto,
                        coalesce(sum(e.arquivos), 0) AS arquivos,
                        coalesce(sum(e.bytes), 0) AS bytes
                   FROM generate_series(
                            to_timestamp(floor(extract(epoch FROM now() - ($2 || ' hours')::interval) / $3) * $3),
                            now(),
                            make_interval(secs => $3)
                        ) AS g(t)
                   LEFT JOIN painel.envio_caixa e
                     ON e.instancia = $1 AND e.status = 'concluida'
                    AND e.evento_ts >= g.t AND e.evento_ts < g.t + make_interval(secs => $3)
                  GROUP BY g.t
                  ORDER BY g.t`,
                [instancia, horas, baldeSegundos]
            ),
            dbPainel.query(
                // Os últimos RECENTES_LIMITE eventos, com no máximo ALERTAS_RECENTES_MAX alertas entre eles
                // (os mais recentes); os demais alertas cedem o lugar a eventos normais.
                `WITH base AS (
                    SELECT pasta, fluxo, status, resultado, evento_ts,
                           CASE WHEN starts_with(mensagem, $3) THEN mensagem END AS mensagem,
                           row_number() OVER (PARTITION BY coalesce(starts_with(mensagem, $3), false)
                                              ORDER BY evento_ts DESC) AS posicao
                      FROM painel.envio_caixa
                     WHERE instancia = $1
                 )
                 SELECT pasta, fluxo, status, resultado, evento_ts, mensagem
                   FROM base
                  WHERE mensagem IS NULL OR posicao <= $4
                  ORDER BY evento_ts DESC
                  LIMIT $2`,
                [instancia, RECENTES_LIMITE, PREFIXO_ALERTA, ALERTAS_RECENTES_MAX]
            ),
            dbPainel.query(`SELECT ultimo_ts, versao FROM painel.envio_heartbeat WHERE instancia = $1`, [instancia]),
        ]);

        const c = cartoesResult.rows[0];
        // Conferência sem divergência / total conferido hoje (concluídas + divergentes).
        // Antes dividia concluídas por concluídas: sempre 100%, porque 'concluida' só existe
        // quando a conferência deu OK.
        const conferidasHoje = Number(c.conferidas_hoje);
        const taxaConferenciaPct = conferidasHoje === 0 ? 100 : Math.round((Number(c.ok_hoje) / conferidasHoje) * 1000) / 10;

        const funil = { na_fila: 0, enviando: 0, conferindo: 0, concluida: 0, divergente: 0, erro: 0 };
        for (const linha of funilResult.rows) funil[linha.status] = Number(linha.total);

        const heartbeatLinha = heartbeatResult.rows[0] || null;
        const atrasado = heartbeatLinha
            ? (Date.now() - new Date(heartbeatLinha.ultimo_ts).getTime()) / 60000 > LIMITE_ATRASO_HEARTBEAT_MIN
            : null; // null = Bridge desta instância nunca mandou heartbeat (RNB-007: sem dado, não é "atrasado")

        res.json({
            success: true,
            data: {
                geradoEm: new Date().toISOString(),
                cartoes: {
                    enviadasHoje: Number(c.enviadas_hoje),
                    pendentes: Number(c.pendentes),
                    divergenciasAbertas: Number(c.divergencias_abertas),
                    taxaConferenciaPct,
                },
                funil: {
                    naFila: funil.na_fila,
                    enviando: funil.enviando,
                    conferindo: funil.conferindo,
                    concluida: funil.concluida,
                    divergente: funil.divergente,
                    erro: funil.erro,
                },
                vazao: vazaoResult.rows.map((linha) => ({
                    t: new Date(linha.minuto).toISOString(),
                    arquivosMin: Math.round((Number(linha.arquivos) / (baldeSegundos / 60)) * 10) / 10,
                    mbSeg: Math.round((Number(linha.bytes) / baldeSegundos / 1_000_000) * 100) / 100,
                })),
                recentes: recentesResult.rows.map((linha) => ({
                    pasta: linha.pasta,
                    fluxo: linha.fluxo,
                    status: linha.status,
                    resultado: linha.resultado,
                    eventoTs: new Date(linha.evento_ts).toISOString(),
                    ...(linha.mensagem ? { mensagem: truncarAlerta(linha.mensagem) } : {}),
                })),
                heartbeat: heartbeatLinha
                    ? { ultimoTs: new Date(heartbeatLinha.ultimo_ts).toISOString(), versao: heartbeatLinha.versao, atrasado }
                    : { ultimoTs: null, versao: null, atrasado: null },
            },
        });
    }));

    return router;
}

module.exports = { criarEnvioRouter };
