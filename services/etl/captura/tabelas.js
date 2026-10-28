// Tabelas do Captura espelhadas em db_espelho (schema captura_<fonte>).
//
// Fonte única da verdade do espelho: tanto o DDL (postgres.js → prepararSchema) quanto o
// SELECT de extração (sqlserver.js → montarSelect) são gerados a partir daqui — nenhum dos
// dois é mantido à mão, então não há como divergirem.
//
// Convenções:
// * nome de coluna no Postgres = nome da coluna no SQL Server em minúsculas;
// * `origem(fluIds)` devolve o FROM/WHERE da extração, sempre com a tabela principal sob o alias X;
// * `timestamp` = relógio de parede do servidor Captura (horário de Brasília), sem fuso —
//   mesmo significado do `datetime` de origem.
//
// O mirror é fiel às tabelas cruas: deduplicação (RA-009), regras de fase e agregações
// continuam acontecendo nas queries do back_dashboard, não aqui.

const lista = (fluIds) => fluIds.join(', ');

const doFluxoPorProjeto = (fluIds) =>
    `INNER JOIN TBL_PROJETO PRJ ON X.PRJ_ID = PRJ.PRJ_ID WHERE PRJ.FLU_ID IN (${lista(fluIds)})`;

const TABELAS = [
    {
        nome: 'tbl_projeto',
        pk: ['prj_id'],
        colunas: {
            prj_id: 'integer',
            prj_nome: 'text',
            prj_data_inicio: 'timestamp',
            flu_id: 'integer',
            prj_descricao: 'text',
            pvi_ativo: 'integer',
        },
        indices: [['flu_id']],
        origem: (fluIds) => `FROM TBL_PROJETO X WHERE X.FLU_ID IN (${lista(fluIds)})`,
    },
    {
        nome: 'tbl_fluxo',
        pk: ['flu_id'],
        colunas: {
            flu_id: 'integer',
            flu_nome: 'text',
            pvi_ativo: 'integer',
        },
        indices: [],
        origem: (fluIds) => `FROM TBL_FLUXO X WHERE X.FLU_ID IN (${lista(fluIds)})`,
    },
    {
        nome: 'tbl_fase_fluxo',
        pk: ['ffl_id'],
        colunas: {
            ffl_id: 'integer',
            flu_id: 'integer',
            fas_id: 'integer',
            ffl_fas_invalido: 'integer',
            ffl_fas_valido: 'integer',
            ffl_posicao: 'text',
        },
        indices: [['flu_id']],
        origem: (fluIds) => `FROM TBL_FASE_FLUXO X WHERE X.FLU_ID IN (${lista(fluIds)})`,
    },
    {
        // Dicionário global da instância (compartilhado entre fluxos e clientes): espelhado
        // inteiro, porque pastas/estatísticas podem referenciar FAS_ID fora de TBL_FASE_FLUXO
        // (ex: EIN_FAS_ID_DESTINO). ~50 linhas, sem dado sensível.
        nome: 'tbl_fase',
        pk: ['fas_id'],
        colunas: {
            fas_id: 'integer',
            fas_nome: 'text',
            fas_descricao: 'text',
            mod_id: 'integer',
            fas_inexistente: 'integer',
        },
        indices: [],
        origem: () => 'FROM TBL_FASE X',
    },
    {
        nome: 'tbl_lote',
        pk: ['prj_id', 'lot_id'],
        colunas: {
            prj_id: 'integer',
            lot_id: 'integer',
            lot_nome: 'text',
            lot_lim_img_pasta: 'integer',
            pvi_ativo: 'integer',
        },
        indices: [],
        origem: (fluIds) => `FROM TBL_LOTE X ${doFluxoPorProjeto(fluIds)}`,
    },
    {
        nome: 'tbl_pasta',
        pk: ['prj_id', 'lot_id', 'pas_id'],
        colunas: {
            prj_id: 'integer',
            lot_id: 'integer',
            pas_id: 'integer',
            pas_nome: 'text',
            pas_data: 'timestamp',
            pas_quant_doc: 'integer',
            pas_quant_img: 'integer',
            pas_quant_kb: 'integer',
            pas_em_uso: 'integer',
            usu_id: 'integer',
            fas_id: 'integer',
            pas_inexistente: 'integer',
            pas_hora_finalizado: 'timestamp',
            pas_prioridade: 'integer',
            pvi_ativo: 'integer',
        },
        indices: [['fas_id', 'pas_hora_finalizado']],
        origem: (fluIds) => `FROM TBL_PASTA X ${doFluxoPorProjeto(fluIds)}`,
    },
    {
        // Filtrada pelo PRJ_ID do próprio registro de estatística (histórico), não pelo projeto
        // atual da pasta — preserva o retrato histórico da RN-004 mesmo se a pasta mudar de projeto.
        nome: 'tbl_estatistica',
        pk: ['ein_id'],
        colunas: {
            ein_id: 'integer',
            ein_inicio: 'timestamp',
            ein_termino: 'timestamp',
            ein_status_finalizado: 'integer',
            fas_id: 'integer',
            usu_id: 'integer',
            prj_id: 'integer',
            lot_id: 'integer',
            pas_id: 'integer',
            qtd_img_antes: 'integer',
            qtd_img_depois: 'integer',
            qtd_doc_antes: 'integer',
            qtd_doc_depois: 'integer',
            ein_tamanho_kb: 'integer',
            ein_fas_id_destino: 'integer',
        },
        indices: [['fas_id', 'ein_termino'], ['prj_id', 'lot_id', 'pas_id']],
        origem: (fluIds) => `FROM TBL_ESTATISTICA X ${doFluxoPorProjeto(fluIds)}`,
    },
    {
        // Só USU_ID/USU_NOME, e só dos usuários referenciados pelos fluxos desta fonte: a tabela
        // de origem tem hash de senha, CPF, e-mail e telefone, que nenhum relatório do painel usa.
        nome: 'tbl_usuario',
        pk: ['usu_id'],
        colunas: {
            usu_id: 'integer',
            usu_nome: 'text',
        },
        indices: [],
        origem: (fluIds) => `FROM TBL_USUARIO X WHERE X.USU_ID IN (
            SELECT P.USU_ID FROM TBL_PASTA P INNER JOIN TBL_PROJETO PRJ ON P.PRJ_ID = PRJ.PRJ_ID
             WHERE PRJ.FLU_ID IN (${lista(fluIds)})
            UNION
            SELECT E.USU_ID FROM TBL_ESTATISTICA E INNER JOIN TBL_PROJETO PRJ ON E.PRJ_ID = PRJ.PRJ_ID
             WHERE PRJ.FLU_ID IN (${lista(fluIds)})
        )`,
    },
];

module.exports = { TABELAS };
