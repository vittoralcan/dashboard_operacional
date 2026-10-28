import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { protegerCelula, nomeDoRelatorio, matrizDeExportacao, gerarCsv, XLSX_ARQUIVO, XLSX_SRI } from '../../public/app/js/core/exportar.js';

const COLS = [{ chave: 'a', rotulo: 'Nome' }, { chave: 'n', rotulo: 'Imagens' }];

test('FE-11: texto que começa com = + - @ ganha apóstrofo; números e texto comum passam intactos', () => {
  assert.equal(protegerCelula('=HYPERLINK("http://x")'), '\'=HYPERLINK("http://x")');
  assert.equal(protegerCelula('+1'), '\'+1');
  assert.equal(protegerCelula('-cmd'), '\'-cmd');
  assert.equal(protegerCelula('@SUM(A1)'), '\'@SUM(A1)');
  assert.equal(protegerCelula('\tx'), '\'\tx');
  assert.equal(protegerCelula('BOREAL DF'), 'BOREAL DF');
  assert.equal(protegerCelula('a=b'), 'a=b');
  assert.equal(protegerCelula(-5), -5);
  assert.equal(protegerCelula(0), 0);
  assert.equal(protegerCelula(null), '');
  assert.equal(protegerCelula(undefined), '');
});

test('nomeDoRelatorio: Relatorio_<NOME>_<ref>.<ext>, higienizado', () => {
  const d = new Date(2026, 9, 3);
  assert.equal(nomeDoRelatorio('Indexação IA', { data: d }), 'Relatorio_INDEXACAO_IA_03-10-2026.xlsx');
  assert.equal(nomeDoRelatorio('Lumen', { ref: '01/10/2026 a 03/10/2026', ext: 'csv' }), 'Relatorio_LUMEN_01-10-2026-A-03-10-2026.csv');
  assert.doesNotMatch(nomeDoRelatorio('../../etc/passwd', { data: d }), /[./\\]{2}|\/|\\/);
});

test('matrizDeExportacao: cabeçalho + linhas, células protegidas', () => {
  const m = matrizDeExportacao(COLS, [{ a: '=1+1', n: 3 }, { a: 'ok', n: 0 }]);
  assert.deepEqual(m, [['Nome', 'Imagens'], ['\'=1+1', 3], ['ok', 0]]);
});

test('gerarCsv: separador ;, aspas duplicadas, CRLF e BOM', () => {
  const csv = gerarCsv(COLS, [{ a: 'diz "oi"; tchau', n: 2 }, { a: '=x', n: 1 }]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const linhas = csv.slice(1).split('\r\n');
  assert.equal(linhas[0], '"Nome";"Imagens"');
  assert.equal(linhas[1], '"diz ""oi""; tchau";"2"');
  assert.equal(linhas[2], '"\'=x";"1"');
});

test('SheetJS fixado em vendor/: o SRI declarado confere com o arquivo e a licença acompanha', () => {
  const raiz = new URL('../../public/app/', import.meta.url);
  const arquivo = fs.readFileSync(new URL(XLSX_ARQUIVO, raiz));
  assert.equal(`sha384-${crypto.createHash('sha384').update(arquivo).digest('base64')}`, XLSX_SRI);
  assert.match(XLSX_ARQUIVO, /xlsx-\d+\.\d+\.\d+\.full\.min\.js$/, 'versão no nome do arquivo');
  assert.ok(fs.existsSync(new URL('vendor/LICENSE-xlsx.txt', raiz)), 'licença Apache-2.0 incluída');
});
