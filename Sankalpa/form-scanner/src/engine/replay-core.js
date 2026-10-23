// Part 3 logic shared by the web app (Playwright) and the browser extension (chrome.* APIs).
// No browser automation here: callers capture requests and run replays their own way.
import { isEmailField } from '../rules.js';

export const rand = () => Math.random().toString(36).slice(2, 8);
export const KEEP_HEADER = /^(content-type|authorization|accept|x-[\w-]+)$/i;

// A value the browser accepts for this field, unique so it can be found in the request.
export function validValue(field) {
  const tag = `sk${rand()}`;
  const min = field.probe?.clientMin ?? 0;
  const max = field.probe?.clientMax ?? Infinity;
  let v;
  if (isEmailField(field)) v = `test+${tag}@example.com`;
  else if (field.type === 'password') v = `Sk${rand()}!9`;
  else if (field.type === 'tel' || /phone|mobile/i.test(field.key)) v = `555${String(Date.now()).slice(-7)}`;
  else if (field.type === 'url') v = `https://example.com/${tag}`;
  else v = tag;
  if (v.length < min) v = v + 'a'.repeat(min - v.length);
  if (v.length > max) v = v.slice(0, max);
  return v;
}

export const parseBody = (body, contentType) => {
  if (body == null || body === '') return { kind: 'none', obj: null };
  try { return { kind: 'json', obj: JSON.parse(body) }; } catch { /* not json */ }
  if (/x-www-form-urlencoded/i.test(contentType || '') || /^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(body)) {
    return { kind: 'form', obj: Object.fromEntries(new URLSearchParams(body)) };
  }
  return { kind: 'unsupported', obj: null };
};

export function leaves(obj, path = [], out = []) {
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) leaves(v, [...path, k], out);
  else out.push({ path, value: obj });
  return out;
}

// raw: [{ method, url, headers, postData, status, responseText }] in the order they were sent.
// Returns the request list, which request/paths carry each field, and links between requests.
export function analyzeCapture(markers, raw) {
  const requests = raw.map((r) => {
    const headers = Object.fromEntries(Object.entries(r.headers || {}).filter(([k]) => KEEP_HEADER.test(k)).map(([k, v]) => [k.toLowerCase(), v]));
    const body = parseBody(r.postData, headers['content-type']);
    let responseObj = null; try { responseObj = JSON.parse(r.responseText); } catch { /* not json */ }
    return { method: r.method, url: r.url, headers, kind: body.kind, body: body.obj, status: r.status ?? null, responseObj, responseText: String(r.responseText || '').slice(0, 4000) };
  });
  // A field can appear in several requests (e.g. the answer in both "create user" and "save answer").
  // Record every place; the field is judged on the LAST request that carries it, sent after its chain.
  const map = {};
  for (const [key, marker] of Object.entries(markers)) {
    const locations = requests.map((rq, i) => ({ req: i, paths: leaves(rq.body).filter((l) => l.value === marker).map((l) => l.path) })).filter((l) => l.paths.length);
    if (locations.length) map[key] = { req: locations.at(-1).req, paths: locations.at(-1).paths, locations };
  }
  // Later requests that reuse an id from an earlier response (e.g. security answer → UserId).
  const deps = [];
  requests.forEach((rq, j) => {
    if (!j) return;
    for (const l of leaves(rq.body)) {
      if (Object.values(markers).includes(l.value) || l.value == null || l.value === '') continue;
      for (let i = 0; i < j; i++) {
        const hit = leaves(requests[i].responseObj).find((x) => x.value === l.value && /id$/i.test(String(x.path.at(-1))));
        if (hit) { deps.push({ req: j, path: l.path, fromReq: i, fromPath: hit.path }); break; }
      }
    }
  });
  return { requests, map, deps };
}

// Runs INSIDE the page (main world) so cookies/session match the real submit. Self-contained.
export async function replayInPage(spec) {
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const setPath = (o, p, v) => { let c = o; for (const k of p.slice(0, -1)) c = c[k]; c[p.at(-1)] = v; };
  const getPath = (o, p) => p.reduce((c, k) => c?.[k], o);
  const walk = (o, fn) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (o[k] && typeof o[k] === 'object') walk(o[k], fn); else o[k] = fn(o[k]); } };
  const out = [];
  const responses = [];
  for (let i = 0; i <= spec.upto; i++) {
    const rq = spec.requests[i];
    const body = clone(rq.body);
    walk(body, (v) => (spec.rename[v] !== undefined ? spec.rename[v] : v));
    for (const s of spec.set.filter((x) => x.req === i)) setPath(body, s.path, s.value);
    for (const d of spec.deps.filter((x) => x.req === i)) setPath(body, d.path, getPath(responses[d.fromReq], d.fromPath));
    const payload = rq.kind === 'form' ? new URLSearchParams(body).toString() : JSON.stringify(body);
    let status = null, text = '', obj = null, resHeaders = {};
    const started = Date.now();
    try {
      const res = await fetch(rq.url, { method: rq.method, headers: rq.headers, body: payload, credentials: 'include' });
      status = res.status; text = await res.text();
      res.headers.forEach((v, k) => { if (/^(content-type|location|retry-after|x-[\w-]+)$/i.test(k)) resHeaders[k] = v; });
      try { obj = JSON.parse(text); } catch { /* not json */ }
    } catch (e) { text = `NETWORK ERROR: ${e.message}`; }
    responses.push(obj);
    out.push({ method: rq.method, url: rq.url, headers: rq.headers, body: payload, status, responseHeaders: resHeaders, at: started, ms: Date.now() - started, text: text.slice(0, 4000) });
    if (i < spec.upto && !(status >= 200 && status < 300)) break;
    await new Promise((r) => setTimeout(r, spec.delayMs ?? 300));
  }
  return out;
}

// What to send: the field (and its repeat field) gets `value`; other unique markers get a suffix.
export function buildSpec(cap, form, fieldKey, value, suffix, delayMs = 300) {
  const m = cap.map[fieldKey];
  const rename = {};
  for (const [key, marker] of Object.entries(cap.markers)) {
    if (key === fieldKey || form.fields.find((f) => f.key === key)?.repeatOf === fieldKey) continue;
    rename[marker] = marker.includes('@') ? marker.replace('@', `.${suffix}@`) : `${marker}${suffix}`;
  }
  const at = (mm) => mm.locations || [{ req: mm.req, paths: mm.paths }];
  const set = at(m).flatMap((l) => l.paths.map((p) => ({ req: l.req, path: p, value })));
  const repeat = form.fields.find((f) => f.repeatOf === fieldKey);
  if (repeat && cap.map[repeat.key]) for (const l of at(cap.map[repeat.key])) for (const p of l.paths) set.push({ req: l.req, path: p, value });
  return { requests: cap.requests, deps: cap.deps, upto: m.req, set, rename, delayMs };
}

const okBody = (t) => !/"status"\s*:\s*"error"|"success"\s*:\s*false|"errors"\s*:\s*\[\s*\{/i.test(t || '');
const DUPLICATE = /exist|unique|already|taken|duplicate|in use/i;

// Verdict for one server case (skill Part 3, step 6). `replay(spec)` sends the requests and returns responses.
export async function judge(replay, cap, form, field, expected, value, { delayMs = 300 } = {}) {
  const suffix = `r${rand()}`;
  const targetReq = cap.map[field.key].req;
  const responses = await replay(buildSpec(cap, form, field.key, value, suffix, delayMs));
  const last = responses.at(-1);
  if (responses.length - 1 < targetReq) {
    return { status: 'not_verified', detail: `An earlier linked request failed (HTTP ${last.status}), so this field could not be tested.`, evidence: { responses } };
  }
  const accepted = last.status >= 200 && last.status < 300 && okBody(last.text);
  const evidence = { valueSent: value, sentLength: value.length, codePoints: [...value].length, http: last.status, response: last.text, responses, delayMs };
  if (expected === 'Accepted') {
    return accepted
      ? { status: 'pass', detail: `Accepted (HTTP ${last.status}).`, evidence }
      : { status: 'fail', detail: `Server rejected a value the browser allows (HTTP ${last.status}): ${last.text.slice(0, 120)}`, evidence };
  }
  if (accepted) return { status: 'fail', detail: `Server accepted it (HTTP ${last.status}). There is no server-side rule, only the browser checks this.`, evidence };
  if (last.status >= 500) return { status: 'fail', detail: `Server error (HTTP ${last.status}) instead of a clear message.`, evidence };

  // Reject-but-save: re-send the same unique values with a valid field value. "Already exists" ⇒ it was saved.
  const uniqueHere = Object.entries(cap.markers).some(([k, mk]) => k !== field.key && mk.includes('@') && cap.map[k]?.req === targetReq);
  if (uniqueHere) {
    await new Promise((r) => setTimeout(r, delayMs));
    const r = (await replay(buildSpec(cap, form, field.key, cap.markers[field.key], suffix, delayMs))).at(-1);
    evidence.recheck = r;
    if (r.status >= 400 && DUPLICATE.test(r.text)) {
      return { status: 'fail', detail: `Server said "rejected" (HTTP ${last.status}) but saved the record anyway — re-sending the same email says it already exists.`, evidence };
    }
  }
  const names = [field.key, field.label].filter(Boolean).map((s) => s.toLowerCase().replace(/control$/, ''));
  const namesField = names.some((n) => last.text.toLowerCase().includes(n));
  return namesField
    ? { status: 'pass', detail: `Rejected (HTTP ${last.status}) with a message naming the field: ${last.text.slice(0, 120)}`, evidence }
    : { status: 'warn', detail: `Rejected (HTTP ${last.status}), but the message doesn't name the field: ${last.text.slice(0, 120) || '(empty)'}`, evidence };
}

export const canReplay = (cap, field) => !!cap?.map[field.key] && cap.requests[cap.map[field.key].req].kind !== 'unsupported';

// What the form really sent when Sankalpa submitted it once (for the report).
export const captureRecord = (cap) => cap && {
  markers: cap.markers, map: cap.map, deps: cap.deps, blocked: cap.blocked,
  requests: cap.requests.map((r) => ({ method: r.method, url: r.url, headers: r.headers, kind: r.kind, body: r.body, status: r.status, response: r.responseText })),
};
