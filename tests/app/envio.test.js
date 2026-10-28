import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  instanciaValida, janelaValida, normalizarResumoEnvio, semDadosDeEnvio, situacaoDoBridge, taxaExibida, linhasDoFunil, etapaDoStatus, serieDeVazao, nomeDoFluxo, JANELA_PADRAO,
  textoDoAlerta, etapaDoEvento, ETAPA_ALERTA, PREFIXO_ALERTA,
} from '../../public/app/js/core/envio.js';

const CAT = JSON.parse(fs.readFileSync(new URL('../../public/app/config/projetos.json', import.meta.url), 'utf8'));
for (const p of CAT.projetos) { p.status = p.status || 'ativo'; p.sigla = p.sigla || p.nome; }

const RESUMO = {
  geradoEm: '2026-10-03T15:00:00-03:00',
  cartoes: { enviadasHoje: 24, pendentes: 4, divergenciasAbertas: 1, taxaConferenciaPct: 95.8 },
  funil: { naFila: 2, enviando: 1, conferindo: 1, concluida: 20, divergente: 1, erro: 0 },
  vazao: [{ t: '2026-10-03T14:55:00-03:00', arquivosMin: 42, mbSeg: 1.8 }, { t: '2026-10-03T14:50:00-03:00', arquivosMin: 30, mbSeg: 1.2 }],
  recentes: [{ pasta: 'ATLAS-CX-00231', fluxo: 'certidoes', status: 'concluida', resultado: 'ok', eventoTs: '2026-10-03T14:02:11-03:00' }],
  heartbeat: { ultimoTs: '2026-10-03T14:58:02-03:00', versao: '1.0.1', atrasado: false },
};

test('instância: mesmo formato que o servidor aceita (minúsculas, números, hífen; 3 a 60)', () => {
  assert.equal(instanciaValida('  Bridge-Cliente-X '), 'bridge-cliente-x');
  for (const x of ['ab', 'a'.repeat(61), 'com espaço', 'sub_traço', 'acentuação', '', null, undefined]) assert.equal(instanciaValida(x), null, String(x));
});

test('janela: só as oferecidas; o resto volta ao padrão', () => {
  assert.equal(janelaValida('72'), 72);
  assert.equal(janelaValida(168), 168);
  for (const x of [0, 5, 999, 'x', null]) assert.equal(janelaValida(x), JANELA_PADRAO);
});

test('resumo: normaliza o contrato B14, ordena a vazão no tempo e converte as datas', () => {
  const r = normalizarResumoEnvio(RESUMO);
  assert.deepEqual(r.cartoes, { enviadasHoje: 24, pendentes: 4, divergenciasAbertas: 1, taxaConferenciaPct: 95.8 });
  assert.equal(r.funil.concluida, 20);
  assert.deepEqual(r.vazao.map((v) => v.arquivosMin), [30, 42], 'do mais antigo ao mais novo');
  assert.equal(r.recentes[0].ts, Date.parse('2026-10-03T14:02:11-03:00'));
  assert.deepEqual(r.sinal, { ultimoTs: Date.parse('2026-10-03T14:58:02-03:00'), versao: '1.0.1', atrasado: false });
});

test('resumo: resposta torta não quebra — vira zeros/vazio/null, nunca valor inventado', () => {
  for (const lixo of [null, undefined, 'x', 5, {}, { cartoes: null, funil: [], vazao: 'a', recentes: [null, { sem: 'pasta' }], heartbeat: 3 }]) {
    const r = normalizarResumoEnvio(lixo);
    assert.equal(r.cartoes.enviadasHoje, 0);
    assert.equal(r.cartoes.taxaConferenciaPct, null);
    assert.deepEqual(r.vazao, []);
    assert.deepEqual(r.recentes, []);
    assert.deepEqual(r.sinal, { ultimoTs: null, versao: null, atrasado: null });
    assert.ok(semDadosDeEnvio(r));
  }
  assert.equal(normalizarResumoEnvio({ funil: { naFila: -3, erro: 'x' } }).funil.naFila, 0);
});

test('sem dados: só quando não há evento, funil, envio hoje nem sinal de vida', () => {
  assert.equal(semDadosDeEnvio(normalizarResumoEnvio(RESUMO)), false);
  assert.equal(semDadosDeEnvio(normalizarResumoEnvio({ heartbeat: { ultimoTs: '2026-10-03T14:58:02-03:00', atrasado: false } })), false, 'só o sinal de vida já é dado');
});

test('sinal de vida: ativo, atrasado (limite do servidor) e "sem sinal" (null ≠ atrasado)', () => {
  const agora = Date.parse('2026-10-03T15:00:00-03:00');
  const ok = situacaoDoBridge(normalizarResumoEnvio(RESUMO).sinal, agora);
  assert.equal(ok.nivel, 'ok'); assert.equal(Math.round(ok.idadeSeg), 118);
  assert.equal(situacaoDoBridge({ ultimoTs: agora - 3600e3, versao: null, atrasado: true }, agora).nivel, 'atrasado');
  assert.deepEqual(situacaoDoBridge({ ultimoTs: null, versao: null, atrasado: null }, agora), { nivel: 'sem-sinal', idadeSeg: null });
});

test('taxa de conferência: com nenhum envio hoje não mostra "100 %" (o servidor devolve 100 por padrão)', () => {
  assert.equal(taxaExibida({ enviadasHoje: 0, pendentes: 0, divergenciasAbertas: 0, taxaConferenciaPct: 100 }), null);
  assert.equal(taxaExibida({ enviadasHoje: 24, pendentes: 0, divergenciasAbertas: 0, taxaConferenciaPct: 95.8 }), 95.8);
});

test('funil: ordem do processo, barras relativas à maior etapa, zero não quebra', () => {
  const l = linhasDoFunil(normalizarResumoEnvio(RESUMO).funil);
  assert.deepEqual(l.map((x) => x.chave), ['naFila', 'enviando', 'conferindo', 'concluida', 'divergente', 'erro']);
  assert.equal(l.find((x) => x.chave === 'concluida').rel, 100);
  assert.equal(l.find((x) => x.chave === 'naFila').rel, 10);
  assert.ok(linhasDoFunil({}).every((x) => x.rel === 0 && x.total === 0));
});

test('estado do evento: rótulo em português e tom; status desconhecido é mostrado, não escondido', () => {
  assert.deepEqual([etapaDoStatus('na_fila').rotulo, etapaDoStatus('concluida').tom, etapaDoStatus('divergente').tom, etapaDoStatus('erro').tom], ['Na fila', 'ok', 'warn', 'err']);
  assert.equal(etapaDoStatus('em_analise').rotulo, 'em analise');
  assert.equal(etapaDoStatus('').rotulo, '—');
});

test('vazão: um eixo por vez (arquivos/min OU MB/s), rótulos HH:MM', () => {
  const v = normalizarResumoEnvio(RESUMO).vazao;
  assert.deepEqual(serieDeVazao(v, 'arquivos').valores, [30, 42]);
  assert.deepEqual(serieDeVazao(v, 'mb').valores, [1.2, 1.8]);
  assert.match(serieDeVazao(v, 'arquivos').rotulos[0], /^\d{2}:\d{2}$/);
  assert.deepEqual(serieDeVazao([], 'mb'), { valores: [], rotulos: [] });
});

test('fluxo: o servidor manda o id; a tela mostra o nome do catálogo (id desconhecido aparece como veio)', () => {
  assert.equal(nomeDoFluxo('certidoes', CAT), 'Certidões');
  assert.equal(nomeDoFluxo('fluxo-novo', CAT), 'fluxo-novo');
  assert.equal(nomeDoFluxo(null, CAT), '—');
});

test('alerta: a mensagem iniciada por "[ALERTA]" vira alerta, e o texto aparece sem o prefixo', () => {
  assert.equal(PREFIXO_ALERTA, '[ALERTA]');
  assert.equal(textoDoAlerta('[ALERTA] Pasta "lixo" fora do padrão'), 'Pasta "lixo" fora do padrão');
  assert.equal(textoDoAlerta('[ALERTA]sem espaço'), 'sem espaço');
  assert.equal(textoDoAlerta('[ALERTA] '), '', 'só o prefixo continua sendo alerta');
  for (const x of ['Falha ao enviar', ' [ALERTA] com espaço antes', '[alerta] minúsculo', 'texto [ALERTA] no meio', '', null, undefined, 5, {}]) assert.equal(textoDoAlerta(x), null, String(x));
});

test('alerta: recentes marca o evento, guarda o texto sem prefixo e não afeta eventos sem mensagem (contrato aditivo)', () => {
  const r = normalizarResumoEnvio({
    ...RESUMO,
    recentes: [
      { pasta: 'lixo', fluxo: 'certidoes', status: 'erro', resultado: 'erro', eventoTs: '2026-10-03T14:05:00-03:00', mensagem: '[ALERTA] Pasta "lixo" não casa com o padrão' },
      { pasta: 'ATLAS-CX-00231', fluxo: 'certidoes', status: 'erro', resultado: 'erro', eventoTs: '2026-10-03T14:04:00-03:00' },
      { pasta: 'ATLAS-CX-00232', status: 'erro', resultado: 'erro', eventoTs: '2026-10-03T14:03:00-03:00', mensagem: 'Falha de rede ao enviar' },
    ],
  });
  const [alerta, comum, comMensagem] = r.recentes;
  assert.equal(alerta.alerta, true);
  assert.equal(alerta.detalhe, 'Pasta "lixo" não casa com o padrão');
  assert.equal(alerta.status, 'erro', 'o status segue sendo erro: nenhum status novo');
  assert.deepEqual([comum.alerta, comum.detalhe], [false, null]);
  assert.deepEqual([comMensagem.alerta, comMensagem.detalhe], [false, null], 'mensagem de erro comum não vira alerta nem é exibida');
});

test('alerta: etapa exibida tem tom de atenção distinto do erro comum; as contagens do funil não mudam', () => {
  const alerta = { status: 'erro', alerta: true };
  const comum = { status: 'erro', alerta: false };
  assert.equal(etapaDoEvento(alerta), ETAPA_ALERTA);
  assert.deepEqual([etapaDoEvento(alerta).rotulo, etapaDoEvento(alerta).tom], ['Alerta', 'warn']);
  assert.deepEqual([etapaDoEvento(comum).rotulo, etapaDoEvento(comum).tom], ['Erro', 'err']);
  assert.notEqual(etapaDoEvento(alerta).tom, etapaDoEvento(comum).tom);
  const base = normalizarResumoEnvio(RESUMO);
  const comAlerta = normalizarResumoEnvio({ ...RESUMO, recentes: [{ pasta: 'lixo', status: 'erro', eventoTs: '2026-10-03T14:05:00-03:00', mensagem: '[ALERTA] x' }] });
  assert.deepEqual(comAlerta.funil, base.funil);
  assert.deepEqual(comAlerta.cartoes, base.cartoes);
});
