# Regras de negócio

> As regras citadas nos comentários do código como `RN-xxx`. Valores-padrão são parâmetros do manifesto e podem ser ajustados por instância.

| ID | Regra |
|---|---|
| **RN-001** | **Natureza analítica.** O painel só lê os sistemas de produção. As tabelas de apoio (`painel.*`) e o módulo operacional são do próprio painel. Toda ação destrutiva pede confirmação na tela |
| **RN-004** | Relatórios refletem projeto e lote **no momento** da estatística ou da conclusão; mudanças posteriores na pasta não reescrevem o passado; totais nunca são recalculados no cliente |
| **RN-007 / RN-012** | **"Atualizado" é a idade do dado**, não um relógio decorativo. Fonte com ETL: `agora − ultimaSincronizacao`; acima de 30 min a tela fica âmbar e mostra "dado de HH:MM". O botão ↻ refaz as consultas da tela, não força o ETL |
| **RN-008** | **Paradas no fluxo** = soma de pastas e imagens de todas as fases **exceto** a final. Fases sem nó desenhado e fases de espera ficam fora (a espera é estacionamento deliberado e mascararia o gargalo real) e ganham bloco "Aguardando" próprio |
| **RN-009 · Gargalo** | Entre as fases `entrada`, `processo` e `reprocessamento`, uma fase `f` é gargalo quando **todas** valem: `pastas(f) ≥ piso` (padrão 20); `pastas(f) / total ≥ minParticipacao` (0,20); `pastas(f) ≥ minRazao × mediana das demais` (2,0). No máximo um gargalo por instância (o de mais pastas); a fase de entrada só é elegível se nenhuma outra for |
| **RN-010 · Variação** | `(A − B) / B × 100`, com uma casa decimal. `A` = finalizadas do dia 1 até hoje; `B` = finalizadas do mês anterior do dia 1 até o **mesmo dia**. Período equivalente, não mês fechado contra mês aberto. Com `B = 0`, a variação não aparece |
| **RN-011 · Meta e projeção** | `% da meta = finalizadas no mês / meta`. Projeção em dias corridos: ritmo até ontem × dias que faltam, sem extrapolar no dia 1. Faltam = `max(0, meta − finalizadas)`. Sem meta, o bloco some ("Definir meta" só para admin) |
| **RN-013 · Notificações** | Erro e sucesso do monitor de APIs, alerta de gargalo, alerta de ETL atrasado, sucesso de meta atingida. Deduplicadas por chave, texto montado no servidor e sem HTML |
| **RN-014 · Atividade recente** | `{ quem, ação, alvo, onde, quando }` a partir da auditoria (relatório gerado, meta definida, teste e intervalo do monitor). Máximo de 50 |
| **RN-016 · Envio não bloqueia** | O relato de eventos do Bridge é só observação; nenhuma falha do painel impede, atrasa ou reverte um envio real |
| **RN-017 · Primeira passagem** | Todo número de produção (KPI, série, variação, relatório, Macro View) sai da mesma CTE: cada pasta conta **uma vez por fase**, na data da primeira passagem que cumpre a regra do tipo da fase. Reprocesso não soma de novo; lote ignorado (`lotesIgnorados`) não entra |

## Primeira passagem por tipo de fase (RN-017)

| Tipo | Passagem que conta | Imagens |
|---|---|---|
| `entrada` | Primeira passagem concluída que **gerou imagens** | Imagens depois − imagens antes ("imagens digitalizadas") |
| `processo` | Primeira passagem concluída | Imagens depois (ou da pasta) |
| `final` | Primeira passagem pela fase final | Imagens depois (ou da pasta) |

## Módulo operacional

| Regra | Onde é imposta |
|---|---|
| O código da caixa precisa casar **inteiro** com o regex do projeto (no showcase, `^AC-\d{6}$`) | Servidor (`bip.js`) e tela |
| Um colaborador tem no máximo uma caixa aberta; a mesma caixa não abre duas vezes | Servidor (`409`) |
| Bip repetido em até 3 s é duplicado e não fecha a caixa | Servidor |
| A duração é líquida: desconta as pausas (manuais e automáticas) | Servidor (`pausa.js`) |
| Na digitalização, o relógio para no bip ou no "Concluir", não na confirmação dos dados | Servidor (`encerrando`) |
| Correções (colaborador, código, horário, fechar, reabrir, excluir) exigem confirmação de senha e são auditadas | Servidor |
