import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iso, deIso, semanasDoMes, navegarMes, clicarDia, estadoDoDia, diasNoIntervalo, atalhosDeIntervalo, somarDias, dataCurta, mesmoDia } from '../../public/app/js/core/calendario.js';

const d = (a, m, dia) => new Date(a, m - 1, dia);
const HOJE = d(2026, 10, 15);

test('iso / deIso ida e volta e rejeição de datas impossíveis', () => {
  assert.equal(iso(d(2026, 1, 5)), '2026-01-05');
  assert.ok(mesmoDia(deIso('2026-10-02'), d(2026, 10, 2)));
  assert.equal(deIso('2026-02-30'), null);
  assert.equal(deIso('02/10/2026'), null);
  assert.equal(deIso(''), null);
});

test('dataCurta dd/mm/aaaa', () => assert.equal(dataCurta(d(2026, 10, 2)), '02/10/2026'));

test('semanasDoMes: outubro/2026 começa numa quinta e tem 31 dias', () => {
  const sem = semanasDoMes(2026, 9);
  assert.ok(sem.every((s) => s.length === 7));
  assert.equal(sem[0].filter((x) => x === null).length, 4); // dom–qua vazios
  assert.equal(sem[0][4].getDate(), 1);
  const dias = sem.flat().filter(Boolean);
  assert.equal(dias.length, 31);
  assert.equal(dias[30].getDate(), 31);
});

test('semanasDoMes: fevereiro bissexto tem 29 dias', () => {
  assert.equal(semanasDoMes(2028, 1).flat().filter(Boolean).length, 29);
  assert.equal(semanasDoMes(2026, 1).flat().filter(Boolean).length, 28);
});

test('navegarMes atravessa o ano', () => {
  assert.deepEqual(navegarMes({ ano: 2026, mes: 11 }, 1), { ano: 2027, mes: 0 });
  assert.deepEqual(navegarMes({ ano: 2026, mes: 0 }, -1), { ano: 2025, mes: 11 });
});

test('seleção: 1º clique início, 2º fim, 3º recomeça', () => {
  let s = { ini: null, fim: null };
  s = clicarDia(s, d(2026, 10, 3), HOJE);
  assert.ok(mesmoDia(s.ini, d(2026, 10, 3)) && s.fim === null);
  s = clicarDia(s, d(2026, 10, 9), HOJE);
  assert.ok(mesmoDia(s.fim, d(2026, 10, 9)));
  s = clicarDia(s, d(2026, 10, 12), HOJE);
  assert.ok(mesmoDia(s.ini, d(2026, 10, 12)) && s.fim === null);
});

test('seleção: fim anterior ao início inverte o intervalo', () => {
  let s = clicarDia({ ini: null, fim: null }, d(2026, 10, 9), HOJE);
  s = clicarDia(s, d(2026, 10, 3), HOJE);
  assert.ok(mesmoDia(s.ini, d(2026, 10, 3)) && mesmoDia(s.fim, d(2026, 10, 9)));
});

test('seleção: datas futuras são ignoradas; hoje é permitido', () => {
  const vazio = { ini: null, fim: null };
  assert.equal(clicarDia(vazio, d(2026, 10, 16), HOJE), vazio);
  assert.ok(mesmoDia(clicarDia(vazio, HOJE, HOJE).ini, HOJE));
});

test('estadoDoDia: ini, fim, dentro e fora', () => {
  const sel = { ini: d(2026, 10, 3), fim: d(2026, 10, 6) };
  assert.equal(estadoDoDia(d(2026, 10, 3), sel), 'ini');
  assert.equal(estadoDoDia(d(2026, 10, 4), sel), 'in');
  assert.equal(estadoDoDia(d(2026, 10, 6), sel), 'fim');
  assert.equal(estadoDoDia(d(2026, 10, 7), sel), '');
  assert.equal(estadoDoDia(d(2026, 10, 3), { ini: d(2026, 10, 3), fim: null }), 'ini fim');
  assert.equal(estadoDoDia(d(2026, 10, 3), { ini: null, fim: null }), '');
  assert.equal(estadoDoDia(d(2026, 10, 3), { ini: d(2026, 10, 3), fim: d(2026, 10, 3) }), 'ini fim');
});

test('diasNoIntervalo é inclusivo e imune a horário de verão', () => {
  assert.equal(diasNoIntervalo(d(2026, 10, 3), d(2026, 10, 3)), 1);
  assert.equal(diasNoIntervalo(d(2026, 10, 1), d(2026, 10, 31)), 31);
  assert.equal(diasNoIntervalo(d(2026, 2, 1), d(2026, 3, 31)), 59);
});

test('atalhos de intervalo', () => {
  const a = Object.fromEntries(atalhosDeIntervalo(HOJE).map((x) => [x.id, x]));
  assert.equal(diasNoIntervalo(a.hoje.ini, a.hoje.fim), 1);
  assert.equal(diasNoIntervalo(a['7d'].ini, a['7d'].fim), 7);
  assert.equal(diasNoIntervalo(a['30d'].ini, a['30d'].fim), 30);
  assert.ok(mesmoDia(a.mes.ini, d(2026, 10, 1)) && mesmoDia(a.mes.fim, HOJE));
  assert.ok(mesmoDia(somarDias(HOJE, -6), a['7d'].ini));
});
