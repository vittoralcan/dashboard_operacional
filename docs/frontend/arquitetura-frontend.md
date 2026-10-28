# Frontend: arquitetura

> SPA em JavaScript puro (módulos ES nativos), sem framework, sem bundler e sem dependência de terceiros em tempo de execução. Serve como arquivos estáticos em qualquer hospedagem.

## 1. Regras do frontend (`RNB-0xx`)

| ID | Regra |
|---|---|
| **RNB-002** | Sem framework e sem bundler obrigatório: `<script type="module">` e `import()` dinâmico por rota |
| **RNB-003** | Uma tela de fluxo para todas as instâncias, dirigida por configuração. Proibido copiar a tela para um fluxo novo |
| **RNB-004** | Todo texto dinâmico é escapado pela *template tag* `html` (ou `textContent`/`setAttribute`) |
| **RNB-005** | Tokens, não valores: cores, raios, durações e sombras só por `var(--…)`. Hexadecimal só em `css/tokens.css` |
| **RNB-006** | Acessibilidade AA: contraste, foco visível, teclado, `aria-*` e `prefers-reduced-motion`. O axe roda no E2E em todas as telas, nos dois temas |
| **RNB-007** | "Em breve" em vez de esconder: um recurso que depende de rota ainda não publicada aparece no lugar certo, marcado "Em breve", sem fazer requisição. `js/config/recursos.js` é o registro; um 404 do servidor também liga o "Em breve" |
| **RNB-008** | Cada bloco de dado tem três estados (skeleton com `aria-busy`, vazio ilustrado e erro inline com "Tentar novamente"), e um bloco que falha não derruba os vizinhos |
| **RNB-009** | A animação mostra trabalho real: nada de atraso artificial acima do piso de `DURACAO_MIN_LOGIN_MS` |
| **RNB-010** | "Atualizado há N" é a idade do dado (RN-012), nunca um contador decorativo |
| **RNB-011** | Zero dado fabricado em produção: sem dado, a tela mostra vazio ou "—". O modo demonstração do showcase é uma entrada separada (`demo.html`) e não altera o `index.html` |
| **RNB-013** | Contratos aditivos: o front ignora campos desconhecidos e tolera opcionais ausentes |
| **RNB-014** | Sem terceiros em tempo de execução: fontes, ícones e bibliotecas hospedados no próprio domínio, com versão fixa e SRI |
| **RNB-015** | Orçamento de desempenho (§5); estourar reprova o CI |

## 2. Estrutura

```text
public/app/
├── index.html            a casca: camadas auth, shell, macro e tablet; CSS e o módulo js/main.js
├── demo.html             a mesma casca com a API simulada (só no showcase)
├── .htaccess             CSP, cabeçalhos de segurança, cache e compressão
├── config/               projetos.json (catálogo e menus) e fluxos/<instancia>.json (grafo local)
├── css/                  tokens.css (única fonte de cor) · base · components · overlays · shell · motion · screens/*
├── assets/               fontes Geist (woff2), sprite de ícones (icons.svg), logo
├── vendor/               xlsx e html5-qrcode com versão no nome (carregados sob demanda)
└── js/
    ├── main.js           boot: tema, sessão, catálogo, roteador, atalhos
    ├── config.js         bases de API por ambiente (localhost → serviços locais)
    ├── rotas.js          tabela de rotas, cada tela carregada por import()
    ├── core/             lógica pura e testável: api, auth, router, store, html, format, fluxo, gargalos,
    │                     metas, envio, operacional, relatórios, paleta (fuzzy), atalhos…
    ├── ui/               componentes: modal, drawer, toast, tooltip, tabela densa, gráficos SVG,
    │                     calendário, skeleton, spotlight, scanner…
    └── features/         telas: auth, projetos, fluxo, macro, metas, envio, monitoramento, shell,
                          tablet, digitalizacao, operacional, usuarios
```

`core/` não toca o DOM. É onde mora a lógica coberta por ~360 testes unitários (`node --test`, sem dependências). `features/` monta as telas com `ui/`.

## 3. Peças centrais

- **Roteador por hash** (`#/rota`, `core/router.js`): funciona em hospedagem estática sem reescrita de URL e preserva o botão Voltar. Cada rota declara a camada (`auth`, `shell`, `macro`, `tablet`), o acesso (`publica`, `logado`, `admin`, `gestao`, `turno`) e o skeleton.
- **Cliente HTTP** (`core/api.js`): timeout, *retry* com *backoff* só em GET (502/503/504 e rede), `ETag`/`If-None-Match`, erros normalizados em português, e o `Authorization` só para as bases configuradas.
- **Sessão**: JWT e usuário no `localStorage`; um 401 limpa a sessão e volta ao login; o primeiro acesso obriga a troca de senha.
- **Template tag `html`** (`core/html.js`): escapa toda interpolação; `raw()` marca HTML confiável.
- **Polling consciente**: 30–60 s, só com a aba visível, barato graças ao `304`.

## 4. Telas

| Rota | Tela |
|---|---|
| `#/login`, `#/primeiro-acesso` | Login com animação de etapas reais e troca obrigatória de senha |
| `#/projetos` | Seleção de projetos: cartões com KPI do mês, sparkline, meta, gargalos e atividade recente |
| `#/atlas` | Hub do projeto com os fluxos agrupados por suporte (negativos e papel) |
| `#/atlas/<fluxo>` e `…/fluxograma` | Análise de produção (KPIs, meta, projeção, imagens por dia, tipologia, relatório XLSX/CSV) e fluxograma interativo (zoom, minimapa, modal por fase, gargalo realçado) |
| `#/macro-view` | Modo TV em tela cheia: rotaciona os projetos com intervalo configurável |
| `#/metas` | Metas mensais por projeto e fluxo (admin) |
| `#/envio` | Acompanhamento do Bridge: sinal de vida, funil, vazão e eventos |
| `#/boreal/monitoramento` | Monitoramento de APIs |
| `#/tablet`, `#/digitalizacao` | Telas do operador (perfil `turno`): bipagem, pausa, conclusão, dados da digitalização |
| `#/operacional/caixas`, `…/correcoes`, `…/relatorios`, `…/cadastros` | Gestão do operacional: caixas ao vivo, correções auditadas, relatório hora a hora e tempo médio, cadastros |
| `#/perfil`, `#/usuarios/novo` | Perfil e preferências; criação de usuário (admin) |
| `#/_ui` | Catálogo de componentes (só em `localhost`) |

Transversais: paleta de comandos (`Ctrl+K`, busca *fuzzy* sem acento), atalhos de teclado em acorde (`G` e depois uma letra), central de notificações, tema claro e escuro sem *flash*, barra lateral recolhível e layout responsivo até o celular.

## 5. Desempenho (RNB-015)

| Métrica | Orçamento (gzip) |
|---|---|
| JS da casca + login | ≤ 60 KB |
| JS de cada tela (sob demanda) | ≤ 40 KB |
| CSS total | ≤ 40 KB |
| Fontes | ≤ 120 KB |
| Sprite de ícones | ≤ 25 KB |

`node scripts/app-orcamentos.mjs` mede tudo, e o teste `tests/app/orcamentos.test.js` reprova o que estourar. A biblioteca XLSX só carrega ao clicar em Exportar.

## 6. Design system

Tema escuro (padrão) e claro definidos só por tokens em `css/tokens.css`. Tipografia Geist e Geist Mono. Gráficos SVG próprios (linha, barras, sparkline, anel) que herdam as cores por `var(--…)`, então trocar o tema não redesenha. Animações só de `transform`/`opacity`, todas desligadas com `prefers-reduced-motion`.

## 7. Testes

```bash
npm run test:front                            # ~360 testes unitários das funções puras (sem dependências)
npm run orcamentos                            # orçamentos de desempenho
cd tests/e2e && npm ci && npx playwright test # E2E + axe, com APIs simuladas por contrato e a CSP em modo bloqueio
```

O E2E falha se aparecer erro de JavaScript não tratado, violação de CSP ou requisição a domínio de terceiros (`tests/e2e/fixtures.mjs`).
