// Replays a captured form request with boundary values, one field at a time.
// Run in the page context (same origin) so cookies/session match the real submit.
// Only use after the user approved replays for this origin (see Part 3).
//
// Usage (paste, then call):
//   await replayBoundaries({
//     url: '/api/Users', method: 'POST',
//     headers: { 'Content-Type': 'application/json' },   // copy auth/CSRF headers from the capture
//     body: { email: 'test+bv00@example.com', password: 'Valid123', passwordRepeat: 'Valid123' },
//     uniquePaths: ['email'],                              // fields that must differ per request
//     cases: [
//       { path: 'password', also: ['passwordRepeat'], value: 'x'.repeat(41), label: 'over-max 41' },
//     ],
//   })
async function replayBoundaries({ url, method = 'POST', headers = {}, body, uniquePaths = [], cases, delayMs = 300 }) {
  const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
  const set = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
  const isJson = /json/i.test(headers['Content-Type'] || headers['content-type'] || 'application/json');
  const units = (s) => typeof s === 'string'
    ? { utf16: s.length, codePoints: [...s].length,
        graphemes: typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(s)].length : null }
    : null;
  const results = [];
  for (const [i, c] of cases.entries()) {
    const b = structuredClone(body);
    for (const p of uniquePaths) {
      const v = String(get(b, p));
      set(b, p, v.includes('@') ? v.replace('@', `+r${Date.now()}${i}@`) : `${v}_r${i}`);
    }
    for (const p of [c.path, ...(c.also || [])]) set(b, p, c.value);
    const payload = isJson ? JSON.stringify(b) : new URLSearchParams(b).toString();
    let status = null, text = '';
    try {
      const res = await fetch(url, { method, headers, body: payload, credentials: 'include' });
      status = res.status;
      text = (await res.text()).slice(0, 400);
    } catch (e) { text = `NETWORK ERROR: ${e.message}`; }
    results.push({ label: c.label, field: c.path, sent: units(c.value), status, response: text });
    if (status === 429 || (status >= 500 && results.filter((r) => r.status >= 500).length >= 3)) {
      results.push({ stopped: `Stopped after HTTP ${status}` });
      break;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}
