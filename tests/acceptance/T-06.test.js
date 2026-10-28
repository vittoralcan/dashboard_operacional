const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const existe = (rel) => fs.existsSync(path.join(RAIZ, rel));
const arquivos = (dir) => fs.readdirSync(path.join(RAIZ, dir), { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile()).map((d) => path.join(d.parentPath ?? d.path, d.name));

test('CA1: o cliente HTTP não conhece mais o túnel do BOREAL nem cabeçalhos por base', () => {
  const config = ler('public/app/js/config.js');
  assert.doesNotMatch(config, /tunel-reverso|BOREAL_TUNEL|CABECALHOS_POR_BASE|\bboreal\s*:/i);
  assert.match(config, /export const API\b/);
  assert.doesNotMatch(ler('public/app/js/core/api.js'), /cabecalhosPorBase/);
  assert.doesNotMatch(ler('public/app/js/main.js'), /CABECALHOS_POR_BASE|cabecalhosPorBase/);
});

test('CA2: nenhum código do app usa API.boreal nem cita o host do tunel-reverso (JS, .htaccess e testes unitários)', () => {
  const alvos = [...arquivos('public/app/js'), ...arquivos('tests/app'), path.join(RAIZ, 'public/app/.htaccess')];
  for (const f of alvos.filter((a) => /\.(js|mjs|htaccess)$/.test(a) || a.endsWith('.htaccess'))) {
    const txt = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(txt, /API\.boreal\b|tunel-reverso/i, `${path.relative(RAIZ, f)} ainda cita API.boreal ou tunel-reverso`);
  }
});

test('CA3: as rotas do BOREAL saem de rotas.js (o Monitoramento de APIs e o COBALTO permanecem)', () => {
  const rotas = ler('public/app/js/rotas.js');
  for (const r of ["'/boreal'", '/boreal/higienizacao', '/boreal/digitalizacao', '/boreal/indexacao', '/boreal/aips', '/boreal/registro-caixas']) {
    assert.ok(!rotas.includes(r), `rota ${r} ainda registrada`);
  }
  assert.match(rotas, /\/boreal\/monitoramento/);
  assert.match(rotas, /\/cobalto/);
});

test('CA4: telas e configuração exclusivas do BOREAL foram removidas', () => {
  for (const rel of [
    'public/app/js/features/projetos/hub-boreal.js',
    'public/app/js/features/higienizacao/higienizacao.js', 'public/app/js/features/higienizacao/dados.js', 'public/app/js/features/higienizacao/relatorio.js',
    'public/app/js/features/indexacao/indexacao.js', 'public/app/js/features/indexacao/dados.js', 'public/app/js/features/indexacao/filtros.js',
    'public/app/js/features/indexacao/analise.js', 'public/app/js/features/indexacao/documentos.js', 'public/app/js/features/indexacao/fluxo-lumen.js',
    'public/app/js/features/aips/aips.js',
    'public/app/js/features/rcx/rcx.js', 'public/app/js/features/rcx/dados.js', 'public/app/js/features/rcx/telas.js',
    'public/app/config/fluxos/boreal-digitalizacao.json',
  ]) assert.ok(!existe(rel), `${rel} deveria ter sido removido`);
});

test('CA5: o fluxo de digitalização só lê do painel e o catálogo não lista mais o BOREAL', () => {
  assert.doesNotMatch(ler('public/app/js/features/fluxo/dados.js'), /digitalizacao`|\/digitalizacao\b/);
  assert.doesNotMatch(ler('public/app/js/features/fluxo/config-fluxo.js'), /boreal-digitalizacao/);
  const projetos = JSON.parse(ler('public/app/config/projetos.json'));
  assert.doesNotMatch(JSON.stringify(projetos), /boreal-digitalizacao|\/boreal\/(higienizacao|digitalizacao|indexacao|aips|registro-caixas)|"\/boreal"/);
});
