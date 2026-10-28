import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilar, caminhoDoHash, resolver, rotaConhecida } from '../../public/app/js/core/router.js';

const nada = async () => ({ montar() {} });
const ROTAS = [
  { caminho: '/login', camada: 'auth', acesso: 'publica', titulo: 'Entrar', carregar: nada },
  { caminho: '/projetos', camada: 'shell', acesso: 'logado', titulo: 'Projetos', carregar: nada },
  { caminho: '/boreal', camada: 'shell', acesso: 'logado', titulo: 'BOREAL', carregar: nada },
  { caminho: '/boreal/digitalizacao/:vista?', camada: 'shell', acesso: 'logado', titulo: 'Digitalização', carregar: nada },
  { caminho: '/atlas/:instancia/:vista?', camada: 'shell', acesso: 'logado', titulo: 'Fluxo', carregar: nada },
  { caminho: '/usuarios/novo', camada: 'shell', acesso: 'admin', titulo: 'Criar usuário', carregar: nada },
  { caminho: '/', camada: 'shell', acesso: 'logado', titulo: 'Início', carregar: nada },
];

test('caminhoDoHash normaliza #, barras e query', () => {
  assert.equal(caminhoDoHash(''), '/');
  assert.equal(caminhoDoHash('#'), '/');
  assert.equal(caminhoDoHash('#/'), '/');
  assert.equal(caminhoDoHash('#/projetos'), '/projetos');
  assert.equal(caminhoDoHash('#/projetos/'), '/projetos');
  assert.equal(caminhoDoHash('#//projetos?x=1'), '/projetos');
  assert.equal(caminhoDoHash('#projetos'), '/projetos');
});

test('resolve rota exata', () => {
  assert.equal(resolver('/projetos', ROTAS).rota.titulo, 'Projetos');
  assert.equal(resolver('/', ROTAS).rota.titulo, 'Início');
});

test('parâmetro opcional casa com e sem o segmento', () => {
  assert.deepEqual(resolver('/boreal/digitalizacao', ROTAS).params, {});
  assert.deepEqual(resolver('/boreal/digitalizacao/fluxograma', ROTAS).params, { vista: 'fluxograma' });
});

test('parâmetro obrigatório + opcional (módulo de fluxo único)', () => {
  assert.deepEqual(resolver('/atlas/negativos', ROTAS).params, { instancia: 'negativos' });
  assert.deepEqual(resolver('/atlas/inventarios/fluxograma', ROTAS).params, { instancia: 'inventarios', vista: 'fluxograma' });
});

test('"/atlas" sem instância não casa com a rota de fluxo', () => {
  assert.equal(resolver('/atlas', ROTAS), null);
});

test('rota inexistente e segmento a mais não casam', () => {
  assert.equal(resolver('/nao-existe', ROTAS), null);
  assert.equal(resolver('/projetos/extra', ROTAS), null);
  assert.equal(resolver('/atlas/a/b/c', ROTAS), null);
});

test('parâmetros são decodificados', () => {
  assert.equal(resolver('/atlas/sub%20sa%C3%BAde', ROTAS).params.instancia, 'sub saúde');
});

test('caracteres especiais no caminho da rota não viram regex', () => {
  const { regex } = compilar('/a.b/c+d');
  assert.ok(regex.test('/a.b/c+d'));
  assert.ok(!regex.test('/aXb/c+d'));
});

test('rotaConhecida valida destino pós-login (nunca confiar em valor externo)', () => {
  assert.equal(rotaConhecida('#/boreal/digitalizacao/fluxograma', ROTAS), true);
  assert.equal(rotaConhecida('/projetos', ROTAS), true);
  assert.equal(rotaConhecida('https://malicioso.exemplo', ROTAS), false);
  assert.equal(rotaConhecida('javascript:alert(1)', ROTAS), false);
  assert.equal(rotaConhecida('/../../etc/passwd', ROTAS), false);
});
