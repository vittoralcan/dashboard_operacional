const nodemailer = require('nodemailer');
const { requireEnv } = require('./require-env');

// Transporte SMTP genérico (RA-010: credenciais só via requireEnv(), sem
// fallback hardcoded) — funciona com qualquer provedor (Google Workspace,
// Microsoft 365, SMTP tradicional). As variáveis só são lidas na primeira
// chamada, não no boot do processo: back_auth continua funcionando (login,
// troca de senha) mesmo que o SMTP não esteja configurado — só o envio de
// e-mail de senha temporária fica indisponível, com fallback tratado em
// quem chama (ver enviar-email-senha-temporaria.js).
let transporter = null;

function obterTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: requireEnv('SMTP_HOST'),
            port: Number(requireEnv('SMTP_PORT')),
            secure: requireEnv('SMTP_PORT') === '465',
            auth: {
                user: requireEnv('SMTP_USER'),
                pass: requireEnv('SMTP_PASSWORD'),
            },
        });
    }
    return transporter;
}

async function enviarEmail({ para, assunto, texto, html }) {
    await obterTransporter().sendMail({
        from: requireEnv('SMTP_FROM'),
        to: para,
        subject: assunto,
        text: texto,
        html,
    });
}

module.exports = { enviarEmail };
