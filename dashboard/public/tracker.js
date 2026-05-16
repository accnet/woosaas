(function () {
  'use strict';

  var script = document.currentScript;
  var params = new URLSearchParams((script && script.src && script.src.split('?')[1]) || window.location.search);
  var siteId = params.get('site_id') || '';
  var apiKey = params.get('api_key') || '';
  var collectUrl = params.get('collect_url') || '/api/v1/collect';

  if (!siteId || !apiKey || !collectUrl) {
    return;
  }

  var clientKey = 'woosaas_client_id';
  var sessionKey = 'woosaas_session';
  var sessionTTL = 30 * 60 * 1000;

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) {}
  }

  function getClientId() {
    var value = storageGet(clientKey);
    if (!value) {
      value = uuid();
      storageSet(clientKey, value);
    }
    return value;
  }

  function getSessionId() {
    var now = Date.now();
    var raw = storageGet(sessionKey);
    var session = null;
    if (raw) {
      try { session = JSON.parse(raw); } catch (_) {}
    }
    if (!session || !session.id || !session.lastSeen || now - session.lastSeen > sessionTTL) {
      session = { id: uuid(), lastSeen: now };
    } else {
      session.lastSeen = now;
    }
    storageSet(sessionKey, JSON.stringify(session));
    return session.id;
  }

  function attribution() {
    var search = new URLSearchParams(window.location.search);
    return {
      source: search.get('utm_source') || '',
      medium: search.get('utm_medium') || '',
      campaign: search.get('utm_campaign') || '',
      content: search.get('utm_content') || '',
      term: search.get('utm_term') || '',
      gclid: search.get('gclid') || '',
      fbclid: search.get('fbclid') || '',
      ttclid: search.get('ttclid') || '',
      msclkid: search.get('msclkid') || ''
    };
  }

  function deviceType() {
    var width = window.innerWidth || document.documentElement.clientWidth || 0;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  function baseEvent(name, properties) {
    return {
      event_id: uuid(),
      event_time: new Date().toISOString(),
      event_name: name,
      client_id: getClientId(),
      session_id: getSessionId(),
      url: window.location.href,
      path: window.location.pathname,
      referrer: document.referrer || '',
      attribution: attribution(),
      device_type: deviceType(),
      user_agent: navigator.userAgent || '',
      properties: Object.assign({
        title: document.title || '',
        screen_width: window.screen ? window.screen.width : null,
        screen_height: window.screen ? window.screen.height : null,
        language: navigator.language || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
      }, properties || {})
    };
  }

  function send(name, properties) {
    var url = collectUrl + (collectUrl.indexOf('?') === -1 ? '?' : '&') + 'api_key=' + encodeURIComponent(apiKey);
    var body = JSON.stringify(baseEvent(name, properties));
    if (navigator.sendBeacon) {
      try {
        var ok = navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }));
        if (ok) return;
      } catch (_) {}
    }
    sendFetch(url, body, 0);
  }

  function sendFetch(url, body, attempt) {
    try {
      fetch(url, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' }).catch(function () {
        retry(url, body, attempt);
      });
    } catch (_) {
      retry(url, body, attempt);
    }
  }

  function retry(url, body, attempt) {
    if (attempt >= 2) return;
    window.setTimeout(function () {
      sendFetch(url, body, attempt + 1);
    }, (attempt + 1) * 1000);
  }

  function detectProduct() {
    var path = window.location.pathname;
    if (/\/products?\//i.test(path)) {
      var title = document.querySelector('h1') || document.querySelector('[data-product-title]');
      send('product_view', { product_name: title ? title.textContent.trim() : '' });
    }
  }

  function detectCollection() {
    if (/\/collections?\//i.test(window.location.pathname)) {
      send('collection_view');
    }
  }

  function detectOrderStatus() {
    if (/thank[_-]?you|order[_-]?status|\/orders?\//i.test(window.location.pathname)) {
      send('order_status_view');
    }
  }

  function bindClicks() {
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('button,a,input,[role="button"]') : null;
      if (!target) return;
      var text = ((target.getAttribute('aria-label') || target.value || target.textContent || '') + ' ' + (target.getAttribute('name') || '') + ' ' + (target.getAttribute('href') || '')).toLowerCase();
      if (/add.*cart|cart.*add/.test(text)) {
        send('add_to_cart');
      } else if (/checkout|check out/.test(text)) {
        send('checkout_started');
      }
    }, true);
  }

  send('page_view');
  detectProduct();
  detectCollection();
  detectOrderStatus();
  bindClicks();
})();
