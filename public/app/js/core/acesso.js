// @ts-check
/**
 * Decisão de acesso a uma rota (AUT-09, frontend_spec.md §5.2). Pura — o roteador só obedece.
 * O backend sempre revalida; isto é só UX.
 *
 * @typedef {{ tipo?: string, precisaTrocarSenha?: boolean } | null} Usuario
 * @param {{ acesso: 'publica'|'logado'|'admin'|'turno'|'gestao', caminho: string }} rota
 * @param {Usuario} usuario
 * @param {{ telaLogin?: boolean, telaPrimeiroAcesso?: boolean }} [o] telas que já existem (Onda 3); sem elas não há para onde redirecionar
 * @returns {true | { para: string, aviso?: string }}
 */
export function decidirAcesso(rota, usuario, o = {}) {
  // conta de turno vive só no tablet: tudo o mais (inclusive /login) volta para lá
  if (usuario && usuario.tipo === 'turno') return rota.acesso === 'turno' ? true : { para: '/tablet' };
  if (rota.acesso === 'publica') {
    // logado em /login → projetos; logado precisando trocar senha segue para o primeiro acesso
    if (rota.caminho === '/login' && usuario) return { para: usuario.precisaTrocarSenha && o.telaPrimeiroAcesso ? '/primeiro-acesso' : '/projetos' };
    return true;
  }
  if (!usuario) {
    if (o.telaLogin) return { para: '/login' };
    return rota.acesso === 'admin' ? { para: '/projetos', aviso: 'Acesso restrito a administradores.' } : true;
  }
  if (o.telaPrimeiroAcesso && usuario.precisaTrocarSenha && rota.caminho !== '/primeiro-acesso') return { para: '/primeiro-acesso' };
  // /primeiro-acesso só existe enquanto a senha for temporária
  if (rota.caminho === '/primeiro-acesso' && !usuario.precisaTrocarSenha) return { para: '/projetos' };
  if (rota.acesso === 'turno' && usuario.tipo !== 'admin') return { para: '/projetos', aviso: 'Acesso restrito ao tablet do turno.' };
  if (rota.acesso === 'admin' && usuario.tipo !== 'admin') return { para: '/projetos', aviso: 'Acesso restrito a administradores.' };
  return true;
}

/** O usuário é admin? @param {Usuario} u */
export const ehAdmin = (u) => !!u && u.tipo === 'admin';
