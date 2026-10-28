import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { mensagemDeErroCamera, cameraDisponivel, HTML5_QRCODE_ARQUIVO, HTML5_QRCODE_SRI } from '../../public/app/js/ui/scanner.js';

test('html5-qrcode fixado em vendor/: o SRI declarado confere com o arquivo e a licença acompanha', () => {
  const raiz = new URL('../../public/app/', import.meta.url);
  const arquivo = fs.readFileSync(new URL(HTML5_QRCODE_ARQUIVO, raiz));
  assert.equal(`sha384-${crypto.createHash('sha384').update(arquivo).digest('base64')}`, HTML5_QRCODE_SRI);
  assert.match(HTML5_QRCODE_ARQUIVO, /html5-qrcode-\d+\.\d+\.\d+\.min\.js$/, 'versão no nome do arquivo');
  assert.ok(fs.existsSync(new URL('vendor/LICENSE-html5-qrcode.txt', raiz)));
});

test('mensagens da câmera: permissão, sem câmera, em uso, sem HTTPS e genérica — todas mandam digitar o código', () => {
  assert.match(mensagemDeErroCamera({ name: 'NotAllowedError' }), /Permissão da câmera negada/);
  assert.match(mensagemDeErroCamera({ name: 'NotFoundError' }), /Nenhuma câmera/);
  assert.match(mensagemDeErroCamera({ name: 'NotReadableError' }), /em uso/);
  assert.match(mensagemDeErroCamera({ semCameraSegura: true }), /HTTPS/);
  assert.match(mensagemDeErroCamera(new Error('qualquer')), /Não foi possível acessar a câmera/);
  assert.match(mensagemDeErroCamera(null), /Digite o código/);
});

test('sem navegador (Node) a câmera não está disponível', () => { assert.equal(cameraDisponivel(), false); });
