/*
 * Review Red Flags: content script for play.google.com.
 *
 * Reads every review on a Google Play app page (the few shown on the page and
 * the ones in the "See all reviews" dialog), checks the text against the word
 * list, and lists the reviews that match in a modal with the words
 * highlighted. "Load all reviews" fetches the rest of the reviews in batches
 * (see loader.js) so nobody has to keep scrolling, even in a background tab.
 *
 * Built by Santhosh Tuppad.
 */
(() => {
  'use strict';
  if (window.__reviewRedFlagsLoaded) return;
  window.__reviewRedFlagsLoaded = true;

  const RWF = globalThis.ReviewRedFlags;
  const ext = globalThis.chrome;
  const APP_PAGE = /^\/store\/apps\/details/;
  const PAGE_SIZE = 100; // cards rendered at a time in the modal
  const fmt = (n) => Number(n).toLocaleString();

  const state = {
    settings: { ...RWF.DEFAULT_SETTINGS },
    matcher: null,     // unpleasant words
    posMatcher: null,  // pleasant words (for the report)
    ready: false,
    seen: new Map(),   // review id -> record for every review scanned
    flagged: [],       // flagged records in the order they were found
    pageKey: pageKey(),
    dialogOpen: false, // is the "See all reviews" dialog showing reviews?
    dismissed: false,  // user closed the modal; don't auto-open again until the view changes
    open: false,
    filter: null,
    shown: PAGE_SIZE
  };

  // ------------------------------------------------------------------
  // Reading reviews from the Play Store page
  // ------------------------------------------------------------------

  function pageKey() {
    return location.pathname + location.search;
  }

  function isAppPage() {
    return APP_PAGE.test(location.pathname);
  }

  function appId() {
    return new URLSearchParams(location.search).get('id');
  }

  function textOf(el) {
    return el ? el.textContent.trim() : '';
  }

  function reviewTextElement(header, box) {
    const known = box.querySelector('.h3YV2d');
    if (known) return known;
    // Fallback if Google renames the class: the first sibling after the
    // header that isn't the "found this helpful" block.
    let el = header.nextElementSibling;
    while (el && (el.hasAttribute('data-review-id') || !textOf(el))) el = el.nextElementSibling;
    return el;
  }

  function readReviews() {
    const out = [];
    document.querySelectorAll('header[data-review-id]').forEach((header) => {
      const box = header.parentElement;
      if (!box) return;
      const textEl = reviewTextElement(header, box);
      if (!textEl) return;
      const ratingEl = header.querySelector('[aria-label^="Rated "]') || header.querySelector('[role="img"][aria-label]');
      const rating = ratingEl && (ratingEl.getAttribute('aria-label').match(/\d+(?:\.\d+)?/) || [])[0];
      out.push({
        id: header.getAttribute('data-review-id'),
        box,
        textEl,
        author: textOf(header.querySelector('.X5PpBb')) || 'Google user',
        date: textOf(header.querySelector('.bp9Aid')),
        rating: rating ? Math.round(parseFloat(rating)) : null,
        thumbs: parseInt((box.querySelector('[data-original-thumbs-up-count]') || { getAttribute: () => 0 }).getAttribute('data-original-thumbs-up-count'), 10) || 0,
        inDialog: !!box.closest('[role="dialog"]')
      });
    });
    return out;
  }

  // ------------------------------------------------------------------
  // Scanning
  // ------------------------------------------------------------------

  /**
   * Check one review and keep it (the report needs every review, not just
   * flagged ones). Returns true if it was new and has unpleasant words.
   */
  function ingest(review, source) {
    if (state.seen.has(review.id)) return false;
    const body = (review.text || '').trim();
    // Where the lists overlap the longer phrase wins: "not good" is
    // unpleasant, "no crashes" is pleasant.
    const { hits, pos } = body
      ? RWF.resolveOverlaps(RWF.findMatches(body, state.matcher), RWF.findMatches(body, state.posMatcher))
      : { hits: [], pos: [] };
    let ts = review.ts || null;
    if (!ts && review.date) {
      const parsed = Date.parse(review.date);
      if (!Number.isNaN(parsed)) ts = parsed;
    }
    const rec = {
      id: review.id, box: review.box || null, author: review.author, date: review.date, rating: review.rating,
      ts, thumbs: review.thumbs || 0, version: review.version || null, replied: !!review.replied,
      source, text: body, hits, pos, terms: [...new Set(hits.map((h) => h.term))]
    };
    state.seen.set(review.id, rec);
    if (!hits.length) return false;
    state.flagged.push(rec);
    return true;
  }

  function scan() {
    if (!state.ready) return;
    if (!isAppPage()) { refreshIndicators(); return; }

    const reviews = readReviews();
    const dialogNow = reviews.some((r) => r.inDialog);
    if (dialogNow !== state.dialogOpen) {
      state.dialogOpen = dialogNow;
      if (dialogNow) state.dismissed = false; // opening "See all reviews" counts as a new view
    }

    let fresh = 0;
    for (const r of reviews) {
      const text = textOf(r.textEl);
      if (!text) continue;
      if (ingest({ ...r, text }, r.inDialog ? 'All reviews' : 'App page')) fresh++;

      const rec = state.seen.get(r.id);
      if (!rec || !rec.hits.length) continue;
      // The same review can be on the page, in the dialog, or only loaded in
      // the background. Point "Show on page" at a copy that's on screen.
      if (!rec.box || !rec.box.isConnected || (r.inDialog && !rec.box.closest('[role="dialog"]'))) rec.box = r.box;
      if (state.settings.highlightOnPage && !r.textEl.hasAttribute('data-rwf-done')) markOnPage(r.textEl);
    }

    refreshIndicators(fresh > 0);
    if (state.open) render();
    else if (fresh && state.settings.autoOpen && !state.dismissed && !loader.running && !promptOpen) openModal();
  }

  function resetResults() {
    stopLoading('reset');
    resetLoader();
    clearPageMarks();
    state.seen.clear();
    state.flagged = [];
    state.filter = null;
    state.shown = PAGE_SIZE;
  }

  function onPageChange() {
    state.pageKey = pageKey();
    state.dialogOpen = false;
    state.dismissed = false;
    resetResults();
    if (state.open) render();
    refreshIndicators();
  }

  // Wrap matched words in <mark> inside the review on the Play page itself.
  function markOnPage(el) {
    el.setAttribute('data-rwf-done', '');
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const hits = RWF.findMatches(node.nodeValue, state.matcher);
      if (hits.length) node.replaceWith(highlighted(node.nodeValue, hits, 'rwf-mark'));
    }
  }

  function clearPageMarks() {
    document.querySelectorAll('mark.rwf-mark').forEach((m) => {
      const parent = m.parentNode;
      m.replaceWith(document.createTextNode(m.textContent));
      if (parent) parent.normalize();
    });
    document.querySelectorAll('[data-rwf-done]').forEach((el) => el.removeAttribute('data-rwf-done'));
  }

  /** Text as a fragment with each hit wrapped in <mark>. Never uses innerHTML. */
  function highlighted(text, hits, className) {
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const hit of hits) {
      if (hit.start < pos) continue;
      if (hit.start > pos) frag.append(text.slice(pos, hit.start));
      const mark = document.createElement('mark');
      if (className) mark.className = className;
      mark.title = 'Matched "' + RWF.displayTerm(hit.term) + '"';
      mark.textContent = text.slice(hit.start, hit.end);
      frag.append(mark);
      pos = hit.end;
    }
    if (pos < text.length) frag.append(text.slice(pos));
    return frag;
  }

  // ------------------------------------------------------------------
  // Load all reviews
  // ------------------------------------------------------------------

  const loader = {
    running: false,
    loaded: 0,       // reviews fetched in the current run
    total: 0,        // reviews fetched for this page across runs
    target: 0,       // this run's limit (0 = no limit)
    token: null,     // where the next batch starts
    ended: false,    // Play has no more reviews
    error: null,
    finishedAt: 0,
    abort: null,
    mode: 'anonymous' // see loader.js: no Google cookies unless Play needs them
  };

  function resetLoader() {
    Object.assign(loader, { running: false, loaded: 0, total: 0, target: 0, token: null, ended: false, error: null, finishedAt: 0, notifyDone: false, abort: null, mode: 'anonymous' });
  }

  function limitSetting() {
    return state.settings.noLimit ? 0 : Math.max(1, parseInt(state.settings.loadLimit, 10) || RWF.DEFAULT_SETTINGS.loadLimit);
  }

  function throttleSetting() {
    const ms = parseInt(state.settings.throttleMs, 10);
    return Number.isFinite(ms) ? Math.max(0, Math.min(RWF.MAX_THROTTLE_MS, ms)) : RWF.DEFAULT_SETTINGS.throttleMs;
  }

  /**
   * Pause between requests. Chrome slows a background tab's own timers (to
   * once a minute after a few minutes hidden), so the extension's service
   * worker keeps time and messages back. Falls back to a local timer.
   */
  async function wait(ms) {
    // The worker keeps each timer under its 30-second idle limit, so split long waits.
    for (let left = ms; left > 0; left -= RWF.MAX_THROTTLE_MS) await waitOnce(Math.min(left, RWF.MAX_THROTTLE_MS));
  }

  function waitOnce(ms) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try {
        ext.runtime.sendMessage({ type: 'rwf-sleep', ms }, () => {
          if (ext.runtime.lastError) setTimeout(finish, ms); else finish();
        });
      } catch (e) {
        setTimeout(finish, ms);
      }
    });
  }

  async function startLoading() {
    if (loader.running || loader.ended || !isAppPage() || !state.ready) return;
    const id = appId();
    if (!id) return;
    const key = state.pageKey;
    const abort = new AbortController();
    Object.assign(loader, { running: true, loaded: 0, target: limitSetting(), error: null, finishedAt: 0, abort });
    if (state.open) closeModal(false); // keep the screen clear while loading
    refreshIndicators();

    const params = new URLSearchParams(location.search);
    const opts = { hl: params.get('hl') || document.documentElement.lang || '', gl: params.get('gl') || '', signal: abort.signal };
    let failures = 0;
    let switchedMode = false;

    let first = true;
    while (loader.running && state.pageKey === key) {
      const want = loader.target ? Math.min(RWF.MAX_BATCH, loader.target - loader.loaded) : RWF.MAX_BATCH;
      if (want <= 0) break;
      if (!first) {
        await wait(throttleSetting()); // user-set delay between requests, to stay clear of rate limits
        if (!loader.running || abort.signal.aborted) return;
      }
      first = false;
      let batch;
      try {
        batch = await RWF.fetchReviewBatch(id, want, loader.token, { ...opts, mode: loader.mode });
        failures = 0;
        switchedMode = false;
      } catch (err) {
        if (abort.signal.aborted) return;
        if (err.status >= 400 && err.status < 500 && err.status !== 429) {
          // Play refused the request itself (e.g. HTTP 400), so sending it
          // again unchanged won't help. Try the other way of asking once.
          if (!switchedMode) {
            switchedMode = true;
            loader.mode = loader.mode === 'session' ? 'anonymous' : 'session';
            continue;
          }
          loader.error = 'Google Play refused the request (HTTP ' + err.status + '). Reload the page, then switch it on again';
          break;
        }
        failures++;
        if (failures > 3) {
          loader.error = err.status === 429
            ? 'Google Play is limiting requests (HTTP 429). Raise the wait between requests, then switch it on again'
            : (err.message || 'Could not load more reviews') + '. Switch it on again to retry';
          break;
        }
        // Back off harder on rate limits (HTTP 429) than on other errors.
        await wait((err.status === 429 ? 5000 : 1500) * failures * failures + throttleSetting());
        if (!loader.running || abort.signal.aborted) return;
        continue;
      }
      if (!loader.running || abort.signal.aborted) return;

      let fresh = 0;
      for (const r of batch.reviews) if (ingest(r, 'Loaded automatically')) fresh++;
      loader.loaded += batch.reviews.length;
      loader.total += batch.reviews.length;
      loader.token = batch.token;
      if (!batch.token || !batch.reviews.length) loader.ended = true;
      refreshIndicators(fresh > 0);
      if (loader.ended) break;
    }

    if (!loader.running || state.pageKey !== key) return;
    loader.running = false;
    loader.abort = null;
    loader.finishedAt = Date.now();
    loader.notifyDone = document.visibilityState === 'hidden';
    refreshIndicators(true);
    if (state.settings.askExport && state.seen.size) {
      openPrompt('finished'); // "Do you want to export to HTML?"
    } else if (state.settings.autoOpen && state.flagged.length) {
      state.filter = null;
      state.shown = PAGE_SIZE;
      openModal();
    }
  }

  function stopLoading(reason) {
    if (!loader.running) return;
    loader.running = false;
    if (loader.abort) loader.abort.abort();
    loader.abort = null;
    loader.finishedAt = Date.now();
    loader.stoppedBy = reason;
    refreshIndicators();
  }

  function toggleLoading() {
    if (loader.running) stopLoading('user');
    else startLoading();
  }

  /** Short status shared by the on-page pill, popup, toolbar icon and tab title. */
  function stats() {
    return {
      appPage: isAppPage(),
      scanned: state.seen.size,
      flagged: state.flagged.length,
      limit: limitSetting(),
      throttleMs: throttleSetting(),
      loader: {
        running: loader.running,
        loaded: loader.loaded,
        total: loader.total,
        target: loader.target,
        ended: loader.ended,
        canContinue: !!loader.token && !loader.ended,
        error: loader.error,
        finished: !!loader.finishedAt
      }
    };
  }

  function loaderLabel() {
    const L = loader;
    if (L.running) return 'Loading ' + fmt(L.loaded) + (L.target ? ' / ' + fmt(L.target) : '') + ' reviews';
    if (L.error) return 'Stopped: ' + L.error;
    if (L.ended && L.total) return 'All ' + fmt(L.total) + ' reviews loaded';
    if (L.ended) return 'No more reviews to load';
    const lim = limitSetting();
    if (L.token) return 'Load ' + (lim ? 'next ' + fmt(lim) : 'the rest of the') + ' reviews';
    return 'Load ' + (lim ? fmt(lim) : 'all') + ' reviews';
  }

  // ------------------------------------------------------------------
  // Progress everywhere: on-page pill, toolbar icon, tab title
  // ------------------------------------------------------------------

  let lastPushed = '';
  function refreshIndicators(pulse) {
    updateDock(pulse);
    updateTitle();
    const s = stats();
    const json = JSON.stringify(s);
    if (json === lastPushed) return;
    lastPushed = json;
    try {
      ext.runtime.sendMessage({ type: 'rwf-status', status: s }, () => void ext.runtime.lastError);
    } catch (e) { /* extension was reloaded; nothing to update */ }
  }

  const TITLE_PREFIX = /^(?:⏳|✓|⚠) [^·]* · /;
  function updateTitle() {
    const base = document.title.replace(TITLE_PREFIX, '');
    let prefix = '';
    if (loader.running) {
      prefix = '⏳ ' + fmt(loader.loaded) + (loader.target ? '/' + fmt(loader.target) : '') + ' loaded';
    } else if (loader.notifyDone && document.visibilityState === 'hidden') {
      prefix = loader.error ? '⚠ Load stopped' : '✓ ' + fmt(state.flagged.length) + ' flagged';
    }
    const next = prefix ? prefix + ' · ' + base : base;
    if (document.title !== next) document.title = next;
  }
  document.addEventListener('visibilitychange', () => {
    // The "done" mark in the tab title is for when you're elsewhere; clear it when you come back.
    if (document.visibilityState === 'visible') loader.notifyDone = false;
    updateTitle();
  });

  // ------------------------------------------------------------------
  // Modal, badge and loader switch (in a shadow root so Play's CSS can't touch them)
  // ------------------------------------------------------------------

  let ui = null;
  let lastFocus = null;

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }

  function ensureUI() {
    if (ui) return ui;
    const host = document.createElement('div');
    host.id = 'review-red-flags';
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });

    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(RWF.MODAL_CSS);
      root.adoptedStyleSheets = [sheet];
    } catch (e) {
      root.append(h('style', null, RWF.MODAL_CSS));
    }

    const loadSwitch = h('button', { class: 'loadall', type: 'button', role: 'switch', 'aria-checked': 'false', onclick: () => toggleLoading() },
      h('span', { class: 'sw', 'aria-hidden': 'true' }, h('span', { class: 'knob' })),
      h('span', { class: 'ltext' }, 'Load all reviews'),
      h('span', { class: 'bar', 'aria-hidden': 'true' }, h('span', { class: 'fill' })));
    const badge = h('button', { class: 'badge', type: 'button', hidden: true, onclick: () => (state.open ? closeModal() : openModal()) },
      h('span', { class: 'flag', 'aria-hidden': 'true' }, '⚑'),
      h('span', { class: 'count' }, '0'));
    const dockExport = h('button', {
      class: 'dock-export', type: 'button', hidden: true,
      title: 'Export every scanned review as an HTML dashboard. You choose the folder.',
      onclick: () => runExport()
    }, h('span', { 'aria-hidden': 'true' }, '⤓'), ' Report');
    const dock = h('div', { class: 'dock', hidden: true }, loadSwitch, dockExport, badge);

    const summary = h('p', { class: 'summary', id: 'rwf-summary' });
    const closeBtn = h('button', { class: 'close', type: 'button', 'aria-label': 'Close', onclick: () => closeModal() }, '×');
    const modalExport = h('button', { class: 'export', type: 'button', onclick: () => runExport() }, 'Export HTML report');
    const chips = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Filter by word' });
    const list = h('ol', { class: 'list' });
    const modal = h('section', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rwf-title', 'aria-describedby': 'rwf-summary' },
      h('div', { class: 'head' },
        h('div', null, h('h2', { id: 'rwf-title' }, 'Review Red Flags'), summary),
        h('div', { class: 'head-actions' }, modalExport, closeBtn)),
      chips,
      list,
      h('div', { class: 'foot' },
        h('span', null, 'Keeps scanning as more reviews load. Press Esc to close.'),
        h('span', { class: 'credit' }, 'Built by ', h('a', { href: 'https://www.linkedin.com/in/santhosh-tuppad-338b7412/', target: '_blank', rel: 'noopener noreferrer' }, 'Santhosh Tuppad'))));
    const overlay = h('div', { class: 'overlay', hidden: true },
      h('div', { class: 'backdrop', onclick: () => closeModal() }),
      modal);

    // "Export to HTML?" prompt (after loading finishes, or from the popup)
    const promptTitle = h('h2', { id: 'rwf-prompt-title' });
    const promptText = h('p', { class: 'prompt-text', id: 'rwf-prompt-text' });
    const promptStatus = h('p', { class: 'prompt-status', role: 'status', 'aria-live': 'polite' });
    const promptExport = h('button', { class: 'primary', type: 'button', onclick: () => runExport() }, 'Export to HTML…');
    const promptView = h('button', { type: 'button', onclick: () => { closePrompt(); openModal(); } }, 'View flagged reviews');
    const promptClose = h('button', { type: 'button', onclick: () => closePrompt() }, 'Not now');
    const promptBox = h('section', { class: 'prompt', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rwf-prompt-title', 'aria-describedby': 'rwf-prompt-text' },
      promptTitle, promptText, promptStatus,
      h('div', { class: 'prompt-actions' }, promptExport, promptView, promptClose),
      h('p', { class: 'prompt-credit' }, 'Built by ', h('a', { href: 'https://www.linkedin.com/in/santhosh-tuppad-338b7412/', target: '_blank', rel: 'noopener noreferrer' }, 'Santhosh Tuppad')));
    const promptOverlay = h('div', { class: 'overlay', hidden: true },
      h('div', { class: 'backdrop', onclick: () => closePrompt() }),
      promptBox);

    root.append(h('div', { class: 'wrap' }, overlay, promptOverlay, dock));
    (document.body || document.documentElement).append(host);

    ui = {
      host, root, dock, loadSwitch, dockExport, badge, overlay, modal, summary, closeBtn, modalExport, chips, list,
      promptOverlay, promptBox, promptTitle, promptText, promptStatus, promptExport, promptView, promptClose
    };
    return ui;
  }

  // ------------------------------------------------------------------
  // HTML report export
  // ------------------------------------------------------------------

  let promptOpen = false;
  let exporting = false;

  function sentimentCounts() {
    const c = { pleasant: 0, neutral: 0, mixed: 0, unpleasant: 0 };
    for (const r of state.seen.values()) {
      if (r.hits.length && r.pos.length) c.mixed++;
      else if (r.hits.length) c.unpleasant++;
      else if (r.pos.length) c.pleasant++;
      else c.neutral++;
    }
    return c;
  }

  function appName() {
    const h1 = document.querySelector('h1');
    return (h1 && h1.textContent.trim()) || appId() || 'App';
  }

  function reportFileName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = appName().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'app';
    return name + '-review-report-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.html';
  }

  function reportInput() {
    const id = appId();
    return {
      app: { name: appName(), id, url: location.origin + '/store/apps/details?id=' + encodeURIComponent(id) },
      generatedAt: Date.now(),
      reviews: [...state.seen.values()],
      negList: RWF.parseTerms(state.settings.terms),
      posList: RWF.parseTerms(state.settings.pleasantTerms),
      scope: { loaded: loader.total, ended: loader.ended }
    };
  }

  function openPrompt(reason) {
    ensureUI();
    if (state.open) closeModal(false);
    const c = sentimentCounts();
    const n = state.seen.size;
    const L = loader;
    ui.promptTitle.textContent = reason === 'finished'
      ? (L.error ? 'Loading stopped' : L.ended ? 'All reviews loaded' : 'Loading finished')
      : 'Export HTML report';
    ui.promptText.textContent = (n
      ? fmt(n) + ' reviews scanned: ' + fmt(c.unpleasant + c.mixed) + ' with unpleasant words, ' + fmt(c.pleasant) + ' pleasant only, ' +
        fmt(c.neutral) + ' neutral. Do you want to export them to an HTML dashboard? You\'ll choose the folder and file name next.'
      : 'No reviews have been scanned on this page yet. Scroll to the reviews or use "Load all reviews" first.');
    ui.promptStatus.textContent = '';
    ui.promptStatus.classList.remove('error');
    ui.promptExport.disabled = !n;
    ui.promptExport.textContent = 'Export to HTML…';
    ui.promptView.hidden = !state.flagged.length;
    ui.promptClose.textContent = 'Not now';
    if (!promptOpen) {
      const active = document.activeElement;
      lastFocus = active && active !== ui.host ? active : null;
    }
    promptOpen = true;
    ui.promptOverlay.hidden = false;
    (n ? ui.promptExport : ui.promptClose).focus({ preventScroll: true });
  }

  function closePrompt() {
    if (!ui || !promptOpen) return;
    promptOpen = false;
    ui.promptOverlay.hidden = true;
    if (lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function promptSay(text, isError) {
    ensureUI();
    ui.promptStatus.textContent = text;
    ui.promptStatus.classList.toggle('error', !!isError);
  }

  /**
   * Build the report and save it. Must be called straight from a click: the
   * Save dialog (showSaveFilePicker) is only allowed during a user gesture,
   * so it opens before any slow work.
   */
  async function runExport() {
    if (exporting) return;
    if (!state.seen.size) { openPrompt('manual'); return; }
    exporting = true;
    const name = reportFileName();
    let handle = null;
    let picked = false;
    try {
      if (typeof window.showSaveFilePicker === 'function') {
        try {
          handle = await window.showSaveFilePicker({
            id: 'review-red-flags-report',
            suggestedName: name,
            startIn: 'documents',
            types: [{ description: 'HTML report', accept: { 'text/html': ['.html'] } }]
          });
          picked = true;
        } catch (e) {
          if (e && e.name === 'AbortError') return; // you cancelled the Save dialog
          handle = null; // Save dialog not available here; fall back to a download
        }
      }
      if (!promptOpen) openPrompt('manual');
      promptSay('Building the report…');
      await new Promise((r) => setTimeout(r, 30)); // let the message paint
      const html = RWF.buildReport(reportInput());
      const blob = new Blob([html], { type: 'text/html' });
      if (picked && handle) {
        const out = await handle.createWritable();
        await out.write(blob);
        await out.close();
        promptSay('Saved "' + handle.name + '" (' + sizeText(blob.size) + '). Open it in any browser.');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        ui.root.append(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
        promptSay('Downloaded "' + name + '" (' + sizeText(blob.size) + '). To pick a folder each time, turn on "Ask where to save each file" in Chrome\'s download settings.');
      }
      ui.promptExport.textContent = 'Export again…';
      ui.promptClose.textContent = 'Close';
    } catch (e) {
      if (!promptOpen) openPrompt('manual');
      promptSay('Could not save the report: ' + ((e && e.message) || e), true);
    } finally {
      exporting = false;
    }
  }

  function sizeText(bytes) {
    return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function updateDock(pulse) {
    if (!isAppPage()) {
      if (ui) ui.dock.hidden = true;
      return;
    }
    if (!state.ready) return;
    ensureUI();
    ui.dock.hidden = false;

    // Flagged-count badge and report button
    const n = state.flagged.length;
    ui.badge.hidden = state.seen.size === 0;
    ui.dockExport.hidden = state.seen.size === 0 || loader.running;
    ui.badge.classList.toggle('clean', n === 0);
    ui.badge.querySelector('.count').textContent = fmt(n);
    ui.badge.setAttribute('aria-label', fmt(n) + ' flagged review' + (n === 1 ? '' : 's') + '. Open list.');
    ui.badge.title = fmt(n) + ' of ' + fmt(state.seen.size) + ' reviews scanned contain flagged words';
    if (pulse) {
      ui.badge.classList.remove('pulse');
      void ui.badge.offsetWidth; // restart the animation
      ui.badge.classList.add('pulse');
    }

    // Load-all switch
    const L = loader;
    const sw = ui.loadSwitch;
    sw.setAttribute('aria-checked', String(L.running));
    sw.classList.toggle('running', L.running);
    sw.classList.toggle('indeterminate', L.running && !L.target);
    sw.classList.toggle('error', !!L.error && !L.running);
    sw.disabled = L.ended && !L.running;
    sw.querySelector('.ltext').textContent = loaderLabel();
    sw.querySelector('.fill').style.width = L.running && L.target ? Math.min(100, (L.loaded / L.target) * 100) + '%' : '0%';
    sw.title = L.running
      ? 'Loading reviews in the background. ' + fmt(L.loaded) + (L.target ? ' of ' + fmt(L.target) : '') +
        ' loaded, ' + fmt(n) + ' flagged so far. You can switch tabs. Click to stop.'
      : L.ended ? 'Every review for this app has been loaded.'
        : 'Load reviews automatically, without scrolling. Keeps going if you switch tabs. Change the limit from the toolbar icon.';
  }

  function openModal() {
    ensureUI();
    if (!state.open) {
      const active = document.activeElement;
      lastFocus = active && active !== ui.host ? active : null;
    }
    state.open = true;
    ui.overlay.hidden = false;
    render();
    ui.closeBtn.focus({ preventScroll: true });
  }

  function closeModal(byUser = true) {
    if (!ui || !state.open) return;
    state.open = false;
    if (byUser) state.dismissed = true;
    ui.overlay.hidden = true;
    if (lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function stars(n) {
    if (n == null) return null;
    const v = Math.max(0, Math.min(5, n));
    return h('span', { class: 'stars', 'aria-label': 'Rated ' + v + ' out of 5', role: 'img' }, '★'.repeat(v) + '☆'.repeat(5 - v));
  }

  function termCounts() {
    const counts = new Map();
    for (const rec of state.flagged) for (const t of rec.terms) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function render() {
    if (!ui) return;
    const scanned = state.seen.size;
    const total = state.flagged.length;
    if (state.filter && !state.flagged.some((r) => r.terms.includes(state.filter))) state.filter = null;
    const matching = state.filter ? state.flagged.filter((r) => r.terms.includes(state.filter)) : state.flagged;

    let summary;
    if (!isAppPage()) summary = 'Open a Google Play app page to scan its reviews.';
    else if (!scanned) summary = 'No reviews found on this page yet. Scroll to "Ratings and reviews", open "See all reviews", or use "Load all reviews".';
    else summary = fmt(total) + ' of ' + fmt(scanned) + ' review' + (scanned === 1 ? '' : 's') + ' scanned contain flagged words' +
      (state.filter ? '. Showing ' + fmt(matching.length) + ' with "' + RWF.displayTerm(state.filter) + '".' : '.');
    if (loader.running) summary += ' Still loading…';
    ui.summary.textContent = summary;

    // Word filter chips
    const chipFor = (term, label, count) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(state.filter === term),
      onclick: () => { state.filter = term; state.shown = PAGE_SIZE; ui.list.scrollTop = 0; render(); }
    }, label, h('span', { class: 'n' }, fmt(count)));
    ui.chips.replaceChildren(...(total ? [chipFor(null, 'All', total), ...termCounts().map(([t, c]) => chipFor(t, RWF.displayTerm(t), c))] : []));

    // Review cards, a page at a time so thousands of results stay quick
    const scrollTop = ui.list.scrollTop;
    if (!matching.length) {
      ui.list.replaceChildren(h('li', { class: 'empty' }, scanned ? 'No flagged words found in the reviews scanned so far.' : 'Waiting for reviews…'));
    } else {
      const items = matching.slice(0, state.shown).map(card);
      const rest = matching.length - state.shown;
      if (rest > 0) {
        items.push(h('li', { class: 'more-row' }, h('button', {
          class: 'more', type: 'button',
          onclick: () => { state.shown += PAGE_SIZE; render(); }
        }, 'Show ' + fmt(Math.min(PAGE_SIZE, rest)) + ' more (' + fmt(rest) + ' left)')));
      }
      ui.list.replaceChildren(...items);
    }
    ui.list.scrollTop = scrollTop;
  }

  function card(rec) {
    const onPage = !!rec.box && rec.box.isConnected;
    let action;
    if (onPage) {
      action = h('button', { class: 'show', type: 'button', title: 'Close this list and scroll to the review', onclick: () => showOnPage(rec) }, 'Show on page');
    } else if (rec.source === 'Loaded automatically') {
      action = null; // never shown in Play's page, so there's nothing to scroll to
    } else {
      action = h('button', { class: 'show', type: 'button', disabled: true, title: 'This review is no longer on the page (the dialog it was in was closed)' }, 'Not on page');
    }
    return h('li', { class: 'card' },
      h('div', { class: 'meta' },
        h('span', { class: 'author' }, rec.author),
        stars(rec.rating),
        rec.date ? h('span', null, rec.date) : null,
        h('span', { class: 'source' }, rec.source)),
      h('p', { class: 'text' }, highlighted(rec.text, rec.hits)),
      h('div', { class: 'foot-row' },
        h('div', { class: 'terms' }, 'Matched:', rec.terms.map((t) => h('span', { class: 'term' }, RWF.displayTerm(t)))),
        action));
  }

  function showOnPage(rec) {
    if (!rec.box || !rec.box.isConnected) return;
    closeModal();
    rec.box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    rec.box.classList.add('rwf-flash');
    setTimeout(() => rec.box.classList.remove('rwf-flash'), 2400);
  }

  // Keyboard: Esc closes our dialog (and only ours), Tab stays inside it.
  window.addEventListener('keydown', (e) => {
    if (!ui || (!state.open && !promptOpen)) return;
    const dialog = promptOpen ? ui.promptBox : ui.modal;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (promptOpen) closePrompt(); else closeModal();
    } else if (e.key === 'Tab') {
      const items = [...dialog.querySelectorAll('button:not([disabled]):not([hidden])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = ui.root.activeElement;
      if (!active || !items.includes(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
  }, true);

  // ------------------------------------------------------------------
  // Watching for new reviews and page changes
  // ------------------------------------------------------------------

  let timer = 0;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(tick, 250);
  }
  function tick() {
    if (pageKey() !== state.pageKey) onPageChange();
    scan();
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  // Play is a single-page app; catch URL changes that don't touch the DOM much.
  setInterval(() => { if (pageKey() !== state.pageKey) schedule(); }, 1000);

  // ------------------------------------------------------------------
  // Settings and messages from the popup
  // ------------------------------------------------------------------

  function applySettings(stored) {
    const prev = state.settings;
    state.settings = { ...RWF.DEFAULT_SETTINGS, ...(stored || {}) };
    const wordsChanged = !state.ready || prev.terms !== state.settings.terms ||
      prev.pleasantTerms !== state.settings.pleasantTerms || prev.highlightOnPage !== state.settings.highlightOnPage;
    if (wordsChanged) {
      state.matcher = RWF.buildMatcher(RWF.parseTerms(state.settings.terms));
      state.posMatcher = RWF.buildMatcher(RWF.parseTerms(state.settings.pleasantTerms));
      state.ready = true;
      resetResults();
      scan();
    }
    if (state.open) render();
    refreshIndicators();
  }

  function loadSettings() {
    try {
      ext.storage.sync.get(RWF.DEFAULT_SETTINGS, (stored) => applySettings(stored));
    } catch (e) {
      applySettings(RWF.DEFAULT_SETTINGS);
    }
  }

  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') loadSettings();
  });

  ext.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (isAppPage() && state.ready) {
      if (msg.type === 'rwf-open') { scan(); openModal(); }
      if (msg.type === 'rwf-load') { if (msg.on) startLoading(); else stopLoading('user'); }
      // The Save dialog needs a click on this page, so the popup opens the prompt here.
      if (msg.type === 'rwf-export') openPrompt('manual');
    }
    if (['rwf-open', 'rwf-stats', 'rwf-load', 'rwf-export'].includes(msg.type)) reply(stats());
  });

  loadSettings();
})();
