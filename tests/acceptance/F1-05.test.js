// core/operacional.js: funções puras do tablet (ordem A-Z, cronômetro, normalização).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.resolve(__dirname, '../..');
const mod = () => import(pathToFileURL(path.join(RAIZ, 'public/app/js/core/operacional.js')).href);

test('CA1: ordenarNomes põe A-Z sem distinguir acento e caixa, sem alterar a lista de entrada', async () => {
  const { ordenarNomes } = await mod();
  const entrada = [{ id: 1, nome: 'Zélia' }, { id: 2, nome: 'érica' }, { id: 3, nome: 'Bruno' }, { id: 4, nome: 'ana' }];
  const copia = JSON.parse(JSON.stringify(entrada));
  assert.deepEqual(ordenarNomes(entrada).map((c) => c.id), [4, 3, 2, 1]);
  assert.deepEqual(entrada, copia);
  assert.deepEqual(ordenarNomes([]), []);
});

test('CA2: segundosDecorridos usa o desvio do relógio do servidor e nunca é negativo', async () => {
  const { segundosDecorridos, desvioDoRelogio } = await mod();
  const inicio = '2026-10-20T13:00:00.000Z';
  const t0 = Date.parse(inicio);
  assert.equal(segundosDecorridos(inicio, t0 + 125_900), 125);
  assert.equal(segundosDecorridos(inicio, t0 - 5000), 0);
  assert.equal(segundosDecorridos('lixo', t0), 0);
  // relógio local 30 s atrasado em relação ao servidor
  const desvio = desvioDoRelogio('2026-10-20T13:10:30.000Z', t0 + 600_000);
  assert.equal(desvio, 30_000);
  assert.equal(segundosDecorridos(inicio, t0 + 600_000, desvio), 630);
  assert.equal(desvioDoRelogio('lixo', 123), 0);
});

test('CA3: formatarCronometro mostra MM:SS e H:MM:SS a partir de 1 hora', async () => {
  const { formatarCronometro } = await mod();
  assert.equal(formatarCronometro(0), '00:00');
  assert.equal(formatarCronometro(65), '01:05');
  assert.equal(formatarCronometro(3599), '59:59');
  assert.equal(formatarCronometro(3600), '1:00:00');
  assert.equal(formatarCronometro(3725), '1:02:05');
  assert.equal(formatarCronometro(-4), '00:00');
  assert.equal(formatarCronometro(Number.NaN), '00:00');
});

test('CA4: normalizarCodigoBip tira espaços e o Enter/controles que o leitor manda; não-texto vira vazio', async () => {
  const { normalizarCodigoBip } = await mod();
  assert.equal(normalizarCodigoBip('  AC-000123\r\n'), 'AC-000123');
  assert.equal(normalizarCodigoBip('AC-000123\t'), 'AC-000123');
  assert.equal(normalizarCodigoBip('PR 000123'), 'PR 000123');
  assert.equal(normalizarCodigoBip(null), '');
  assert.equal(normalizarCodigoBip(42), '');
});

test('CA5: normalizarColaboradores ordena A-Z, descarta entradas inválidas e tolera lixo', async () => {
  const { normalizarColaboradores } = await mod();
  const r = normalizarColaboradores([
    { id: 3, nome: 'Zélia', funcao: 'higienizador', avatar: null, extra: 1 },
    { id: 1, nome: 'Bruno', funcao: null, avatar: 'a1' },
    { id: 'x', nome: 'Sem id' },
    { id: 9, nome: '   ' },
    null,
    { id: 2, nome: 'Ana' },
  ]);
  assert.deepEqual(r.map((c) => c.id), [2, 1, 3]);
  assert.deepEqual(r[2], { id: 3, nome: 'Zélia', funcao: 'higienizador', avatar: null });
  assert.deepEqual(r[0], { id: 2, nome: 'Ana', funcao: null, avatar: null });
  assert.deepEqual(normalizarColaboradores(undefined), []);
  assert.deepEqual(normalizarColaboradores({}), []);
});

test('CA6: normalizarEstado converte a hora do servidor e o início de cada caixa aberta em milissegundos', async () => {
  const { normalizarEstado } = await mod();
  const r = normalizarEstado({
    agora: '2026-10-20T13:00:00.000Z',
    abertas: [
      { id: 7, codigo: 'AC-000123', colaboradorId: 1, colaboradorNome: 'Ana', mesaId: null, inicioEm: '2026-10-20T12:55:00.000Z' },
      { id: 8, codigo: 'AC-000124', colaboradorId: 2, colaboradorNome: 'Bruno', mesaId: 4, inicioEm: 'lixo' },
    ],
  });
  assert.equal(r.agoraMs, Date.parse('2026-10-20T13:00:00.000Z'));
  assert.equal(r.abertas.length, 1, 'caixa com início inválido é descartada');
  const { etapa, pausadoS, pausaInicioMs, pausaAutomatica, fimSolicitadoMs, ...semEtapa } = r.abertas[0];
  assert.deepEqual([pausadoS, pausaInicioMs, pausaAutomatica, fimSolicitadoMs], [0, null, false, null]);
  assert.ok(etapa === undefined || typeof etapa === 'string');
  assert.deepEqual(semEtapa, { id: 7, codigo: 'AC-000123', colaboradorId: 1, colaboradorNome: 'Ana', mesaId: null, inicioMs: Date.parse('2026-10-20T12:55:00.000Z') });
  assert.deepEqual(normalizarEstado(null), { agoraMs: null, abertas: [] });
});

test('CA7: mensagemBip devolve o texto de cada resposta do bip (conclusão com a duração)', async () => {
  const { mensagemBip } = await mod();
  const fim = mensagemBip({ acao: 'finalizar', duracaoS: 125 });
  assert.match(fim, /Caixa conclu[ií]da/);
  assert.match(fim, /02:05/);
  assert.match(mensagemBip({ acao: 'duplicado' }), /repetid/i);
  assert.match(mensagemBip({ acao: 'ja_concluida' }), /j[aá] .*conclu[ií]da/i);
  assert.match(mensagemBip({ acao: 'inexistente' }), /reconhec|inv[aá]lid/i);
  assert.equal(mensagemBip({ acao: 'iniciar' }), '');
  assert.equal(mensagemBip(null), '');
});
