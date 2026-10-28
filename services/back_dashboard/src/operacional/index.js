const express = require('express');
const { exigirTurno, exigirGestao, exigirConfirmacaoSenha } = require('../core/auth.middleware');
const { resolverTurno } = require('./turno');
const { criarCadastrosRouter } = require('./cadastros');
const { criarTerminalRouter } = require('./terminal');
const { criarCorrecoesRouter } = require('./correcoes');
const { criarRelatoriosRouter } = require('./relatorios');

// Montado em `app.use('/api', ...)`, depois de exigirAutenticacao.
function criarOperacionalRouter({ dbPainel, exigirAdmin }) {
    const router = express.Router();
    router.use('/operacional', express.json());

    router.use('/operacional/admin', exigirAdmin, criarCadastrosRouter({ dbPainel }));
    router.use('/operacional/terminal', exigirTurno, resolverTurno(dbPainel), criarTerminalRouter({ dbPainel }));
    router.use('/operacional/correcoes', exigirGestao, exigirConfirmacaoSenha, criarCorrecoesRouter({ dbPainel }));
    router.use('/operacional/relatorios', exigirGestao, criarRelatoriosRouter({ dbPainel }));

    return router;
}

module.exports = { criarOperacionalRouter };
