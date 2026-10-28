import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medir, relatorio, FOLGA_ALERTA, LIMITES } from '../../scripts/app-orcamentos.mjs';

/**
 * Orçamentos de desempenho (RNB-015). A medição vive em `scripts/app-orcamentos.mjs`
 * (`node scripts/app-orcamentos.mjs` imprime a tabela). Passar de um limite reprova; chegar perto (< 5 % de folga) só avisa
 * no relatório do teste — é o sinal para dividir/adiar carga ANTES de o próximo recurso estourar.
 */

const R = medir();
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

test('RNB-015: JS da casca + login (gzip ≤ 60 KB)', (t) => {
  t.diagnostic(`casca = ${kb(R.casca.bytes)} de ${kb(LIMITES.casca)}`);
  assert.ok(R.casca.bytes <= LIMITES.casca, `${R.casca.nome} = ${kb(R.casca.bytes)}`);
});

test('RNB-015: JS de cada tela (gzip ≤ 40 KB), sem contar o que a casca já carrega', () => {
  const estouros = R.telas.filter((m) => m.bytes > m.limite).map((m) => `${m.nome} = ${kb(m.bytes)}`);
  assert.deepEqual(estouros, []);
});

test('RNB-015: CSS total (gzip ≤ 40 KB), fontes (≤ 120 KB) e sprite (≤ 25 KB)', () => {
  for (const m of [R.css, R.fontes, R.sprite]) assert.ok(m.bytes <= m.limite, `${m.nome} = ${kb(m.bytes)} (limite ${kb(m.limite)})`);
});

test('RNB-015: nenhuma tela pode passar de 95 % do limite sem aviso — relatório de folga', (t) => {
  t.diagnostic(`\n${relatorio(R)}`);
  const apertados = [R.casca, ...R.telas].filter((m) => (m.limite - m.bytes) / m.limite < FOLGA_ALERTA);
  // Hoje só a casca (58,0/60 KB) está abaixo de 5 %; se uma TELA entrar aqui, divida/adie carga (dynamic import) antes do próximo PR.
  assert.deepEqual(apertados.filter((m) => m !== R.casca).map((m) => m.nome), [], 'telas coladas no orçamento: faça carga sob demanda');
});
