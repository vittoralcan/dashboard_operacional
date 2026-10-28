// Template HTML do e-mail de senha temporária — markup de e-mail "clássico"
// de propósito: tabelas + CSS inline, sem Tailwind/fontes externas/JS. Email
// não executa <script> e a maioria dos clientes (Outlook em especial) não
// interpreta <link>/@import de fonte nem grid/flex — só esse subconjunto
// antigo de HTML/CSS renderiza de forma previsível em todos eles.
//
// Mantém a identidade visual do painel (faixa escura com o logo, paleta de
// theme.css, botão em pílula) dentro dessa limitação: cores batem com
// :root de theme.css (--bg-page/--text-primary/--accent-info), mas a fonte
// cai para a pilha padrão do sistema (sem Inter) e o fundo é majoritariamente
// claro — e-mail escuro de ponta a ponta depende de suporte a
// `prefers-color-scheme` que boa parte dos clientes ainda não tem, e um
// fundo escuro sem esse suporte vira texto ilegível em muitos webmails.

const LOGO_URL = 'https://app.example.com/app/assets/logo.png';
const LOGIN_URL = 'https://app.example.com/app/#/login';

function escaparHtml(valor) {
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function montarHtmlSenhaTemporaria({ nome, login, senhaTemporaria }) {
    const nomeSeguro = escaparHtml(nome);
    const loginSeguro = escaparHtml(login);
    const senhaSegura = escaparHtml(senhaTemporaria);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Seu acesso ao Painel Operacional</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px; max-width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08);">

          <!-- Faixa de marca — fundo claro (o logo só existe em PNG escuro;
               e-mail não pode depender do SVG branco, Outlook não renderiza
               SVG) + friso de cor pra não ficar sem nenhum acento de marca. -->
          <tr>
            <td style="background-color:#111827; height:4px; line-height:4px; font-size:0;">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" style="background-color:#ffffff; padding:28px 24px 20px 24px; border-bottom:1px solid #e5e7eb;">
              <img src="${LOGO_URL}" alt="Demo" width="96" style="display:block; height:auto;">
            </td>
          </tr>

          <!-- Corpo -->
          <tr>
            <td style="padding:36px 32px 8px 32px;">
              <p style="margin:0 0 4px 0; font-size:13px; color:#6b7280;">Painel Operacional</p>
              <h1 style="margin:0 0 20px 0; font-size:20px; line-height:1.4; color:#111827; font-weight:600;">
                Olá, ${nomeSeguro}. Sua conta foi criada.
              </h1>
              <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#4b5563;">
                Use o login e a senha temporária abaixo para acessar o painel pela primeira vez. Essa senha serve só para esse primeiro acesso — você vai escolher uma nova em seguida.
              </p>
            </td>
          </tr>

          <!-- Login -->
          <tr>
            <td style="padding:0 32px 16px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px; color:#6b7280; padding-bottom:2px;">Login</td>
                </tr>
                <tr>
                  <td style="font-size:16px; color:#111827; font-weight:600;">${loginSeguro}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Senha temporária (destaque) -->
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#eff8ff; border:1px solid #bae6fd; border-radius:12px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px 0; font-size:12px; letter-spacing:0.04em; color:#0369a1; font-weight:600;">SENHA TEMPORÁRIA</p>
                    <p style="margin:0; font-size:20px; font-family:'SFMono-Regular',Consolas,Menlo,monospace; letter-spacing:0.03em; color:#111827;">${senhaSegura}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:0 32px 36px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#111827; border-radius:9999px;">
                    <a href="${LOGIN_URL}" target="_blank"
                      style="display:inline-block; padding:13px 32px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:9999px;">
                      Acessar o painel
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td style="padding:20px 32px; border-top:1px solid #e5e7eb;">
              <p style="margin:0; font-size:12px; line-height:1.6; color:#9ca3af;">
                Se você não esperava este e-mail, ignore-o — nenhuma ação será tomada na sua conta.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { montarHtmlSenhaTemporaria };
