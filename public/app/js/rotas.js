// @ts-check
/** Fluxo Captura: UMA tela para as 5 instâncias (RNB-003); `instancia` escolhe `config/fluxos/<instancia>.json`. */
const fluxo = (/** @type {string} */ c, /** @type {string} */ titulo, /** @type {string} */ instancia) => ({
  caminho: c, camada: /** @type {const} */ ('shell'), acesso: /** @type {const} */ ('logado'), titulo, instancia, skeleton: 'modulo', carregar: () => import('./features/fluxo/fluxo.js'),
});

/**
 * Tabela de rotas. Cada tela é carregada sob demanda (`import()`).
 * A primeira rota que casa vence. Todas as telas do plano estão migradas; rota desconhecida cai na 404.
 */
/** @type {import('./core/router.js').Rota[]} */
export const ROTAS = [
  { caminho: '/login', camada: 'auth', acesso: 'publica', titulo: 'Entrar', carregar: () => import('./features/auth/login.js') },
  { caminho: '/primeiro-acesso', camada: 'auth', acesso: 'logado', titulo: 'Primeiro acesso', carregar: () => import('./features/auth/primeiro-acesso.js') },
  { caminho: '/_ui', camada: 'shell', acesso: 'publica', titulo: 'Catálogo de componentes', dev: true,
    carregar: () => import('./features/dev/ui-catalogo.js') },
  { caminho: '/', camada: 'shell', acesso: 'logado', titulo: 'Projetos', redireciona: '/projetos' },
  { caminho: '/projetos', camada: 'shell', acesso: 'logado', titulo: 'Projetos', skeleton: 'home', carregar: () => import('./features/projetos/home.js') },
  { caminho: '/macro-view', camada: 'macro', acesso: 'logado', titulo: 'Macro View', carregar: () => import('./features/macro/macro.js') },
  { caminho: '/boreal/monitoramento', camada: 'shell', acesso: 'logado', titulo: 'Monitoramento de APIs', skeleton: 'lista', carregar: () => import('./features/monitoramento/monitoramento.js') },
  { caminho: '/atlas', camada: 'shell', acesso: 'logado', titulo: 'ATLAS', skeleton: 'hub', carregar: () => import('./features/projetos/hub-atlas.js') },
  fluxo('/atlas/negativos/:vista?', 'Negativos', 'negativos'),
  fluxo('/atlas/certidoes/:vista?', 'Certidões', 'certidoes'),
  fluxo('/atlas/inventarios/:vista?', 'Inventários', 'inventarios'),
  fluxo('/atlas/cartografia/:vista?', 'Cartografia', 'cartografia'),
  { caminho: '/cobalto', camada: 'shell', acesso: 'logado', titulo: 'COBALTO', carregar: () => import('./features/projetos/cobalto.js') },
  { caminho: '/envio', camada: 'shell', acesso: 'logado', titulo: 'Envio (Bridge)', skeleton: 'modulo', carregar: () => import('./features/envio/envio.js') },
  { caminho: '/perfil', camada: 'shell', acesso: 'logado', titulo: 'Meu perfil', carregar: () => import('./features/usuarios/perfil.js') },
  { caminho: '/metas', camada: 'shell', acesso: 'admin', titulo: 'Metas mensais', skeleton: 'lista', carregar: () => import('./features/metas/metas.js') },
  { caminho: '/tablet', camada: 'tablet', acesso: 'turno', titulo: 'Tablet do turno', carregar: () => import('./features/tablet/tablet.js') },
  { caminho: '/digitalizacao', camada: 'tablet', acesso: 'turno', titulo: 'Digitalização', carregar: () => import('./features/digitalizacao/digitalizacao.js') },
  { caminho: '/operacional/relatorios', camada: 'shell', acesso: 'gestao', titulo: 'Relatório hora a hora', skeleton: 'lista', carregar: () => import('./features/operacional/relatorio.js') },
  { caminho: '/operacional/caixas', camada: 'shell', acesso: 'gestao', titulo: 'Caixas ao vivo', skeleton: 'lista', carregar: () => import('./features/operacional/caixas.js') },
  { caminho: '/operacional/correcoes', camada: 'shell', acesso: 'gestao', titulo: 'Correções de caixas', skeleton: 'lista', carregar: () => import('./features/operacional/correcoes.js') },
  { caminho: '/operacional/cadastros', camada: 'shell', acesso: 'admin', titulo: 'Cadastros operacionais', skeleton: 'lista', carregar: () => import('./features/operacional/cadastros.js') },
  { caminho: '/usuarios/novo', camada: 'shell', acesso: 'admin', titulo: 'Criar novo usuário', carregar: () => import('./features/usuarios/criar-usuario.js') },
];
