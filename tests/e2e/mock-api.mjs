// APIs simuladas POR CONTRATO (docs/api/) para os testes E2E: back_auth (:3002), back_dashboard (:3010),
// e o Apps Script do Monitoramento. Nada aqui depende de backend no ar.
// O `st` devolvido é o "servidor": os testes leem as chamadas feitas e mudam o estado (falhas, 401, backend antigo…).

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const jwt = (u, expSeg = 36000) => `${b64({ alg: 'HS256' })}.${b64({ sub: u.id, login: u.login, tipo: u.tipo, exp: Math.floor(Date.now() / 1000) + expSeg })}.sig`;

export const USUARIOS = {
  rafael: { id: 1, nome: 'Rafael Lima Moura', login: 'rafael', senha: 'Senha-Forte-123', tipo: 'admin', precisaTrocarSenha: false },
  maria: { id: 2, nome: 'Maria Souza', login: 'maria', senha: 'Senha-Forte-123', tipo: 'standard', precisaTrocarSenha: false },
  novo: { id: 3, nome: 'Novo Usuario', login: 'novo', senha: 'Temporaria-1', tipo: 'standard', precisaTrocarSenha: true },
};

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const serie = (k) => [86, 97, 92, 106, 101, 0, 52].map((v) => v * k);
const INSTANCIAS_ATLAS = { negativos: 2, 'certidoes': 3, inventarios: 4, 'cartografia': 5 };

/** Instala os mocks na página. `opcoes.usuario`: chave de USUARIOS já logado (padrão rafael) ou `null` (sem sessão). */
export async function instalar(page, opcoes = {}) {
  const agora = new Date();
  const st = {
    chamadas: [], falhas: new Set(), status401: false, semBackendNovo: !!opcoes.semBackendNovo, monitorVazio: false, atraso: opcoes.atraso ?? 30,
    metas: [{ projeto: 'atlas', escopo: 'negativos', ano: agora.getFullYear(), mes: agora.getMonth() + 1, valor: 750, unidade: 'pastas' }],
    notificacoes: [{ id: 3, tipo: 'alerta', titulo: 'Gargalo em Validação', texto: '118 pastas paradas.', criadoEm: new Date(Date.now() - 600000).toISOString(), lida: false, destino: { rota: '/atlas/certidoes/fluxograma', foco: { instancia: 'certidoes', fasId: 7 } } }],
    prefsPatches: [], loginTentativas: 0, envioConsultas: [], apisOff: opcoes.apisOff ?? 0,
  };
  const chamada = (base, req, p, corpo) => st.chamadas.push({ base, metodo: req.method(), caminho: p, corpo });

  const handler = (base) => async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    let corpo = null; try { corpo = req.postDataJSON(); } catch { /* GET */ }
    chamada(base, req, p, corpo);
    const json = (o, s = 200, cab = {}) => route.fulfill({ status: s, headers: { ...CORS, 'content-type': 'application/json', ...cab }, body: JSON.stringify(o) });
    await new Promise((r) => setTimeout(r, st.atraso));
    if (st.status401 && !p.includes('/auth/login')) return json({ success: false, message: 'Sessão expirada. Faça login novamente.' }, 401);
    if ([...st.falhas].some((f) => p.includes(f))) return json({ success: false, message: 'Falha simulada' }, 500);
    const eu = (() => { try { const t = (req.headers().authorization || '').replace('Bearer ', ''); const c = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()); return Object.values(USUARIOS).find((u) => u.login === c.login) || null; } catch { return null; } })();

    // ---------------------------------------------------------------- back_auth
    if (base === 'auth') {
      if (p === '/auth/login' && req.method() === 'POST') {
        st.loginTentativas += 1;
        const u = USUARIOS[String(corpo.login || '').trim().toLowerCase()];
        if (corpo.login === 'bloqueado') return json({ success: false, message: 'Muitas tentativas de login. Tente novamente em alguns minutos.' }, 429, { 'retry-after': '3' });
        if (!u || u.senha !== corpo.senha) return json({ success: false, message: 'Login ou senha inválidos.' }, 401);
        return json({ success: true, data: { token: jwt(u), usuario: { id: u.id, nome: u.nome, login: u.login, tipo: u.tipo, precisaTrocarSenha: u.precisaTrocarSenha } } });
      }
      if (!eu) return json({ success: false, message: 'Token de autenticação ausente.' }, 401);
      if (p === '/auth/me' && req.method() === 'GET') return json({ success: true, data: { ...eu, senha: undefined, email: `${eu.login}@example.com`, cargo: 'Supervisor', ultimoLoginEm: '2026-10-03T08:41:12-03:00', criadoEm: '2026-08-24T15:06:38-03:00', preferencias: {} } });
      if (p === '/auth/me/preferencias') { st.prefsPatches.push(corpo); return json({ success: true, data: corpo }); }
      if (p === '/auth/senha' && req.method() === 'PATCH') {
        if (String(corpo.novaSenha || '').length < 12) return json({ success: false, message: 'Nova senha deve ter ao menos 12 caracteres.' }, 400);
        eu.senha = corpo.novaSenha; eu.precisaTrocarSenha = false;
        return json({ success: true, data: { id: eu.id, nome: eu.nome, login: eu.login } });
      }
      return json({ success: false, message: 'Rota não encontrada.' }, 404);
    }
    if (!eu) return json({ success: false, message: 'Token de autenticação ausente.' }, 401);

    // ---------------------------------------------------------------- back_dashboard (ATLAS + rotas do backend novo)
    if (base === 'atlas') {
      if (st.semBackendNovo && (/^\/(metas|gargalos|atividades|notificacoes|painel|monitoramento|envio)/.test(p) || /\/(config|gargalos)$/.test(p))) return json({ success: false, message: 'Rota não encontrada.' }, 404);
      if (/\/config$/.test(p)) return json({ success: false, message: 'Rota não encontrada.' }, 404); // front usa a configuração local
      if (p === '/painel/resumo') {
        const inst = {};
        for (const [id, k] of Object.entries(INSTANCIAS_ATLAS)) {
          inst[id] = { projeto: 'atlas', emAndamento: 58 * k, finalizadosTotal: 612 * k, finalizadasMes: { pastas: 330 * k, imagens: 72600 * k }, metaPastas: id === 'negativos' ? 750 : null, variacaoPct: 4.1, projecaoMes: 682 * k, serie7Dias: serie(k), mesAnterior: { pastas: 317 * k, imagens: 69740 * k, ateDia: 4 }, sincronizacao: { ultimaSincronizacao: new Date().toISOString(), atrasado: false } };
        }
        return json({ success: true, data: { geradoEm: new Date().toISOString(), instancias: inst } });
      }
      if (p === '/metas' && req.method() === 'GET') return json({ success: true, data: st.metas });
      if (p === '/gargalos') return json({ success: true, data: [{ projeto: 'atlas', instancia: 'certidoes', fasId: 7, nome: 'Controle de Qualidade', pastas: 118, pctParadas: 31.4 }] });
      if (p === '/atividades') return json({ success: true, data: [{ id: 5, em: new Date(Date.now() - 120000).toISOString(), quem: 'rafael', sistema: false, acao: 'meta.definida', alvo: 'Meta de 10/2026', onde: 'atlas · negativos' }] });
      if (p === '/notificacoes' && req.method() === 'GET') return json({ success: true, data: { naoLidas: st.notificacoes.filter((n) => !n.lida).length, itens: st.notificacoes } });
      if (/^\/notificacoes\//.test(p)) { st.notificacoes.forEach((n) => { n.lida = true; }); return json({ success: true }); }
      const mg = /^\/atlas\/([^/]+)\/gargalos$/.exec(p);
      if (mg) return json({ success: true, data: { regra: {}, paradas: { pastas: 582, imagens: 85530 }, gargalo: null } });
      if (p === '/envio/resumo') {
        const instancia = new URL(req.url()).searchParams.get('instancia');
        st.envioConsultas.push(instancia);
        if (!instancia) return json({ success: false, message: 'Parâmetro "instancia" é obrigatório.' }, 400);
        if (instancia === 'bridge-novo') return json({ success: true, data: { geradoEm: new Date().toISOString(), cartoes: { enviadasHoje: 0, pendentes: 0, divergenciasAbertas: 0, taxaConferenciaPct: 100 }, funil: { naFila: 0, enviando: 0, conferindo: 0, concluida: 0, divergente: 0, erro: 0 }, vazao: [], recentes: [], heartbeat: { ultimoTs: null, versao: null, atrasado: null } } });
        const agora = Date.now();
        return json({ success: true, data: {
          geradoEm: new Date(agora).toISOString(),
          cartoes: { enviadasHoje: 24, pendentes: 4, divergenciasAbertas: 1, taxaConferenciaPct: 95.8 },
          funil: { naFila: 2, enviando: 1, conferindo: 1, concluida: 20, divergente: 1, erro: 0 },
          vazao: Array.from({ length: 8 }, (_, i) => ({ t: new Date(agora - (8 - i) * 60000).toISOString(), arquivosMin: 30 + i * 4, mbSeg: 1 + i / 10 })),
          recentes: [
            { pasta: 'ATLAS-CX-00231', fluxo: 'certidoes', status: 'concluida', resultado: 'ok', eventoTs: new Date(agora - 120000).toISOString() },
            { pasta: 'ATLAS-CX-00230', fluxo: 'negativos', status: 'divergente', resultado: 'divergente', eventoTs: new Date(agora - 600000).toISOString() },
            { pasta: '<img src=x onerror=alert(1)>', fluxo: 'fluxo-novo', status: 'erro', resultado: 'erro', eventoTs: new Date(agora - 900000).toISOString() },
            // o servidor só devolve `mensagem` nos alertas (mensagem iniciada por "[ALERTA]"); fora deles o campo não existe
            ...(instancia === 'bridge-alerta' ? [{ pasta: 'lixo', fluxo: 'certidoes', status: 'erro', resultado: 'erro', eventoTs: new Date(agora - 60000).toISOString(),
              mensagem: '[ALERTA] Pasta "lixo" na entrega não casa com o padrão <b>x</b>' }] : [])],
          heartbeat: { ultimoTs: new Date(agora - (instancia === 'bridge-atrasado' ? 3600000 : 90000)).toISOString(), versao: '1.0.1', atrasado: instancia === 'bridge-atrasado' },
        } });
      }
      if (p === '/monitoramento/apis') return json({ success: true, data: { intervaloMin: 15, ultimaVerificacao: null, proximaVerificacao: null, resumo: { online: 0, total: 0, latenciaMediaMs: null, disponibilidadePct: null }, apis: [] } });
    }

    // ---------------------------------------------------------------- dados do projeto (back_dashboard ATLAS)
    const inst = (/^\/atlas\/([^/]+)\//.exec(p) || [])[1];
    const k = INSTANCIAS_ATLAS[inst] || 1;
    if (p.endsWith('/macro-view/summary')) {
      return json({ success: true, data: { negativos: { imagensHoje: 1000 }, 'certidoes': { imagensHoje: 2000 }, inventarios: null, 'cartografia': { imagensHoje: 4000 } } });
    }
    if (p.endsWith('/status-fases')) {
      return json({ success: true, data: { 3: { pastas: 58 * k, imagens: 900 }, 7: { pastas: 10 * k, imagens: 1 }, 12: { pastas: 612 * k, imagens: 99999 } } });
    }
    if (p.endsWith('/gestao')) return json({ success: true, data: { fase3: { totaisMes: { TotalPastas: 800, TotalImagens: 24110 }, grafico7Dias: serie(1) }, fase12: { totaisMes: { TotalPastas: 330 * k, TotalImagens: 72600 * k }, grafico7Dias: serie(k) } } });
    if (p.endsWith('/sincronizacao')) return json({ success: true, data: { ultimaSincronizacao: new Date().toISOString(), atrasado: false } });
    return json({ success: false, message: 'Rota não encontrada.' }, 404);
  };

  await page.route(/localhost:3010\/api\//, handler('atlas'));
  await page.route(/localhost:3002\/api\//, handler('auth'));
  await page.route(/script\.google\.com\//, (route) => route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'success', triggerInterval: 15, data: Array.from({ length: 6 }, (_, i) => ({ funcao_api: `Inscrição Online - API ${i + 1}`, status_api: i < 6 - st.apisOff ? 'Online' : 'Offline', log_api: '', link_api: 'https://x.test/a', hora_disparo: '2026-10-04 09:00:00' })) }) }));

  // sessão semeada UMA vez por aba (o teste de "sair" não pode ser desfeito por um novo carregamento)
  if (opcoes.usuario !== null) {
    const u = USUARIOS[opcoes.usuario || 'rafael'];
    await page.addInitScript(([t, usuario]) => {
      try {
        if (sessionStorage.getItem('__e2e-semeado')) return;
        sessionStorage.setItem('__e2e-semeado', '1');
        localStorage.setItem('dsn-auth-token', t);
        localStorage.setItem('dsn-auth-usuario', JSON.stringify(usuario));
        if (!localStorage.getItem('dsn-theme')) localStorage.setItem('dsn-theme', 'dark');
      } catch { /* sem armazenamento */ }
    }, [jwt(u), { id: u.id, nome: u.nome, login: u.login, email: `${u.login}@example.com`, tipo: u.tipo, precisaTrocarSenha: u.precisaTrocarSenha }]);
  }
  return st;
}
