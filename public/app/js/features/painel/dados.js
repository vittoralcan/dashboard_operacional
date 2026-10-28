// @ts-check
import { API } from '../../config.js';
import { normalizarHojeAtlas, resumoDaInstancia, resumoDoPainel, INSTANCIAS_ATLAS } from '../../core/painel.js';
import { ativo, ausenteSe404 } from '../../config/recursos.js';
import { definirContadores, contadorEmAndamento, contadorApis } from '../../core/contadores.js';
import { carregarConfigFluxo } from '../fluxo/config-fluxo.js';
import { criarDadosFluxo } from '../fluxo/dados.js';

/**
 * Acesso aos números da seleção de projetos, dos hubs e da Macro View. Cada método é independente: quem chama dispara os que
 * precisa e pinta cada bloco quando o SEU dado chega — uma rota fora do ar nunca derruba as outras (RA-015, `Promise.allSettled`).
 * Quando `GET /painel/resumo` existir (recurso `painel.resumo`), só `instancia()` e os métodos de módulo mudam; as telas não.
 *
 * @param {ReturnType<typeof import('../../core/api.js').criarApi>} api
 */
export function criarDadosPainel(api) {
  /** `{ success:false }` com status 200 também é falha. @param {{ dados: any }} r */
  const exigir = (r) => {
    const j = r.dados;
    if (!j || j.success === false) throw new Error((j && (j.message || j.error)) || 'O servidor não devolveu os dados.');
    return j;
  };
  return {
    /** Imagens de hoje de cada instância do ATLAS (`GET /atlas/macro-view/summary`). @param {AbortSignal} [sinal] */
    async hojeAtlas(sinal) { return normalizarHojeAtlas(exigir(await api.get(`${API.painel}/atlas/macro-view/summary`, { sinal, etag: false }))); },
    /** APIs monitoradas (monitor nativo, ou Apps Script de reserva): quantas online, o total, a lista (uptime) e o intervalo. @param {AbortSignal} [sinal] */
    async apis(sinal) {
      // adaptadores e monitor.js só aqui (sob demanda): fora do peso das telas que importam este módulo
      const [{ criarAdaptadorGas }, { criarAdaptadorNativo }, { resumir }] = await Promise.all([import('../monitoramento/adaptador-gas.js'), import('../monitoramento/adaptador-nativo.js'), import('../../core/monitor.js')]);
      const gas = criarAdaptadorGas(api);
      const nativo = criarAdaptadorNativo(api);
      /** @type {{ apis: import('../../core/monitor.js').Api[], intervalo: number|null }|null} */
      let d = null;
      if (ativo('monitor.nativo')) { // monitor nativo primeiro; sem APIs cadastradas (ou fora do ar) → Apps Script, como na tela de Monitoramento
        try { const n = await nativo.listar(sinal); if (n.apis.length) d = n; } catch (e) { if (sinal && sinal.aborted) throw e; ausenteSe404('monitor.nativo', e); }
      }
      const { apis, intervalo } = d || await gas.listar(sinal);
      const r = resumir(apis);
      definirContadores({ monitoramento: contadorApis(r) });
      return { online: r.online, total: r.total, apis, intervalo };
    },
    /**
     * Resumo de uma instância Captura (id de `config/fluxos`). `status:false` pula a rota de fases quando só se quer o mês.
     * Metade que falha vira `null`; só rejeita se a configuração não puder ser lida ou AS DUAS rotas falharem.
     * @param {string} instancia @param {{ status?: boolean, sinal?: AbortSignal }} [o]
     */
    async instancia(instancia, o = {}) {
      const cfg = await carregarConfigFluxo(instancia, o.sinal);
      if (!cfg) throw new Error(`Configuração "${instancia}" indisponível.`);
      const d = criarDadosFluxo(api, cfg);
      const [s, g] = await Promise.allSettled([o.status === false ? Promise.resolve(null) : d.statusFases(o.sinal), d.gestao(o.sinal)]);
      if (g.status === 'rejected' && (o.status === false || s.status === 'rejected')) throw g.reason;
      const gestao = g.status === 'fulfilled' ? g.value : null;
      const resumo = resumoDaInstancia({ cfg, status: s.status === 'fulfilled' ? s.value : null, gestao: gestao && gestao.colunas, resumoMes: gestao && gestao.resumo });
      if (resumo.emAndamento !== null) definirContadores({ [instancia]: contadorEmAndamento(resumo.emAndamento) }); // NAV-10: a barra só pinta o que alguém já leu
      return { cfg, resumo };
    },
    /** KPIs de TODAS as instâncias do ATLAS numa chamada (`GET /painel/resumo`, B6): `{ id → resumo | null }`. @param {AbortSignal} [sinal] */
    async painelResumo(sinal) {
      const j = exigir(await api.get(`${API.painel}/painel/resumo`, { sinal }));
      const inst = (j.data && j.data.instancias) || {};
      const r = /** @type {Record<string, import('../../core/painel.js').ResumoInstancia|null>} */ (Object.fromEntries(INSTANCIAS_ATLAS.map((id) => [id, resumoDoPainel(id, inst[id])])));
      definirContadores(Object.fromEntries(INSTANCIAS_ATLAS.map((id) => [id, contadorEmAndamento(r[id] && r[id].emAndamento)])));
      return r;
    },
    /**
     * As 4 instâncias do ATLAS: uma chamada (`/painel/resumo`) e, se ela falhar ou o recurso estiver desligado, a composição
     * antiga (status-fases + gestao de cada uma) — o mesmo formato nas duas vias. `{ id → resumo | null }`.
     * @param {AbortSignal} [sinal]
     */
    async atlas(sinal) {
      if (ativo('painel.resumo')) {
        try { return await this.painelResumo(sinal); } catch (e) { if (sinal && sinal.aborted) throw e; ausenteSe404('painel.resumo', e); console.warn('painel/resumo indisponível; compondo por instância.', e); }
      }
      const r = await Promise.allSettled(INSTANCIAS_ATLAS.map((id) => this.instancia(id, { status: true, sinal })));
      return /** @type {Record<string, import('../../core/painel.js').ResumoInstancia|null>} */ (Object.fromEntries(INSTANCIAS_ATLAS.map((id, i) => [id, r[i].status === 'fulfilled' ? /** @type {any} */ (r[i]).value.resumo : null])));
    },
  };
}
