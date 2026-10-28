# Testes E2E do front (Playwright + axe)

Cobrem `public/app/` ponta a ponta **sem backend**: as APIs (`back_auth`, `back_dashboard` e o Apps Script do Monitoramento) são simuladas por contrato em [`mock-api.mjs`](mock-api.mjs), seguindo `docs/api/` ([back-dashboard.md](../../docs/api/back-dashboard.md), [auth.md](../../docs/api/auth.md)).

| Arquivo | O que prova |
|---|---|
| `acesso.spec.mjs` | login ok/erro/429, primeiro acesso, guarda de rota e destino pós-login, papéis (admin × padrão), Sair, 401 |
| `navegacao.spec.mjs` | atalhos `G`+letra, paleta (`Ctrl K`), Esc e foco devolvido, tema persistido, movimento reduzido, "Voltar à versão anterior" |
| `fluxograma.spec.mjs` | zoom/ajuste/minimapa, modal da fase, foco vindo de notificação |
| `regras-de-negocio.spec.mjs` | **RN-008** (contador do fluxo) |
| `blocos.spec.mjs` | blocos carregados sob demanda (gargalos, atividade, barra lateral) e o recuo para "Em breve" com backend antigo (404) |
| `envio.spec.mjs` | acompanhamento do Bridge (`#/envio`): instância lembrada, cartões, funil, vazão, eventos (texto escapado), sinal de vida, estado vazio, 500, 404 |
| `csp.spec.mjs` | CSP do `.htaccess` sem violação, cabeçalhos, registrador `dsn-csp`, xlsx e leitor de QR sob a CSP |
| `acessibilidade.spec.mjs` | axe-core em 19 telas × 2 temas (reprova grave/crítica) + "teste do teste" |
| `responsivo.spec.mjs` | 15 telas × 5 larguras (1920 → 390 px) sem rolagem horizontal da página |

**A CSP é a de verdade.** [`servidor.mjs`](servidor.mjs) serve `public/` e lê a política de `public/app/.htaccess`, aplicando-a em modo **bloqueio** (com as APIs locais do modo DEV acrescentadas). Toda tela é vigiada por uma fixture automática ([`fixtures.mjs`](fixtures.mjs)): erro de JavaScript, violação de CSP ou requisição a terceiros **reprova o teste**.

## Rodar

```bash
cd tests/e2e
npm ci                      # uma vez
npx playwright test         # tudo (usa o Chrome instalado; no CI usa o Chromium do Playwright)
npx playwright test acesso  # um arquivo
npx playwright test --ui    # modo interativo
```

* Porta `4173` (`E2E_PORTA` muda). O servidor sobe sozinho.
* Sem Chrome local? `npx playwright install chromium` e rode com `CI=1`.
* Os testes unitários (sem dependências) ficam em `tests/app/` e rodam com `node --test "tests/app/*.test.js"` na raiz.
* Orçamentos de desempenho: `node scripts/app-orcamentos.mjs`.
