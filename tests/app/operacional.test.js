import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarNomes, segundosDecorridos, desvioDoRelogio, formatarCronometro, normalizarCodigoBip, normalizarColaboradores, normalizarEstado, mensagemBip, normalizarEtapa, rotuloEtapa } from '../../public/app/js/core/operacional.js';

test('ordenarNomes ignora acento e caixa e não muta a entrada', () => {
  const entrada = [{ nome: 'Édson' }, { nome: 'edna' }, { nome: 'Eduardo' }];
  assert.deepEqual(ordenarNomes(entrada).map((x) => x.nome), ['edna', 'Édson', 'Eduardo']);
  assert.equal(entrada[0].nome, 'Édson');
});

test('segundosDecorridos aplica o desvio e nunca é negativo', () => {
  const inicio = '2026-10-20T13:00:00.000Z';
  const t0 = Date.parse(inicio);
  assert.equal(segundosDecorridos(inicio, t0 + 2999, 0), 2);
  assert.equal(segundosDecorridos(inicio, t0 + 1000, -5000), 0);
  assert.equal(segundosDecorridos(inicio, Number.NaN), 0);
});

test('desvioDoRelogio é servidor - local e 0 quando inválido', () => {
  assert.equal(desvioDoRelogio('2026-10-20T13:00:00.000Z', Date.parse('2026-10-20T12:59:00.000Z')), 60_000);
  assert.equal(desvioDoRelogio(undefined, 1), 0);
  assert.equal(desvioDoRelogio('2026-10-20T13:00:00.000Z', Number.NaN), 0);
});

test('formatarCronometro trunca frações e trata não-finitos', () => {
  assert.equal(formatarCronometro(59.9), '00:59');
  assert.equal(formatarCronometro(Number.POSITIVE_INFINITY), '00:00');
  assert.equal(formatarCronometro(36_000), '10:00:00');
});

test('normalizarCodigoBip mantém o miolo intacto', () => {
  assert.equal(normalizarCodigoBip('\tPR 1\u0000 2\n'), 'PR 1 2');
  assert.equal(normalizarCodigoBip(''), '');
});

test('normalizarColaboradores descarta nome vazio, id não inteiro e não-objetos', () => {
  assert.deepEqual(normalizarColaboradores([{ id: 1.5, nome: 'X' }, 'lixo', { id: 4, nome: ' Carla ', funcao: 'x' }]), [
    { id: 4, nome: 'Carla', funcao: 'x', avatar: null },
  ]);
  assert.deepEqual(normalizarColaboradores('nada'), []);
});

test('normalizarEstado converte hora do servidor e tolera lixo', () => {
  assert.deepEqual(normalizarEstado({ agora: 'x', abertas: 'x' }), { agoraMs: null, abertas: [] });
  assert.deepEqual(normalizarEstado(42), { agoraMs: null, abertas: [] });
});

test('normalizarEtapa e rotuloEtapa tratam valores fora da lista', () => {
  assert.equal(normalizarEtapa('remontagem'), 'remontagem');
  assert.equal(normalizarEtapa('x'), 'higienizacao');
  assert.equal(rotuloEtapa('remontagem'), 'Remontagem');
  assert.equal(rotuloEtapa(undefined), 'Higienização');
});

test('mensagemBip cobre ações desconhecidas com texto vazio', () => {
  assert.equal(mensagemBip({ acao: 'algo_novo' }), '');
  assert.equal(mensagemBip({ acao: 'finalizar', duracaoS: 3600 }).includes('1:00:00'), true);
});

test('digitalização: rótulo, etapa do estado e leitura de imagens', async () => {
  const m = await import('../../public/app/js/core/operacional.js');
  assert.equal(m.rotuloEtapa('digitalizacao'), 'Digitalização');
  assert.equal(m.normalizarEtapa('digitalizacao'), 'higienizacao', 'o tablet só escolhe entre as etapas dele');
  assert.equal(m.normalizarEtapaDoTurno('digitalizacao'), 'digitalizacao');
  assert.equal(m.lerImagens(' 480 '), 480);
  for (const ruim of ['', '0', '-3', '1,5', 'abc', null, '12345678']) assert.equal(m.lerImagens(ruim), null, String(ruim));
});

test('estado traz a pausa; cartão de retorno nunca mostra tempo; colaboradoresOcupados', async () => {
  const m = await import('../../public/app/js/core/operacional.js');
  const e = m.normalizarEstado({ agora: '2026-10-20T10:00:00Z', abertas: [{ id: 3, codigo: 'X', colaboradorId: 1, colaboradorNome: 'A', inicioEm: '2026-10-20T09:00:00Z', etapa: 'digitalizacao', pausadoS: 30, pausaInicioEm: '2026-10-20T09:50:00Z', pausaAutomatica: true }] });
  assert.deepEqual([e.abertas[0].etapa, e.abertas[0].pausadoS, e.abertas[0].pausaInicioMs, e.abertas[0].pausaAutomatica], ['digitalizacao', 30, Date.parse('2026-10-20T09:50:00Z'), true]);
  assert.deepEqual(m.cartaoDeRetorno('iniciada', { codigo: 'CX-1', nome: 'Ana' }), { tipo: 'iniciada', titulo: 'Caixa iniciada', linhas: ['CX-1', 'Ana'] });
  assert.deepEqual(m.cartaoDeRetorno('concluida', { codigo: 'CX-1', imagens: 480 }).linhas, ['CX-1', '480 imagens']);
  assert.equal(m.cartaoDeRetorno('pausada', { codigo: 'CX-1' }).titulo, 'Caixa pausada');
});

test('colaboradoresOcupados e retorno sem tempo', async () => {
  const m = await import('../../public/app/js/core/operacional.js');
  assert.deepEqual([...m.colaboradoresOcupados([{ colaboradorId: 3 }, { colaboradorId: 5 }, { colaboradorId: 3 }])].sort(), [3, 5]);
  for (const t of ['iniciada', 'pausada', 'retomada', 'concluida']) {
    const c = m.cartaoDeRetorno(t, { codigo: 'CX', nome: 'Ana', duracaoS: 75, imagens: 3 });
    assert.doesNotMatch(JSON.stringify(c), /\d{1,2}:\d{2}|Tempo|cronômetro/i, t);
  }
});

test('telas do turno não deixam listener no #tablet compartilhado (um clique virava vários POSTs)', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['tablet/tablet.js', 'digitalizacao/digitalizacao.js']) {
    const s = readFileSync(new URL(`../../public/app/js/features/${f}`, import.meta.url), 'utf8');
    assert.match(s, /view\.addEventListener\('click'[\s\S]*?\{ signal: escuta\.signal \}\)/, `${f}: o click em view precisa sair com a tela`);
    assert.match(s, /escuta\.abort\(\)/, `${f}: destruir() desliga os listeners`);
  }
});

test('mensagemBip avisa quando a caixa está aberta em outra etapa', async () => {
  const m = await import('../../public/app/js/core/operacional.js');
  assert.match(m.mensagemBip({ acao: 'outra_etapa', etapa: 'digitalizacao' }), /Digitalização/);
});

test('D1: id da caixa em texto numérico (bigint do banco) não derruba a caixa em andamento', async () => {
  const m = await import('../../public/app/js/core/operacional.js');
  assert.equal(m.idDeCaixa(42), 42);
  assert.equal(m.idDeCaixa('42'), 42);
  for (const ruim of ['', '0', '-1', '4.2', 'abc', null, undefined, 0, 1.5, '1'.repeat(20)]) assert.equal(m.idDeCaixa(ruim), null, String(ruim));
  const e = m.normalizarEstado({ agora: '2026-10-20T10:00:00Z', abertas: [
    { id: '42', codigo: 'CX-1', colaboradorId: 1, colaboradorNome: 'Ana', inicioEm: '2026-10-20T09:00:00Z', etapa: 'higienizacao' },
    { id: 'x', codigo: 'CX-2', colaboradorId: 2, colaboradorNome: 'Bia', inicioEm: '2026-10-20T09:00:00Z' },
  ] });
  assert.deepEqual(e.abertas.map((c) => c.id), [42], 'o texto numérico vira número; o lixo continua descartado');
});

test('D1: o selo de colaborador ocupado diz qual caixa, a etapa e desde quando; a outra tela é avisada', async () => {
  const m = await import('../../public/app/js/core/operacional.js');
  const base = { colaboradorNome: 'Ana', mesaId: null, pausadoS: 0, pausaInicioMs: null, pausaAutomatica: false, fimSolicitadoMs: null };
  const dig = { ...base, id: 1, codigo: 'CX-9', colaboradorId: 3, etapa: 'digitalizacao', inicioMs: Date.parse('2026-10-20T15:05:00Z') };
  const hig = { ...base, id: 2, codigo: 'CX-4', colaboradorId: 3, etapa: 'higienizacao', inicioMs: Date.parse('2026-10-20T14:00:00Z') };
  assert.equal(m.textoOcupado(undefined), 'Já tem caixa em andamento');
  assert.equal(m.textoOcupado(dig), 'Já tem a caixa CX-9 em Digitalização desde 12:05', 'hora de São Paulo');
  assert.equal(m.caixaPorColaborador([dig, hig]).get(3).codigo, 'CX-4', 'a mais antiga');
  assert.equal(m.avisoOutraTela([dig], (c) => c.etapa !== 'digitalizacao', 'Digitalização'), 'Há 1 caixa em andamento em Digitalização.');
  assert.equal(m.avisoOutraTela([dig, { ...dig, id: 3 }], (c) => c.etapa !== 'digitalizacao', 'Digitalização'), 'Há 2 caixas em andamento em Digitalização.');
  assert.equal(m.avisoOutraTela([hig], (c) => c.etapa !== 'digitalizacao', 'Digitalização'), '');
});

test('D1: as telas do turno avisam quando a lista não atualiza, em vez de ficar vazia em silêncio', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['tablet/tablet.js', 'digitalizacao/digitalizacao.js']) {
    const s = readFileSync(new URL(`../../public/app/js/features/${f}`, import.meta.url), 'utf8');
    assert.match(s, /estadoFalhou = true/, `${f}: erro de /estado precisa aparecer`);
    assert.match(s, /Não consegui atualizar a lista/, `${f}: aviso visível`);
  }
});
