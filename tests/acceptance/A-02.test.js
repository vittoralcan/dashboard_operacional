// Cadastros e relatório: título do formulário de metas e total do hora a hora com fallback.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP = path.resolve(__dirname, '../../public/app');
const cadastros = () => import(pathToFileURL(path.join(APP, 'js/features/operacional/cadastros.js')).href);
const regras = () => import(pathToFileURL(path.join(APP, 'js/core/cadastros-op.js')).href);
const rel = () => import(pathToFileURL(path.join(APP, 'js/core/relatorio-op.js')).href);
const horas = [{ hora: 8, caixas: 2 }, { hora: 10, caixas: 3 }];

test('CA1: metas sem dados abre como "Novo cadastro: Metas" e com etapa preenchida como "Editar: Metas"', async () => {
  const { tituloFormulario } = await cadastros();
  const { RECURSOS } = await regras();
  assert.equal(tituloFormulario(RECURSOS.metas, {}), 'Novo cadastro: Metas');
  assert.equal(tituloFormulario(RECURSOS.metas, { projetoId: 1, etapa: 'cq', valorDia: 10, unidade: 'caixas' }), 'Editar: Metas');
});

test('CA2: recursos com id continuam decidindo o título pelo id', async () => {
  const { tituloFormulario } = await cadastros();
  const { RECURSOS } = await regras();
  assert.equal(tituloFormulario(RECURSOS.turnos, {}), `Novo cadastro: ${RECURSOS.turnos.rotulo}`);
  assert.equal(tituloFormulario(RECURSOS.turnos, { id: 3, nome: 'Manhã' }), `Editar: ${RECURSOS.turnos.rotulo}`);
});

test('CA3: total ausente, não numérico ou inválido usa a soma das horas', async () => {
  const { normalizarHoraAHora } = await rel();
  for (const total of [undefined, null, 'abc', Number.NaN, {}]) {
    assert.equal(normalizarHoraAHora({ total, horas }).total, 5, String(total));
  }
});

test('CA4: total 0 com horas preenchidas usa a soma das horas', async () => {
  const { normalizarHoraAHora } = await rel();
  const r = normalizarHoraAHora({ total: 0, horas });
  assert.equal(r.total, 5);
  assert.deepEqual(r.pico, { hora: 10, caixas: 3 });
});

test('CA5: total válido do servidor é mantido, e sem horas o total continua 0', async () => {
  const { normalizarHoraAHora } = await rel();
  assert.equal(normalizarHoraAHora({ total: 7, horas }).total, 7);
  assert.equal(normalizarHoraAHora({ total: 0, horas: [] }).total, 0);
  assert.equal(normalizarHoraAHora({ horas: [] }).total, 0);
});
