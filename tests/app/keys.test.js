import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarAtalhos } from '../../public/app/js/core/keys.js';
import { empilhar, desempilhar, fecharTudo, totalCamadas, temCamada, fecharTopo } from '../../public/app/js/core/camadas.js';

/** documento falso: guarda o handler de keydown e dispara eventos. */
function alvoFalso() {
  let h = null;
  return { addEventListener: (_t, f) => { h = f; }, removeEventListener: () => { h = null; }, disparar: (e) => { const ev = { key: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, defaultPrevented: false, target: { tagName: 'BODY' }, preventDefault() { this.defaultPrevented = true; }, ...e }; h(ev); return ev; } };
}
function timersFalsos() {
  const fila = [];
  return { setTimeoutFn: (f) => { fila.push(f); return fila.length; }, clearTimeoutFn: () => {}, expirar: () => { while (fila.length) fila.shift()(); } };
}

beforeEach(() => fecharTudo());

test('tecla única aciona o atalho e bloqueia o comportamento padrão', () => {
  const a = alvoFalso(); const t = timersFalsos();
  const k = criarAtalhos({ alvo: a, ...t });
  let n = 0;
  k.registrar({ id: 'tema', tecla: 't', aoAcionar: () => n++ });
  const ev = a.disparar({ key: 'T' });
  assert.equal(n, 1);
  assert.equal(ev.defaultPrevented, true);
});

test('teclas únicas ficam DESLIGADAS em campo de texto', () => {
  const a = alvoFalso();
  const k = criarAtalhos({ alvo: a, ...timersFalsos() });
  let n = 0;
  k.registrar({ id: 'tema', tecla: 't', aoAcionar: () => n++ });
  a.disparar({ key: 't', target: { tagName: 'INPUT' } });
  a.disparar({ key: 't', target: { tagName: 'TEXTAREA' } });
  a.disparar({ key: 't', target: { tagName: 'DIV', isContentEditable: true } });
  assert.equal(n, 0);
});

test('teclas únicas ficam desligadas com modal/gaveta/paleta aberta', () => {
  const a = alvoFalso();
  const k = criarAtalhos({ alvo: a, ...timersFalsos() });
  let n = 0;
  k.registrar({ id: 'tema', tecla: 't', aoAcionar: () => n++ });
  const c = empilhar(() => {}, null, 'modal');
  a.disparar({ key: 't' });
  assert.equal(n, 0);
  desempilhar(c);
  a.disparar({ key: 't' });
  assert.equal(n, 1);
});

test('popover aberto NÃO bloqueia atalhos de uma tecla (só modal/gaveta/paleta)', () => {
  const a = alvoFalso();
  const k = criarAtalhos({ alvo: a, ...timersFalsos() });
  let n = 0;
  k.registrar({ id: 'tema', tecla: 't', aoAcionar: () => n++ });
  empilhar(() => {}, null, 'pop');
  a.disparar({ key: 't' });
  assert.equal(n, 1);
});

test('Ctrl/⌘+K funciona até em campo de texto e com modal aberto', () => {
  const a = alvoFalso();
  const k = criarAtalhos({ alvo: a, ...timersFalsos() });
  let n = 0;
  k.registrar({ id: 'paleta', tecla: 'k', mod: true, aoAcionar: () => n++ });
  empilhar(() => {}, null, 'modal');
  a.disparar({ key: 'k', ctrlKey: true, target: { tagName: 'INPUT' } });
  a.disparar({ key: 'k', metaKey: true });
  assert.equal(n, 2);
});

test('acorde G + letra navega; dica liga e desliga', () => {
  const a = alvoFalso(); const t = timersFalsos();
  const dica = [];
  const k = criarAtalhos({ alvo: a, aoAcorde: (on) => dica.push(on), ...t });
  const vai = [];
  k.registrar({ id: 'ir.p', acorde: 'p', aoAcionar: () => vai.push('projetos') });
  k.registrar({ id: 'ir.s', acorde: 's', aoAcionar: () => vai.push('boreal') });
  a.disparar({ key: 'g' });
  a.disparar({ key: 's' });
  assert.deepEqual(vai, ['boreal']);
  assert.deepEqual(dica, [true, false]);
});

test('o acorde expira (1,5 s) e a segunda tecla deixa de valer', () => {
  const a = alvoFalso(); const t = timersFalsos();
  const k = criarAtalhos({ alvo: a, ...t });
  let n = 0;
  k.registrar({ id: 'ir.p', acorde: 'p', aoAcionar: () => n++ });
  a.disparar({ key: 'g' });
  t.expirar();
  a.disparar({ key: 'p' });
  assert.equal(n, 0);
});

test('"g" sozinho não faz nada se não houver acordes registrados', () => {
  const a = alvoFalso();
  const dica = [];
  const k = criarAtalhos({ alvo: a, aoAcorde: (on) => dica.push(on), ...timersFalsos() });
  k.registrar({ id: 'tema', tecla: 't', aoAcionar: () => {} });
  a.disparar({ key: 'g' });
  assert.deepEqual(dica, []);
});

test('Esc fecha a camada do topo e consome o evento', () => {
  const a = alvoFalso();
  criarAtalhos({ alvo: a, ...timersFalsos() });
  const fechadas = [];
  empilhar(() => fechadas.push('base'), null, 'modal');
  empilhar(() => fechadas.push('topo'), null, 'pop');
  const ev = a.disparar({ key: 'Escape' });
  assert.deepEqual(fechadas, ['topo']);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(totalCamadas(), 1);
});

test('atalho com `ativo()` falso é ignorado', () => {
  const a = alvoFalso();
  const k = criarAtalhos({ alvo: a, ...timersFalsos() });
  let n = 0; let ligado = false;
  k.registrar({ id: 'zoom', tecla: '+', ativo: () => ligado, aoAcionar: () => n++ });
  a.disparar({ key: '+' });
  ligado = true;
  a.disparar({ key: '+' });
  assert.equal(n, 1);
});

test('remover atalho (função devolvida e por prefixo)', () => {
  const a = alvoFalso();
  const k = criarAtalhos({ alvo: a, ...timersFalsos() });
  let n = 0;
  const rm = k.registrar({ id: 'tela.a', tecla: 'a', aoAcionar: () => n++ });
  k.registrar({ id: 'tela.b', tecla: 'b', aoAcionar: () => n++ });
  rm();
  a.disparar({ key: 'a' });
  k.removerPrefixo('tela.');
  a.disparar({ key: 'b' });
  assert.equal(n, 0);
  assert.equal(k.lista().length, 0);
});

test('camadas: temCamada por tipo e fecharTopo vazio', () => {
  assert.equal(fecharTopo(), false);
  const c = empilhar(() => {}, null, 'drawer');
  assert.equal(temCamada('drawer'), true);
  assert.equal(temCamada(['modal', 'drawer']), true);
  assert.equal(temCamada('modal'), false);
  assert.equal(temCamada(), true);
  desempilhar(c);
  assert.equal(temCamada(), false);
});

test('Alt e composição de texto (IME) são ignorados', () => {
  const a = alvoFalso();
  const k = criarAtalhos({ alvo: a, ...timersFalsos() });
  let n = 0;
  k.registrar({ id: 'tema', tecla: 't', aoAcionar: () => n++ });
  a.disparar({ key: 't', altKey: true });
  a.disparar({ key: 't', isComposing: true });
  assert.equal(n, 0);
});
