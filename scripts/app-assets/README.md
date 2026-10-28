# Assets do frontend Noir Bento (`public/app/`)

Arquivos gerados uma vez e **versionados**; só se rodam de novo ao acrescentar ícone ou trocar fonte.

## Ícones — `public/app/assets/icons.svg`
Sprite SVG só com os ícones usados (Phosphor Icons 2.1.1, licença MIT), em vez do pacote inteiro (~1.500 glifos).

```bash
npm pack @phosphor-icons/core@2.1.1 && tar xzf phosphor-icons-core-2.1.1.tgz   # cria ./package/assets
# 1) acrescente o nome em scripts/app-assets/icones.json ("regular" ou "fill")
node scripts/app-assets/gerar-icones.mjs package/assets
```
O teste `tests/app/estatico.test.js` falha se o código usar `ic('nome')` que não esteja no sprite.

## Fontes — `public/app/assets/fonts/`
Geist e Geist Mono (SIL OFL, licença junto dos arquivos), variáveis, em `woff2`, com *subset* latino/latino-estendido (≈ 90 KB no total; orçamento 120 KB).

```bash
npm pack geist@1.7.2 && tar xzf geist-1.7.2.tgz
pip install fonttools brotli
pyftsubset package/dist/fonts/geist-sans/Geist-Variable.ttf --flavor=woff2 --layout-features='*' \
  --unicodes="U+0000-00FF,U+0100-02AF,U+0300-036F,U+1E00-1EFF,U+2000-206F,U+2070-209F,U+20A0-20CF,U+2113,U+2122,U+2190-2193,U+2197,U+21B5,U+2212,U+2215,U+2318,U+2325,U+2713,U+2715,U+2C60-2C7F,U+A720-A7FF,U+FEFF,U+FFFD" \
  --output-file=public/app/assets/fonts/Geist-Variable.woff2
# idem para geist-mono/GeistMono-Variable.ttf → GeistMono-Variable.woff2
```
Se trocar o arquivo da fonte, **mude o nome** (o `.htaccess` dá cache de 1 ano a `.woff2`).

## Testes do frontend
```bash
node --test "tests/app/*.test.js"      # sem instalar nada (Node ≥ 22)
```

## Bibliotecas de terceiros — `public/app/vendor/`
**SheetJS Community 0.20.3** (Apache-2.0) para exportar XLSX e **html5-qrcode 2.3.8** (Apache-2.0) para ler QR/código de barras quando o navegador não tem `BarcodeDetector` — ambos com a licença junto. Fica no nosso servidor, com a versão no nome e **SRI** (`XLSX_SRI` em `js/core/exportar.js`); carrega apenas ao clicar em **Exportar** — nunca na abertura da tela.

```bash
curl -O https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js && mv xlsx.full.min.js public/app/vendor/xlsx-0.20.3.full.min.js
node -e "console.log('sha384-'+require('crypto').createHash('sha384').update(require('fs').readFileSync('public/app/vendor/xlsx-0.20.3.full.min.js')).digest('base64'))"
# cole o hash em XLSX_SRI; `tests/app/exportar.test.js` falha se arquivo e hash divergirem.
```
Para trocar de versão: baixe a nova, **mude o nome do arquivo** (`XLSX_ARQUIVO`, a regra de cache do `.htaccess` e o teste usam o padrão `xlsx-<versão>.full.min.js`) e atualize o hash.

html5-qrcode: `curl -o public/app/vendor/html5-qrcode-2.3.8.min.js https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js` e o hash em `HTML5_QRCODE_SRI` (`js/ui/scanner.js`); `tests/app/scanner.test.js` confere. Só carrega ao abrir o leitor do Registro de Caixas.
