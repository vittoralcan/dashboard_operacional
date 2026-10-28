const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '../..');
const WF = '.github/workflows';
const lerAtual = (nome) => fs.readFileSync(path.join(raiz, WF, nome), 'utf8');
/** Bloco `permissions:` de nível raiz: devolve as linhas indentadas que o compõem, ou null. */
function permissoesRaiz(yaml) {
  const linhas = yaml.split('\n');
  const i = linhas.findIndex((l) => /^permissions:\s*$/.test(l));
  if (i < 0) return null;
  const filhas = [];
  for (let j = i + 1; j < linhas.length && /^\s+\S/.test(linhas[j]); j++) filhas.push(linhas[j].trim());
  return filhas.filter((l) => !l.startsWith('#'));
}

for (const [ca, nome] of [['CA1', 'deploy-back-dashboard.yml'], ['CA2', 'deploy-frontend.yml']]) {
  test(`${ca}: ${nome} declara permissions: contents: read antes de jobs`, () => {
    const y = lerAtual(nome);
    assert.deepEqual(permissoesRaiz(y), ['contents: read']);
    assert.ok(y.indexOf('\npermissions:') < y.indexOf('\njobs:'), 'permissions deve vir antes de jobs');
  });
}

// Marcos do arquivo original que não podem mudar (passos de deploy). No showcase os dois deploys são só manuais (workflow_dispatch).
const MARCOS = {
  'deploy-back-dashboard.yml': ['workflow_dispatch: {}', 'runs-on: [self-hosted, linux, dashboard]', 'environment: production-dashboard', 'git -C /opt/dashboard reset --hard origin/main', 'sudo systemctl restart back-dashboard', 'curl -fsS --retry 5'],
  'deploy-frontend.yml': ['workflow_dispatch: {}', 'uses: ./.github/workflows/verificar-frontend.yml', 'needs: verificar', 'wlixcc/SFTP-Deploy-Action@v1.2.4', "local_path: 'public/*'"],
};

test('CA3: sem write e gatilhos e passos de deploy intactos', () => {
  for (const [nome, marcos] of Object.entries(MARCOS)) {
    const atual = lerAtual(nome);
    assert.doesNotMatch(atual, /:\s*write\b/, `${nome} ganhou write`);
    for (const m of marcos) assert.ok(atual.includes(m), `${nome}: perdeu "${m}"`);
  }
});
