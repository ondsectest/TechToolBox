// Records request bodies for fetch and XHR, so Part 3 can map form fields to the request.
// Run in the page BEFORE submitting the form. Read results with: JSON.stringify(window.__captured)
// Data stays in the page; nothing is sent anywhere. Reload the page to remove the hook.
(() => {
  if (window.__captured) return 'already capturing';
  window.__captured = [];
  const log = (entry) => window.__captured.push({ at: Date.now(), ...entry });

  const origFetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || input.method || 'GET').toUpperCase();
    const res = await origFetch.apply(this, arguments);
    if (method !== 'GET') {
      const copy = res.clone();
      log({ via: 'fetch', method, url, headers: init.headers || null, body: typeof init.body === 'string' ? init.body : String(init.body ?? ''), status: res.status, response: (await copy.text()).slice(0, 2000) });
    }
    return res;
  };

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  const setHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) { this.__m = String(method).toUpperCase(); this.__u = url; this.__h = {}; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.__h[k] = v; return setHeader.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__m !== 'GET') {
      this.addEventListener('loadend', () => log({ via: 'xhr', method: this.__m, url: this.__u, headers: this.__h, body: typeof body === 'string' ? body : String(body ?? ''), status: this.status, response: String(this.responseText || '').slice(0, 2000) }));
    }
    return send.apply(this, arguments);
  };
  return 'capturing';
})();
