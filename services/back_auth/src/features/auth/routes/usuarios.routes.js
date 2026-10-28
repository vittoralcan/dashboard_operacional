const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { assinarTokenConfirmacao } = require('../../../config/jwt');
const { exigirAdmin } = require('../middleware/auth.middleware');
const { criarUsuario, atualizarSenha, buscarUsuarioPorLogin } = require('../queries/usuarios.queries');
const { gerarSenhaTemporaria } = require('../utils/gerar-senha-temporaria');
const { enviarEmailSenhaTemporaria } = require('../utils/enviar-email-senha-temporaria');

const router = express.Router();

const SALT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_REGEX = /^[a-z0-9._-]{3,50}$/;
// BE-10 (docs/arquitetura/seguranca.md): subiu de 8 para 12 caracteres.
const SENHA_MIN_LENGTH = 12;
// bcrypt (e bcryptjs) ignora silenciosamente qualquer byte além do 72º —
// sem este teto, alguém poderia digitar uma senha "mais longa" achando que
// isso aumenta a segurança, quando na prática só os 72 primeiros bytes contam.
const SENHA_MAX_BYTES = 72;
const TIPOS_VALIDOS = ['admin', 'standard', 'turno'];
const CARGO_MAX_LENGTH = 100;

// Lista pequena, de propósito (A5, docs/api/back-dashboard.md) — não é uma
// blocklist exaustiva tipo rockyou.txt, só os padrões mais óbvios dado que
// logins seguem o formato previsível `nome.sobrenome` (ver BE-01). Comparada
// sempre em minúsculas.
const SENHAS_COMUNS = new Set([
    '12345678', '123456789', '1234567890', 'password', 'senha123', 'senha1234',
    'qwerty123', '11111111', '00000000', 'admin123', 'mudar123', 'trocar123',
    'abc12345', 'a1b2c3d4', 'password1', 'Password1',
]);

function validarNovoUsuario({ nome, login, email, tipo, cargo }) {
    if (typeof nome !== 'string' || nome.trim().length < 2) {
        return 'Nome é obrigatório e deve ter ao menos 2 caracteres.';
    }
    if (typeof login !== 'string' || !LOGIN_REGEX.test(login.trim().toLowerCase())) {
        return 'Login é obrigatório, deve ter ao menos 3 caracteres e conter apenas letras minúsculas, números, ponto, hífen ou underscore.';
    }
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
        return 'E-mail é obrigatório e deve ter um formato válido.';
    }
    if (!TIPOS_VALIDOS.includes(tipo)) {
        return 'Tipo de usuário é obrigatório e deve ser "admin", "standard" ou "turno".';
    }
    if (cargo !== undefined && cargo !== null && (typeof cargo !== 'string' || cargo.length > CARGO_MAX_LENGTH)) {
        return `Cargo deve ter no máximo ${CARGO_MAX_LENGTH} caracteres.`;
    }
    return null;
}

// POST /api/auth/usuarios — só admins criam novos usuários (RA-016).
// Gera uma senha temporária (nunca escolhida pelo admin) e marca
// `precisa_trocar_senha`, para forçar a troca no primeiro login.
router.post('/auth/usuarios', exigirAdmin, async (req, res) => {
    try {
        const { nome, login, email, tipo, cargo } = req.body || {};

        const erroValidacao = validarNovoUsuario({ nome, login, email, tipo, cargo });
        if (erroValidacao) {
            return res.status(400).json({ success: false, message: erroValidacao });
        }

        const nomeNormalizado = nome.trim();
        const loginNormalizado = login.trim().toLowerCase();
        const emailNormalizado = email.trim().toLowerCase();
        const cargoNormalizado = typeof cargo === 'string' && cargo.trim() ? cargo.trim() : null;
        const senhaTemporaria = gerarSenhaTemporaria();
        const senhaHash = await bcrypt.hash(senhaTemporaria, SALT_ROUNDS);

        const usuario = await criarUsuario({
            nome: nomeNormalizado,
            login: loginNormalizado,
            email: emailNormalizado,
            senhaHash,
            tipo,
            precisaTrocarSenha: true,
            cargo: cargoNormalizado,
        });

        // Tenta entregar a senha temporária por e-mail em vez de devolvê-la na
        // resposta (FE-10 do security_findings.md: assim ela nunca passa pela
        // tela/clipboard do admin). Se o envio falhar — SMTP não configurado,
        // provedor fora do ar — cai no comportamento anterior como fallback,
        // pra não travar a criação do usuário por causa de e-mail.
        let emailEnviado = false;
        try {
            await enviarEmailSenhaTemporaria({ nome: nomeNormalizado, email: emailNormalizado, login: loginNormalizado, senhaTemporaria });
            emailEnviado = true;
        } catch (erroEmail) {
            console.error('Falha ao enviar e-mail de senha temporária:', erroEmail.message);
        }

        // `senhaTemporaria` só aparece em texto puro na resposta quando o
        // e-mail falhou — nunca é gravada nem logada em texto puro (o banco
        // só guarda o hash).
        return res.status(201).json({
            success: true,
            data: emailEnviado
                ? { ...usuario, emailEnviado: true }
                : { ...usuario, emailEnviado: false, senhaTemporaria },
        });
    } catch (error) {
        if (error.code === '23505') {
            const ehLogin = error.constraint === 'usuarios_login_key';
            const mensagem = ehLogin ? 'Este login já está em uso.' : 'Este e-mail já está cadastrado.';
            return res.status(409).json({ success: false, message: mensagem });
        }

        console.error('Erro ao criar usuário:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao criar usuário.' });
    }
});

// PATCH /api/auth/senha — usuário autenticado define sua própria senha.
// Usada no primeiro login (troca obrigatória da senha temporária) e também
// fora desse fluxo — mas fora dele agora é exigida a senha atual (ver
// docs/api/auth.md), pra um token roubado/observado não bastar sozinho
// pra um atacante trocar a senha da conta sem saber a senha atual.
router.patch('/auth/senha', async (req, res) => {
    try {
        const { senhaAtual, novaSenha } = req.body || {};

        if (typeof novaSenha !== 'string' || novaSenha.length < SENHA_MIN_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `Nova senha é obrigatória e deve ter ao menos ${SENHA_MIN_LENGTH} caracteres.`,
            });
        }
        // BE-10: acima disso o hash ignora o excedente (ver comentário de SENHA_MAX_BYTES).
        if (Buffer.byteLength(novaSenha, 'utf8') > SENHA_MAX_BYTES) {
            return res.status(400).json({
                success: false,
                message: `Nova senha deve ter no máximo ${SENHA_MAX_BYTES} bytes.`,
            });
        }
        // A5 (docs/api/back-dashboard.md) — reforço de política, além do
        // tamanho mínimo já exigido acima.
        if (novaSenha.toLowerCase() === req.usuario.login.toLowerCase()) {
            return res.status(400).json({ success: false, message: 'A nova senha não pode ser igual ao seu login.' });
        }
        if (SENHAS_COMUNS.has(novaSenha.toLowerCase())) {
            return res.status(400).json({ success: false, message: 'Escolha uma senha menos óbvia.' });
        }

        const usuarioAtual = await buscarUsuarioPorLogin(req.usuario.login);
        if (!usuarioAtual) {
            return res.status(401).json({ success: false, message: 'Token de autenticação inválido.' });
        }

        // BE-10 (resto): diferente da checagem de login acima, esta compara
        // contra a senha vigente de verdade (hash), não um valor literal —
        // por isso precisa do bcrypt.compare, não dá pra checar antes de
        // buscar o usuário.
        const novaSenhaIgualAtual = await bcrypt.compare(novaSenha, usuarioAtual.senha_hash);
        if (novaSenhaIgualAtual) {
            return res.status(400).json({ success: false, message: 'A nova senha não pode ser igual à senha atual.' });
        }

        // No primeiro login (senha temporária), o próprio login recém-feito já
        // prova posse da senha atual — não exige `senhaAtual` de novo. Fora
        // desse fluxo, exige e confere via bcrypt antes de trocar.
        if (!usuarioAtual.precisa_trocar_senha) {
            if (typeof senhaAtual !== 'string' || !senhaAtual) {
                return res.status(400).json({ success: false, message: 'Senha atual é obrigatória.' });
            }

            const senhaAtualConfere = await bcrypt.compare(senhaAtual, usuarioAtual.senha_hash);
            if (!senhaAtualConfere) {
                return res.status(401).json({ success: false, message: 'Senha atual incorreta.' });
            }
        }

        const senhaHash = await bcrypt.hash(novaSenha, SALT_ROUNDS);
        const usuario = await atualizarSenha(req.usuario.id, senhaHash);

        return res.status(200).json({ success: true, data: usuario });
    } catch (error) {
        console.error('Erro ao definir nova senha:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao definir nova senha.' });
    }
});

const CONFIRMACAO_EXPIRA_EM_SEGUNDOS = 120;
// Mesmo hash dummy do login: iguala o tempo quando o usuário não existe.
const HASH_DUMMY = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8u.qHAQEr.4S/7/xrJ.eZmi6ZuJIie';

const limitadorConfirmacaoSenha = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.usuario?.id ?? 'anonimo'),
    validate: { keyGeneratorIpFallback: false },
    handler: (req, res) => res.status(429).json({
        success: false,
        message: 'Muitas tentativas. Tente novamente em alguns minutos.',
    }),
});

// POST /api/auth/confirmar-senha — o usuário logado confirma a própria senha e
// recebe um token curto, exclusivo das correções (verificado pelo back_dashboard).
router.post('/auth/confirmar-senha', limitadorConfirmacaoSenha, async (req, res) => {
    try {
        const { senha } = req.body || {};
        if (typeof senha !== 'string' || !senha) {
            return res.status(400).json({ success: false, message: 'Senha é obrigatória.' });
        }

        const usuario = await buscarUsuarioPorLogin(req.usuario.login);
        const senhaConfere = await bcrypt.compare(senha, usuario ? usuario.senha_hash : HASH_DUMMY);

        if (!usuario || !usuario.ativo) {
            return res.status(401).json({ success: false, message: 'Usuário inválido ou inativo.' });
        }
        if (usuario.tipo === 'turno') {
            return res.status(403).json({ success: false, message: 'Contas de turno não podem confirmar correções.' });
        }
        if (!senhaConfere) {
            return res.status(401).json({ success: false, message: 'Senha incorreta.' });
        }

        const token = assinarTokenConfirmacao({ id: usuario.id, login: usuario.login });
        return res.json({ success: true, data: { token, expiraEmSegundos: CONFIRMACAO_EXPIRA_EM_SEGUNDOS } });
    } catch (error) {
        console.error('Erro ao confirmar senha:', error.message);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});

module.exports = router;
