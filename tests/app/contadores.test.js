import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contadorEmAndamento, contadorApis, definirContadores, lerContador, limparContadores } from '../../public/app/js/core/contadores.js';
import { secoesSidebar } from '../../public/app/js/core/catalogo.js';

const CAT = JSON.parse(fs.readFileSync(new URL('../../public/app/config/projetos.json', import.meta.url), 'utf8'));
for (const p of CAT.projetos) { p.status = p.status || 'ativo'; p.sigla = p.sigla || p.nome; }

test('contador "em andamento": número formatado; sem leitura (null/NaN/negativo) não mostra nada', () => {
  assert.equal(contadorEmAndamento(1016)?.texto, '1.016');
  assert.equal(contadorEmAndamento(0)?.texto, '0');
  for (const x of [null, undefined, NaN, -1, '12']) assert.equal(contadorEmAndamento(x), null);
});

test('contador de APIs: online/total; ponto vermelho (erro) só quando há API fora', () => {
  assert.deepEqual(contadorApis({ online: 6, total: 6 }), { texto: '6/6', erro: false, dica: 'Todas as APIs online' });
  assert.deepEqual(contadorApis({ online: 5, total: 6 }), { texto: '5/6', erro: true, dica: '1 API fora do ar' });
  assert.equal(contadorApis({ online: 3, total: 6 }).dica, '3 APIs fora do ar');
  assert.equal(contadorApis({ online: 0, total: 0 }), null);
  assert.equal(contadorApis(null), null);
});

test('armazém: guarda, troca, apaga com null e limpa tudo', () => {
  limparContadores();
  definirContadores({ negativos: contadorEmAndamento(10), monitoramento: contadorApis({ online: 1, total: 2 }) });
  assert.equal(lerContador('negativos').texto, '10');
  assert.equal(lerContador('monitoramento').erro, true);
  definirContadores({ negativos: null });
  assert.equal(lerContador('negativos'), undefined);
  limparContadores();
  assert.equal(lerContador('monitoramento'), undefined);
});

test('a barra lateral dá uma chave de contador a cada fluxo e ao Monitoramento', () => {
  const itens = secoesSidebar(CAT, {}).flatMap((s) => s.itens);
  const chaves = itens.filter((i) => i.chave).map((i) => i.chave);
  for (const k of ['negativos', 'certidoes', 'inventarios', 'cartografia', 'monitoramento']) assert.ok(chaves.includes(k), k);
  assert.equal(new Set(chaves).size, chaves.length, 'chaves únicas');
});
