// The tab under test, driven through the background worker. Mirrors the web app's engine/browser.js.

export async function rpc(type, payload) {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (!res?.ok) throw new Error(res?.error || `${type} failed`);
  return res.data;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const short = (u) => { try { const x = new URL(u); return x.pathname + x.hash; } catch { return u; } };

export class Tab {
  constructor(id, { realTyping = false } = {}) { this.id = id; this.realTyping = realTyping; }

  // Calls a helper from content/inpage.js; retries once if the page was mid-navigation.
  async call(fn, ...args) {
    try { return await rpc('exec', { tabId: this.id, fn, args }); }
    catch (e) {
      if (!/Frame with ID|No frame|navigat|Cannot access|context invalidated|page error/i.test(e.message)) throw e;
      await sleep(800);
      return rpc('exec', { tabId: this.id, fn, args });
    }
  }
  main(fn, ...args) { return rpc('exec', { tabId: this.id, fn, args, world: 'MAIN' }); }
  replay(spec) { return rpc('exec', { tabId: this.id, fn: '__replay', args: [spec], world: 'MAIN' }); }
  url() { return rpc('tabUrl', { tabId: this.id }); }

  async settle(extra = 500) { await this.call('quiet').catch(() => {}); await sleep(extra); }
  async clearOverlays() {
    for (let i = 0; i < 3; i++) { if (!(await this.call('dismissOverlays').catch(() => false))) break; await sleep(400); }
  }
  // Fresh full load of a URL.
  async load(url) { await rpc('navigate', { tabId: this.id, url }); await this.settle(); await this.clearOverlays(); }

  // Real keyboard (Chrome debugger), attached only for the duration of fn.
  async withKeyboard(fn) {
    await rpc('dbgAttach', { tabId: this.id });
    try { return await fn({ insert: (text) => rpc('dbgInsert', { tabId: this.id, text }), key: (key) => rpc('dbgKey', { tabId: this.id, key }) }); }
    finally { await rpc('dbgDetach', { tabId: this.id }); }
  }
}

// Reach a form the way a user would: open the page that links to it, then click the link.
export async function reachForm(tab, form) {
  if (form.from?.url && form.from.url !== form.url) {
    await tab.load(form.from.url);
    const target = new URL(form.url);
    const clicked = await tab.call('clickLinkTo', [target.hash, target.pathname + target.hash, form.url].filter(Boolean));
    if (clicked !== null && clicked !== undefined) {
      await tab.settle(1500);
      if ((await tab.url()) === form.url) return `clicked "${form.from.text || clicked || 'link'}" on ${short(form.from.url)}`;
    }
    if (target.hash && new URL(await tab.url()).pathname === target.pathname) {
      await tab.call('setHash', target.hash);
      await tab.settle(1500);
      return `in-app navigation from ${short(form.from.url)} (link "${form.from.text || form.url}" was inside a closed menu)`;
    }
  }
  await tab.load(form.url);
  await sleep(800);
  return 'opened the URL directly';
}

// Re-finds a discovered form on the current page by its field keys.
export async function locateForm(tab, form) {
  const live = await tab.call('tagForms');
  const want = form.fields.map((f) => f.key).join('|');
  const exact = live.find((f) => f.fields.map((x) => x.key).join('|') === want);
  if (exact) return exact;
  const ranked = live
    .map((f) => ({ f, score: f.fields.filter((x) => form.fields.some((y) => y.key === x.key)).length }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].f : null;
}
