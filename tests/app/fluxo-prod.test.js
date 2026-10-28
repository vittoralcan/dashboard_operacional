import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  estiloDaFase, normalizarStatus, contadoresParados, miniIndicadores, maiorCarga,
  normalizarGestao, rotulosUltimos7Dias, indicadorSincronizacao, normalizarPastas, normalizarPorLote, normalizarRelatorioFase,
} from '../../public/app/js/core/fluxo-prod.js';
import { grafoDeConfig, validarConfigFluxo } from '../../public/app/js/core/fluxo-config.js';
import { validarGrafo, calcularLayout, caminhoOrtogonal } from '../../public/app/js/core/fluxo.js';

const DIR = new URL('../../public/app/config/fluxos/', import.meta.url);
const IDS = ['negativos', 'certidoes', 'inventarios', 'cartografia'];
const CFG = Object.fromEntries(IDS.map((i) => [i, JSON.parse(fs.readFileSync(new URL(`${i}.json`, DIR), 'utf8'))]));

test('as 4 instâncias têm configuração válida (um módulo, quatro configs — RNB-003)', () => {
  for (const id of IDS) {
    const r = validarConfigFluxo(CFG[id]);
    assert.deepEqual(r, { ok: true, erros: [] }, `${id}: ${r.erros.join(' | ')}`);
    assert.equal(CFG[id].instancia, id);
  }
});

test('catálogo × configs: cada rota de fluxo do projetos.json tem a sua configuração', () => {
  const cat = JSON.parse(fs.readFileSync(new URL('../../public/app/config/projetos.json', import.meta.url), 'utf8'));
  const rotas = new Set(Object.values(CFG).map((c) => c.rota));
  for (const p of cat.projetos) for (const i of [...p.fluxos, ...p.modulos]) if (i.sub === 'Captura') assert.ok(rotas.has(i.rota), `${i.rota} sem configuração`);
  const aValidar = cat.projetos.flatMap((p) => p.fluxos).filter((f) => f.aValidar).map((f) => f.rota).sort();
  assert.deepEqual(Object.values(CFG).filter((c) => c.aValidar).map((c) => c.rota).sort(), aValidar, 'selo "Grafo a validar" coerente com o catálogo');
});

test('contagem de fases e de nós por instância (conferido com docs/api/back-dashboard.md)', () => {
  assert.equal(CFG.negativos.fases.length, 15);
  assert.equal(CFG['certidoes'].fases.length, 11);
  assert.equal(CFG.inventarios.fases.length, 13);
  assert.equal(CFG['cartografia'].fases.length, 12);
  assert.ok(CFG['certidoes'].fases.some((f) => f.fasId === 109 && f.tipo === 'espera'));
  assert.ok(CFG.inventarios.fases.some((f) => f.fasId === 120 && f.tipo === 'espera'));
  assert.ok(!CFG['cartografia'].fases.some((f) => f.tipo === 'espera'), 'Cartografia não tem fase de espera');
  assert.ok(!CFG.negativos.fases.some((f) => f.fasId === 93), 'Negativos não tem o CQ 2 (93)');
  const mf = CFG.negativos.grafo.arestas.find((a) => a.de === 16 && a.erro);
  assert.equal(mf.para, 14, 'a Verificação de Negativos suspende em 14, não em 72');
  assert.ok(CFG.inventarios.grafo.arestas.some((a) => a.de === 1 && a.para === 16 && a.bidirecional), 'Validação ↔ Verificação');
  assert.ok(!CFG['certidoes'].fases.some((f) => f.fasId === 60 || f.fasId === 69), 'resíduos 60/69 fora do fluxo');
});

test('toda fase de espera fica sem arestas (não faz parte do percurso)', () => {
  for (const c of Object.values(CFG)) {
    for (const f of c.fases.filter((x) => x.tipo === 'espera')) assert.ok(!c.grafo.arestas.some((a) => a.de === f.fasId || a.para === f.fasId), `${c.instancia}/${f.fasId}`);
  }
});

test('grafoDeConfig + layout: setas vermelhas só nas suspensões e caminhos ortogonais sem diagonais', () => {
  for (const c of Object.values(CFG)) {
    const g = grafoDeConfig(c);
    assert.equal(validarGrafo(g).ok, true, c.instancia);
    const { pos } = calcularLayout(g);
    for (const a of g.arestas) {
      const pts = caminhoOrtogonal(pos[String(a.from)], pos[String(a.to)]);
      for (let i = 1; i < pts.length; i++) assert.ok(Math.abs(pts[i][0] - pts[i - 1][0]) < 1 || Math.abs(pts[i][1] - pts[i - 1][1]) < 1, `${c.instancia}: ${a.from}→${a.to} tem trecho diagonal`);
    }
    const vermelhas = c.grafo.arestas.filter((a) => a.erro).map((a) => c.fases.find((f) => f.fasId === a.para)?.tipo);
    assert.ok(vermelhas.every((t) => t === 'erro' || t === 'reprocessamento'), `${c.instancia}: seta vermelha para fase que não é de suspensão`);
  }
});

test('validarConfigFluxo: erros legíveis', () => {
  const base = CFG.inventarios;
  assert.equal(validarConfigFluxo(null).ok, false);
  assert.match(validarConfigFluxo({ ...base, fonte: 'x' }).erros.join(' '), /fonte/);
  assert.match(validarConfigFluxo({ ...base, fases: base.fases.filter((f) => f.tipo !== 'entrada') }).erros.join(' '), /uma fase de entrada/);
  assert.match(validarConfigFluxo({ ...base, faseFinal: 7 }).erros.join(' '), /fase final/);
  assert.match(validarConfigFluxo({ ...base, fases: [...base.fases, base.fases[0]] }).erros.join(' '), /repetida/);
  assert.match(validarConfigFluxo({ ...base, grafo: { ...base.grafo, nos: [...base.grafo.nos, { fasId: 999, x: 0, y: 0 }] } }).erros.join(' '), /999/);
  assert.match(validarConfigFluxo({ ...base, gestaoColunas: [{ fasId: 999, titulo: 'x' }] }).erros.join(' '), /Coluna/);
  assert.match(validarConfigFluxo({ ...base, grafo: { ...base.grafo, arestas: [{ de: 3, para: 'JX' }] } }).erros.join(' '), /não existe/);
  assert.match(validarConfigFluxo({ ...base, fases: [{ fasId: 3, nome: 'a', tipo: 'xx' }] }).erros.join(' '), /inválida/);
});

test('estiloDaFase', () => {
  assert.deepEqual(estiloDaFase('erro'), { cls: 'err', mm: 'err' });
  assert.deepEqual(estiloDaFase('reprocessamento'), { cls: 'err', mm: 'err' });
  assert.deepEqual(estiloDaFase('espera'), { cls: 'wait', mm: 'wait' });
  assert.deepEqual(estiloDaFase('terminal'), { cls: 'final', mm: 'f' });
  assert.deepEqual(estiloDaFase('processo'), { cls: '', mm: '' });
});

const STATUS = normalizarStatus({ 3: { pastas: 10, imagens: 100 }, 7: { pastas: 5, imagens: 50 }, 93: { pastas: 2, imagens: 20 }, 12: { pastas: 1000, imagens: 9000 }, 109: { pastas: 127, imagens: 143004 }, 60: { pastas: 7, imagens: 70 }, 999: { pastas: 'x' }, abc: { pastas: 1 } });

test('normalizarStatus: chaves numéricas, valores inválidos viram 0, lixo é ignorado', () => {
  assert.equal(STATUS.get(3).pastas, 10);
  assert.equal(STATUS.get(999).pastas, 0);
  assert.equal(STATUS.has(NaN), false);
  assert.equal(normalizarStatus(null).size, 0);
});

test('RN-008: paradas = todas as fases menos FINALIZADO e espera; espera tem bloco próprio; resíduos (60) nunca entram', () => {
  const c = contadoresParados(CFG['certidoes'], STATUS);
  assert.deepEqual([c.pastas, c.imagens], [17, 170]);
  assert.deepEqual(c.espera, { pastas: 127, imagens: 143004 });
  assert.equal(contadoresParados(CFG['cartografia'], STATUS).espera, null, 'sem fase de espera não há bloco "Aguardando"');
  assert.equal(contadoresParados(CFG.inventarios, new Map()).pastas, 0);
});

test('miniIndicadores usa a fase de ENTRADA (Negativos entra por 50, não por 3) e a final', () => {
  assert.deepEqual(miniIndicadores(CFG['certidoes'], STATUS), { emAndamento: 10, finalizados: 1000 });
  assert.deepEqual(miniIndicadores(CFG.negativos, normalizarStatus({ 50: { pastas: 4, imagens: 1 }, 3: { pastas: 99, imagens: 1 } })).emAndamento, 4);
});

test('maiorCarga ignora a fase final e a de espera', () => {
  assert.equal(maiorCarga(CFG['certidoes'], STATUS), 10);
  assert.equal(maiorCarga(CFG.inventarios, new Map()), 0);
});

test('normalizarGestao: colunas na ordem da config, estados só quando vêm, faltando = zeros marcados', () => {
  const data = {
    fase3: { totaisMes: { TotalPastas: 12, TotalImagens: 345 }, grafico7Dias: [1, 2, 3, 4, 5, 6, 7], estados: { lista: [{ nome: 'SP', total: 3 }, { nome: 'MG', total: 2 }, null], total: 5 } },
    fase12: { totaisMes: { TotalPastas: 8, TotalImagens: 90 }, grafico7Dias: [0, 0, 0, 0, 0, 0, 0] },
  };
  const g = normalizarGestao({ gestaoColunas: [{ fasId: 3, titulo: 'A' }, { fasId: 7, titulo: 'B' }, { fasId: 12, titulo: 'C' }] }, data);
  assert.deepEqual(g.map((c) => c.fasId), [3, 7, 12]);
  assert.deepEqual([g[0].pastas, g[0].imagens, g[0].serie.length], [12, 345, 7]);
  assert.deepEqual(g[0].estados, { lista: [{ nome: 'SP', total: 3 }, { nome: 'MG', total: 2 }], total: 5 });
  assert.equal(g[1].ausente, true);
  assert.deepEqual([g[1].pastas, g[1].serie, g[1].estados], [0, [], null]);
  assert.equal(g[2].estados, null);
  assert.doesNotThrow(() => normalizarGestao(CFG.inventarios, null));
});

test('rotulosUltimos7Dias: dias reais, do mais antigo a hoje', () => {
  assert.deepEqual(rotulosUltimos7Dias(new Date(2026, 9, 3)), ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']);
});

test('FLX-13: indicador de sincronização (âmbar só quando atrasado; nunca sincronizou = aviso)', () => {
  const agora = new Date('2026-10-03T15:00:00-03:00');
  const ok = indicadorSincronizacao({ ultimaSincronizacao: '2026-10-03T14:48:00-03:00', atrasado: false }, agora);
  assert.match(ok.texto, /^Dados de \d{2}:\d{2} · há 12 min$/);
  assert.equal(ok.atrasado, false);
  assert.equal(indicadorSincronizacao({ ultimaSincronizacao: '2026-10-03T13:00:00-03:00', atrasado: true }, agora).atrasado, true);
  assert.deepEqual(indicadorSincronizacao({ ultimaSincronizacao: null, atrasado: true }, agora), { texto: 'Sem sincronização registrada', atrasado: true });
  assert.equal(indicadorSincronizacao(null, agora).atrasado, true);
});

test('normalizarPastas / normalizarPorLote', () => {
  const p = normalizarPastas([{ Fase: 'VALIDAÇÃO', Projeto: 'P', Lote: 'L1', Pasta: 'PA-1', Documentos: '3', Imagens: 40 }, null, 'x']);
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].documentos, p[0].imagens, p[0].pasta], [3, 40, 'PA-1']);
  assert.deepEqual(normalizarPorLote([{ Lote: 'INVENTARIOS', Pastas: 12, Imagens: 11115 }]), [{ lote: 'INVENTARIOS', pastas: 12, imagens: 11115 }]);
  assert.deepEqual(normalizarPastas(undefined), []);
});

test('normalizarRelatorioFase: totais da API, linhas, data ordenável (e índices certos com linhas inválidas no meio)', () => {
  const r = normalizarRelatorioFase({ totais: { pastas: 2, imagens: 90 }, lista: [{ Pasta: 'A', Imagens: 40, DataFinalizado: '02/10/2026 10:00' }, null, { Pasta: 'B', Imagens: 50, DataFinalizado: '03/10/2026 09:30' }] });
  assert.deepEqual(r.totais, { pastas: 2, imagens: 90 });
  assert.deepEqual(r.linhas.map((l) => l.pasta), ['A', 'B']);
  assert.equal(r.linhas[1].dataFinalizado, '03/10/2026 09:30');
  assert.ok(r.linhas[1]._ts > r.linhas[0]._ts);
  assert.equal(normalizarRelatorioFase({ lista: [{ Imagens: 5 }] }).totais.imagens, 5, 'sem totais, soma as linhas');
  assert.doesNotThrow(() => normalizarRelatorioFase(null));
});

test('card == soma da série: o servidor tira KPI e série do mesmo CTE (pastas e imagens batem)', () => {
  const cfg = CFG['cartografia'];
  const graficoMes = [{ dia: '2026-10-01', pastas: 2, imagens: 1800 }, { dia: '2026-10-02', pastas: 0, imagens: 0 }, { dia: '2026-10-03', pastas: 3, imagens: 2100 }];
  const dados = Object.fromEntries(cfg.gestaoColunas.map((c) => [`fase${c.fasId}`, { regra: 'entrada', totaisMes: { TotalPastas: 5, TotalImagens: 3900 }, graficoMes, grafico7Dias: [2, 0, 3] }]));
  for (const col of normalizarGestao(cfg, dados)) {
    assert.equal(col.serie.reduce((s, v) => s + v, 0), col.imagens, `${col.titulo}: série == card (imagens)`);
    assert.equal(graficoMes.reduce((s, x) => s + x.pastas, 0), col.pastas, `${col.titulo}: série == card (pastas)`);
  }
});

test('rótulos: o estoque de agora e o do mês não têm o mesmo nome; imagens da entrada são "digitalizadas"', async () => {
  const { analiseHtml } = await import('../../public/app/js/features/fluxo/analise.js');
  for (const id of ['cartografia', 'negativos']) {
    const h = analiseHtml(CFG[id]).toString();
    const entrada = CFG[id].fases.find((f) => f.tipo === 'entrada').fasId;
    assert.equal(h.includes('Imagens digitalizadas'), CFG[id].gestaoColunas.some((c) => c.fasId === entrada), `${id}: só a coluna de entrada diz "digitalizadas"`);
  }
  const fonte = fs.readFileSync(new URL('../../public/app/js/features/fluxo/fluxo.js', import.meta.url), 'utf8');
  const hub = fs.readFileSync(new URL('../../public/app/js/features/projetos/cartoes.js', import.meta.url), 'utf8');
  assert.match(fonte, /Na digitalização \(agora\)/); assert.match(fonte, /Finalizados \(total\)/);
  assert.match(hub, /Finalizados no mês/); assert.match(hub, /Na digitalização \(agora\)/);
});
