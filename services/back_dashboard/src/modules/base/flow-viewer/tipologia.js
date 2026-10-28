// Rótulo legível da tipologia (projeto + lote do Captura) — usado no `porTipo` do /gestao.
// Os nomes vêm do Captura em caixa alta e sem padrão ("PRONTUARIOS"/"CARTOGRAFIA",
// "PLANTA DE LOTEAMENTO URBANO"/"PLANTA LOTEAMENTO URBANO", "MAPA"/"MAPA"). Regra (só apresentação; o dado não muda,
// `projeto` e `lote` seguem crus ao lado do rótulo):
//   1. compara projeto e lote sem acento/caixa/pontuação e sem conectivos (de, da, do, das, dos, e);
//   2. se os dois dizem o mesmo (iguais, ou um contido no outro), mostra só um — o mais completo;
//   3. senão, "Projeto · Lote"; lote vazio (pasta sem lote cadastrado) mostra só o projeto;
//   4. capitalização amigável: Primeira Letra Maiúscula em cada palavra, conectivos em minúsculas.
// Limite: acentos não são restaurados ("PRONTUARIOS" -> "Prontuarios"), pois o Captura os grava sem acento.
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

const palavras = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
const essencial = (texto) => palavras(texto).filter((p) => !CONECTIVOS.has(p));

function amigavel(texto) {
    return String(texto ?? '').trim().toLowerCase().replace(/_+/g, ' ')
        .replace(/[\p{L}\p{N}]+/gu, (p, i) => (i > 0 && CONECTIVOS.has(p) ? p : p[0].toUpperCase() + p.slice(1)));
}

function rotuloTipologia(projeto, lote) {
    const p = String(projeto ?? '').trim();
    const l = String(lote ?? '').trim();
    if (!l) return amigavel(p);
    if (!p) return amigavel(l);
    const ep = essencial(p);
    const el = essencial(l);
    const contido = (a, b) => a.every((w) => b.includes(w));
    if (contido(ep, el) || contido(el, ep)) return amigavel(el.length > ep.length ? l : p);
    return `${amigavel(p)} · ${amigavel(l)}`;
}

module.exports = { rotuloTipologia };
