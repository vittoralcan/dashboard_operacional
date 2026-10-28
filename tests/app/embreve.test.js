import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RECURSOS, recurso, ativo, emBreve, marcarAusente, limparAusentes, ausenteSe404 } from '../../public/app/js/config/recursos.js';
import { seloEmBreve, valorEmBreve, blocoEmBreve, paginaEmBreve, atributosEmBreve, dicaEmBreve, seAtivo } from '../../public/app/js/ui/embreve.js';

const original = Object.fromEntries(Object.entries(RECURSOS).map(([k, v]) => [k, v.estado]));
afterEach(() => { for (const k of Object.keys(RECURSOS)) RECURSOS[k].estado = original[k]; limparAusentes(); });

/** O que o backend já entregou (docs/README.md, 2026-10-03). O resto continua "Em breve" até o parceiro entregar. */
const LIGADOS = ['auth.me', 'auth.preferencias', 'fluxo.config', 'gestao.resumo', 'painel.resumo', 'metas', 'gargalos', 'atividades', 'notificacoes', 'monitor.nativo', 'envio'];

test('todo recurso tem nome, API e funções; só os que o backend entregou estão "ativo"', () => {
  for (const [id, r] of Object.entries(RECURSOS)) {
    assert.ok(r.nome && r.api && r.funcoes.length, id);
    assert.equal(r.estado, LIGADOS.includes(id) ? 'ativo' : 'em-breve', id);
  }
});

test('404 do servidor vira "Em breve" de novo (RNB-007) só para aquele recurso e só nesta sessão', () => {
  assert.equal(ativo('metas'), true);
  assert.equal(ausenteSe404('metas', { status: 500 }), false);
  assert.equal(ativo('metas'), true, '500 não é "ausente"');
  assert.equal(ausenteSe404('metas', { status: 404 }), true);
  assert.equal(ativo('metas'), false);
  assert.equal(ativo('gargalos'), true, 'os outros seguem ativos');
  limparAusentes();
  assert.equal(ativo('metas'), true);
  assert.throws(() => marcarAusente('typo'), /Recurso desconhecido/);
});

test('recurso desconhecido é erro de programação, não "desligado"', () => {
  assert.throws(() => recurso('nao.existe'), /Recurso desconhecido/);
  assert.throws(() => ativo('typo'), /Recurso desconhecido/);
});

test('ativo/emBreve refletem o estado', () => {
  assert.equal(ativo('boreal.resumo'), false);
  assert.equal(emBreve('boreal.resumo'), true);
  RECURSOS['boreal.resumo'].estado = 'ativo';
  assert.equal(ativo('boreal.resumo'), true);
  assert.equal(emBreve('boreal.resumo'), false);
});

test('selo "Em breve" nomeia o recurso em texto oculto (não em aria-label) e tem tooltip dizendo o que falta', () => {
  const s = String(seloEmBreve('boreal.exportacao'));
  assert.match(s, /class="selo embreve"/);
  assert.match(s, /Em breve<span class="sr-only">: Exportação completa<\/span>/);
  assert.doesNotMatch(s, /aria-label/);
  assert.match(s, /Depende do backend \(exportação no servidor\)/);
});

test('com o recurso ATIVO nenhum selo é renderizado (o selo não pode sobrar)', () => {
  RECURSOS['boreal.resumo'].estado = 'ativo';
  assert.equal(String(seloEmBreve('boreal.resumo')), '');
  assert.equal(String(valorEmBreve('boreal.resumo')), '');
  assert.equal(String(blocoEmBreve({ recurso: 'boreal.resumo', titulo: 'Meta mensal' })), '');
  assert.equal(String(seloEmBreve('metas')), '', 'recurso já entregue nunca mostra o selo');
});

test('bloco usa a mesma moldura de cartão e o selo', () => {
  const b = String(blocoEmBreve({ recurso: 'atividades.boreal', titulo: 'Gargalos agora', classes: 'c-4' }));
  assert.match(b, /class="card embreve c-4"/);
  assert.match(b, /Gargalos agora/);
  assert.match(b, /selo embreve/);
});

test('texto vindo do chamador é escapado', () => {
  const b = String(blocoEmBreve({ recurso: 'atividades.boreal', titulo: '<script>x</script>', texto: '<b>oi</b>' }));
  assert.doesNotMatch(b, /<script>/);
  assert.match(b, /&lt;script&gt;/);
  assert.match(b, /&lt;b&gt;oi&lt;\/b&gt;/);
});

test('valor em breve mostra traço e selo discreto', () => {
  const v = String(valorEmBreve('boreal.resumo'));
  assert.match(v, /embreve-valor/);
  assert.match(v, />—</);
});

test('atributos de botão desabilitado', () => {
  const a = String(atributosEmBreve('boreal.mesas.criar'));
  assert.match(a, /aria-disabled="true"/);
  assert.match(a, /data-embreve="boreal.mesas.criar"/);
  assert.match(a, /data-tip="Em breve: Adicionar mesa/);
});

test('página em breve', () => {
  const p = String(paginaEmBreve({ recurso: 'auth.usuarios', titulo: 'Gestão de usuários' }));
  assert.match(p, /embreve-pag/);
  assert.match(p, /Gestão de usuários/);
});

test('seAtivo escolhe o ramo certo', () => {
  assert.equal(seAtivo('boreal.resumo', () => 'real', () => 'breve'), 'breve');
  RECURSOS['boreal.resumo'].estado = 'ativo';
  assert.equal(seAtivo('boreal.resumo', () => 'real', () => 'breve'), 'real');
});

test('dicaEmBreve nomeia o recurso e a API', () => {
  assert.equal(dicaEmBreve('boreal.exportacao'), 'Em breve: Exportação completa. Depende do backend (exportação no servidor).');
});

test('as funções citadas em cada recurso existem no catálogo de funções', (t) => {
  const arq = new URL('../../docs/frontend/catalogo-de-funcoes.md', import.meta.url);
  if (!fs.existsSync(arq)) return t.skip('catálogo não encontrado');
  const catalogo = fs.readFileSync(arq, 'utf8');
  for (const [id, r] of Object.entries(RECURSOS)) {
    for (const f of r.funcoes) assert.match(catalogo, new RegExp(`\\| ${f} \\|`), `${id} → ${f}`);
  }
});
