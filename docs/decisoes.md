# Decisões de produto

> Decisões que moldaram o módulo operacional (o código cita este arquivo). Formato: contexto, decisão, alternativa descartada.

## Módulo operacional: rastreio de caixas por pessoa e por tempo

- **Contexto:** além da vertente de gestão, a operação precisava medir a produção **por pessoa e por tempo** nas etapas manuais (higienização, remontagem, digitalização), com uma tela simples para o chão de fábrica, inspirada em gamificação: botões grandes, cores, retorno visual imediato e nenhum excesso de informação.
- **Decisão:**
  1. O módulo vive dentro do `back_dashboard` (`src/operacional/`, rotas `/api/operacional/*`), com quatro áreas por perfil: `admin` (cadastros), `terminal` (tablet do turno), `correcoes` (gestão, com confirmação de senha) e `relatorios` (gestão). Sem backend novo.
  2. O tablet usa uma **conta compartilhada por turno**: um usuário do `back_auth` com `tipo = 'turno'`, ligado ao turno em `painel.op_turno`. O operador só escolhe o próprio nome numa lista; não há login individual.
  3. O token de turno só alcança o terminal. Relatórios nominais ficam restritos à gestão.
  4. Os dados ficam em `db_dashboard.painel`, tabelas `op_*`; o espelho continua só leitura. Correções e exclusões gravam auditoria.
  5. Diferenças entre projetos são configuração em dado: o formato do código de barras da caixa é `op_projeto.codigo_regex`.
- **Alternativa descartada:** um backend por projeto; login individual por operador no tablet.

## Gargalo por vazão entre turnos

- **Contexto:** para a operação, gargalo também é a etapa que não teve vazão de um turno para o outro, não só a que acumulou volume.
- **Decisão:** um retrato das fases às 07h e 19h (`painel.snapshot_fase`, `jobs/snapshot.js`); a vazão é a diferença entre dois retratos. O critério de volume (RN-009) continua valendo.

## Pausa, digitalização e design operacional

- **Contexto:** no piloto em campo apareceram quatro necessidades: tratar o almoço no meio de uma caixa, registrar dados da digitalização, editar o número de uma caixa lida errado e dar retorno visual claro no tablet. Há rotatividade: quem higieniza hoje pode digitalizar amanhã.
- **Decisão:**
  1. **Digitalização entra no bip** como etapa `digitalizacao`, com tela própria. O segundo bip devolve `finalizar_pendente` e a conclusão pede `imagens` (≥ 1), `grampo` e `deteriorado`.
  2. **Pausa** sem justificativa, com duração gravada **líquida**. Uma pausa esquecida é encerrada na virada de turno, de forma preguiçosa (ao ler o estado, sem job), e a caixa fica sinalizada para correção.
  3. **Editar o número da caixa** valida o regex do projeto, bloqueia duplicata aberta e exige senha e auditoria.
  4. **Design operacional** sobre o mesmo design system (só tokens): botões grandes com ícone, selo sempre com ícone e texto (cor nunca sozinha), um destaque por tela e um retorno grande após cada ação (`ui/retorno.js`).
- **Alternativa descartada:** pausa com motivo obrigatório; filtro de nomes por função; tema visual separado para o operacional; job de cron para encerrar pausas.
