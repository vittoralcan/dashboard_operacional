// Queries do flow-viewer contra o espelho Postgres (schema captura_<fonte>).
// Tradução fiel das queries T-SQL originais de back_atlas/back_boreal (features/*/queries/),
// com três cuidados de dialeto:
//
// * ORDER BY ... DESC NULLS LAST: no SQL Server NULL ordena por último em DESC; no Postgres,
//   por primeiro. Sem isso, um registro ainda aberto (EIN_TERMINO nulo) ganharia o rn = 1 e
//   tiraria a pasta do relatório.
// * "hoje"/"mês" vêm de current_date/localtimestamp, com a sessão em America/Sao_Paulo
//   (ver core/db-espelho.js) — equivalente ao GETDATE() do servidor Captura.
// * JOIN direto com tbl_lote/tbl_fase é seguro aqui: no espelho as PKs (prj_id, lot_id) e
//   (fas_id) garantem uma linha por chave, então não há fan-out (RA-009).
//
// Deduplicação (RA-009): uma linha por pasta — a chave é composta (prj_id, lot_id, pas_id),
// porque pas_id sozinho não é único no Captura.
//
// Produção = PRIMEIRA PASSAGEM da pasta pela fase (regra A do dono): "pasta digitalizada" é a caixa
// escaneada pela primeira vez; voltar à etapa ou reescanear não soma de novo. Cada pasta conta UMA vez,
// na data (ein_termino) do primeiro registro que "vale" para o tipo da fase (o filtro é aplicado ANTES de
// escolher o primeiro registro; o mesmo CTE alimenta KPI do mês, série diária, variação, relatório e Macro View):
//   - entrada (fase 3 / 50 Importação): passagem concluída que gerou imagens —
//     ein_status_finalizado = 1 AND depois > antes; imagens = depois - antes (as geradas). "Visitas" a pasta
//     antiga (antes = depois) e sessões abertas (status 0) não contam;
//   - processo (CQ 7, Verificação 16 etc.): primeira passagem com ein_status_finalizado = 1; imagens = depois
//     (cai para PAS_QUANT_IMG se nulo);
//   - final (12): primeira passagem (RN-017), sem filtro de status (todas as linhas reais já são status 1).
//
// Lotes ignorados (regra C): `opcoes.lotesIgnorados` (manifesto da instância, ex.: ["teste"]) tira de TODA
// contagem de produção e de ocupação as pastas cujo lote tenha esse lot_nome (sem diferenciar maiúsculas).

const MES_CORRENTE = (coluna) =>
    `${coluna} >= date_trunc('month', localtimestamp) AND ${coluna} < date_trunc('month', localtimestamp) + interval '1 month'`;

// Série do mês até hoje (dia 1 .. hoje), com zero nos dias sem movimento. Mesma janela do KPI do mês:
// a soma da série bate com o total (pastas e imagens). `porDia` devolve (dia date, pastas, imagens).
const SERIE_MES = (porDia) => `
    SELECT to_char(d.dia::date, 'YYYY-MM-DD') AS dia, coalesce(pd.pastas, 0)::int AS pastas, coalesce(pd.imagens, 0)::int AS imagens
      FROM generate_series(date_trunc('month', current_date)::date, current_date, interval '1 day') AS d(dia)
      LEFT JOIN (${porDia}) pd ON pd.dia = d.dia::date
     ORDER BY d.dia`;

// Literal SQL seguro (a lista vem do manifesto, validada em config.js; aqui só dobra aspas por garantia).
const literal = (texto) => `'${String(texto).toLowerCase().replace(/'/g, "''")}'`;

// Regra de "primeira passagem" por tipo de fase — ver cabeçalho.
const REGRAS_PASSAGEM = {
    entrada: {
        filtro: 'e.ein_status_finalizado = 1 AND coalesce(e.qtd_img_depois, 0) > coalesce(e.qtd_img_antes, 0)',
        imagens: 'e.qtd_img_depois - coalesce(e.qtd_img_antes, 0)',
    },
    processo: {
        filtro: 'e.ein_status_finalizado = 1',
        imagens: 'coalesce(e.qtd_img_depois, p.pas_quant_img, 0)',
    },
    final: {
        filtro: 'TRUE',
        imagens: 'coalesce(e.qtd_img_depois, p.pas_quant_img, 0)',
    },
};

function montarQueries(schema, opcoes = {}) {
    const t = (tabela) => `${schema}.${tabela}`;
    const lotesIgnorados = (opcoes.lotesIgnorados ?? []).map(literal);

    // Pasta `alias` fora dos lotes ignorados (regra C). EXISTS em vez de JOIN: nunca multiplica linhas.
    const foraDeLoteIgnorado = (alias) => lotesIgnorados.length === 0 ? 'TRUE' : `NOT EXISTS (
            SELECT 1 FROM ${t('tbl_lote')} li
             WHERE li.prj_id = ${alias}.prj_id AND li.lot_id = ${alias}.lot_id AND lower(li.lot_nome) IN (${lotesIgnorados.join(', ')}))`;

    const estatisticaDaFase = `
        FROM ${t('tbl_estatistica')} e
        JOIN ${t('tbl_projeto')} prj ON prj.prj_id = e.prj_id
        JOIN ${t('tbl_pasta')} p ON p.prj_id = e.prj_id AND p.lot_id = e.lot_id AND p.pas_id = e.pas_id
        WHERE prj.flu_id = $1 AND e.fas_id = $2 AND coalesce(p.pas_inexistente, 0) = 0 AND ${foraDeLoteIgnorado('p')}`;

    const pastasDaFase = `
        FROM ${t('tbl_pasta')} p
        JOIN ${t('tbl_projeto')} prj ON prj.prj_id = p.prj_id
        WHERE prj.flu_id = $1 AND p.fas_id = $2 AND coalesce(p.pas_inexistente, 0) = 0 AND ${foraDeLoteIgnorado('p')}`;

    // As consultas de produção de um tipo de fase ('entrada' | 'processo' | 'final'), todas sobre o mesmo CTE.
    function porPassagem(modo) {
        const regra = REGRAS_PASSAGEM[modo];
        // CTE `passagem`: primeira passagem (menor EIN_TERMINO) de cada pasta pela fase $2 que cumpre a regra do tipo.
        const passagem = `passagem AS (
                SELECT DISTINCT ON (e.prj_id, e.lot_id, e.pas_id)
                       e.prj_id, e.lot_id, p.pas_nome, p.pas_quant_doc, e.ein_termino, ${regra.imagens} AS imagens
                ${estatisticaDaFase} AND e.ein_termino IS NOT NULL AND ${regra.filtro}
                ORDER BY e.prj_id, e.lot_id, e.pas_id, e.ein_termino ASC, e.ein_id ASC
            )`;
        return {
            // KPI do mês. $1 flu_id, $2 fas_id
            totaisMes: `
            WITH ${passagem}
            SELECT count(*)::int AS "TotalPastas", coalesce(sum(imagens), 0)::int AS "TotalImagens"
              FROM passagem WHERE ${MES_CORRENTE('ein_termino')}`,

            // Tipologia: produção do mês dividida por (projeto, lote) — o mesmo CTE do KPI, então a soma de
            // `pastas`/`imagens` das linhas bate com `totaisMes`. Agrupa pelo NOME (projetos/lotes homônimos
            // são a mesma tipologia). Uma pasta sem lote cadastrado cai em lote ''. $1 flu_id, $2 fas_id
            porTipoMes: `
            WITH ${passagem}
            SELECT prj.prj_nome AS projeto, coalesce(l.lot_nome, '') AS lote, count(*)::int AS pastas, coalesce(sum(g.imagens), 0)::int AS imagens
              FROM passagem g
              JOIN ${t('tbl_projeto')} prj ON prj.prj_id = g.prj_id
              LEFT JOIN ${t('tbl_lote')} l ON l.prj_id = g.prj_id AND l.lot_id = g.lot_id
             WHERE ${MES_CORRENTE('g.ein_termino')}
             GROUP BY prj.prj_nome, coalesce(l.lot_nome, '')
             ORDER BY pastas DESC, projeto, lote`,

            // RN-010 (variação vs. mês anterior): mesma regra, período arbitrário (inclusive nas duas pontas).
            // $1 flu_id, $2 fas_id, $3 dataInicio, $4 dataFim
            totaisPeriodo: `
            WITH ${passagem}
            SELECT count(*)::int AS "TotalPastas", coalesce(sum(imagens), 0)::int AS "TotalImagens"
              FROM passagem WHERE ein_termino >= $3::date AND ein_termino < $4::date + 1`,

            // Pastas que já passaram pela fase (histórico inteiro, mesma regra). $1 flu_id, $2 fas_id
            totalHistorico: `
            WITH ${passagem}
            SELECT count(*)::int AS total FROM passagem`,

            // Série do mês até hoje: a soma bate com totaisMes (pastas e imagens).
            graficoMes: SERIE_MES(`
            WITH ${passagem}
            SELECT ein_termino::date AS dia, count(*) AS pastas, sum(imagens) AS imagens
              FROM passagem WHERE ${MES_CORRENTE('ein_termino')}
             GROUP BY 1`),

            // Relatório: uma linha por pasta, na primeira passagem — a mesma do KPI (a soma bate).
            // $1 flu_id, $2 fas_id, $3 data início, $4 data fim (inclusivas)
            relatorio: `
            WITH ${passagem}
            SELECT f.fas_nome AS "Fase", prj.prj_nome AS "Projeto", l.lot_nome AS "Lote", g.pas_nome AS "Pasta",
                   coalesce(g.pas_quant_doc, 0) AS "Documentos", g.imagens AS "Imagens",
                   to_char(g.ein_termino, 'YYYY-MM-DD') AS "DataFinalizado"
              FROM passagem g
              JOIN ${t('tbl_projeto')} prj ON prj.prj_id = g.prj_id
              LEFT JOIN ${t('tbl_fase')} f ON f.fas_id = $2
              LEFT JOIN ${t('tbl_lote')} l ON l.prj_id = g.prj_id AND l.lot_id = g.lot_id
             WHERE g.ein_termino >= $3::date AND g.ein_termino < $4::date + 1
             ORDER BY g.ein_termino DESC`,

            // Macro View: imagens das pastas cuja primeira passagem foi hoje. $1 flu_id, $2 fas_id
            imagensHoje: `
            WITH ${passagem}
            SELECT coalesce(sum(imagens), 0)::int AS total
              FROM passagem WHERE ein_termino >= current_date AND ein_termino < current_date + 1`,
        };
    }
    const passagens = { entrada: porPassagem('entrada'), processo: porPassagem('processo'), final: porPassagem('final') };

    return {
        // $1 flu_id, $2 int[] de fas_id
        statusFases: `
            SELECT p.fas_id, count(*)::int AS pastas, coalesce(sum(p.pas_quant_img), 0)::int AS imagens
              FROM ${t('tbl_pasta')} p
              JOIN ${t('tbl_projeto')} prj ON prj.prj_id = p.prj_id
             WHERE prj.flu_id = $1 AND p.fas_id = ANY($2::int[]) AND coalesce(p.pas_inexistente, 0) = 0 AND ${foraDeLoteIgnorado('p')}
             GROUP BY p.fas_id`,

        // Quebra genérica por lote (tipologia) de uma fase — útil sobretudo em fluxos que
        // misturam mais de uma tipologia numa mesma fase de espera (ver módulo Papel do ATLAS:
        // FLU_ID 8/9 estacionam tipologias fora de tratamento numa fase própria de "espera").
        // Não é específica de nenhuma instância — qualquer fase de qualquer fluxo pode ser
        // consultada assim, o front decide onde usar.
        // B11: paginada — $1 flu_id, $2 fas_id, $3 limite, $4 offset
        pastasPorLote: `
            SELECT l.lot_nome AS "Lote", count(*)::int AS "Pastas", coalesce(sum(p.pas_quant_img), 0)::int AS "Imagens"
              FROM ${t('tbl_pasta')} p
              JOIN ${t('tbl_projeto')} prj ON prj.prj_id = p.prj_id
              JOIN ${t('tbl_lote')} l ON l.prj_id = p.prj_id AND l.lot_id = p.lot_id
             WHERE prj.flu_id = $1 AND p.fas_id = $2 AND coalesce(p.pas_inexistente, 0) = 0 AND ${foraDeLoteIgnorado('p')}
             GROUP BY l.lot_nome
             ORDER BY l.lot_nome
             LIMIT $3 OFFSET $4`,

        // Total de lotes distintos (cabeçalho X-Total-Count de /pastas-por-lote, paginado
        // acima). $1 flu_id, $2 fas_id
        pastasPorLoteContagem: `
            SELECT count(DISTINCT l.lot_nome)::int AS total
              FROM ${t('tbl_pasta')} p
              JOIN ${t('tbl_projeto')} prj ON prj.prj_id = p.prj_id
              JOIN ${t('tbl_lote')} l ON l.prj_id = p.prj_id AND l.lot_id = p.lot_id
             WHERE prj.flu_id = $1 AND p.fas_id = $2 AND coalesce(p.pas_inexistente, 0) = 0 AND ${foraDeLoteIgnorado('p')}`,

        // B11: paginada — $1 flu_id, $2 fas_id, $3 limite, $4 offset
        pastasNaFase: `
            SELECT f.fas_nome AS "Fase", prj.prj_nome AS "Projeto", l.lot_nome AS "Lote", p.pas_nome AS "Pasta",
                   coalesce(p.pas_quant_doc, 0) AS "Documentos", coalesce(p.pas_quant_img, 0) AS "Imagens"
              FROM ${t('tbl_pasta')} p
              JOIN ${t('tbl_fase')} f ON f.fas_id = p.fas_id
              JOIN ${t('tbl_projeto')} prj ON prj.prj_id = p.prj_id
              JOIN ${t('tbl_lote')} l ON l.prj_id = p.prj_id AND l.lot_id = p.lot_id
             WHERE prj.flu_id = $1 AND p.fas_id = $2 AND coalesce(p.pas_inexistente, 0) = 0 AND ${foraDeLoteIgnorado('p')}
             ORDER BY prj.prj_nome, l.lot_nome, p.pas_nome
             LIMIT $3 OFFSET $4`,

        // Total de pastas na fase (cabeçalho X-Total-Count de /pastas, paginado acima).
        // $1 flu_id, $2 fas_id
        pastasNaFaseContagem: `
            SELECT count(*)::int AS total
            ${pastasDaFase}`,

        // Produção por primeira passagem, por tipo de fase: passagens.entrada | processo | final (ver cabeçalho).
        passagens,

        // "Hoje" no fuso da sessão (America/Sao_Paulo, ver db-espelho.js) — usado para
        // RN-010/011 em vez do relógio do processo Node, que pode estar em outro fuso.
        hoje: `SELECT current_date::text AS hoje`,

        // Quebra por estado da federação (código nas posições 5-7 do nome da pasta) — só quando
        // a instância liga `estadosDaFederacao` (hoje: BOREAL). Ocupação atual da fase, sem
        // filtro de período — mesmo recorte de `pastasDaFase`/`pastasNaFase`. $1 flu_id, $2 fas_id
        pastasPorEstado: `
            SELECT substring(p.pas_nome from 5 for 3) AS codigo, count(*)::int AS total
            ${pastasDaFase}
             GROUP BY 1`,

        // Relatório — fases sem passagem de produção (snapshot): pastas nessa fase finalizadas no período.
        relatorioSnapshot: `
            SELECT f.fas_nome AS "Fase", prj.prj_nome AS "Projeto", l.lot_nome AS "Lote", p.pas_nome AS "Pasta",
                   coalesce(p.pas_quant_doc, 0) AS "Documentos", coalesce(p.pas_quant_img, 0) AS "Imagens",
                   to_char(p.pas_hora_finalizado, 'YYYY-MM-DD') AS "DataFinalizado"
              FROM ${t('tbl_pasta')} p
              JOIN ${t('tbl_fase')} f ON f.fas_id = p.fas_id
              JOIN ${t('tbl_projeto')} prj ON prj.prj_id = p.prj_id
              JOIN ${t('tbl_lote')} l ON l.prj_id = p.prj_id AND l.lot_id = p.lot_id
             WHERE prj.flu_id = $1 AND p.fas_id = $2 AND coalesce(p.pas_inexistente, 0) = 0 AND ${foraDeLoteIgnorado('p')}
               AND p.pas_hora_finalizado >= $3::date AND p.pas_hora_finalizado < $4::date + 1
             ORDER BY p.pas_hora_finalizado DESC`,
    };
}

module.exports = { montarQueries };
