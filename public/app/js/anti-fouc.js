/* Define o tema antes da primeira pintura (THM-02). Único script síncrono da casca:
   arquivo externo (não inline) para a CSP dispensar 'unsafe-inline'. Lê `dsn-theme`
   (texto puro "dark"/"light"), a mesma chave do legado; qualquer outro valor = claro. */
(function () {
  var t = 'light';
  try { if (localStorage.getItem('dsn-theme') === 'dark') t = 'dark'; } catch (e) { /* sem armazenamento */ }
  document.documentElement.setAttribute('data-theme', t);
})();
