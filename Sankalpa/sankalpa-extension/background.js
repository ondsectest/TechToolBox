// Sankalpa background service worker: a thin bridge between the panel and the tab under test.
// It only calls Sankalpa's own in-page helpers by name (content/inpage.js, content/main.js).

const ok = (data) => ({ ok: true, data });
const fail = (e) => ({ ok: false, error: e?.message || String(e) });

// ---- run a named helper in the page, injecting the helper library when the page doesn't have it yet
async function exec({ tabId, fn, args = [], world = 'ISOLATED' }) {
  const target = { tabId };
  const call = () => chrome.scripting.executeScript({
    target, world, args: [fn, args],
    func: async (name, a) => {
      try {
        if (name === '__replay') return window.__skReplay ? { r: await window.__skReplay(a[0]) } : 'NOLIB';
        const lib = name.startsWith('cap.') ? window.__skCap : window.__sk;
        if (!lib) return 'NOLIB';
        const f = lib[name.replace(/^cap\./, '')];
        if (!f) return { e: `unknown helper ${name}` };
        return { r: await f(...a) };
      } catch (err) { return { e: String(err?.message || err) }; }
    },
  });
  let [res] = await call();
  if (res?.result === 'NOLIB') {
    await chrome.scripting.executeScript({ target, world, files: [world === 'MAIN' ? 'content/main.js' : 'content/inpage.js'] });
    [res] = await call();
  }
  if (res?.result?.e) throw new Error(res.result.e);
  return res?.result?.r;
}

// ---- navigation that waits for the page to load
function waitComplete(tabId, timeout = 20000) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listener); clearTimeout(timer); resolve(); };
    const listener = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const timer = setTimeout(done, timeout);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function navigate({ tabId, url }) {
  const before = (await chrome.tabs.get(tabId)).url || '';
  const sameDoc = before.split('#')[0] === url.split('#')[0];
  const wait = waitComplete(tabId);
  await chrome.tabs.update(tabId, { url });
  if (sameDoc) { // a hash change doesn't reload; reload so the page starts fresh
    await new Promise((r) => setTimeout(r, 150));
    const w2 = waitComplete(tabId);
    await chrome.tabs.reload(tabId);
    await w2;
  } else {
    await wait;
  }
  return (await chrome.tabs.get(tabId)).url;
}

async function reload({ tabId }) { const w = waitComplete(tabId); await chrome.tabs.reload(tabId); await w; return true; }

// ---- site access + optional debugger, asked in a small window (panels can't show permission prompts)
const pending = new Map();
async function requestAccess({ origin, debuggerPerm = false }) {
  const want = { origins: origin ? [`${origin}/*`] : [], permissions: debuggerPerm ? ['debugger'] : [] };
  if (await chrome.permissions.contains(want)) return true;
  const id = String(Date.now());
  const url = chrome.runtime.getURL(`approve.html?id=${id}&origin=${encodeURIComponent(origin || '')}&debugger=${debuggerPerm ? 1 : 0}`);
  const win = await chrome.windows.create({ url, type: 'popup', width: 460, height: 420 });
  return new Promise((resolve) => {
    pending.set(id, resolve);
    const onRemoved = (wid) => { if (wid === win.id) { chrome.windows.onRemoved.removeListener(onRemoved); if (pending.has(id)) { pending.delete(id); resolve(false); } } };
    chrome.windows.onRemoved.addListener(onRemoved);
  });
}

// ---- real keyboard typing (only when the user switched it on; attached per case, detached right after)
const dbg = {
  attach: async ({ tabId }) => { await chrome.debugger.attach({ tabId }, '1.3'); return true; },
  detach: async ({ tabId }) => { await chrome.debugger.detach({ tabId }).catch(() => {}); return true; },
  insert: async ({ tabId, text }) => { await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text }); return true; },
  key: async ({ tabId, key }) => {
    const codes = { Backspace: 8, Enter: 13, Tab: 9 };
    for (const type of ['rawKeyDown', 'keyUp']) {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: codes[key] || 0 });
    }
    return true;
  },
};

const handlers = {
  exec,
  navigate,
  reload,
  tabUrl: async ({ tabId }) => (await chrome.tabs.get(tabId)).url,
  createTab: async ({ url }) => (await chrome.tabs.create({ url, active: true })).id,
  hasAccess: ({ origin }) => chrome.permissions.contains({ origins: [`${origin}/*`] }),
  hasDebugger: () => chrome.permissions.contains({ permissions: ['debugger'] }),
  requestAccess,
  approved: ({ id, granted }) => { pending.get(id)?.(granted); pending.delete(id); return true; },
  dbgAttach: dbg.attach, dbgDetach: dbg.detach, dbgInsert: dbg.insert, dbgKey: dbg.key,
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  Promise.resolve().then(() => h(msg.payload || {})).then((d) => reply(ok(d)), (e) => reply(fail(e)));
  return true;
});
