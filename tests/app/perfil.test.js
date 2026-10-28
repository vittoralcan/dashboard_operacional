import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarPerfil, validarNome, preferenciasValidas, mudancasDoUsuario, criarEmissor } from '../../public/app/js/core/perfil.js';

const ME = { id: 1, nome: 'Rafael Oliveira', login: 'rafael.oliveira', email: 'rafael@x.com.br', tipo: 'admin', cargo: 'Supervisor de Produção', precisaTrocarSenha: false,
  ultimoLoginEm: '2026-10-02T08:41:12-03:00', criadoEm: '2026-08-24T15:06:38-03:00', preferencias: { tema: 'light', sidebarRecolhida: true, macroIntervaloSeg: 15, lixo: 1 } };

test('normalizarPerfil (A2): datas em ms, tipo conhecido, preferências só as válidas; campo ausente = null', () => {
  const p = normalizarPerfil(ME);
  assert.deepEqual([p.id, p.login, p.email, p.cargo, p.tipo], [1, 'rafael.oliveira', 'rafael@x.com.br', 'Supervisor de Produção', 'admin']);
  assert.ok(p.ultimoLoginEm > 0 && p.criadoEm > 0 && p.criadoEm < p.ultimoLoginEm);
  assert.deepEqual(p.preferencias, { tema: 'light', sidebarRecolhida: true, macroIntervaloSeg: 15 }, 'chave desconhecida é ignorada');
  const sem = normalizarPerfil({ login: 'a', nome: 'A', tipo: 'root', email: null, cargo: null, ultimoLoginEm: null });
  assert.deepEqual([sem.email, sem.cargo, sem.ultimoLoginEm, sem.criadoEm, sem.tipo], [null, null, null, null, 'standard'], 'tipo estranho nunca vira admin');
  assert.equal(normalizarPerfil(null), null);
  assert.equal(normalizarPerfil({ nome: 'sem login' }), null);
});

test('preferenciasValidas: valor fora da lista é descartado (macro 7 s, tema "roxo", sidebar "sim")', () => {
  assert.deepEqual(preferenciasValidas({ tema: 'roxo', sidebarRecolhida: 'sim', macroIntervaloSeg: 7 }), {});
  assert.deepEqual(preferenciasValidas({ tema: 'dark', macroIntervaloSeg: 30 }), { tema: 'dark', macroIntervaloSeg: 30 });
  assert.deepEqual(preferenciasValidas(null), {});
  assert.deepEqual(preferenciasValidas('x'), {});
});

test('validarNome: 2 a 150 caracteres depois do trim (como o servidor)', () => {
  assert.deepEqual(validarNome('  Rafael  '), { ok: true, nome: 'Rafael' });
  assert.equal(validarNome(' a ').ok, false);
  assert.equal(validarNome('').ok, false);
  assert.equal(validarNome('x'.repeat(151)).ok, false);
  assert.equal(validarNome('x'.repeat(150)).ok, true);
});

test('mudancasDoUsuario: só o que difere do guardado; e-mail ausente no servidor não apaga o guardado', () => {
  const p = normalizarPerfil(ME);
  assert.deepEqual(mudancasDoUsuario({ nome: 'Rafael Oliveira', email: 'rafael@x.com.br', cargo: 'Supervisor de Produção', tipo: 'admin' }, p), {});
  assert.deepEqual(mudancasDoUsuario({ nome: 'R. Oliveira', email: 'rafael@x.com.br', cargo: null, tipo: 'standard' }, p), { nome: 'Rafael Oliveira', cargo: 'Supervisor de Produção', tipo: 'admin' });
  const semEmail = normalizarPerfil({ ...ME, email: null });
  assert.equal(mudancasDoUsuario({ nome: 'Rafael Oliveira', email: 'guardado@x.com', cargo: 'Supervisor de Produção', tipo: 'admin' }, semEmail).email, undefined);
});

test('emissor: junta as mudanças e manda UM PATCH depois da pausa; a última escrita de cada chave vence', async () => {
  const enviados = [];
  /** relógio falso */
  const fila = []; let id = 0;
  const agendar = (f, ms) => { const t = { f, ms, id: ++id, vivo: true }; fila.push(t); return t; };
  const cancelar = (t) => { t.vivo = false; };
  const rodar = async () => { for (const t of fila.splice(0)) if (t.vivo) await t.f(); };
  const e = criarEmissor(async (patch) => { enviados.push(patch); }, { agendar, cancelar });
  e.marcar('tema', 'light'); e.marcar('macroIntervaloSeg', 5); e.marcar('tema', 'dark');
  assert.equal(enviados.length, 0, 'nada vai antes da pausa');
  assert.equal(e.temPendente(), true);
  assert.equal(fila.filter((t) => t.vivo).length, 1, 'cada mudança reinicia a espera: só um envio agendado');
  assert.equal(fila[fila.length - 1].ms, 600);
  await rodar();
  assert.deepEqual(enviados, [{ tema: 'dark', macroIntervaloSeg: 5 }]);
  assert.equal(e.temPendente(), false);
});

test('emissor: falha do servidor é silenciosa; valor inválido nunca é enviado; descartar limpa', async () => {
  const fila = []; const agendar = (f) => { const t = { f, vivo: true }; fila.push(t); return t; };
  const cancelar = (t) => { t.vivo = false; };
  let chamadas = 0;
  const e = criarEmissor(async () => { chamadas++; throw new Error('500'); }, { agendar, cancelar });
  e.marcar('tema', 'dark');
  await assert.doesNotReject(() => e.enviarJa());
  assert.equal(chamadas, 1);
  e.marcar('macroIntervaloSeg', 7); // inválido
  await e.enviarJa();
  assert.equal(chamadas, 1, 'patch vazio depois da validação: não chama o servidor');
  e.marcar('tema', 'light'); e.descartar();
  await e.enviarJa();
  assert.equal(chamadas, 1);
});
