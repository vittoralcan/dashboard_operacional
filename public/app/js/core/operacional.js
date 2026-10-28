// @ts-check
/** Funções puras do tablet: ordem A-Z, cronômetro, normalização das respostas e texto do bip. Sem DOM, sem fetch, sem relógio implícito. */

/**
 * @typedef {{ id: number, nome: string, funcao: string|null, avatar: string|null }} Colaborador
 * @typedef {{ id: number, codigo: string, colaboradorId: number, colaboradorNome: string, mesaId: number|null, etapa: string, inicioMs: number, pausadoS: number, pausaInicioMs: number|null, pausaAutomatica: boolean, fimSolicitadoMs: number|null }} CaixaAberta
 * @typedef {{ agoraMs: number|null, abertas: CaixaAberta[] }} EstadoTurno
 */

export const ETAPAS = [
  { id: 'higienizacao', rotulo: 'Higienização' },
  { id: 'remontagem', rotulo: 'Remontagem' },
];

export const ETAPA_DIGITALIZACAO = 'digitalizacao';

/** Etapas que o estado do turno pode trazer (o tablet escolhe só entre ETAPAS; a digitalização tem tela própria). @param {unknown} valor */
export function normalizarEtapaDoTurno(valor) {
  return valor === ETAPA_DIGITALIZACAO ? ETAPA_DIGITALIZACAO : normalizarEtapa(valor);
}

/** Qualquer valor fora da lista de etapas vira 'higienizacao'. @param {unknown} valor */
export function normalizarEtapa(valor) {
  return ETAPAS.some((e) => e.id === valor) ? /** @type {string} */ (valor) : 'higienizacao';
}

/** Rótulo para exibição da etapa. @param {unknown} etapa */
export function rotuloEtapa(etapa) {
  if (etapa === ETAPA_DIGITALIZACAO) return 'Digitalização';
  const id = normalizarEtapa(etapa);
  return /** @type {{ rotulo: string }} */ (ETAPAS.find((e) => e.id === id)).rotulo;
}

/** Ordena A-Z sem distinguir acento nem caixa (mesma regra do back). Não altera a lista de entrada.
 * @template {{ nome: string }} T
 * @param {T[]} lista
 * @returns {T[]}
 */
export function ordenarNomes(lista) {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

/** Instante ISO → milissegundos, ou null se inválido. @param {unknown} iso */
function msDeIso(iso) {
  if (typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Segundos entre o início (ISO) e agora, corrigido pelo desvio do relógio do servidor. Nunca negativo.
 * @param {string} inicioIso
 * @param {number} agoraMs relógio local
 * @param {number} [desvioMs] servidor - local (ver desvioDoRelogio)
 */
export function segundosDecorridos(inicioIso, agoraMs, desvioMs = 0) {
  const inicio = msDeIso(inicioIso);
  if (inicio === null || !Number.isFinite(agoraMs)) return 0;
  const decorridoMs = agoraMs + desvioMs - inicio;
  return Math.max(0, Math.floor(decorridoMs / 1000));
}

/**
 * Desvio do relógio local em relação ao servidor (servidor - local). 0 se algum valor for inválido.
 * @param {string} agoraServidorIso
 * @param {number} agoraLocalMs
 */
export function desvioDoRelogio(agoraServidorIso, agoraLocalMs) {
  const servidor = msDeIso(agoraServidorIso);
  if (servidor === null || !Number.isFinite(agoraLocalMs)) return 0;
  return servidor - agoraLocalMs;
}

const doisDigitos = (/** @type {number} */ n) => String(n).padStart(2, '0');

/**
 * Cronômetro: MM:SS e, a partir de 1 hora, H:MM:SS. Negativo ou inválido vira 00:00.
 * @param {number} segundos
 */
export function formatarCronometro(segundos) {
  const total = Number.isFinite(segundos) ? Math.max(0, Math.floor(segundos)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${doisDigitos(m)}:${doisDigitos(s)}` : `${doisDigitos(m)}:${doisDigitos(s)}`;
}

/**
 * Código lido pelo leitor: remove controles (Enter/Tab) e espaços das pontas. Espaços internos ficam.
 * Não-texto vira ''.
 * @param {unknown} valor
 */
export function normalizarCodigoBip(valor) {
  if (typeof valor !== 'string') return '';
  return valor.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

/**
 * Colaboradores da resposta de GET /colaboradores: descarta entradas inválidas e ordena A-Z.
 * @param {unknown} lista
 * @returns {Colaborador[]}
 */
export function normalizarColaboradores(lista) {
  if (!Array.isArray(lista)) return [];
  /** @type {Colaborador[]} */
  const validos = [];
  for (const item of lista) {
    if (item === null || typeof item !== 'object') continue;
    const { id, nome, funcao, avatar } = /** @type {Record<string, unknown>} */ (item);
    if (!Number.isInteger(id) || typeof nome !== 'string' || nome.trim() === '') continue;
    validos.push({
      id: /** @type {number} */ (id),
      nome: nome.trim(),
      funcao: typeof funcao === 'string' ? funcao : null,
      avatar: typeof avatar === 'string' ? avatar : null,
    });
  }
  return ordenarNomes(validos);
}

/**
 * Id da caixa: inteiro positivo. Aceita também texto numérico, porque o id é bigint no banco e o driver
 * pode entregá-lo como "42"; sem isso a caixa em andamento sumia da tela.
 * @param {unknown} valor
 * @returns {number|null}
 */
export function idDeCaixa(valor) {
  if (typeof valor === 'number') return Number.isSafeInteger(valor) && valor > 0 ? valor : null;
  if (typeof valor === 'string' && /^\d{1,15}$/.test(valor)) return Number(valor) > 0 ? Number(valor) : null;
  return null;
}

/**
 * Estado de GET /estado: hora do servidor e caixas abertas em milissegundos.
 * Caixa com início inválido é descartada.
 * @param {unknown} estado
 * @returns {EstadoTurno}
 */
export function normalizarEstado(estado) {
  if (estado === null || typeof estado !== 'object') return { agoraMs: null, abertas: [] };
  const { agora, abertas } = /** @type {Record<string, unknown>} */ (estado);
  /** @type {CaixaAberta[]} */
  const caixas = [];
  for (const item of Array.isArray(abertas) ? abertas : []) {
    if (item === null || typeof item !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (item);
    const inicioMs = msDeIso(r.inicioEm);
    const id = idDeCaixa(r.id);
    if (inicioMs === null || id === null) continue;
    caixas.push({
      id,
      codigo: String(r.codigo ?? ''),
      colaboradorId: Number(r.colaboradorId),
      colaboradorNome: String(r.colaboradorNome ?? ''),
      mesaId: Number.isInteger(r.mesaId) ? /** @type {number} */ (r.mesaId) : null,
      etapa: normalizarEtapaDoTurno(r.etapa),
      inicioMs,
      pausadoS: Number.isFinite(r.pausadoS) ? Math.max(0, /** @type {number} */ (r.pausadoS)) : 0,
      pausaInicioMs: msDeIso(r.pausaInicioEm),
      pausaAutomatica: r.pausaAutomatica === true,
      fimSolicitadoMs: msDeIso(r.fimSolicitadoEm),
    });
  }
  return { agoraMs: msDeIso(agora), abertas: caixas };
}

/**
 * Ids dos colaboradores que já têm caixa em andamento (inclusive pausada): não podem iniciar outra.
 * @param {CaixaAberta[]} abertas
 * @returns {Set<number>}
 */
export function colaboradoresOcupados(abertas) {
  return new Set(abertas.map((c) => c.colaboradorId));
}

/**
 * Caixa em andamento de cada colaborador (a mais antiga, se houver mais de uma).
 * @param {CaixaAberta[]} abertas
 * @returns {Map<number, CaixaAberta>}
 */
export function caixaPorColaborador(abertas) {
  /** @type {Map<number, CaixaAberta>} */
  const m = new Map();
  for (const c of [...abertas].sort((a, b) => a.inicioMs - b.inicioMs)) if (!m.has(c.colaboradorId)) m.set(c.colaboradorId, c);
  return m;
}

const HORA_SP = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/**
 * Texto do selo de quem não pode iniciar outra caixa: diz qual, em que etapa e desde quando.
 * @param {CaixaAberta | undefined} caixa
 */
export function textoOcupado(caixa) {
  if (!caixa) return 'Já tem caixa em andamento';
  return `Já tem a caixa ${caixa.codigo} em ${rotuloEtapa(caixa.etapa)} desde ${HORA_SP.format(caixa.inicioMs)}`;
}

/**
 * Aviso quando a tela não tem caixas, mas o turno tem caixas abertas na outra tela (digitalização × demais etapas).
 * @param {CaixaAberta[]} abertas todas as do turno
 * @param {(c: CaixaAberta) => boolean} daEstaTela
 * @param {string} nomeOutraTela
 * @returns {string} '' se não há nada na outra tela
 */
export function avisoOutraTela(abertas, daEstaTela, nomeOutraTela) {
  const n = abertas.filter((c) => !daEstaTela(c)).length;
  if (n === 0) return '';
  return `${n === 1 ? 'Há 1 caixa em andamento' : `Há ${n} caixas em andamento`} em ${nomeOutraTela}.`;
}

/**
 * Cartão de retorno depois de iniciar ou concluir uma caixa. Nunca mostra tempo: o operador não vê quanto demorou.
 * @param {'iniciada'|'concluida'|'pausada'|'retomada'} tipo
 * @param {{ codigo: string, nome?: string, imagens?: number }} d
 * @returns {{ tipo: string, titulo: string, linhas: string[] }}
 */
export function cartaoDeRetorno(tipo, d) {
  switch (tipo) {
    case 'iniciada': return { tipo, titulo: 'Caixa iniciada', linhas: [d.codigo, d.nome || 'Em andamento'] };
    case 'pausada': return { tipo, titulo: 'Caixa pausada', linhas: [d.codigo, 'Toque em Retomar quando voltar'] };
    case 'retomada': return { tipo, titulo: 'Caixa retomada', linhas: [d.codigo, 'Em andamento'] };
    default: {
      const imagens = Number.isInteger(d.imagens) ? `${d.imagens} imagens` : '';
      return { tipo: 'concluida', titulo: 'Caixa concluída', linhas: [d.codigo, imagens].filter(Boolean) };
    }
  }
}

/**
 * Nº de imagens digitado: inteiro maior ou igual a 1, ou null.
 * @param {unknown} texto
 * @returns {number|null}
 */
export function lerImagens(texto) {
  const t = String(texto ?? '').trim();
  if (!/^\d{1,7}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 ? n : null;
}

/**
 * Texto mostrado para cada resposta do bip (POST /bip). Ação desconhecida → ''.
 * @param {{ acao?: unknown, duracaoS?: unknown, etapa?: unknown } | null} resposta
 */
export function mensagemBip(resposta) {
  switch (resposta?.acao) {
    case 'finalizar':
      return `Caixa concluída em ${formatarCronometro(Number(resposta.duracaoS))}`;
    case 'duplicado':
      return 'Bipe repetido: esta caixa já foi registrada agora.';
    case 'ja_concluida':
      return 'Esta caixa já foi concluída.';
    case 'outra_etapa':
      return `Esta caixa já está em andamento em ${rotuloEtapa(resposta.etapa)}. Conclua pela tela dessa etapa.`;
    case 'inexistente':
      return 'Código inválido ou não reconhecido.';
    default:
      return '';
  }
}
