/*
 * Review Red Flags: builds the exported HTML dashboard.
 *
 * buildReport() returns one self-contained HTML file: the review data is
 * embedded as JSON, and reportApp() below is serialized into the page to draw
 * the dashboard when the file is opened. No external scripts, fonts or
 * images, so the report works offline and can be emailed or archived.
 *
 * Built by Santhosh Tuppad.
 */
(function (root) {
  'use strict';
  const RWF = (root.ReviewRedFlags = root.ReviewRedFlags || {});

  // ------------------------------------------------------------------
  // Styles for the exported page. Sentiment colors were checked for
  // color-blind separation in light and dark mode (gray is the neutral
  // midpoint on purpose).
  // ------------------------------------------------------------------
  const REPORT_CSS = `
:root {
  color-scheme: light;
  --page: #f9f9f7;
  --surface: #fcfcfb;
  --raised: #ffffff;
  --text: #0b0b0b;
  --text-2: #52514e;
  --muted: #6f6e69;
  --grid: #e1e0d9;
  --axis: #c3c2b7;
  --border: rgba(11, 11, 11, 0.10);
  --hover: rgba(11, 11, 11, 0.05);
  --focus: #2a78d6;
  --s-pleasant: #2a78d6;
  --s-neutral: #8a8983;
  --s-mixed: #eda100;
  --s-unpleasant: #d03b3b;
  --on-mixed: #0b0b0b;
  --hl-neg: rgba(208, 59, 59, 0.16);
  --hl-pos: rgba(42, 120, 214, 0.16);
  --tip-bg: #0b0b0b;
  --tip-text: #f0efec;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --page: #0d0d0d;
    --surface: #1a1a19;
    --raised: #222220;
    --text: #f0efec;
    --text-2: #c3c2b7;
    --muted: #9a9890;
    --grid: #2c2c2a;
    --axis: #383835;
    --border: rgba(255, 255, 255, 0.10);
    --hover: rgba(255, 255, 255, 0.06);
    --focus: #3987e5;
    --s-pleasant: #3987e5;
    --s-neutral: #74736d;
    --s-mixed: #c98500;
    --s-unpleasant: #d03b3b;
    --hl-neg: rgba(208, 59, 59, 0.28);
    --hl-pos: rgba(57, 135, 229, 0.28);
    --tip-bg: #f0efec;
    --tip-text: #0b0b0b;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d;
  --surface: #1a1a19;
  --raised: #222220;
  --text: #f0efec;
  --text-2: #c3c2b7;
  --muted: #9a9890;
  --grid: #2c2c2a;
  --axis: #383835;
  --border: rgba(255, 255, 255, 0.10);
  --hover: rgba(255, 255, 255, 0.06);
  --focus: #3987e5;
  --s-pleasant: #3987e5;
  --s-neutral: #74736d;
  --s-mixed: #c98500;
  --s-unpleasant: #d03b3b;
  --hl-neg: rgba(208, 59, 59, 0.28);
  --hl-pos: rgba(57, 135, 229, 0.28);
  --tip-bg: #f0efec;
  --tip-text: #0b0b0b;
}

* { box-sizing: border-box; }
html { background: var(--page); }
body {
  margin: 0; background: var(--page); color: var(--text);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 24px 24px 48px; }
.noscript { padding: 24px; }

/* Header */
.top { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
.top h1 { margin: 0; font-size: 26px; line-height: 1.25; font-weight: 650; }
.meta { margin: 6px 0 0; color: var(--text-2); }
.meta a { color: inherit; }
.scope { margin: 4px 0 0; color: var(--muted); font-size: 13px; max-width: 760px; }
.top-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn {
  border: 1px solid var(--border); background: var(--raised); border-radius: 8px;
  padding: 7px 12px; font-size: 13px; font-weight: 600;
}
.btn:hover { background: var(--hover); }

/* KPI tiles */
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 16px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
.tile .k { color: var(--text-2); font-size: 13px; }
.tile .v { font-size: 28px; font-weight: 650; line-height: 1.2; margin-top: 4px; }
.tile .s { color: var(--muted); font-size: 12px; margin-top: 2px; }
.tile .sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: 1px; }

/* Filters */
.filters {
  position: sticky; top: 0; z-index: 5;
  display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center;
  background: var(--page); padding: 10px 0 12px; margin-bottom: 8px; border-bottom: 1px solid var(--border);
}
.fgroup { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.flabel { color: var(--muted); font-size: 12px; margin-right: 2px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--border); background: var(--surface); border-radius: 999px;
  padding: 3px 10px; font-size: 13px;
}
.chip[aria-pressed="false"] { opacity: 0.55; }
.chip[aria-pressed="false"] .sw { background: transparent !important; outline: 1px solid var(--muted); }
.chip .sw { width: 10px; height: 10px; border-radius: 2px; }
.search { border: 1px solid var(--border); background: var(--surface); border-radius: 8px; padding: 5px 10px; min-width: 200px; }
select.search { min-width: 0; }
.wordpill { display: inline-flex; align-items: center; gap: 6px; background: var(--raised); border: 1px solid var(--border); border-radius: 999px; padding: 3px 4px 3px 10px; font-size: 13px; }
.wordpill button { border: 0; background: transparent; border-radius: 50%; width: 22px; height: 22px; line-height: 1; }
.wordpill button:hover { background: var(--hover); }
.showing { margin-left: auto; color: var(--text-2); font-size: 13px; }

/* Cards and grid */
.grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; min-width: 0; grid-column: span 6; }
.card.wide { grid-column: span 12; }
.card.third { grid-column: span 4; }
@media (max-width: 900px) { .card, .card.third { grid-column: span 12; } }
.card h2 { margin: 0; font-size: 15px; font-weight: 650; }
.card .sub { margin: 2px 0 12px; color: var(--muted); font-size: 12px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0 0 12px; font-size: 12px; color: var(--text-2); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.empty { color: var(--muted); padding: 16px 0; }

/* Horizontal bars */
.hbars { display: flex; flex-direction: column; gap: 4px; }
.hbars .lab { font-size: 13px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hbars .val { font-size: 12px; color: var(--text-2); font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
.track { position: relative; height: 18px; display: flex; gap: 2px; border-radius: 0 4px 4px 0; }
.track.clickable, .seg.clickable, .rowhit { cursor: pointer; }
.seg { height: 100%; min-width: 0; }
.track .seg:last-child { border-radius: 0 4px 4px 0; }
.rowhit { display: grid; grid-template-columns: 120px 1fr 112px; gap: 10px; align-items: center; padding: 2px 4px; border-radius: 6px; }
.rowhit:hover, .rowhit:focus-visible { background: var(--hover); }
.rowhit.clickable:hover .lab, .rowhit.clickable:focus-visible .lab { color: var(--text); text-decoration: underline; }

/* 100% stacked bar */
.mix { display: flex; gap: 2px; height: 34px; margin: 4px 0 10px; }
.mix .seg { display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #fff; overflow: hidden; white-space: nowrap; }
.mix .seg:first-child { border-radius: 4px 0 0 4px; }
.mix .seg:last-child { border-radius: 0 4px 4px 0; }
.mixrows { display: grid; grid-template-columns: max-content 1fr max-content max-content; gap: 4px 12px; font-size: 13px; }
.mixrows .n, .mixrows .p { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-2); }
.mixrows .name { display: inline-flex; align-items: center; gap: 6px; }
.mixrows .desc { color: var(--muted); font-size: 12px; }

/* Columns over time */
.cols { position: relative; height: 220px; margin-left: 40px; border-left: 1px solid var(--axis); border-bottom: 1px solid var(--axis); }
.gridline { position: absolute; left: 0; right: 0; border-top: 1px solid var(--grid); }
.gridline span { position: absolute; right: calc(100% + 6px); top: -8px; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.colrow { position: absolute; inset: 0; display: flex; gap: 2px; align-items: stretch; padding: 0 2px; }
.col { flex: 1 1 0; display: flex; flex-direction: column-reverse; gap: 2px; min-width: 0; border-radius: 4px 4px 0 0; }
.col:hover, .col:focus-visible { background: var(--hover); }
.col .seg { width: 100%; flex: none; }
.col .seg:last-child { border-radius: 4px 4px 0 0; }
.xlabels { display: flex; gap: 2px; margin-left: 40px; padding: 4px 2px 0; }
.xlabels span { flex: 1 1 0; min-width: 0; font-size: 11px; color: var(--muted); text-align: center; white-space: nowrap; overflow: visible; }

/* Data tables under charts */
details.tbl { margin-top: 10px; font-size: 12px; overflow-x: auto; }
details.tbl summary { color: var(--muted); cursor: pointer; }
table { border-collapse: collapse; width: 100%; margin-top: 6px; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--grid); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

/* Helpful list */
.helpful { list-style: none; margin: 0; padding: 0; }
.helpful li { padding: 10px 0; border-bottom: 1px solid var(--grid); }
.helpful li:last-child { border-bottom: 0; }
.hmeta { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; color: var(--muted); margin-bottom: 4px; }

/* Review list */
.explorer { margin-top: 12px; }
.ex-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.ex-head h2 { margin: 0; font-size: 18px; }
.hl-legend { display: flex; gap: 12px; font-size: 12px; color: var(--text-2); }
.reviews { list-style: none; margin: 0; padding: 0; }
.review { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; margin-bottom: 8px; }
.rmeta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 12px; color: var(--text-2); }
.pill { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text); }
.pill i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.stars { color: #e8a200; letter-spacing: 1px; }
.author { font-weight: 600; color: var(--text); }
.tag { border: 1px solid var(--border); border-radius: 4px; padding: 0 6px; }
.rtext { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
mark { color: inherit; border-radius: 3px; padding: 0 1px; }
mark.neg { background: var(--hl-neg); box-shadow: inset 0 -2px 0 var(--s-unpleasant); }
mark.pos { background: var(--hl-pos); box-shadow: inset 0 -2px 0 var(--s-pleasant); }
.pager { display: flex; gap: 8px; align-items: center; justify-content: center; margin-top: 12px; color: var(--text-2); font-size: 13px; }
.pager button[disabled] { opacity: 0.4; cursor: default; }

/* Methodology */
.method { margin-top: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.method h2 { margin: 0 0 8px; font-size: 15px; }
.method p, .method li { color: var(--text-2); }
.terms { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 12px; }
.terms span { border: 1px solid var(--border); border-radius: 4px; padding: 0 6px; font-size: 12px; }
footer { margin-top: 24px; color: var(--muted); font-size: 12px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
footer .credit { font-weight: 600; color: var(--text-2); }
footer .credit a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }

/* Tooltip */
#tip {
  position: fixed; z-index: 50; pointer-events: none; max-width: 280px;
  background: var(--tip-bg); color: var(--tip-text); border-radius: 8px; padding: 8px 10px;
  font-size: 12px; line-height: 1.45; white-space: pre-line; box-shadow: 0 6px 20px rgba(0,0,0,0.25);
}
#tip[hidden] { display: none; }

@media (max-width: 600px) {
  .wrap { padding: 16px 16px 40px; }
  .top h1 { font-size: 21px; }
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .tile { padding: 10px 12px; }
  .tile .v { font-size: 22px; }
  .filters { position: static; }
  .card { padding: 14px 12px; }
  .showing { margin-left: 0; width: 100%; }
  .search { min-width: 0; width: 100%; }
  .rowhit { grid-template-columns: 84px 1fr 96px; gap: 8px; }
}
@media print {
  .filters, .top-actions, .pager, details.tbl summary, #tip { display: none !important; }
  .card, .review { break-inside: avoid; }
  body, html { background: #fff; }
}
`;

  // ------------------------------------------------------------------
  // The dashboard app. Serialized into the exported page, so it must not
  // use anything from this file's scope.
  // ------------------------------------------------------------------
  function reportApp() {
    'use strict';
    const DATA = JSON.parse(document.getElementById('rwf-data').textContent);
    const SENT = [
      { key: 'pleasant', label: 'Pleasant', desc: 'pleasant words only' },
      { key: 'neutral', label: 'Neutral', desc: 'no listed words' },
      { key: 'mixed', label: 'Mixed', desc: 'pleasant and unpleasant words' },
      { key: 'unpleasant', label: 'Unpleasant', desc: 'unpleasant words only' }
    ];
    const SENT_BY = Object.fromEntries(SENT.map((s) => [s.key, s]));
    const color = (key) => 'var(--s-' + key + ')';
    const fmt = (n) => Number(n).toLocaleString();
    const pct = (a, b) => (b ? (a / b) * 100 : 0);
    const pctText = (a, b) => {
      const p = pct(a, b);
      return (p > 0 && p < 1 ? p.toFixed(1) : Math.round(p)) + '%';
    };
    const dispTerm = (t) => t.replace(/\*+$/, '…');
    const nRev = (n) => fmt(n) + (n === 1 ? ' review' : ' reviews');
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateText = (ts) => ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

    // ---------- Data ----------
    const all = DATA.rows.map((r, i) => {
      const [author, rating, ts, text, thumbs, version, replied, neg, pos] = r;
      const sentiment = neg.length && pos.length ? 'mixed' : neg.length ? 'unpleasant' : pos.length ? 'pleasant' : 'neutral';
      return {
        i, author, rating, ts, text: text || '', thumbs: thumbs || 0, version, replied: !!replied, neg, pos, sentiment,
        negTerms: [...new Set(neg.map((h) => DATA.terms[h[2]]))],
        posTerms: [...new Set(pos.map((h) => DATA.terms[h[2]]))],
        lc: (text || '').toLowerCase() + ' ' + (author || '').toLowerCase()
      };
    });
    const versions = [...new Set(all.map((r) => r.version).filter(Boolean))].sort(cmpVersion).reverse();

    function cmpVersion(a, b) {
      const pa = String(a).split(/[.\-]/).map((x) => parseInt(x, 10) || 0);
      const pb = String(b).split(/[.\-]/).map((x) => parseInt(x, 10) || 0);
      for (let k = 0; k < Math.max(pa.length, pb.length); k++) {
        if ((pa[k] || 0) !== (pb[k] || 0)) return (pa[k] || 0) - (pb[k] || 0);
      }
      return 0;
    }

    // ---------- Filters ----------
    const F = { sent: new Set(SENT.map((s) => s.key)), stars: new Set([1, 2, 3, 4, 5]), version: '', word: null, q: '' };
    let sortBy = 'helpful';
    let page = 0;
    const PER_PAGE = 25;

    function filtered() {
      const q = F.q.trim().toLowerCase();
      return all.filter((r) =>
        F.sent.has(r.sentiment) &&
        (r.rating == null || F.stars.has(r.rating)) &&
        (!F.version || r.version === F.version) &&
        (!F.word || (F.word.neg ? r.negTerms : r.posTerms).includes(F.word.term)) &&
        (!q || r.lc.includes(q)));
    }

    // ---------- DOM helpers ----------
    function h(tag, props, ...kids) {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(props || {})) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.setAttribute('style', v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
      for (const kid of kids.flat(Infinity)) {
        if (kid == null || kid === false) continue;
        el.append(kid instanceof Node ? kid : String(kid));
      }
      return el;
    }
    const sw = (key) => h('i', { style: 'background:' + color(key) });
    const legend = () => h('div', { class: 'legend', 'aria-hidden': 'true' }, SENT.map((s) => h('span', null, sw(s.key), s.label)));
    function dataTable(head, rows) {
      return h('details', { class: 'tbl' }, h('summary', null, 'Show data table'),
        h('table', null,
          h('thead', null, h('tr', null, head.map((c, k) => h('th', { class: k ? 'num' : null }, c)))),
          h('tbody', null, rows.map((r) => h('tr', null, r.map((c, k) => h('td', { class: k ? 'num' : null }, c)))))));
    }
    function card(cls, title, sub, ...body) {
      return h('section', { class: 'card ' + (cls || ''), 'aria-label': title }, h('h2', null, title), sub ? h('p', { class: 'sub' }, sub) : null, ...body);
    }
    // Hover/focus target with a tooltip; Enter/Space activates onclick.
    function mark(el, tip, onclick) {
      el.setAttribute('data-tip', tip);
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', tip.replace(/\n/g, ', '));
      if (onclick) {
        el.classList.add('clickable');
        el.setAttribute('role', 'button');
        el.addEventListener('click', onclick);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onclick(); } });
      }
      return el;
    }
    function countBy(list, keyFn) {
      const m = new Map();
      for (const r of list) { const k = keyFn(r); m.set(k, (m.get(k) || 0) + 1); }
      return m;
    }

    // ---------- Tooltip ----------
    const tip = h('div', { id: 'tip', hidden: true, role: 'tooltip' });
    function showTip(target, x, y) {
      tip.textContent = target.getAttribute('data-tip');
      tip.hidden = false;
      const r = tip.getBoundingClientRect();
      let left = x + 14;
      let top = y + 14;
      if (left + r.width > innerWidth - 8) left = x - r.width - 14;
      if (top + r.height > innerHeight - 8) top = y - r.height - 14;
      tip.style.left = Math.max(8, left) + 'px';
      tip.style.top = Math.max(8, top) + 'px';
    }
    document.addEventListener('mousemove', (e) => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t) showTip(t, e.clientX, e.clientY); else tip.hidden = true;
    });
    document.addEventListener('focusin', (e) => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t) { const b = t.getBoundingClientRect(); showTip(t, b.left + b.width / 2, b.top); } else tip.hidden = true;
    });
    document.addEventListener('scroll', () => { tip.hidden = true; }, true);

    // ---------- Charts ----------
    function sentimentMix(list) {
      const counts = countBy(list, (r) => r.sentiment);
      const n = list.length;
      const bar = h('div', { class: 'mix' }, SENT.filter((s) => counts.get(s.key)).map((s) => {
        const c = counts.get(s.key);
        const seg = h('div', { class: 'seg', style: 'flex:' + c + ' 1 0;background:' + color(s.key) + (s.key === 'mixed' ? ';color:var(--on-mixed)' : '') },
          pct(c, n) >= 8 ? pctText(c, n) : '');
        return mark(seg, s.label + ' (' + s.desc + ')\n' + nRev(c) + ' · ' + pctText(c, n) + '\nClick to show only these', () => soloSentiment(s.key));
      }));
      const rows = h('div', { class: 'mixrows' }, SENT.map((s) => {
        const c = counts.get(s.key) || 0;
        return [h('span', { class: 'name' }, sw(s.key), s.label), h('span', { class: 'desc' }, s.desc), h('span', { class: 'n' }, fmt(c)), h('span', { class: 'p' }, pctText(c, n))];
      }));
      return card('', 'Sentiment mix', 'How the reviews divide by the words they use', n ? [bar, rows] : h('p', { class: 'empty' }, 'No reviews match the filters.'));
    }

    function starChart(list) {
      const max = Math.max(1, ...[1, 2, 3, 4, 5].map((s) => list.filter((r) => r.rating === s).length));
      const rows = [];
      const tableRows = [];
      for (const s of [5, 4, 3, 2, 1]) {
        const at = list.filter((r) => r.rating === s);
        const counts = countBy(at, (r) => r.sentiment);
        // Short bars drop the 2px segment gaps, which would otherwise outweigh the colors.
        const w = Math.max(at.length ? 0.5 : 0, pct(at.length, max));
        const track = h('div', { class: 'track', style: 'width:' + w + '%' + (w < 12 ? ';gap:0' : '') },
          SENT.filter((x) => counts.get(x.key)).map((x) => h('div', { class: 'seg', style: 'flex:' + counts.get(x.key) + ' 1 0;background:' + color(x.key) })));
        const tipText = s + ' star' + (s > 1 ? 's' : '') + ': ' + nRev(at.length) + ' (' + pctText(at.length, list.length) + ')\n' +
          SENT.map((x) => x.label + ': ' + fmt(counts.get(x.key) || 0)).join('\n') + '\nClick to show only ' + s + '-star reviews';
        rows.push(mark(h('div', { class: 'rowhit' }, h('span', { class: 'lab' }, s + ' ★'), h('div', null, track), h('span', { class: 'val' }, fmt(at.length) + ' · ' + pctText(at.length, list.length))), tipText, () => soloStar(s)));
        tableRows.push([s + ' ★', fmt(at.length), ...SENT.map((x) => fmt(counts.get(x.key) || 0))]);
      }
      return card('', 'Star ratings', 'Number of reviews at each rating, split by sentiment', legend(), h('div', { class: 'hbars' }, rows),
        dataTable(['Rating', 'Reviews', ...SENT.map((x) => x.label)], tableRows));
    }

    function timeChart(list) {
      const dated = list.filter((r) => r.ts);
      if (!dated.length) return card('wide', 'Reviews over time', null, h('p', { class: 'empty' }, 'No dated reviews match the filters.'));
      const key = (ts) => { const d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); };
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of dated) { const k = key(r.ts); if (k < lo) lo = k; if (k > hi) hi = k; }
      const MAXM = 36;
      const start = Math.max(lo, hi - MAXM + 1);
      const months = [];
      for (let k = start; k <= hi; k++) months.push({ k, counts: new Map(), n: 0 });
      let earlier = 0;
      for (const r of dated) {
        const k = key(r.ts);
        if (k < start) { earlier++; continue; }
        const m = months[k - start];
        m.n++;
        m.counts.set(r.sentiment, (m.counts.get(r.sentiment) || 0) + 1);
      }
      const label = (k) => MONTHS[k % 12] + ' ' + Math.floor(k / 12);
      const maxN = Math.max(...months.map((m) => m.n));
      const step = niceStep(maxN);
      const top = Math.max(step, Math.ceil(maxN / step) * step);
      const grid = [];
      for (let v = 0; v <= top; v += step) grid.push(h('div', { class: 'gridline', style: 'bottom:' + pct(v, top) + '%' }, h('span', null, fmt(v))));
      const cols = months.map((m) => {
        const segs = SENT.filter((s) => m.counts.get(s.key)).map((s) => h('div', { class: 'seg', style: 'height:' + pct(m.counts.get(s.key), top) + '%;background:' + color(s.key) }));
        const unpleasantShare = pctText((m.counts.get('unpleasant') || 0) + (m.counts.get('mixed') || 0), m.n);
        return mark(h('div', { class: 'col' }, segs), label(m.k) + ': ' + nRev(m.n) + '' +
          (m.n ? '\n' + SENT.map((s) => s.label + ': ' + fmt(m.counts.get(s.key) || 0)).join('\n') + '\nWith unpleasant words: ' + unpleasantShare : ''));
      });
      // About one label per 70px of chart width, so they never overlap.
      const maxLabels = Math.max(3, Math.min(12, Math.floor((Math.min(innerWidth, 1240) - 120) / 70)));
      const every = Math.ceil(months.length / maxLabels);
      const xl = months.map((m, idx) => h('span', null, idx % every === 0 ? (m.k % 12 === 0 || idx === 0 ? label(m.k) : MONTHS[m.k % 12]) : ''));
      const note = earlier ? 'Last ' + MAXM + ' months shown; ' + fmt(earlier) + ' earlier reviews are left out of this chart.' : 'Reviews per month, split by sentiment';
      return card('wide', 'Reviews over time', note, legend(),
        h('div', { class: 'cols', role: 'img', 'aria-label': 'Reviews per month from ' + label(months[0].k) + ' to ' + label(hi) + ', split by sentiment. Data table below.' },
          grid, h('div', { class: 'colrow' }, cols)),
        h('div', { class: 'xlabels', 'aria-hidden': 'true' }, xl),
        dataTable(['Month', 'Reviews', ...SENT.map((s) => s.label)], months.filter((m) => m.n).map((m) => [label(m.k), fmt(m.n), ...SENT.map((s) => fmt(m.counts.get(s.key) || 0))])));
    }
    function niceStep(max) {
      const raw = Math.max(1, max) / 4;
      const p = Math.pow(10, Math.floor(Math.log10(raw)));
      const f = raw / p;
      return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
    }

    function wordChart(list, neg) {
      const counts = new Map();
      for (const r of list) for (const t of neg ? r.negTerms : r.posTerms) counts.set(t, (counts.get(t) || 0) + 1);
      const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);
      const key = neg ? 'unpleasant' : 'pleasant';
      const title = neg ? 'Top unpleasant words' : 'Top pleasant words';
      const sub = 'Reviews using each word (a review counts once per word). Click a word to filter.';
      if (!top.length) return card('', title, sub, h('p', { class: 'empty' }, 'None of these words appear in the filtered reviews.'));
      const max = top[0][1];
      const rows = top.map(([t, c]) => mark(h('div', { class: 'rowhit' },
        h('span', { class: 'lab' }, dispTerm(t)),
        h('div', null, h('div', { class: 'track', style: 'width:' + Math.max(0.5, pct(c, max)) + '%' }, h('div', { class: 'seg', style: 'flex:1;background:' + color(key) }))),
        h('span', { class: 'val' }, fmt(c) + ' · ' + pctText(c, list.length))),
      '"' + dispTerm(t) + '" appears in ' + nRev(c) + ' (' + pctText(c, list.length) + ' of those shown)\nClick to show only these reviews', () => setWord(t, neg)));
      return card('', title, sub, h('div', { class: 'hbars' }, rows), dataTable(['Word', 'Reviews'], top.map(([t, c]) => [dispTerm(t), fmt(c)])));
    }

    function versionChart(list) {
      const by = new Map();
      for (const r of list) {
        if (!r.version) continue;
        const v = by.get(r.version) || { n: 0, bad: 0 };
        v.n++;
        if (r.sentiment === 'unpleasant' || r.sentiment === 'mixed') v.bad++;
        by.set(r.version, v);
      }
      const MIN = 5;
      const top = [...by].filter(([, v]) => v.n >= MIN).sort((a, b) => b[1].n - a[1].n).slice(0, 12).sort((a, b) => cmpVersion(b[0], a[0]));
      const title = 'Unpleasant words by app version';
      const sub = 'Share of each version\'s reviews that use unpleasant words (versions with at least ' + MIN + ' reviews; newest first). Click to filter.';
      if (!top.length) return card('', title, sub, h('p', { class: 'empty' }, 'Not enough reviews with a known app version. Version numbers come with reviews loaded by "Load all reviews".'));
      const rows = top.map(([ver, v]) => mark(h('div', { class: 'rowhit' },
        h('span', { class: 'lab' }, ver),
        h('div', null, h('div', { class: 'track', style: 'width:' + Math.max(0.5, pct(v.bad, v.n)) + '%' }, h('div', { class: 'seg', style: 'flex:1;background:' + color('unpleasant') }))),
        h('span', { class: 'val' }, pctText(v.bad, v.n) + ' of ' + fmt(v.n))),
      'Version ' + ver + ': ' + fmt(v.bad) + ' of ' + nRev(v.n) + ' (' + pctText(v.bad, v.n) + ') use unpleasant words\nClick to show only this version', () => setVersion(ver)));
      return card('', title, sub, h('div', { class: 'hbars' }, rows),
        dataTable(['Version', 'Reviews', 'With unpleasant words', 'Share'], top.map(([ver, v]) => [ver, fmt(v.n), fmt(v.bad), pctText(v.bad, v.n)])));
    }

    function helpfulList(list) {
      const top = list.filter((r) => r.neg.length && r.thumbs > 0).sort((a, b) => b.thumbs - a.thumbs).slice(0, 5);
      const title = 'Most helpful complaints';
      const sub = 'Reviews with unpleasant words that the most people marked "helpful"';
      if (!top.length) return card('', title, sub, h('p', { class: 'empty' }, 'No complaints with "helpful" votes in the filtered reviews.'));
      return card('', title, sub, h('ol', { class: 'helpful' }, top.map((r) => h('li', null,
        h('div', { class: 'hmeta' }, h('span', { class: 'pill' }, sw(r.sentiment), SENT_BY[r.sentiment].label), stars(r.rating),
          h('span', null, fmt(r.thumbs) + ' found helpful'), r.ts ? h('span', null, dateText(r.ts)) : null),
        h('div', null, highlighted(r.text.length > 320 ? r.text.slice(0, 320) + '…' : r.text, r.text.length > 320 ? r.neg.filter((x) => x[1] <= 320) : r.neg, r.text.length > 320 ? r.pos.filter((x) => x[1] <= 320) : r.pos))))));
    }

    function stars(n) {
      if (n == null) return null;
      return h('span', { class: 'stars', role: 'img', 'aria-label': 'Rated ' + n + ' out of 5' }, '★'.repeat(n) + '☆'.repeat(5 - n));
    }

    function highlighted(text, neg, pos) {
      const spans = [...neg.map((x) => [x[0], x[1], 'neg', x[2]]), ...pos.map((x) => [x[0], x[1], 'pos', x[2]])].sort((a, b) => a[0] - b[0]);
      const out = [];
      let at = 0;
      for (const [s, e, cls, ti] of spans) {
        if (s < at) continue;
        if (s > at) out.push(text.slice(at, s));
        out.push(h('mark', { class: cls, title: (cls === 'neg' ? 'Unpleasant: ' : 'Pleasant: ') + dispTerm(DATA.terms[ti]) }, text.slice(s, e)));
        at = e;
      }
      if (at < text.length) out.push(text.slice(at));
      return out;
    }

    // ---------- KPI tiles ----------
    function kpis(list) {
      const n = list.length;
      const anyNeg = list.filter((r) => r.neg.length).length;
      const pleasant = list.filter((r) => r.sentiment === 'pleasant').length;
      const rated = list.filter((r) => r.rating != null);
      const avg = rated.length ? rated.reduce((a, r) => a + r.rating, 0) / rated.length : 0;
      const oneStar = rated.filter((r) => r.rating === 1).length;
      const replied = list.filter((r) => r.replied).length;
      const words = new Map();
      for (const r of list) for (const t of r.negTerms) words.set(t, (words.get(t) || 0) + 1);
      const topWord = [...words].sort((a, b) => b[1] - a[1])[0];
      const tile = (k, v, s, key) => h('div', { class: 'tile' }, h('div', { class: 'k' }, key ? sw(key) : null, k), h('div', { class: 'v' }, v), s ? h('div', { class: 's' }, s) : null);
      return h('section', { class: 'kpis', 'aria-label': 'Key figures' },
        tile('Reviews analysed', fmt(n), n === all.length ? 'all loaded reviews' : 'of ' + fmt(all.length) + ' loaded (filtered)'),
        tile('With unpleasant words', pctText(anyNeg, n), nRev(anyNeg) + ' (unpleasant + mixed)', 'unpleasant'),
        tile('Pleasant only', pctText(pleasant, n), nRev(pleasant) + '', 'pleasant'),
        tile('Average rating', rated.length ? avg.toFixed(1) + ' ★' : '–', rated.length ? pctText(oneStar, rated.length) + ' are 1-star' : ''),
        tile('Top complaint word', topWord ? dispTerm(topWord[0]) : '–', topWord ? 'in ' + nRev(topWord[1]) + ' (' + pctText(topWord[1], n) + ')' : ''),
        tile('Developer replies', pctText(replied, n), fmt(replied) + ' of ' + nRev(n) + ' have a reply'));
    }

    // ---------- Review list ----------
    const SORTS = {
      helpful: ['Most helpful', (a, b) => b.thumbs - a.thumbs],
      newest: ['Newest', (a, b) => (b.ts || 0) - (a.ts || 0)],
      oldest: ['Oldest', (a, b) => (a.ts || Infinity) - (b.ts || Infinity)],
      lowest: ['Lowest rating', (a, b) => (a.rating || 0) - (b.rating || 0) || b.thumbs - a.thumbs],
      highest: ['Highest rating', (a, b) => (b.rating || 0) - (a.rating || 0) || b.thumbs - a.thumbs],
      words: ['Most unpleasant words', (a, b) => b.neg.length - a.neg.length || b.thumbs - a.thumbs]
    };

    function explorer(list) {
      const sorted = [...list].sort(SORTS[sortBy][1]);
      const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
      page = Math.min(page, pages - 1);
      const slice = sorted.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
      const sortSel = h('select', { class: 'search', 'aria-label': 'Sort reviews', onchange: (e) => { sortBy = e.target.value; page = 0; renderExplorer(); } },
        Object.entries(SORTS).map(([k, [label]]) => h('option', { value: k, selected: k === sortBy }, label)));
      const items = slice.map((r) => h('li', { class: 'review' },
        h('div', { class: 'rmeta' },
          h('span', { class: 'pill' }, sw(r.sentiment), SENT_BY[r.sentiment].label),
          stars(r.rating),
          h('span', { class: 'author' }, r.author || 'Google user'),
          r.ts ? h('span', null, dateText(r.ts)) : null,
          r.version ? h('span', { class: 'tag' }, 'v' + r.version) : null,
          r.thumbs ? h('span', null, fmt(r.thumbs) + ' found helpful') : null,
          r.replied ? h('span', { class: 'tag' }, 'Developer replied') : null),
        h('p', { class: 'rtext' }, highlighted(r.text, r.neg, r.pos))));
      const go = (p) => { page = p; renderExplorer(); document.getElementById('explorer').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      return h('section', { class: 'explorer', id: 'explorer', 'aria-label': 'Reviews' },
        h('div', { class: 'ex-head' },
          h('h2', null, 'Reviews (' + fmt(list.length) + ')'),
          h('div', { class: 'hl-legend' }, h('span', null, h('mark', { class: 'neg' }, 'unpleasant word')), h('span', null, h('mark', { class: 'pos' }, 'pleasant word'))),
          h('label', null, h('span', { class: 'flabel' }, 'Sort '), sortSel)),
        list.length ? h('ol', { class: 'reviews' }, items) : h('p', { class: 'empty' }, 'No reviews match the filters.'),
        pages > 1 ? h('div', { class: 'pager' },
          h('button', { class: 'btn', type: 'button', disabled: page === 0, onclick: () => go(page - 1) }, '← Previous'),
          h('span', null, 'Page ' + fmt(page + 1) + ' of ' + fmt(pages)),
          h('button', { class: 'btn', type: 'button', disabled: page >= pages - 1, onclick: () => go(page + 1) }, 'Next →')) : null);
    }

    // ---------- Filter bar ----------
    function filterBar(list) {
      const sentChips = SENT.map((s) => h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(F.sent.has(s.key)),
        onclick: () => { toggle(F.sent, s.key, SENT.length); update(); }
      }, h('span', { class: 'sw', style: 'background:' + color(s.key) }), s.label));
      const starChips = [5, 4, 3, 2, 1].map((s) => h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(F.stars.has(s)),
        onclick: () => { toggle(F.stars, s, 5); update(); }
      }, s + '★'));
      const versionSel = versions.length ? h('select', { class: 'search', 'aria-label': 'App version', onchange: (e) => { F.version = e.target.value; update(); } },
        h('option', { value: '' }, 'All versions'), versions.map((v) => h('option', { value: v, selected: v === F.version }, 'v' + v))) : null;
      const search = h('input', { class: 'search', type: 'search', placeholder: 'Search review text or name', value: F.q, 'aria-label': 'Search reviews' });
      let t = 0;
      search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { F.q = search.value; update(true); }, 200); });
      const word = F.word ? h('span', { class: 'wordpill' }, (F.word.neg ? 'Unpleasant: ' : 'Pleasant: ') + '"' + dispTerm(F.word.term) + '"',
        h('button', { type: 'button', 'aria-label': 'Clear word filter', onclick: () => { F.word = null; update(); } }, '×')) : null;
      const isDefault = F.sent.size === SENT.length && F.stars.size === 5 && !F.version && !F.word && !F.q;
      return h('div', { class: 'filters', role: 'region', 'aria-label': 'Filters' },
        h('div', { class: 'fgroup' }, h('span', { class: 'flabel' }, 'Sentiment'), sentChips),
        h('div', { class: 'fgroup' }, h('span', { class: 'flabel' }, 'Rating'), starChips),
        versionSel ? h('div', { class: 'fgroup' }, versionSel) : null,
        h('div', { class: 'fgroup' }, search),
        word,
        isDefault ? null : h('button', { class: 'btn', type: 'button', onclick: resetFilters }, 'Reset filters'),
        h('span', { class: 'showing', 'aria-live': 'polite' }, 'Showing ' + fmt(list.length) + ' of ' + nRev(all.length) + ''));
    }
    function toggle(set, v, total) {
      // Clicking the only selected item resets to all, so a filter can't empty itself.
      if (set.has(v) && set.size === 1) { for (let k = 0; k < total; k++) set.add(set === F.stars ? k + 1 : SENT[k].key); return; }
      if (set.has(v)) set.delete(v); else set.add(v);
    }
    function soloSentiment(k) { F.sent = new Set([k]); update(); }
    function soloStar(s) { F.stars = new Set([s]); update(); }
    function setWord(term, neg) { F.word = { term, neg }; update(); }
    function setVersion(v) { F.version = v; update(); }
    function resetFilters() { F.sent = new Set(SENT.map((s) => s.key)); F.stars = new Set([1, 2, 3, 4, 5]); F.version = ''; F.word = null; F.q = ''; update(); }

    // ---------- CSV ----------
    function downloadCsv() {
      const list = filtered();
      const safe = (v) => {
        let s = v == null ? '' : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheet apps from running it as a formula
        return '"' + s.replace(/"/g, '""') + '"';
      };
      const head = ['Sentiment', 'Rating', 'Date', 'App version', 'Found helpful', 'Developer replied', 'Author', 'Unpleasant words', 'Pleasant words', 'Review'];
      const lines = [head.map(safe).join(',')];
      for (const r of list) {
        lines.push([SENT_BY[r.sentiment].label, r.rating, r.ts ? new Date(r.ts).toISOString().slice(0, 10) : '', r.version || '', r.thumbs,
          r.replied ? 'Yes' : 'No', r.author, r.negTerms.map(dispTerm).join('; '), r.posTerms.map(dispTerm).join('; '), r.text].map(safe).join(','));
      }
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = h('a', { href: URL.createObjectURL(blob), download: (DATA.app.name || 'reviews').replace(/[^\w\-]+/g, '-') + '-reviews.csv' });
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    // ---------- Theme ----------
    const THEMES = ['auto', 'light', 'dark'];
    let theme = 'auto';
    try { theme = localStorage.getItem('rwf-report-theme') || 'auto'; } catch (e) { /* storage blocked */ }
    function applyTheme() {
      if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', theme);
    }
    applyTheme();

    // ---------- Page ----------
    const app = document.getElementById('app');
    const S = DATA.scope || {};
    const header = h('header', { class: 'top' },
      h('div', null,
        h('h1', null, (DATA.app.name || 'App') + ' review report'),
        h('p', { class: 'meta' }, 'Google Play · ', DATA.app.url ? h('a', { href: DATA.app.url, rel: 'noopener noreferrer', target: '_blank' }, DATA.app.id) : DATA.app.id,
          ' · Generated ' + new Date(DATA.generatedAt).toLocaleString()),
        h('p', { class: 'scope' }, nRev(all.length) + ' analysed' +
          (S.loaded ? ', of which ' + fmt(S.loaded) + ' were loaded automatically in Google Play\'s "Most relevant" order' : '') +
          (S.ended ? '. That is every review Google Play returned.' : S.loaded ? '. Google Play has more reviews than this; the report covers the ones loaded.' : '.') +
          ' Sentiment comes from matching word lists (see "How reviews were classified" below), not from reading tone.')),
      h('div', { class: 'top-actions' },
        h('button', { class: 'btn', type: 'button', onclick: downloadCsv, title: 'Download the reviews that match the current filters' }, 'Download CSV'),
        h('button', { class: 'btn', type: 'button', id: 'themeBtn', onclick: () => {
          theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
          try { localStorage.setItem('rwf-report-theme', theme); } catch (e) { /* ignore */ }
          applyTheme();
          document.getElementById('themeBtn').textContent = 'Theme: ' + theme;
        } }, 'Theme: ' + theme),
        h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Print')));

    const slots = { kpis: h('div'), filters: h('div'), grid: h('div', { class: 'grid' }), explorer: h('div') };
    const method = h('section', { class: 'method', 'aria-label': 'How reviews were classified' },
      h('h2', null, 'How reviews were classified'),
      h('ul', null,
        h('li', null, h('b', null, 'Unpleasant: '), 'uses at least one word from the unpleasant list and none from the pleasant list.'),
        h('li', null, h('b', null, 'Mixed: '), 'uses words from both lists.'),
        h('li', null, h('b', null, 'Pleasant: '), 'uses at least one word from the pleasant list and none from the unpleasant list.'),
        h('li', null, h('b', null, 'Neutral: '), 'uses no word from either list.'),
        h('li', null, 'Matching ignores case and only matches whole words; a word ending in … matches its endings (crash… matches crashes, crashing). A pleasant word inside an unpleasant phrase ("not good") is not counted as pleasant.'),
        h('li', null, 'This is word matching, not a reading of tone: sarcasm, negation ("not bad") and words outside the lists are missed. Treat the figures as a guide and read the reviews behind them.')),
      h('p', null, h('b', null, 'Unpleasant words (' + DATA.negList.length + ')')), h('div', { class: 'terms' }, DATA.negList.map((t) => h('span', null, dispTerm(t)))),
      h('p', null, h('b', null, 'Pleasant words (' + DATA.posList.length + ')')), h('div', { class: 'terms' }, DATA.posList.map((t) => h('span', null, dispTerm(t)))));
    const footer = h('footer', null, h('span', null, 'Made with Review Red Flags from public Google Play reviews.'), h('span', { class: 'credit' }, 'Built by ', h('a', { href: 'https://www.linkedin.com/in/santhosh-tuppad-338b7412/', target: '_blank', rel: 'noopener noreferrer' }, 'Santhosh Tuppad')));

    app.replaceChildren(h('div', { class: 'wrap' }, header, slots.kpis, slots.filters, slots.grid, slots.explorer, method, footer), tip);

    function renderExplorer() {
      slots.explorer.replaceChildren(explorer(filtered()));
    }
    function update(keepSearchFocus) {
      const list = filtered();
      page = 0;
      const focusSearch = keepSearchFocus && document.activeElement && document.activeElement.type === 'search';
      slots.kpis.replaceChildren(kpis(list));
      slots.filters.replaceChildren(filterBar(list));
      slots.grid.replaceChildren(sentimentMix(list), starChart(list), timeChart(list), wordChart(list, true), wordChart(list, false), versionChart(list), helpfulList(list));
      renderExplorer();
      tip.hidden = true;
      if (focusSearch) {
        const s = slots.filters.querySelector('input[type="search"]');
        s.focus();
        s.setSelectionRange(s.value.length, s.value.length);
      }
    }
    update();

    // Redraw the charts (not the review list) when the width changes, so axis labels fit.
    let lastW = innerWidth;
    let rt = 0;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (Math.abs(innerWidth - lastW) < 40) return;
        lastW = innerWidth;
        const list = filtered();
        slots.grid.replaceChildren(sentimentMix(list), starChart(list), timeChart(list), wordChart(list, true), wordChart(list, false), versionChart(list), helpfulList(list));
      }, 200);
    });
  }

  // ------------------------------------------------------------------
  // Build the file
  // ------------------------------------------------------------------

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /**
   * input: { app: {name, id, url}, generatedAt, reviews: [record], negList, posList, scope: {loaded, ended} }
   * Each record: { author, rating, ts, text, thumbs, version, replied, hits, pos }
   */
  function buildReport(input) {
    const termIndex = new Map();
    const terms = [];
    const ti = (t) => {
      if (!termIndex.has(t)) { termIndex.set(t, terms.length); terms.push(t); }
      return termIndex.get(t);
    };
    const rows = input.reviews.map((r) => [
      r.author || '', r.rating == null ? null : r.rating, r.ts || null, r.text || '', r.thumbs || 0, r.version || null, r.replied ? 1 : 0,
      (r.hits || []).map((x) => [x.start, x.end, ti(x.term)]),
      (r.pos || []).map((x) => [x.start, x.end, ti(x.term)])
    ]);
    const data = {
      app: input.app, generatedAt: input.generatedAt || Date.now(), scope: input.scope || {},
      terms, negList: input.negList || [], posList: input.posList || [], rows
    };
    // Safe inside <script>: no "<" can close the tag, and line separators can't break the JSON.
    const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    const title = (input.app && input.app.name ? input.app.name : 'App') + ' review report';
    return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<meta name="generator" content="Review Red Flags, built by Santhosh Tuppad">\n' +
      '<title>' + esc(title) + '</title>\n<style>' + REPORT_CSS + '</style>\n</head>\n<body>\n' +
      '<div id="app"><p class="noscript">' + esc(title) + ': this report needs JavaScript turned on to draw its charts.</p></div>\n' +
      '<script type="application/json" id="rwf-data">' + json + '</script>\n' +
      '<script>(' + reportApp.toString() + ')();</script>\n</body>\n</html>\n';
  }

  RWF.buildReport = buildReport;
})(globalThis);
