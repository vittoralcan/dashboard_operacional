// Gargalo por instância. Função pura: recebe as fases já com contagem (status-fases
// + nome/tipo do manifesto) e, opcionalmente, os dois últimos retratos (07h/19h).
// `gargalo` = fase com volume e vazão nula/baixa entre os retratos (RF-51, RF-53 a RF-55);
// `altoVolume` = critério antigo por volume (RN-009, docs/arquitetura/backend.md §6.1).

// `vazaoMinPct` e `minEstoque` são provisórios (suposição 7 do plano); `piso`,
// `minParticipacao` e `minRazao` valem só para `altoVolume`.
const REGRA_PADRAO = { piso: 20, minParticipacao: 0.2, minRazao: 2, vazaoMinPct: 0.05, minEstoque: 5 };
const TIPOS_ELEGIVEIS = new Set(['entrada', 'processo', 'reprocessamento']);

function mediana(valores) {
    if (valores.length === 0) return 0;
    const ordenados = [...valores].sort((a, b) => a - b);
    const meio = Math.floor(ordenados.length / 2);
    return ordenados.length % 2 === 0 ? (ordenados[meio - 1] + ordenados[meio]) / 2 : ordenados[meio];
}

// RN-009: fase de processo que concentra volume desproporcional.
function calcularAltoVolume(fases, regra) {
    // Mesma base do contador "paradas no fluxo" (RN-008): tudo exceto terminal e espera.
    const paradas = fases.filter((f) => f.tipo !== 'terminal' && f.tipo !== 'espera');
    const totalParadas = {
        pastas: paradas.reduce((acc, f) => acc + f.pastas, 0),
        imagens: paradas.reduce((acc, f) => acc + f.imagens, 0),
    };

    const elegiveis = fases.filter((f) => TIPOS_ELEGIVEIS.has(f.tipo));
    const totalElegiveis = elegiveis.reduce((acc, f) => acc + f.pastas, 0);

    function avaliar(fase) {
        const outras = elegiveis.filter((f) => f.fasId !== fase.fasId && f.pastas > 0).map((f) => f.pastas);
        const med = mediana(outras);
        const participacao = totalElegiveis > 0 ? fase.pastas / totalElegiveis : 0;
        // Sem outra fase com volume pra comparar, qualquer volume já é desproporcional
        // (razão "infinita"); com mediana > 0, a razão normal de RN-009 vale.
        const razao = med > 0 ? fase.pastas / med : fase.pastas > 0 ? Infinity : 0;
        const satisfaz = fase.pastas >= regra.piso && participacao >= regra.minParticipacao && razao >= regra.minRazao;
        return { fase, satisfaz, razao };
    }

    const avaliacoes = elegiveis.map(avaliar);
    // Fase de entrada só é elegível se nenhuma outra (processo/reprocessamento)
    // satisfizer — fila de entrada cheia é normal, o gargalo real costuma ser
    // uma etapa de processamento (RN-009).
    const semEntrada = avaliacoes.filter((a) => a.fase.tipo !== 'entrada' && a.satisfaz);
    const candidatas = semEntrada.length > 0 ? semEntrada : avaliacoes.filter((a) => a.satisfaz);

    const melhor = candidatas.sort((a, b) => b.fase.pastas - a.fase.pastas)[0] ?? null;
    const pctParadas = melhor && totalParadas.pastas > 0 ? Number(((melhor.fase.pastas / totalParadas.pastas) * 100).toFixed(1)) : null;
    const razaoMediana = melhor && Number.isFinite(melhor.razao) ? Number(melhor.razao.toFixed(1)) : null;

    return {
        paradas: totalParadas,
        altoVolume: melhor
            ? {
                  fasId: melhor.fase.fasId,
                  nome: melhor.fase.nome,
                  pastas: melhor.fase.pastas,
                  imagens: melhor.fase.imagens,
                  pctParadas,
                  razaoMediana,
              }
            : null,
    };
}

// Gargalo por vazão: estoque efetivo (sem suspensas, RF-55) alto e saída quase nula
// entre o retrato anterior e o atual. Fase sem linha em qualquer dos dois é ignorada.
function calcularPorVazao(fases, regra, retratos) {
    const anteriorPorFase = new Map(retratos.anterior.map((l) => [l.fasId, l]));
    const atualPorFase = new Map(retratos.atual.map((l) => [l.fasId, l]));
    const efetivoDe = (l) => Math.max(0, l.estoquePastas - l.suspensas);

    const candidatas = [];
    for (const fase of fases) {
        if (!TIPOS_ELEGIVEIS.has(fase.tipo)) continue;
        const atual = atualPorFase.get(fase.fasId);
        const anterior = anteriorPorFase.get(fase.fasId);
        if (!atual || !anterior) continue;
        const efetivo = efetivoDe(atual);
        const vazao = Math.max(0, atual.finalizadasTotal - anterior.finalizadasTotal);
        if (efetivo >= regra.minEstoque && vazao <= Math.floor(regra.vazaoMinPct * efetivo)) {
            candidatas.push({ fase, atual, efetivo, vazao });
        }
    }

    const ordenar = (a, b) => b.efetivo - a.efetivo || a.fase.fasId - b.fase.fasId;
    const semEntrada = candidatas.filter((c) => c.fase.tipo !== 'entrada');
    const melhor = (semEntrada.length > 0 ? semEntrada : candidatas).sort(ordenar)[0];
    if (!melhor) return null;

    const totalParadas = fases
        .filter((f) => f.tipo !== 'terminal' && f.tipo !== 'espera' && atualPorFase.has(f.fasId))
        .reduce((acc, f) => acc + efetivoDe(atualPorFase.get(f.fasId)), 0);

    return {
        fasId: melhor.fase.fasId,
        nome: melhor.fase.nome,
        pastas: melhor.efetivo,
        imagens: melhor.atual.estoqueImagens,
        pctParadas: totalParadas > 0 ? Number(((melhor.efetivo / totalParadas) * 100).toFixed(1)) : null,
        vazao: melhor.vazao,
        suspensas: melhor.atual.suspensas,
    };
}

// `fases`: [{ fasId, nome, tipo, pastas, imagens }]. `overrides`: config.gargalo do
// manifesto (parcial, só o que a instância quiser sobrescrever dos padrões).
// `retratos`: { anteriorEm, atualEm, anterior: [L], atual: [L] } ou null (ver montarRetratos).
function calcularGargalo(fases, overrides = {}, retratos = null) {
    const regra = { ...REGRA_PADRAO, ...overrides };
    const { paradas, altoVolume } = calcularAltoVolume(fases, regra);
    const disponivel = retratos != null;
    return {
        regra,
        paradas,
        gargalo: disponivel ? calcularPorVazao(fases, regra, retratos) : null,
        altoVolume,
        vazao: { disponivel, anteriorEm: disponivel ? retratos.anteriorEm : null, atualEm: disponivel ? retratos.atualEm : null },
    };
}

// Linhas de painel.snapshot_fase -> retratos dos dois momentos mais recentes (ou null).
function montarRetratos(linhas) {
    const porMomento = new Map();
    for (const r of linhas) {
        const iso = new Date(r.momento).toISOString();
        if (!porMomento.has(iso)) porMomento.set(iso, []);
        porMomento.get(iso).push({
            fasId: Number(r.fas_id),
            estoquePastas: Number(r.estoque_pastas),
            estoqueImagens: Number(r.estoque_imagens),
            finalizadasTotal: Number(r.finalizadas_total),
            suspensas: Number(r.suspensas),
        });
    }
    const momentos = [...porMomento.keys()].sort().reverse();
    if (momentos.length < 2) return null;
    const [atualEm, anteriorEm] = momentos;
    return { anteriorEm, atualEm, anterior: porMomento.get(anteriorEm), atual: porMomento.get(atualEm) };
}

module.exports = { calcularGargalo, montarRetratos };
