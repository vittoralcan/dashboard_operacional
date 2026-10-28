// Cálculo de calendário puro (RN-010/RN-011, docs/produto/regras-de-negocio.md) —
// sem Date local nem fuso: opera só sobre números extraídos de uma data ISO
// (vinda de `SELECT current_date` no Postgres, já no fuso certo, ver queries.js).

function diasNoMes(ano, mes) {
    // Dia 0 do mês seguinte = último dia do mês pedido (aritmética de calendário
    // pura, sem depender do fuso local do processo Node — por isso Date.UTC).
    return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

// `hojeIso`: "AAAA-MM-DD" (dia corrente no fuso da operação). Devolve o que RN-010
// (variação vs. mesmo período do mês anterior) e RN-011 (projeção do mês) precisam.
function calcularPeriodoResumo(hojeIso) {
    const [ano, mes, dia] = hojeIso.split('-').map(Number);
    const diasNoMesAtual = diasNoMes(ano, mes);

    let anoAnterior = ano;
    let mesAnterior = mes - 1;
    if (mesAnterior === 0) {
        mesAnterior = 12;
        anoAnterior -= 1;
    }
    const ultimoDiaMesAnterior = diasNoMes(anoAnterior, mesAnterior);
    // "Mesmo período": do dia 1 até o mesmo dia do mês atual — limitado ao
    // último dia do mês anterior quando ele for mais curto (ex.: hoje dia 31
    // de um mês de 31 dias, mês anterior com só 30 — RN-010).
    const ateDia = Math.min(dia, ultimoDiaMesAnterior);

    const pad = (n) => String(n).padStart(2, '0');
    return {
        anoAtual: ano,
        mesAtual: mes,
        diaAtual: dia,
        diasNoMesAtual,
        mesAnterior: {
            dataInicio: `${anoAnterior}-${pad(mesAnterior)}-01`,
            dataFim: `${anoAnterior}-${pad(mesAnterior)}-${pad(ateDia)}`,
            ateDia,
        },
    };
}

// RN-011 (projeção do mês) — dias corridos (a operação 12x36 trabalha todo dia), mas HOJE é dia parcial:
// dividir o realizado por `diaAtual` (contando hoje inteiro) subestima o ritmo no começo do dia, e nos
// primeiros dias do mês um único dia ruim/bom vira projeção absurda. Escolha documentada:
//   ritmo   = realizado até ontem / dias completos (diaAtual - 1);
//   projeção = realizado + ritmo × dias que faltam depois de hoje + o que ainda falta para hoje chegar ao ritmo
//             (nunca negativo — se hoje já passou do ritmo, não se desconta).
// No dia 1 não há dia completo para medir ritmo: devolve só o realizado (piso), sem extrapolar.
// `realizado`: pastas no mês até agora; `hoje`: pastas só de hoje (último ponto da série do mês).
function projetarMes({ realizado, hoje, diaAtual, diasNoMesAtual }) {
    if (diaAtual <= 1) return realizado;
    const ritmo = (realizado - hoje) / (diaAtual - 1);
    const faltaHoje = Math.max(ritmo - hoje, 0);
    return Math.round(realizado + ritmo * (diasNoMesAtual - diaAtual) + faltaHoje);
}

module.exports = { calcularPeriodoResumo, diasNoMes, projetarMes };
