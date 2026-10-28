// Testes de POST /envio/eventos e GET /envio/resumo (B12/B14, docs/api/envio-bridge.md).
//
//   npm test                                  → só os testes com banco simulado (stub)
//   PG_TESTE_URL=postgres://… npm test        → também valida o INSERT/SELECT reais
//
// Os testes "com Postgres" precisam de um banco descartável que já tenha as tabelas de
// ops/01-db-dashboard-envio.sql no schema `painel` (sem o SET ROLE). Eles só apagam as linhas
// das instâncias `it-*` que eles mesmos criam; sem PG_TESTE_URL são pulados.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { criarEnvioRouter } = require('../src/core/envio');

const PG_TESTE_URL = process.env.PG_TESTE_URL;
const SQL_INSERT = /INSERT INTO painel\.envio_caixa/;

// O limitador de /envio/eventos é de módulo e chaveado por `instancia`: cada teste usa a sua.
let seq = 0;
const novaInstancia = (prefixo = 'tst') => `${prefixo}-${process.pid}-${(seq += 1)}`;

const servico = (instancia) => ({ tipo: 'servico', escopo: ['envio'], instancia });
const evento = (pasta, extra = {}) => ({
    pasta, status: 'concluida', resultado: 'ok', arquivos: 10, bytes: 1000, duracaoS: 5,
    eventoTs: '2026-10-03T14:02:11-03:00', ...extra,
});

async function subir(dbPainel, usuario) {
    const app = express();
    app.use((req, _res, next) => { req.usuario = usuario; next(); });
    app.use('/api', criarEnvioRouter({ dbPainel }));
    const servidor = http.createServer(app);
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    const base = `http://127.0.0.1:${servidor.address().port}/api`;
    return {
        async postar(corpo) {
            const r = await fetch(`${base}/envio/eventos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
            return { status: r.status, json: await r.json() };
        },
        async heartbeat(corpo) {
            const r = await fetch(`${base}/envio/heartbeat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
            return { status: r.status, json: await r.json() };
        },
        async resumo(instancia) {
            const r = await fetch(`${base}/envio/resumo?instancia=${encodeURIComponent(instancia)}&horas=24`);
            return { status: r.status, json: await r.json() };
        },
        fechar: () => new Promise((ok) => servidor.close(ok)),
    };
}

// Banco simulado: guarda os INSERTs e deixa o teste decidir quando um deles falha.
function bancoSimulado({ falhar } = {}) {
    const inserts = [];
    return {
        inserts,
        async query(sql, params) {
            if (SQL_INSERT.test(sql)) {
                const erro = falhar?.(params);
                if (erro) throw erro;
                inserts.push(params);
                return { rows: [], rowCount: 1 };
            }
            throw new Error(`consulta inesperada: ${sql.slice(0, 40)}`);
        },
    };
}

const erroPg = (code, message = 'detalhe interno do driver: SELECT secreto') => Object.assign(new Error(message), { code });

// Silencia o console.error esperado das rotas durante um teste e devolve o que foi logado.
function capturarLog(fn) {
    const original = console.error;
    const linhas = [];
    console.error = (...args) => linhas.push(args.join(' '));
    return fn().finally(() => { console.error = original; }).then((r) => ({ r, linhas }));
}

// --------------------------------------------------------------------------- (a) fluxo/projeto
test('fluxo ou projeto com mais de 30 caracteres: só esse evento é rejeitado, o resto do lote é aceito', async () => {
    const instancia = novaInstancia();
    const db = bancoSimulado();
    const srv = await subir(db, servico(instancia));
    try {
        const r = await srv.postar({
            instancia,
            eventos: [
                evento('CX-1', { fluxo: 'certidoes' }),
                evento('CX-2', { fluxo: 'f'.repeat(31) }),
                evento('CX-3', { projeto: 'p'.repeat(31) }),
                evento('CX-4', { fluxo: 'f'.repeat(30), projeto: 'p'.repeat(30) }), // limite exato passa
                evento('CX-5', { fluxo: 42 }),
                evento('CX-6', { fluxo: null, projeto: null }),
            ],
        });
        assert.equal(r.status, 200);
        assert.equal(r.json.data.aceitos, 3);
        assert.deepEqual(r.json.data.rejeitados.map((x) => x.indice), [1, 2, 4]);
        assert.match(r.json.data.rejeitados[0].motivo, /"fluxo".*30/);
        assert.match(r.json.data.rejeitados[1].motivo, /"projeto".*30/);
        assert.deepEqual(db.inserts.map((p) => p[3]), ['CX-1', 'CX-4', 'CX-6'], 'só os válidos chegaram ao banco');
    } finally { await srv.fechar(); }
});

// --------------------------------------------------------------------------- (b) falha de INSERT
test('falha de dados no INSERT de um evento vira rejeitado, sem vazar o erro do driver, e o lote continua', async () => {
    const instancia = novaInstancia();
    const db = bancoSimulado({ falhar: (p) => (p[3] === 'CX-2' ? erroPg('22001') : p[3] === 'CX-3' ? erroPg('23514') : null) });
    const srv = await subir(db, servico(instancia));
    try {
        const { r, linhas } = await capturarLog(() => srv.postar({ instancia, eventos: [evento('CX-1'), evento('CX-2'), evento('CX-3'), evento('CX-4')] }));
        assert.equal(r.status, 200);
        assert.equal(r.json.data.aceitos, 2);
        assert.deepEqual(r.json.data.rejeitados.map((x) => x.indice), [1, 2]);
        const corpo = JSON.stringify(r.json);
        assert.doesNotMatch(corpo, /driver|SELECT|secreto|22001|23514|INSERT/i, 'RNB-B5: nada do driver na resposta');
        assert.deepEqual(db.inserts.map((p) => p[3]), ['CX-1', 'CX-4']);
        assert.ok(linhas.some((l) => l.includes('22001') && l.includes('secreto')), 'o detalhe fica no log do servidor');
    } finally { await srv.fechar(); }
});

test('indisponibilidade do banco NÃO é engolida: 5xx genérico para o Bridge tentar de novo', async () => {
    const casos = [erroPg('ECONNREFUSED'), erroPg('08006'), erroPg('57P01'), erroPg('53300'), erroPg('42P01'), new Error('Connection terminated unexpectedly')];
    for (const erro of casos) {
        const instancia = novaInstancia();
        const srv = await subir(bancoSimulado({ falhar: () => erro }), servico(instancia));
        try {
            const { r } = await capturarLog(() => srv.postar({ instancia, eventos: [evento('CX-1'), evento('CX-2')] }));
            assert.equal(r.status, 500, String(erro.code || erro.message));
            assert.equal(r.json.success, false);
            assert.doesNotMatch(JSON.stringify(r.json), /secreto|ECONN|driver|terminated/i);
        } finally { await srv.fechar(); }
    }
});

// --------------------------------------------------------------------------- (c) alerta
test('evento "[ALERTA] …" (status erro) é aceito e armazenado como erro, com a mensagem original', async () => {
    const instancia = novaInstancia();
    const db = bancoSimulado();
    const srv = await subir(db, servico(instancia));
    const mensagem = '[ALERTA] Pasta "lixo" na entrega do fluxo X não casa com o padrão';
    try {
        const r = await srv.postar({ instancia, eventos: [evento('lixo', { status: 'erro', resultado: 'erro', fluxo: 'certidoes', mensagem })] });
        assert.equal(r.status, 200);
        assert.deepEqual(r.json.data, { aceitos: 1, rejeitados: [] });
        const [params] = db.inserts;
        // ordem do INSERT: instancia, projeto, fluxo, pasta, status, arquivos, bytes, duracao_s, resultado, mensagem, evento_ts
        assert.equal(params[3], 'lixo');
        assert.equal(params[4], 'erro');
        assert.equal(params[8], 'erro');
        assert.equal(params[9], mensagem);
    } finally { await srv.fechar(); }
});

// --------------------------------------------------------------------------- (d) idempotência
test('idempotência: o INSERT continua com ON CONFLICT DO NOTHING na chave única e o formato da resposta não mudou', async () => {
    const instancia = novaInstancia();
    let sqlVisto = '';
    const db = { async query(sql) { sqlVisto = sql; return { rows: [], rowCount: 0 }; } }; // 0 linhas = conflito ignorado
    const srv = await subir(db, servico(instancia));
    try {
        const r = await srv.postar({ instancia, eventos: [evento('CX-1')] });
        assert.equal(r.status, 200);
        assert.deepEqual(Object.keys(r.json.data).sort(), ['aceitos', 'rejeitados']);
        assert.match(sqlVisto, /ON CONFLICT \(instancia, pasta, status, evento_ts\) DO NOTHING/);
    } finally { await srv.fechar(); }
});

// --------------------------------------------------------------------------- recentes (tarefa 2, lado servidor)
test('GET /envio/resumo: "recentes" traz a mensagem só nos alertas, truncada; os demais itens não mudam de formato', async () => {
    const instancia = novaInstancia();
    const longa = `[ALERTA] ${'x'.repeat(400)}`;
    const ts = new Date('2026-10-03T17:02:11Z');
    const db = {
        async query(sql) {
            if (/WITH ultimo/.test(sql)) return { rows: [{ enviadas_hoje: 0, conferidas_hoje: 0, ok_hoje: 0, divergencias_abertas: 0, pendentes: 0 }] };
            if (/LIMIT/.test(sql)) {
                return { rows: [
                    { pasta: 'lixo', fluxo: 'certidoes', status: 'erro', resultado: 'erro', evento_ts: ts, mensagem: longa },
                    { pasta: 'CX-1', fluxo: null, status: 'concluida', resultado: 'ok', evento_ts: ts, mensagem: null },
                ] };
            }
            return { rows: [] };
        },
    };
    const srv = await subir(db, { tipo: 'standard' });
    try {
        const { status, json } = await srv.resumo(instancia);
        assert.equal(status, 200);
        const [alerta, normal] = json.data.recentes;
        assert.equal(alerta.mensagem.length, 300);
        assert.ok(alerta.mensagem.startsWith('[ALERTA] ') && alerta.mensagem.endsWith('…'));
        assert.deepEqual(Object.keys(normal).sort(), ['eventoTs', 'fluxo', 'pasta', 'resultado', 'status'], 'sem "mensagem" fora dos alertas');
    } finally { await srv.fechar(); }
});

// --------------------------------------------------------------------------- instancia / heartbeat
test('instancia com mais de 60 caracteres: 400 em eventos e em heartbeat, sem tocar no banco', async () => {
    const instancia = `${novaInstancia()}-${'x'.repeat(60)}`;
    const db = bancoSimulado();
    const srv = await subir(db, servico(instancia));
    try {
        const r = await srv.postar({ instancia, eventos: [evento('CX-1')] });
        assert.equal(r.status, 400);
        assert.match(r.json.message, /"instancia".*60/);
        const hb = await srv.heartbeat({ instancia, versao: '1.0.1' });
        assert.equal(hb.status, 400);
        assert.equal(db.inserts.length, 0);
    } finally { await srv.fechar(); }
});

test('heartbeat: versao longa é cortada em 20, não-texto é ignorado — nunca vira 500', async () => {
    const instancia = novaInstancia();
    const chamadas = [];
    const db = { async query(sql, params) { chamadas.push(params); return { rows: [], rowCount: 1 }; } };
    const srv = await subir(db, servico(instancia));
    try {
        for (const versao of ['v'.repeat(35), '  1.0.1  ', 42, { a: 1 }, '', null, undefined]) {
            const r = await srv.heartbeat({ instancia, versao });
            assert.equal(r.status, 200, String(JSON.stringify(versao)));
        }
        assert.deepEqual(chamadas.map((p) => p[1]), ['v'.repeat(20), '1.0.1', null, null, null, null, null]);
    } finally { await srv.fechar(); }
});

// --------------------------------------------------------------------------- Postgres real
if (PG_TESTE_URL) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: PG_TESTE_URL });
    const limpar = () => pool.query(`DELETE FROM painel.envio_caixa WHERE instancia LIKE 'it-%'`);
    before(limpar);
    after(async () => { await limpar(); await pool.end(); });

    const linhas = async (instancia) => (await pool.query('SELECT * FROM painel.envio_caixa WHERE instancia = $1 ORDER BY pasta', [instancia])).rows;

    test('[Postgres] lote misto: fluxo longo, valor fora da faixa do INTEGER e alerta — o banco real recebe o resto', async () => {
        const instancia = novaInstancia('it');
        const srv = await subir(pool, servico(instancia));
        try {
            const { r, linhas: log } = await capturarLog(async () => srv.postar({
                instancia,
                eventos: [
                    evento('CX-1', { fluxo: 'certidoes' }),
                    evento('CX-2', { fluxo: 'f'.repeat(31) }),            // barrado na validação
                    evento('CX-3', { arquivos: 3_000_000_000 }),          // inteiro JS, mas estoura o INTEGER → 22003 no banco
                    evento('lixo', { status: 'erro', resultado: 'erro', mensagem: '[ALERTA] Pasta "lixo" fora do padrão' }),
                ],
            }));
            assert.equal(r.status, 200);
            assert.equal(r.json.data.aceitos, 2);
            assert.deepEqual(r.json.data.rejeitados.map((x) => x.indice), [1, 2]);
            assert.doesNotMatch(JSON.stringify(r.json), /integer|out of range|varying/i);
            assert.ok(log.some((l) => l.includes('22003')), 'o erro real do Postgres foi classificado como erro de dado');
            const gravadas = await linhas(instancia);
            assert.deepEqual(gravadas.map((l) => l.pasta), ['CX-1', 'lixo']);
            const alerta = gravadas.find((l) => l.pasta === 'lixo');
            assert.equal(alerta.status, 'erro');
            assert.equal(alerta.resultado, 'erro');
            assert.equal(alerta.mensagem, '[ALERTA] Pasta "lixo" fora do padrão');
        } finally { await srv.fechar(); }
    });

    test('[Postgres] idempotência: reenviar o mesmo lote não duplica nem dá erro', async () => {
        const instancia = novaInstancia('it');
        const srv = await subir(pool, servico(instancia));
        try {
            const corpo = { instancia, eventos: [evento('CX-1'), evento('CX-2', { status: 'divergente', resultado: 'divergente' })] };
            const um = await srv.postar(corpo);
            const dois = await srv.postar(corpo);
            assert.equal(um.status, 200);
            assert.equal(dois.status, 200);
            assert.deepEqual(dois.json.data, { aceitos: 2, rejeitados: [] });
            assert.equal((await linhas(instancia)).length, 2);
        } finally { await srv.fechar(); }
    });

    test('[Postgres] GET /envio/resumo roda inteiro e "recentes" traz o alerta com a mensagem truncada', async () => {
        const instancia = novaInstancia('it');
        const agora = new Date().toISOString();
        const srvEscrita = await subir(pool, servico(instancia));
        const srvLeitura = await subir(pool, { tipo: 'standard' });
        try {
            await srvEscrita.postar({ instancia, eventos: [
                evento('CX-1', { eventoTs: agora, fluxo: 'negativos' }),
                evento('lixo', { eventoTs: agora, status: 'erro', resultado: 'erro', mensagem: `[ALERTA] ${'y'.repeat(450)}` }),
            ] });
            const { status, json } = await srvLeitura.resumo(instancia);
            assert.equal(status, 200, JSON.stringify(json));
            const { recentes, cartoes, vazao } = json.data;
            assert.equal(recentes.length, 2);
            const alerta = recentes.find((x) => x.pasta === 'lixo');
            const normal = recentes.find((x) => x.pasta === 'CX-1');
            assert.equal(alerta.mensagem.length, 300);
            assert.equal('mensagem' in normal, false);
            assert.equal(cartoes.enviadasHoje, 1);
            assert.ok(Array.isArray(vazao) && vazao.length > 0);
        } finally { await srvEscrita.fechar(); await srvLeitura.fechar(); }
    });

    test('[Postgres] recentes: uma rajada de alertas não expulsa os eventos normais (até 10 alertas entre os 20)', async () => {
        const instancia = novaInstancia('it');
        const srvEscrita = await subir(pool, servico(instancia));
        const srvLeitura = await subir(pool, { tipo: 'standard' });
        const base = Date.now();
        const ts = (minutosAtras) => new Date(base - minutosAtras * 60000).toISOString();
        try {
            // 25 alertas (mais novos) e 25 eventos normais (mais antigos): sem o teto, os 20 recentes seriam só alertas.
            const alertas = Array.from({ length: 25 }, (_, i) => evento(`lixo-${i}`, { status: 'erro', resultado: 'erro', eventoTs: ts(i + 1), mensagem: `[ALERTA] pasta ${i}` }));
            const normais = Array.from({ length: 25 }, (_, i) => evento(`CX-${i}`, { eventoTs: ts(100 + i) }));
            const r = await srvEscrita.postar({ instancia, eventos: [...alertas, ...normais] });
            assert.equal(r.json.data.aceitos, 50);
            const { json } = await srvLeitura.resumo(instancia);
            const { recentes } = json.data;
            assert.equal(recentes.length, 20);
            const doAlerta = recentes.filter((x) => 'mensagem' in x);
            assert.equal(doAlerta.length, 10);
            assert.deepEqual(doAlerta.map((x) => x.pasta), Array.from({ length: 10 }, (_, i) => `lixo-${i}`), 'os 10 alertas mais recentes');
            assert.equal(recentes.length - doAlerta.length, 10, 'o restante são eventos normais');
            const tempos = recentes.map((x) => Date.parse(x.eventoTs));
            assert.deepEqual(tempos, [...tempos].sort((a, b) => b - a), 'continua em ordem do mais novo para o mais antigo');
        } finally { await srvEscrita.fechar(); await srvLeitura.fechar(); }
    });

    test('[Postgres] heartbeat: versao de 35 caracteres é gravada cortada em 20 e instancia longa não chega ao banco', async () => {
        const instancia = novaInstancia('it');
        const srv = await subir(pool, servico(instancia));
        try {
            const r = await srv.heartbeat({ instancia, versao: 'v'.repeat(35) });
            assert.equal(r.status, 200);
            const { rows } = await pool.query('SELECT versao FROM painel.envio_heartbeat WHERE instancia = $1', [instancia]);
            assert.equal(rows[0].versao, 'v'.repeat(20));
        } finally {
            await pool.query('DELETE FROM painel.envio_heartbeat WHERE instancia = $1', [instancia]);
            await srv.fechar();
        }
    });
}
