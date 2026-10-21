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

// Navegador antigo demais (ex.: iPhone com iOS anterior ao 16): em vez de tela
// branca, explica o que fazer. Roda antes do app, sem sintaxe moderna.
(function () {
  var ok = typeof structuredClone === 'function' && typeof Object.hasOwn === 'function' && 'indexedDB' in window && 'noModule' in document.createElement('script');
  function show() {
    var root = document.getElementById('root');
    if (!root || (ok && (window.__nexoIniciado || root.childElementCount))) return;
    root.innerHTML =
      '<div role="alert" class="np-noscript" data-testid="navegador-antigo"><h1>Atualize o navegador para usar o NexoProcess</h1>' +
      '<p>Este navegador é antigo demais para o app. Use a versão mais recente do Chrome, Edge, Firefox ou Safari — no iPhone e no iPad, iOS 16 ou mais novo.</p>' +
      '<p>Se você já usava o app neste aparelho, seus dados continuam guardados aqui.</p></div>';
  }
  if (!ok) {
    window.__nexoIncompativel = true;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
  } else {
    // Falha ao interpretar o código do app (sintaxe nova demais) antes de ele iniciar.
    window.addEventListener('error', function (e) {
      if ((e && e.error instanceof SyntaxError) || /SyntaxError/.test(String(e && e.message))) show();
    });
  }
})();
