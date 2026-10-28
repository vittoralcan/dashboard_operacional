# Catálogo de funções

> Os comentários do código citam funções do produto por um prefixo e um número (por exemplo `FLX-05` ou `MAC-01`). Este é o significado de cada prefixo.

| Prefixo | Área |
|---|---|
| `AUT` | Autenticação: login, primeiro acesso, sessão, logout |
| `NAV` | Navegação: barra lateral, migalhas, catálogo de projetos |
| `PRD` | Produtividade: paleta de comandos (`Ctrl+K`) e atalhos |
| `USR` | Usuário: perfil, preferências, criação de usuário |
| `THM` | Tema claro e escuro |
| `NTF` | Notificações, atividade recente e gargalos |
| `HUB` | Seleção de projetos e hubs de projeto |
| `MAC` | Macro View (modo TV) |
| `FLX` | Módulo de fluxo: análise de produção, relatório, fluxograma, modal de fase, sincronização |
| `HIG` · `RCX` · `IDX` · `AIP` | Telas de um projeto legado (higienização, registro de caixas, indexação, pacotes de arquivamento), mantidas no código como "Em breve" |
| `MON` | Monitoramento de APIs |
| `CMP` | Componentes compartilhados: tabela densa, exportação, gráficos, skeleton, spotlight, calendário, modal |
| `ENV` | Acompanhamento do envio (Bridge) |

## Funções ligadas a recursos do backend

Estas são as funções citadas em `public/app/js/config/recursos.js`, o registro que decide o que está ativo e o que aparece como "Em breve". O teste `tests/app/embreve.test.js` confere que cada uma tem uma linha aqui.

| ID | Função | O que faz |
|---|---|---|
| AIP-01 | Processamento de pacotes de arquivamento (legado) | Total geral, maiores regionais, lista por regional com busca e ordenação |
| AUT-12 | Sessão para TV | Sessão de longa duração para a Macro View (evolução planejada: refresh token) |
| AUT-13 | Revogação de sessão | Logout que invalida o token no servidor (evolução planejada) |
| ENV-01 | Acompanhamento de envio (Bridge) | Instância e janela de tempo; cartões, funil, vazão, sinal de vida e eventos recentes |
| FLX-02 | Meta mensal | Anel de %, medidor finalizadas/meta, variação, projeção do mês e quanto falta |
| FLX-05 | Fluxograma | Nós com pastas, imagens e barra de carga; junções; arestas com fluxo animado; suspensões em vermelho; zoom e minimapa |
| FLX-06 | Gargalo | O nó-gargalo ganha destaque e o botão "Ir para o gargalo" centraliza nele |
| HIG-02 | Caixas finalizadas no mês (legado) | Total, meta, variação e lista de caixas |
| HIG-07 | Adicionar mesa (legado) | Cria a próxima mesa de higienização |
| HUB-01 | Seleção de projetos | Saudação, data, atalho para a Macro View e um cartão por projeto |
| HUB-04 | KPI com variação e meta | Variação contra o mês anterior, medidor de meta e anel de % |
| IDX-01 | Análise de produção da indexação (legado) | Documentos indexados no mês e cartões por etapa |
| IDX-05 | Defasagem do espelho (legado) | "Dados sincronizados há N min" |
| IDX-06 | Exportação completa (legado) | Exportação gerada no servidor, em *stream* |
| MAC-06 | Macro View sobrevive à expiração do token | Aviso de "Sessão expirada" na TV até existir a sessão de TV |
| MON-01 | Resumo do monitoramento | APIs online, latência média, disponibilidade e próxima verificação |
| MON-02 | Lista de integrações | Uma linha por API: barras de uptime, latência, selo de estado e detalhe expansível |
| NAV-10 | Contadores na barra lateral | "Em andamento" por fluxo e APIs online, com pontos de alerta |
| NTF-01 | Central de notificações | Sino com não lidas, abas, ícone por tipo, "Marcar todas como lidas"; clicar leva ao destino |
| NTF-02 | Atividade recente | "Quem · ação · alvo · onde · quando" a partir da auditoria |
| NTF-05 | Gargalos agora | Lista de fases-gargalo na seleção de projetos; clicar abre o fluxograma focado no nó |
| RCX-02 | Código da mesa (legado) | Campo de 4 dígitos ou QR code, com validação |
| USR-02 | Menu do usuário | Perfil, configurações, criar usuário (admin), tema, atalhos e sair |
| USR-03 | Meu perfil | Dados da conta, preferências e troca de senha |
| USR-05 | Preferências persistidas | Tema, barra lateral e intervalo da Macro View salvos na conta |
| USR-07 | Gestão de usuários | Listar, ativar e desativar, alterar tipo e redefinir senha (evolução planejada) |
