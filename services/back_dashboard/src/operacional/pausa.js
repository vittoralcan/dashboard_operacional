// Pausa da caixa (almoço no meio da caixa). O tempo pausado sai da duração; pausa
// esquecida é encerrada na virada de turno e a caixa fica sinalizada para correção.
// São Paulo é UTC-3 sem horário de verão: 07h BRT = 10:00Z, 19h BRT = 22:00Z.
const HORAS_UTC_DA_VIRADA = [10, 22];

// Última virada de turno já ocorrida em `agora`.
function momentoDaVirada(agora = new Date()) {
    const dia = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
    const candidatas = [-1, 0].flatMap((deslocamento) =>
        HORAS_UTC_DA_VIRADA.map((hora) => dia + deslocamento * 86400000 + hora * 3600000));
    return new Date(Math.max(...candidatas.filter((ms) => ms <= agora.getTime())));
}

// Encerra, na virada, as pausas abertas que começaram antes dela.
async function encerrarPausasVencidas(db, agora) {
    const virada = momentoDaVirada(agora).toISOString();
    await db.query(
        `UPDATE painel.op_pausa SET fim_em = $1, auto_encerrada = true
          WHERE fim_em IS NULL AND inicio_em < $1`,
        [virada],
    );
}

// Fecha a pausa aberta da caixa (se houver) e devolve o total pausado em segundos.
async function fecharPausasEContar(db, registroId, momento) {
    await db.query(
        'UPDATE painel.op_pausa SET fim_em = $2 WHERE registro_id = $1 AND fim_em IS NULL',
        [registroId, momento.toISOString()],
    );
    const { rows } = await db.query(
        `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (fim_em - inicio_em))), 0)::int AS pausado_s
           FROM painel.op_pausa WHERE registro_id = $1`,
        [registroId],
    );
    return rows[0]?.pausado_s ?? 0;
}

// Colunas de pausa para juntar a SELECTs sobre `painel.op_caixa_registro r`.
const COLUNAS_PAUSA = `
    COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (p.fim_em - p.inicio_em))) FROM painel.op_pausa p
               WHERE p.registro_id = r.id AND p.fim_em IS NOT NULL), 0)::int AS pausado_s,
    (SELECT p.inicio_em FROM painel.op_pausa p WHERE p.registro_id = r.id AND p.fim_em IS NULL) AS pausa_inicio_em,
    EXISTS (SELECT 1 FROM painel.op_pausa p WHERE p.registro_id = r.id AND p.auto_encerrada) AS pausa_automatica`;

module.exports = { momentoDaVirada, encerrarPausasVencidas, fecharPausasEContar, COLUNAS_PAUSA };
