import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executarLogin, PROGRESSO, carimbo } from '../../public/app/js/core/login-etapas.js';

/** relógio falso: cada `await dormir`/trabalho avança o tempo combinado. */
function relogio() {
  let t = 1000;
  return { agora: () => t, avancar: (ms) => { t += ms; }, dormir: async (ms) => { t += ms; }, timers: [], agendar(fn, ms) { const id = { fn, ms }; this.timers.push(id); return id; }, cancelar(id) { this.timers = this.timers.filter((x) => x !== id); } };
}
const montar = (o = {}) => {
  const r = relogio();
  const eventos = [];
  const d = {
    autenticar: async () => { r.avancar(180); return { token: 'T', usuario: { tipo: 'admin' } }; },
    carregarProjetos: async () => { r.avancar(40); return { total: 3 }; },
    montarPainel: async () => { r.avancar(25); },
    aoEvento: (e) => eventos.push(e),
    agora: r.agora, dormir: r.dormir, agendar: (f, m) => r.agendar(f, m), cancelar: (i) => r.cancelar(i),
    ...o,
  };
  return { r, eventos, d };
};

test('sequência feliz: 4 etapas, tempos MEDIDOS e progresso 8 → 32 → 58 → 86 → 100', async () => {
  const { eventos, d } = montar();
  const out = await executarLogin(d);
  assert.equal(out.token, 'T');
  const fim = eventos.filter((e) => e.estado === 'ok');
  assert.deepEqual(fim.map((e) => e.id), ['auth', 'perm', 'proj', 'painel']);
  assert.deepEqual(fim.map((e) => e.progresso), [32, 58, 86, 100]);
  assert.equal(fim[0].ms, 180);
  assert.equal(fim[2].ms, 40);
  assert.equal(fim[3].ms, 25);
  assert.equal(eventos[0].progresso, PROGRESSO.inicio);
  assert.equal(out.totalMs, 245);
});

test('rótulos reais: permissões mostram o tipo; projetos mostram a quantidade', async () => {
  const { eventos, d } = montar();
  await executarLogin(d);
  const rot = Object.fromEntries(eventos.filter((e) => e.estado === 'ok').map((e) => [e.id, e.rotulo]));
  assert.equal(rot.perm, 'Carregando permissões (admin)');
  assert.equal(rot.proj, 'Sincronizando projetos (3)');
});

test('falha na autenticação: etapa vira erro, rejeita com o erro original e para (nada de etapas 2–4)', async () => {
  const erro = Object.assign(new Error('Login ou senha inválidos.'), { status: 401 });
  const { eventos, d } = montar({ autenticar: async () => { throw erro; } });
  await assert.rejects(executarLogin(d), (e) => e === erro);
  assert.deepEqual(eventos.map((e) => `${e.id}:${e.estado}`), ['auth:rodando', 'auth:erro']);
});

test('etapas 2–4 NÃO são fatais: falha vira aviso e o login conclui', async () => {
  const { eventos, d } = montar({ carregarProjetos: async () => { throw new Error('x'); }, montarPainel: async () => { throw new Error('y'); } });
  const out = await executarLogin(d);
  assert.equal(out.token, 'T');
  const avisos = eventos.filter((e) => e.estado === 'aviso');
  assert.deepEqual(avisos.map((e) => e.id), ['proj', 'painel']);
  assert.equal(avisos[0].nota, 'indisponível — continuando');
});

test('servidor lento: o aviso sai depois de 4 s e é cancelado quando a resposta chega', async () => {
  const { r, eventos, d } = montar({ autenticar: async () => { return { token: 'T', usuario: {} }; } });
  await executarLogin(d);
  assert.equal(r.timers.length, 0, 'timer cancelado ao concluir');
  assert.ok(!eventos.some((e) => e.nota && /devagar/.test(e.nota)));

  const m = montar();
  m.d.autenticar = async () => { m.r.timers[0].fn(); m.r.avancar(5000); return { token: 'T', usuario: {} }; };
  await executarLogin(m.d);
  assert.ok(m.eventos.some((e) => e.nota === 'O servidor está respondendo devagar…'));
  assert.equal(m.r.timers.length, 0);
});

test('o aviso de lentidão usa 4 s por padrão', async () => {
  const { r, d } = montar();
  let ms = null;
  d.agendar = (f, m) => { ms = m; return r.agendar(f, m); };
  await executarLogin(d);
  assert.equal(ms, 4000);
});

test('piso de duração: espera SÓ o que falta, nunca mais', async () => {
  const a = montar({ duracaoMinMs: 1200 });
  const out = await executarLogin(a.d);
  assert.equal(out.totalMs, 1200, 'completou 245 ms de trabalho + 955 ms de piso');
  const b = montar({ duracaoMinMs: 100 });
  assert.equal((await executarLogin(b.d)).totalMs, 245, 'já passou do piso: nenhum atraso extra');
  const c = montar();
  assert.equal((await executarLogin(c.d)).totalMs, 245, 'sem piso configurado: nenhum atraso');
});

test('falha na autenticação não aplica o piso (erro aparece na hora)', async () => {
  let dormiu = 0;
  const { d } = montar({ autenticar: async () => { throw new Error('x'); }, duracaoMinMs: 5000, dormir: async () => { dormiu++; } });
  await assert.rejects(executarLogin(d));
  assert.equal(dormiu, 0);
});

test('carimbo de tempo do log (6 caracteres)', () => {
  assert.equal(carimbo(520), '00,52s');
  assert.equal(carimbo(0), '00,00s');
  assert.equal(carimbo(12345), '12,35s');
  assert.equal(carimbo(-5), '00,00s');
});
