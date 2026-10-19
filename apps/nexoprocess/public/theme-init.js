// Aplica o tema antes da pintura (evita "flash" do tema errado). Arquivo
// externo para permitir CSP sem 'unsafe-inline' em scripts.
(function () {
  try {
    var t = localStorage.getItem('nexo.theme');
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
