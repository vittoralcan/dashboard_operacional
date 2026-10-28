// Mede os orçamentos de desempenho do front novo (frontend_spec.md §11, RNB-015) — fonte única do CI e do relatório.
//   node scripts/app-orcamentos.mjs          → tabela com tamanho, limite e folga de cada item
//   node scripts/app-orcamentos.mjs --json   → o mesmo em JSON (para anexar ao PR)
// Os testes (tests/app/orcamentos.test.js) importam `medir()`; o que estoura reprova o CI.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app');
const KB = 1024;
export const LIMITES = Object.freeze({ casca: 60 * KB, tela: 40 * KB, css: 40 * KB, fontes: 120 * KB, sprite: 25 * KB });
/** Folga mínima desejada: abaixo disso o relatório avisa (o teste só reprova acima do limite). */
export const FOLGA_ALERTA = 0.05;

const gz = (/** @type {string} */ f) => zlib.gzipSync(fs.readFileSync(f)).length;
export const rel = (/** @type {string} */ p) => path.relative(RAIZ, p).split(path.sep).join('/');

/** @param {string} dir @param {string[]} exts @param {string[]} [saida] */
export function arquivos(dir, exts, saida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor') arquivos(p, exts, saida); } else if (exts.some((x) => e.name.endsWith(x))) saida.push(p);
  }
  return saida;
}

/** Arquivos alcançados por `import ... from` ESTÁTICO a partir de uma entrada (o que carrega junto com ela). */
export function grafoEstatico(/** @type {string} */ entrada, visitados = new Set()) {
  if (visitados.has(entrada)) return visitados;
  visitados.add(entrada);
  const t = fs.readFileSync(entrada, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of t.matchAll(/^\s*(?:import|export)\s[^'"`;]*?from\s*['"](\.[^'"]+)['"]/gm)) grafoEstatico(path.resolve(path.dirname(entrada), m[1]), visitados);
  for (const m of t.matchAll(/^\s*import\s*['"](\.[^'"]+)['"]/gm)) grafoEstatico(path.resolve(path.dirname(entrada), m[1]), visitados);
  return visitados;
}

/** @typedef {{ nome: string, bytes: number, limite: number }} Medida */

/** @returns {{ casca: Medida, telas: Medida[], css: Medida, fontes: Medida, sprite: Medida }} */
export function medir() {
  const js = arquivos(RAIZ, ['.js']);
  const css = arquivos(RAIZ, ['.css']);

  const cascaArqs = grafoEstatico(path.join(RAIZ, 'js', 'main.js'));
  const arqsCasca = new Set(cascaArqs);
  const login = path.join(RAIZ, 'js', 'features', 'auth', 'login.js');
  if (fs.existsSync(login)) grafoEstatico(login, arqsCasca);
  const casca = { nome: `casca + login (${arqsCasca.size} arquivos)`, bytes: [...arqsCasca].reduce((s, f) => s + gz(f), 0), limite: LIMITES.casca };

  const telas = js
    .filter((f) => /js\/features\/(?!dev\/)[^/]+\/[^/]+\.js$/.test(rel(f)) && !cascaArqs.has(f))
    .map((f) => ({ nome: rel(f), bytes: [...grafoEstatico(f)].filter((a) => !cascaArqs.has(a)).reduce((s, a) => s + gz(a), 0), limite: LIMITES.tela }))
    .sort((a, b) => b.bytes - a.bytes);

  const cssTotal = { nome: `CSS (${css.length} arquivos)`, bytes: css.filter((f) => !rel(f).includes('screens/dev.css')).reduce((s, f) => s + gz(f), 0), limite: LIMITES.css };

  const dirFontes = path.join(RAIZ, 'assets', 'fonts');
  const fontes = { nome: 'fontes woff2 (sem gzip)', bytes: fs.readdirSync(dirFontes).filter((n) => n.endsWith('.woff2')).reduce((s, n) => s + fs.statSync(path.join(dirFontes, n)).size, 0), limite: LIMITES.fontes };
  const sprite = { nome: 'sprite de ícones', bytes: gz(path.join(RAIZ, 'assets', 'icons.svg')), limite: LIMITES.sprite };
  return { casca, telas, css: cssTotal, fontes, sprite };
}

const kb = (/** @type {number} */ n) => `${(n / KB).toFixed(1)} KB`;
const folga = (/** @type {Medida} */ m) => (m.limite - m.bytes) / m.limite;

/** Texto da tabela do relatório. @param {ReturnType<typeof medir>} r */
export function relatorio(r) {
  const linhas = [r.casca, ...r.telas.slice(0, 8), r.css, r.fontes, r.sprite];
  const larg = Math.max(...linhas.map((m) => m.nome.length));
  return linhas.map((m) => `${folga(m) < FOLGA_ALERTA ? '!' : ' '} ${m.nome.padEnd(larg)}  ${kb(m.bytes).padStart(9)} / ${kb(m.limite).padStart(7)}  folga ${(folga(m) * 100).toFixed(1).padStart(5)}%`).join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = medir();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else console.log(`${relatorio(r)}\n\n"!" = folga abaixo de ${FOLGA_ALERTA * 100}% do limite (ainda passa, mas o próximo recurso estoura).`);
  const estourou = [r.casca, ...r.telas, r.css, r.fontes, r.sprite].filter((m) => m.bytes > m.limite);
  if (estourou.length) { console.error(`\nESTOUROU: ${estourou.map((m) => m.nome).join(', ')}`); process.exitCode = 1; }
}
