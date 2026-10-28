# Modo demonstração

> O showcase roda **sem backend, sem banco e sem instalar dependências**. A demonstração usa o mesmo frontend da produção, com uma API simulada que vive no navegador e responde com dados fictícios.

## Como rodar

Requisito: Node.js 20.6 ou mais novo.

```bash
npm run demo                       # http://localhost:4173/app/demo.html
DEMO_PORTA=8080 npm run demo       # em outra porta
```

O servidor (`scripts/servir-demo.mjs`) só serve arquivos estáticos de `public/`. Ele aplica a mesma CSP do `public/app/.htaccess`, em modo bloqueio, como faz o E2E, então a demonstração também prova que o app funciona sem violar a política.

Como é só estático, `public/` também pode ir para o GitHub Pages ou qualquer hospedagem estática. Aponte a página inicial para `app/demo.html`.

## Usuários

| Usuário | Senha | Perfil | Vê |
|---|---|---|---|
| `gestor` | `gestor123` | admin | Todas as telas de gestão, metas, cadastros operacionais e correções |
| `operador` | `operador123` | turno | Só o tablet do turno e a digitalização. Bipe um código como `AC-000123` |
| `leitor` | `leitor123` | standard | Gestão em modo consulta |

## Como funciona

```text
demo.html ── carrega ──► demo/instalar.js ──► troca globalThis.fetch
                              │                   │
                              │   URL do painel ou da autenticação? ──sim──► demo/api-simulada.js
                              │                   │                           (rotas, estado em memória, latência de 100–300 ms)
                              │                  não
                              ▼                   ▼
                       js/main.js (o app)     fetch original (config/*.json, fontes, ícones)
```

- `demo.html` é a mesma casca de `index.html`, com um `<script type="module" src="demo/instalar.js">` **antes** do `js/main.js`. Módulos executam na ordem do documento, então o app já nasce falando com a simulação.
- `instalar.js` só intercepta as URLs que começam com as bases de API de `js/config.js`. Todo o resto segue para a rede.
- `api-simulada.js` despacha por método e caminho e responde no envelope `{ success, data }` com os status HTTP do contrato real, respeitando o cancelamento por `AbortSignal`.
- O estado vive em memória e muda com o uso: bipar, pausar e concluir caixas, definir metas, marcar notificações como lidas, criar cadastros. Recarregar a página recomeça do zero.
- As datas são relativas ao momento atual, então os números sempre parecem recentes.
- Os dados são gerados a partir das mesmas configurações do produto (`public/app/config/fluxos/*.json`), para as contagens por fase fecharem com o fluxograma.

| Arquivo | Conteúdo |
|---|---|
| `demo/instalar.js` | Troca o `fetch` e mostra a faixa "Demonstração · dados fictícios" |
| `demo/api-simulada.js` | Despachante das rotas |
| `demo/auth.js` | Login, perfil, preferências, senha, usuários |
| `demo/base.js` | Utilitários de resposta, datas e geração de séries |
| `demo/fluxos.js` | Fluxos de produção (status das fases, gestão, relatórios, gargalos, Macro View) |
| `demo/servicos.js` | Metas, notificações, atividades, monitoramento, envio |
| `demo/op-dados.js` · `op-terminal.js` · `op-gestao.js` | Módulo operacional: cadastros, tablet, correções e relatórios |
| `demo/demo.css` | Estilo da faixa de demonstração |

## O que a demonstração garante

O código da demonstração fica isolado em `public/app/demo*` e `scripts/servir-demo.mjs`. O `index.html` de produção e o comportamento do app não mudam, e os E2E continuam rodando contra o `index.html` com os mocks do Playwright. A demonstração obedece às mesmas regras estáticas dos testes: nada de `innerHTML` sem a *template tag*, handlers inline, URL de terceiros ou cor fora dos tokens.

## Limites

É uma simulação para mostrar o produto, não um backend. Ela não valida todas as regras de negócio do servidor real (por exemplo, o SQL e a CTE de primeira passagem não rodam) e não persiste nada entre recargas. Os contratos que ela imita estão em [api/](api/).
