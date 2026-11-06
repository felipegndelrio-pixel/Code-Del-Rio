/* Paddle.js na página de venda (/en/). Carregado SÓ quando o build tem as variáveis VITE_PADDLE_*.
 * Sem JavaScript inline (CSP). Lê token, ambiente e price id dos atributos data-* da própria tag.
 * Ao concluir o pagamento (evento checkout.completed da doc oficial), leva o comprador a /entrar?lang=en com
 * o id da transação e o e-mail no FRAGMENTO (#…), que não vai ao servidor nem ao Referer.
 * Doc: developer.paddle.com/paddle-js/events/checkout-completed, /methods/paddle-checkout-open, /methods/paddle-environment-set */
(function (root) {
  'use strict';
  var TXN = /^txn_[a-z0-9]{26}$/;
  /** URL de retorno para a entrada. Dados inválidos → entrada sem preenchimento. */
  function entryUrl(txn, email) {
    var base = '/entrar?lang=en';
    if (typeof txn !== 'string' || !TXN.test(txn)) return base;
    var h = 'txn=' + encodeURIComponent(txn);
    if (typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) h += '&email=' + encodeURIComponent(email);
    return base + '#' + h;
  }
  /** Só reage a checkout.completed. */
  function onEvent(ev, go) {
    if (!ev || ev.name !== 'checkout.completed' || !ev.data) return false;
    go(entryUrl(ev.data.transaction_id, ev.data.customer && ev.data.customer.email));
    return true;
  }
  function init(doc, win) {
    var tag = doc.currentScript || doc.querySelector('script[data-token][data-price]');
    if (!tag || !win.Paddle) return false;
    var token = tag.getAttribute('data-token');
    var price = tag.getAttribute('data-price');
    if (tag.getAttribute('data-env') === 'sandbox') win.Paddle.Environment.set('sandbox');
    win.Paddle.Initialize({ token: token, eventCallback: function (ev) { onEvent(ev, function (u) { win.location.assign(u); }); } });
    var buttons = doc.querySelectorAll('[data-paddle-buy]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function (e) {
        e.preventDefault();
        win.Paddle.Checkout.open({ items: [{ priceId: price, quantity: 1 }], settings: { displayMode: 'overlay', locale: 'en' } });
      });
    }
    return true;
  }
  var api = { entryUrl: entryUrl, onEvent: onEvent, init: init };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.document) init(root.document, root);
})(typeof window !== 'undefined' ? window : globalThis);
