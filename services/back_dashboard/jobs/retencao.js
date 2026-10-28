// Retenção diária de painel.* (backend_spec.md §3.1/§5). Oneshot, agendado
// pelo timer do systemd — mesmo padrão de jobs/monitor.js.
//
//   node jobs/retencao.js
//
// Env: as mesmas PG_PAINEL_* do back_dashboard.

const { criarPoolPainel } = require('../src/core/db-painel');

function logger() {
    const prefixo = '[retencao]';
    return {
        info: (msg) => console.log(`${prefixo} ${msg}`),
        erro: (msg) => console.error(`${prefixo} ${msg}`),
    };
}

// Cada entrada: tabela, coluna de data e retenção (dias). `envio_caixa` usa
// `recebido_ts` (não `evento_ts`) — é quando o painel soube do evento, não
// quando ele aconteceu no Bridge (podem divergir se o Bridge reenviar depois
// de ficar offline, RN-016).
const REGRAS = [
    { tabela: 'painel.notificacao', coluna: 'criado_em', dias: 30 },
    { tabela: 'painel.auditoria', coluna: 'em', dias: 180 },
    { tabela: 'painel.monitor_verificacao', coluna: 'em', dias: 30 },
    { tabela: 'painel.envio_caixa', coluna: 'recebido_ts', dias: 180 },
];

async function main() {
    const log = logger();
    const dbPainel = criarPoolPainel();

    try {
        for (const { tabela, coluna, dias } of REGRAS) {
            try {
                // `tabela`/`coluna` vêm só da constante REGRAS acima (nunca de
                // entrada externa) — a interpolação aqui é segura; `dias` é o
                // único valor variável, e vai parametrizado ($1).
                const { rowCount } = await dbPainel.query(
                    `DELETE FROM ${tabela} WHERE ${coluna} < now() - ($1 || ' days')::interval`,
                    [dias]
                );
                log.info(`${tabela}: ${rowCount} linha(s) apagada(s) (> ${dias} dias).`);
            } catch (erro) {
                // Uma tabela que ainda não existe (ex.: envio_caixa antes da
                // migração 01-db-dashboard-envio.sql rodar) não deve impedir a
                // retenção das demais — RNB-007 em espírito.
                log.erro(`falha ao limpar ${tabela}: ${erro.message}`);
            }
        }
    } finally {
        await dbPainel.end();
    }
}

main().catch((erro) => {
    console.error('[retencao] encerrado com erro:', erro.message);
    process.exitCode = 1;
});
