/* Registro de violações da CSP enquanto ela está em modo relatório (Onda 9; some no "enforce").
   Script síncrono e externo (a CSP dispensa 'unsafe-inline'): precisa existir ANTES de qualquer CSS, fonte
   ou módulo, senão perde as primeiras violações. Guarda as 30 últimas em sessionStorage (`dsn-csp`) e avisa
   no console; nada sai do navegador — o relatório é lido na homologação (console ou `sessionStorage`). */
(function () {
  document.addEventListener('securitypolicyviolation', function (e) {
    var item = { em: new Date().toISOString(), diretiva: e.effectiveDirective, bloqueado: e.disposition === 'enforce', alvo: String(e.blockedURI || '').slice(0, 120), arquivo: String(e.sourceFile || '').slice(0, 120), linha: e.lineNumber };
    try {
      var lista = JSON.parse(sessionStorage.getItem('dsn-csp') || '[]');
      lista.push(item);
      sessionStorage.setItem('dsn-csp', JSON.stringify(lista.slice(-30)));
    } catch (err) { /* sem armazenamento */ }
    if (window.console) console.warn('[CSP]', item.diretiva, item.alvo, item.arquivo + ':' + item.linha);
  });
})();
