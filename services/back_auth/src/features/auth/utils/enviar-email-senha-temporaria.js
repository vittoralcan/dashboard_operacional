const { enviarEmail } = require('../../../config/mailer');
const { montarHtmlSenhaTemporaria } = require('./email-senha-temporaria.template');

const LOGIN_URL = 'https://app.example.com/app/#/login';

// Chamada só por POST /auth/usuarios, logo após criar a conta — nunca
// re-envia (não existe rota de "reenviar senha"; se falhar, o chamador cai
// no fallback de devolver a senha na resposta da API, ver usuarios.routes.js).
// Envia multipart (texto + html) — o texto é o que sobrevive em clientes que
// não renderizam HTML e em filtros de spam que avaliam a versão texto.
async function enviarEmailSenhaTemporaria({ nome, email, login, senhaTemporaria }) {
    const texto = [
        `Olá, ${nome}.`,
        '',
        'Uma conta foi criada para você no Painel Operacional.',
        '',
        `Login: ${login}`,
        `Senha temporária: ${senhaTemporaria}`,
        '',
        `Acesse ${LOGIN_URL} e troque essa senha no primeiro acesso — ela serve só para o primeiro login.`,
        '',
        'Se você não esperava este e-mail, ignore-o.',
    ].join('\n');

    const html = montarHtmlSenhaTemporaria({ nome, login, senhaTemporaria });

    await enviarEmail({ para: email, assunto: 'Seu acesso ao Painel Operacional', texto, html });
}

module.exports = { enviarEmailSenhaTemporaria };
