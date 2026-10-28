// @ts-check
/**
 * Template tag seguro (RNB-004). Todo valor interpolado é ESCAPADO por padrão;
 * só `raw()` e o resultado de outro `html` passam como markup (já são seguros).
 *
 *   html`<td>${nome}</td>`                                  → nome escapado
 *   html`<td>${raw(ic('x'))}</td>`                          → markup confiável de um componente
 *   html`<ul>${itens.map((i) => html`<li>${i}</li>`)}</ul>` → aninhar `html` não escapa duas vezes
 *
 * O resultado é um `Html` (objeto com `toString()`): serve direto em `el.innerHTML = html`…``,
 * em concatenação e em template literal comum. Diferente de uma string pura, ele permite
 * distinguir "markup seguro" de "texto de usuário que por acaso tem `<`" ao aninhar.
 */

export class Html {
  /** @param {string} s */
  constructor(s) { this.__raw = s; }
  toString() { return this.__raw; }
}

/** @param {unknown} s */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * Marca um trecho como HTML confiável (não escapa). Só para markup gerado por componentes.
 * @param {unknown} s
 */
export const raw = (s) => new Html(String(s ?? ''));

/** @param {any} v @returns {string} */
const parte = (v) => {
  if (v instanceof Html) return v.__raw;
  if (Array.isArray(v)) return v.map(parte).join('');
  return esc(v);
};

/**
 * Converte um valor em markup seguro: `Html`/`raw` passa; qualquer outra coisa (string de
 * usuário, número) é ESCAPADA. É o que os componentes usam para aceitar "texto ou Html".
 * @param {unknown} v @returns {string}
 */
export const seguro = (v) => parte(v);

/**
 * @param {TemplateStringsArray} partes
 * @param {...any} valores
 * @returns {Html}
 */
export const html = (partes, ...valores) => new Html(partes.reduce(
  (saida, p, i) => saida + p + (i < valores.length ? parte(valores[i]) : ''),
  '',
));
