// 3 ciclos de 10 min sem sucesso: o dado já não reflete a operação — o painel sinaliza.
const LIMITE_ATRASO_MIN = 30;

async function buscarSincronizacao(db, { processo, fonte }) {
    const { rows } = await db.query(
        `SELECT max(fim) AS ultima,
                coalesce(max(fim) < now() - make_interval(mins => $3), true) AS atrasado
           FROM etl.execucao
          WHERE processo = $1 AND fonte = $2 AND status = 'sucesso'`,
        [processo, fonte, LIMITE_ATRASO_MIN]
    );
    const { ultima, atrasado } = rows[0];
    return { ultimaSincronizacao: ultima ? new Date(ultima).toISOString() : null, atrasado };
}

module.exports = { buscarSincronizacao };
