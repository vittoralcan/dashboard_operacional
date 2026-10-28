const jwt = require('jsonwebtoken');
const { verificarToken } = require('../../../config/jwt');
const { buscarUsuarioPorId } = require('../queries/usuarios.queries');

/**
 * Middleware de verificação de sessão — exige um JWT válido e não expirado
 * no header `Authorization: Bearer <token>` (ver docs/arquitetura/regras-de-arquitetura.md,
 * RA-016, e docs/api/auth.md). `back_boreal`/`back_atlas`/`back_dashboard` têm
 * cópias desta lógica, mas sem acesso ao banco de credenciais (bancos
 * separados, RA-016) — só o `back_auth` consegue revalidar contra o banco;
 * os demais continuam confiando só no claim do token até ele expirar.
 *
 * BE-02 (item 4)/BE-06 (docs/arquitetura/seguranca.md): `tipo`/`ativo` vêm
 * sempre de uma consulta fresca, nunca do claim do JWT (que pode estar até
 * 8h desatualizado) — um admin rebaixado ou um usuário desativado perde o
 * acesso na próxima requisição, não só quando o token expirar. Mesmo formato
 * de resposta de erro de sempre (401, "Token de autenticação inválido."),
 * então nenhum cliente que já trata token inválido/expirado precisa mudar.
 * **Não** cobre a troca de senha invalidar tokens antigos já emitidos — isso
 * depende de devolver um token novo em `PATCH /auth/senha` e o front passar
 * a lê-lo, fora do escopo desta leva (ver docs/README.md §3).
 */
async function exigirAutenticacao(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ success: false, message: 'Token de autenticação ausente.' });
    }

    try {
        const payload = verificarToken(token);
        const usuarioAtual = await buscarUsuarioPorId(payload.sub);
        if (!usuarioAtual || !usuarioAtual.ativo) {
            return res.status(401).json({ success: false, message: 'Token de autenticação inválido.' });
        }
        req.usuario = { id: usuarioAtual.id, login: usuarioAtual.login, tipo: usuarioAtual.tipo };
        return next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ success: false, message: 'Sessão expirada. Faça login novamente.' });
        }
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ success: false, message: 'Token de autenticação inválido.' });
        }
        // Erro de banco ou outro imprevisto — não é "token inválido", é falha
        // interna; propaga pro handler de erro final (BE-03) em vez de
        // mascarar como 401, o que esconderia um problema real de infra.
        return next(error);
    }
}

/**
 * Exige que o usuário autenticado (deve rodar depois de `exigirAutenticacao`
 * na cadeia de middlewares) seja do tipo "admin" — usado só em
 * `POST /auth/usuarios` (criação de conta), ver RA-016.
 */
function exigirAdmin(req, res, next) {
    if (!req.usuario || req.usuario.tipo !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acesso restrito a administradores.' });
    }
    return next();
}

module.exports = { exigirAutenticacao, exigirAdmin };
