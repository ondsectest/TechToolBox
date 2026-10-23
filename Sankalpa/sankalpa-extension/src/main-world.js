// Runs in the page's MAIN world (bundled into content/main.js as window.__skCap).
// Records the body of every non-GET request the page sends, so a form submit can be replayed.
// Data stays in the page (window + sessionStorage); nothing is sent anywhere.

export function install() {
  if (window.__skCapOn) return 'already';
  window.__skCapOn = true;
  const KEY = '__sk_cap';
  const push = (entry) => {
    const list = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    list.push({ at: Date.now(), ...entry });
    sessionStorage.setItem(KEY, JSON.stringify(list.slice(-30)));
  };
  const headersObj = (h) => {
    if (!h) return {};
    if (h instanceof Headers) return Object.fromEntries(h.entries());
    if (Array.isArray(h)) return Object.fromEntries(h);
    return { ...h };
  };

  const origFetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const req = input instanceof Request ? input : null;
    const method = (init.method || req?.method || 'GET').toUpperCase();
    const url = new URL(req ? req.url : String(input), location.href).href;
    let body = init.body ?? null;
    if (body == null && req && method !== 'GET') body = await req.clone().text().catch(() => null);
    const res = await origFetch.apply(this, arguments);
    if (method !== 'GET' && !window.__skReplaying) {
      const text = await res.clone().text().catch(() => '');
      push({ via: 'fetch', method, url, headers: { ...headersObj(req?.headers), ...headersObj(init.headers) }, postData: typeof body === 'string' ? body : body instanceof URLSearchParams ? body.toString() : null, status: res.status, responseText: text.slice(0, 4000) });
    }
    return res;
  };

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  const setHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) { this.__m = String(method).toUpperCase(); this.__u = new URL(url, location.href).href; this.__h = {}; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.__h[k] = v; return setHeader.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__m !== 'GET' && !window.__skReplaying) {
      this.addEventListener('loadend', () => push({ via: 'xhr', method: this.__m, url: this.__u, headers: this.__h, postData: typeof body === 'string' ? body : body instanceof URLSearchParams ? body.toString() : null, status: this.status, responseText: String(this.responseText || '').slice(0, 4000) }));
    }
    return send.apply(this, arguments);
  };

  // Classic form posts (full page navigation): record what the browser is about to send.
  // Bubble phase on window runs after the page's own handlers, so defaultPrevented is final here.
  window.addEventListener('submit', (ev) => {
    const f = ev.target;
    if (!(f instanceof HTMLFormElement) || ev.defaultPrevented) return; // JS-handled forms are caught above
    const method = (f.getAttribute('method') || 'GET').toUpperCase();
    if (method === 'GET') return;
    const multipart = /multipart/i.test(f.enctype);
    push({ via: 'form', method, url: new URL(f.getAttribute('action') || location.href, location.href).href, headers: { 'content-type': multipart ? 'multipart/form-data' : 'application/x-www-form-urlencoded' }, postData: multipart ? null : new URLSearchParams(new FormData(f)).toString(), status: null, responseText: '' });
  });
  return 'installed';
}

export function read() { return JSON.parse(sessionStorage.getItem('__sk_cap') || '[]'); }
export function clear() { sessionStorage.removeItem('__sk_cap'); return true; }
