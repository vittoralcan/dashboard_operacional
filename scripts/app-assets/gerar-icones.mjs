// Gera public/app/assets/icons.svg (sprite) só com os ícones listados em icones.json.
// Uso: node scripts/app-assets/gerar-icones.mjs <pasta assets do @phosphor-icons/core>
//   (npm pack @phosphor-icons/core@2.1.1 && tar xzf ... → package/assets)
// Licença dos ícones: MIT (Phosphor Icons). Rodar só ao acrescentar ícone; o resultado é versionado.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const origem = process.argv[2];
if (!origem) { console.error('Informe a pasta "assets" do @phosphor-icons/core.'); process.exit(1); }

const { regular, fill } = JSON.parse(fs.readFileSync(path.join(aqui, 'icones.json'), 'utf8'));
const interno = (arq) => fs.readFileSync(arq, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();

const simbolos = [];
for (const n of regular) simbolos.push(`<symbol id="i-${n}" viewBox="0 0 256 256">${interno(path.join(origem, 'regular', `${n}.svg`))}</symbol>`);
for (const n of fill) simbolos.push(`<symbol id="i-${n}-fill" viewBox="0 0 256 256">${interno(path.join(origem, 'fill', `${n}-fill.svg`))}</symbol>`);

const saida = path.join(aqui, '..', '..', 'public', 'app', 'assets', 'icons.svg');
fs.writeFileSync(saida, `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${simbolos.join('\n')}\n</svg>\n`);
console.log(`${simbolos.length} ícones → ${path.relative(process.cwd(), saida)} (${(fs.statSync(saida).size / 1024).toFixed(1)} KB)`);
