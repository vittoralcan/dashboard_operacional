// Cadastros do módulo operacional (RF-01 a RF-05), montados em /api/operacional/admin
// por operacional/index.js atrás de exigirAdmin e express.json().
const express = require('express');
const { rota } = require('../core/rota');
const { registrarAuditoria } = require('../core/auditoria');

const SLUG_RE = /^[a-z0-9-]{2,30}$/;
const INTEGRACOES = ['captura', 'lumen', 'arca'];
const MSG_DUPLICADO = 'Já existe um cadastro com esses dados.';
const MSG_REFERENCIA = 'Referência inválida.';

// Validadores: devolvem a mensagem de erro ou null.
const texto = (rotulo, max) => (v) =>
    typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max
        ? null
        : `Campo "${rotulo}" deve ter de 1 a ${max} caracteres.`;
const inteiro = (rotulo, min = 1) => (v) =>
    Number.isInteger(v) && v >= min ? null : `Campo "${rotulo}" deve ser um inteiro maior ou igual a ${min}.`;
const opcao = (rotulo, validos) => (v) =>
    validos.includes(v) ? null : `Campo "${rotulo}" deve ser um de: ${validos.join(', ')}.`;
const booleano = (rotulo) => (v) => (typeof v === 'boolean' ? null : `Campo "${rotulo}" deve ser verdadeiro ou falso.`);

function validarRegex(v) {
    if (typeof v !== 'string' || v.length < 1 || v.length > 200) return 'Campo "codigoRegex" deve ter de 1 a 200 caracteres.';
    try {
        new RegExp(v);
    } catch {
        return 'Campo "codigoRegex" não é uma expressão regular válida.';
    }
    return null;
}

function validarIntegracoes(v) {
    if (!Array.isArray(v) || v.some((i) => !INTEGRACOES.includes(i))) {
        return `Campo "integracoes" deve ser uma lista com itens de: ${INTEGRACOES.join(', ')}.`;
    }
    return null;
}

// Definição por recurso. Cada campo: coluna, validação, obrigatório na criação,
// nulável (aceita null) e conversão do valor para o banco. Nomes de coluna só vêm daqui.
const ativo = { coluna: 'ativo', validar: booleano('ativo') };
const projetoId = { coluna: 'projeto_id', validar: inteiro('projetoId'), obrigatorio: true };

const RECURSOS = {
    projetos: {
        tabela: 'op_projeto',
        ordem: 'nome',
        campos: {
            slug: { coluna: 'slug', validar: (v) => (typeof v === 'string' && SLUG_RE.test(v) ? null : 'Campo "slug" deve casar com ^[a-z0-9-]{2,30}$.'), obrigatorio: true },
            nome: { coluna: 'nome', validar: texto('nome', 100), obrigatorio: true },
            codigoRegex: { coluna: 'codigo_regex', validar: validarRegex, nulavel: true },
            integracoes: { coluna: 'integracoes', validar: validarIntegracoes, converter: (v) => JSON.stringify(v), cast: '::jsonb' },
            ativo,
        },
    },
    turnos: {
        tabela: 'op_turno',
        ordem: 'nome',
        campos: {
            projetoId,
            nome: { coluna: 'nome', validar: texto('nome', 60), obrigatorio: true },
            usuarioAuthId: { coluna: 'usuario_auth_id', validar: inteiro('usuarioAuthId'), nulavel: true },
            ativo,
        },
    },
    colaboradores: {
        tabela: 'op_colaborador',
        ordem: 'nome',
        campos: {
            projetoId,
            nome: { coluna: 'nome', validar: texto('nome', 150), obrigatorio: true },
            funcao: { coluna: 'funcao', validar: texto('funcao', 60), nulavel: true },
            turnoId: { coluna: 'turno_id', validar: inteiro('turnoId'), nulavel: true },
            avatar: { coluna: 'avatar', validar: texto('avatar', 60), nulavel: true },
            ativo,
        },
    },
    mesas: {
        tabela: 'op_mesa',
        ordem: 'codigo',
        campos: {
            projetoId,
            codigo: { coluna: 'codigo', validar: texto('codigo', 10), obrigatorio: true },
            tipo: { coluna: 'tipo', validar: opcao('tipo', ['higienizacao', 'remontagem']), obrigatorio: true },
            ativo,
        },
    },
};

const META = {
    tabela: 'op_meta',
    campos: {
        projetoId,
        etapa: { coluna: 'etapa', validar: opcao('etapa', ['higienizacao', 'scanner', 'cq']), obrigatorio: true },
        valorDia: { coluna: 'valor_dia', validar: inteiro('valorDia'), obrigatorio: true },
        unidade: { coluna: 'unidade', validar: opcao('unidade', ['caixas', 'imagens']), obrigatorio: true },
    },
};

const paraCamel = (nome) => nome.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const linhaCamel = (linha) => Object.fromEntries(Object.entries(linha).map(([k, v]) => [paraCamel(k), v]));

function ehObjeto(corpo) {
    return corpo !== null && typeof corpo === 'object' && !Array.isArray(corpo);
}

// Valida o corpo e devolve { erro } ou { campos: [[def, valor], ...] } só com o que foi enviado.
function validarCorpo(def, corpo, { completo }) {
    if (!ehObjeto(corpo)) return { erro: 'Corpo da requisição inválido.' };
    const enviados = [];
    for (const [nome, campo] of Object.entries(def.campos)) {
        let valor = corpo[nome];
        if (valor === undefined) {
            if (completo && campo.obrigatorio) return { erro: `Campo "${nome}" é obrigatório.` };
            continue;
        }
        if (valor === null && campo.nulavel) {
            enviados.push([campo, null]);
            continue;
        }
        if (typeof valor === 'string' && !campo.converter) valor = valor.trim();
        const erro = campo.validar(valor);
        if (erro) return { erro };
        enviados.push([campo, campo.converter ? campo.converter(valor) : valor]);
    }
    if (!enviados.length) return { erro: 'Nenhum campo para gravar.' };
    return { campos: enviados };
}

const marcador = (campo, n) => `$${n}${campo.cast ?? ''}`;

function responderErroBanco(erro, res) {
    if (erro.code === '23505') return res.status(409).json({ success: false, message: MSG_DUPLICADO });
    if (erro.code === '23503') return res.status(400).json({ success: false, message: MSG_REFERENCIA });
    return null;
}

function criarCadastrosRouter({ dbPainel }) {
    const router = express.Router();

    // Executa a gravação traduzindo erros de integridade; os demais caem no 500 de rota().
    const gravar = (mensagemErro, handler) => rota(mensagemErro, async (req, res) => {
        try {
            await handler(req, res);
        } catch (erro) {
            if (responderErroBanco(erro, res)) return;
            throw erro;
        }
    });

    const auditar = (req, recurso, acao, linha, detalhe) => registrarAuditoria(dbPainel, {
        usuarioId: req.usuario.id,
        usuarioLogin: req.usuario.login,
        acao,
        alvo: `${recurso.tabela}:${linha.id}`,
        detalhe,
    });

    async function listar(def, req, res) {
        const params = [];
        let filtro = '';
        if (def.campos.projetoId && req.query.projetoId !== undefined) {
            const id = Number(req.query.projetoId);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({ success: false, message: 'Parâmetro "projetoId" inválido.' });
            }
            params.push(id);
            filtro = 'WHERE projeto_id = $1';
        }
        const ordem = def.ordem ?? 'id';
        const { rows } = await dbPainel.query(
            `SELECT * FROM painel.${def.tabela} ${filtro} ORDER BY ${ordem}, id`,
            params
        );
        res.json({ success: true, data: rows.map(linhaCamel) });
    }

    async function inserir(def, corpo, { conflito } = {}) {
        const v = validarCorpo(def, corpo, { completo: true });
        if (v.erro) return v;
        const colunas = v.campos.map(([c]) => c.coluna);
        const marcas = v.campos.map(([c], i) => marcador(c, i + 1));
        let sql = `INSERT INTO painel.${def.tabela} (${colunas.join(', ')}) VALUES (${marcas.join(', ')})`;
        if (conflito) {
            const atualiza = colunas.filter((c) => !conflito.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
            sql += ` ON CONFLICT (${conflito.join(', ')}) DO UPDATE SET ${atualiza.join(', ')}`;
        }
        const { rows } = await dbPainel.query(`${sql} RETURNING *`, v.campos.map(([, valor]) => valor));
        return { linha: rows[0], detalhe: Object.fromEntries(Object.keys(def.campos).filter((k) => corpo[k] !== undefined).map((k) => [k, corpo[k]])) };
    }

    for (const [nome, def] of Object.entries(RECURSOS)) {
        router.get(`/${nome}`, rota(`Erro ao listar ${nome}`, (req, res) => listar(def, req, res)));

        router.post(`/${nome}`, gravar(`Erro ao criar ${nome}`, async (req, res) => {
            const r = await inserir(def, req.body);
            if (r.erro) return res.status(400).json({ success: false, message: r.erro });
            await auditar(req, def, 'cadastro.criar', r.linha, r.detalhe);
            res.status(201).json({ success: true, data: linhaCamel(r.linha) });
        }));

        router.put(`/${nome}/:id`, gravar(`Erro ao atualizar ${nome}`, async (req, res) => {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({ success: false, message: 'Identificador inválido.' });
            }
            const v = validarCorpo(def, req.body, { completo: false });
            if (v.erro) return res.status(400).json({ success: false, message: v.erro });
            const sets = v.campos.map(([c], i) => `${c.coluna} = ${marcador(c, i + 1)}`);
            const { rows } = await dbPainel.query(
                `UPDATE painel.${def.tabela} SET ${sets.join(', ')} WHERE id = $${sets.length + 1} RETURNING *`,
                [...v.campos.map(([, valor]) => valor), id]
            );
            if (!rows.length) return res.status(404).json({ success: false, message: 'Cadastro não encontrado.' });
            await auditar(req, def, 'cadastro.atualizar', rows[0], Object.fromEntries(v.campos.map(([c, valor]) => [c.coluna, valor])));
            res.json({ success: true, data: linhaCamel(rows[0]) });
        }));
    }

    router.get('/metas', rota('Erro ao listar metas', (req, res) => listar({ ...META, ordem: 'projeto_id, etapa' }, req, res)));

    router.put('/metas', gravar('Erro ao gravar meta', async (req, res) => {
        const r = await inserir(META, req.body, { conflito: ['projeto_id', 'etapa'] });
        if (r.erro) return res.status(400).json({ success: false, message: r.erro });
        await auditar(req, META, 'cadastro.atualizar', r.linha, r.detalhe);
        res.json({ success: true, data: linhaCamel(r.linha) });
    }));

    return router;
}

module.exports = { criarCadastrosRouter };
