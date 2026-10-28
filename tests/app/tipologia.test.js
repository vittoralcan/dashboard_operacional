import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { normalizarGestao } from '../../public/app/js/core/fluxo-prod.js';
import { normalizarPorTipo } from '../../public/app/js/features/fluxo/tipologia.js';

const { rotuloTipologia } = createRequire(import.meta.url)('../../services/back_dashboard/src/modules/base/flow-viewer/tipologia.js');

const CFG = { gestaoColunas: [{ fasId: 3, titulo: 'Digitalização' }, { fasId: 12, titulo: 'Finalizado' }] };
const TIPOS = [
  { tipo: 'Prontuarios · Cartografia', projeto: 'PRONTUARIOS', lote: 'CARTOGRAFIA', pastas: 185, imagens: 9000 },
  { tipo: 'Mapa', projeto: 'MAPA', lote: 'MAPA', pastas: 14, imagens: 700 },
];

test('normalizarGestao: porTipo passa quando o servidor manda; backend antigo (sem o campo) não quebra', () => {
  const g = normalizarGestao(CFG, { fase3: { totaisMes: { TotalPastas: 199, TotalImagens: 9700 }, graficoMes: [], porTipo: TIPOS }, fase12: { totaisMes: { TotalPastas: 1, TotalImagens: 1 } } });
  assert.equal(g[0].porTipo.length, 2);
  assert.deepEqual(normalizarPorTipo(g[1].porTipo), []);
  assert.deepEqual(normalizarPorTipo(undefined), []);
  assert.deepEqual(normalizarPorTipo(normalizarGestao(CFG, null)[0].porTipo), []);
});

test('normalizarPorTipo: soma dos tipos bate com o KPI da fase; lixo é descartado; sem rótulo usa projeto · lote', () => {
  const kpi = { pastas: 199, imagens: 9700 };
  const t = normalizarPorTipo([...TIPOS, null, 'x', { projeto: 'A', lote: 'B', pastas: '2', imagens: -5 }]);
  assert.equal(t.length, 3);
  assert.deepEqual([t[0].tipo, t[0].pastas, t[0].imagens], ['Prontuarios · Cartografia', 185, 9000]);
  assert.deepEqual(t[2], { tipo: 'A · B', pastas: 2, imagens: 0 });
  const soma = normalizarPorTipo(TIPOS).reduce((s, x) => ({ pastas: s.pastas + x.pastas, imagens: s.imagens + x.imagens }), { pastas: 0, imagens: 0 });
  assert.deepEqual(soma, kpi);
});

test('rotuloTipologia: mostra um só nome quando projeto e lote dizem o mesmo; capitalização amigável', () => {
  assert.equal(rotuloTipologia('PRONTUARIOS', 'CARTOGRAFIA'), 'Prontuarios · Cartografia');
  assert.equal(rotuloTipologia('MAPA', 'MAPA'), 'Mapa');
  assert.equal(rotuloTipologia('PLANTA DE LOTEAMENTO URBANO', 'PLANTA LOTEAMENTO URBANO'), 'Planta de Loteamento Urbano');
  assert.equal(rotuloTipologia('MAPA', 'MAPA RODOVIARIO'), 'Mapa Rodoviario');
  assert.equal(rotuloTipologia('CAIXAS_PLANTAS', 'MAPAS_ESTADUAIS-HISTORICOS'), 'Caixas Plantas · Mapas Estaduais-Historicos');
  assert.equal(rotuloTipologia('Rolos Novos', ''), 'Rolos Novos');
  assert.equal(rotuloTipologia('Ação', 'acao'), 'Ação');
});
