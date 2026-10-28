// Quebra "Top 2 + Outros" por estado da federação, usada hoje só pelo BOREAL (projeto nacional —
// ver product_spec.md, "Dashboard de Digitalização": "listagem de status por estado da federação
// (no BOREAL)"). O ATLAS não usa (opera numa única unidade da federação). Fica como utilitário fixo
// do módulo, não como config de instância (RAM-001), porque não é dado de negócio de um projeto —
// é a tabela de códigos que o Captura grava nas posições 5–7 do nome da pasta
// (ex.: CX00257G10000942SOS -> "257" -> Amazonas), igual pros dois projetos que usarem esse padrão.
// Tradução fiel de services/back_boreal/src/features/digitalizacao/queries/estados-dicionarios.js.
const CODIGOS_ESTADOS = {
    '251': 'DISTRITO FEDERAL',
    '255': 'ACRE',
    '256': 'ALAGOAS',
    '257': 'AMAZONAS',
    '258': 'AMAPÁ',
    '259': 'BAHIA',
    '260': 'CEARÁ',
    '261': 'ESPÍRITO SANTO',
    '262': 'GOIÁS',
    '263': 'MARANHÃO',
    '264': 'MATO GROSSO',
    '265': 'PARÁ',
    '266': 'PARAÍBA',
    '267': 'PERNAMBUCO',
    '269': 'RONDÔNIA',
    '270': 'RORAIMA',
    '271': 'SANTA CATARINA',
    '272': 'SERGIPE',
    '273': 'TOCANTINS',
    '274': 'MATO GROSSO DO SUL',
    '275': 'PIAUI',
    '277': 'MINAS GERAIS',
    '278': 'RIO GRANDE DO NORTE',
};

// Tradução 1:1 de processaEstados() em back_boreal/.../digitalizacao-sql.routes.js: mantém só os 2
// estados de maior volume, soma o resto em "OUTROS" (igual ao card de Gestão que já existe hoje).
function agruparPorEstado(linhas) {
    let estados = [];
    let outrosTotal = 0;

    for (const { codigo, total } of linhas) {
        const nome = CODIGOS_ESTADOS[String(codigo)];
        if (nome) estados.push({ nome, total });
        else outrosTotal += total;
    }

    estados.sort((a, b) => b.total - a.total);

    if (estados.length > 2) {
        const top2 = estados.slice(0, 2);
        for (const { total } of estados.slice(2)) outrosTotal += total;
        estados = top2;
    }

    if (outrosTotal > 0) estados.push({ nome: 'OUTROS', total: outrosTotal });

    return { lista: estados, total: estados.reduce((acc, cur) => acc + cur.total, 0) };
}

module.exports = { agruparPorEstado };
