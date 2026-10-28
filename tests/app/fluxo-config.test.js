import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mesclarConfigServidor, validarConfigFluxo } from '../../public/app/js/core/fluxo-config.js';

const DIR = new URL('../../public/app/config/fluxos/', import.meta.url);
const MANIFESTO = JSON.parse(fs.readFileSync(new URL('../../services/back_dashboard/projects/atlas.json', import.meta.url), 'utf8'));
const local = (id) => JSON.parse(fs.readFileSync(new URL(`${id}.json`, DIR), 'utf8'));

/** O que `GET /:projeto/:instancia/config` devolve (flow-viewer/index.js, rota /config), montado a partir do manifesto real. */
function respostaDoServidor(modulo) {
  const c = modulo.config;
  return { instancia: modulo.instanceId, nome: c.apresentacao.nome, sub: c.apresentacao.sub, aValidar: c.apresentacao.aValidar, visualStyle: c.visualStyle,
    faseFinal: c.faseFinal, kpiFases: c.kpiFases, passo: c.apresentacao.passo, gestaoColunas: c.gestaoColunas, fases: c.fases, grafo: c.grafo };
}

test('o /config REAL de cada fluxo do ATLAS, mesclado por cima da config local, continua válido', () => {
  for (const m of MANIFESTO.modules) {
    const l = local(m.instanceId);
    const cfg = mesclarConfigServidor(l, respostaDoServidor(m));
    assert.deepEqual(validarConfigFluxo(cfg), { ok: true, erros: [] }, m.instanceId);
    assert.equal(cfg.rota, l.rota, 'a rota é do front e não se perde');
    assert.equal(cfg.fonte, 'atlas');
    assert.equal(cfg.grafo.nos.length, l.grafo.nos.length, 'mesmo desenho (nós)');
    assert.equal(cfg.grafo.arestas.length, l.grafo.arestas.length, 'mesmo desenho (setas)');
  }
});

test('o que o servidor manda vale mais (rótulos de fase e colunas); o que é só do front fica', () => {
  const m = MANIFESTO.modules[0];
  const l = local(m.instanceId);
  const cfg = mesclarConfigServidor(l, respostaDoServidor(m));
  assert.equal(cfg.fases.find((f) => f.fasId === 60).nome, 'Controle de Qualidade Automático', 'rótulo do servidor');
  assert.equal(l.fases.find((f) => f.fasId === 60).nome, 'CQ Automático', 'a local tinha outro texto');
  assert.equal(cfg.sub, l.sub, '`sub` do servidor ("Papel · Digitalização") não substitui o eyebrow do front');
  assert.equal(cfg.projeto, 'ATLAS');
});

test('resposta incompleta/estranha NÃO apaga a local: cada campo é conferido', () => {
  const l = local('inventarios');
  assert.equal(mesclarConfigServidor(l, null), l);
  assert.equal(mesclarConfigServidor(l, 'x'), l);
  const c = mesclarConfigServidor(l, { nome: '', aValidar: 'sim', faseFinal: '12', passo: { cw: 1 }, gestaoColunas: [], fases: 'x', grafo: { nos: 1 } });
  assert.deepEqual(c, l, 'tudo inválido: nada muda');
  const so = mesclarConfigServidor(l, { aValidar: false, nome: 'Inventários 2' });
  assert.deepEqual([so.aValidar, so.nome, so.fases === l.fases], [false, 'Inventários 2', true]);
});

test('grafo do servidor incoerente é pego pela validação (o front então volta para a local)', () => {
  const l = local('negativos');
  const ruim = mesclarConfigServidor(l, { grafo: { nos: [{ fasId: 9999, x: 0, y: 0 }], juncoes: [], arestas: [] } });
  assert.equal(validarConfigFluxo(ruim).ok, false);
});
