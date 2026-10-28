// Envolve um handler async: qualquer erro vira 500 com a mensagem do contrato daquela rota.
// O detalhe do erro fica só no log do servidor — nunca na resposta.
function rota(mensagemErro, handler) {
    return async (req, res) => {
        try {
            await handler(req, res);
        } catch (erro) {
            // BD-14: `req.id` (core/request-id.js) correlaciona esta linha com o
            // que o cliente vê no cabeçalho `X-Request-Id` da resposta de erro.
            console.error(`[${req.id ?? '-'}] ${req.method} ${req.originalUrl} — ${mensagemErro}:`, erro.message);
            res.status(500).json({ success: false, message: mensagemErro });
        }
    };
}

module.exports = { rota };
