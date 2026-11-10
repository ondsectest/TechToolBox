/* Review Red Flags popup. Built by Santhosh Tuppad. */
(() => {
  'use strict';
  const RWF = globalThis.ReviewRedFlags;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString();

  function setStatus(text, isError) {
    $('status').textContent = text;
    $('status').classList.toggle('error', !!isError);
  }

  function updateCount() {
    const n = RWF.parseTerms($('terms').value).length;
    $('termCount').textContent = n + ' word' + (n === 1 ? '' : 's') + ' and phrases in the list';
    const p = RWF.parseTerms($('pleasantTerms').value).length;
    $('pleasantCount').textContent = p + ' pleasant word' + (p === 1 ? '' : 's') + ' and phrases';
  }

  function fill(settings) {
    $('terms').value = settings.terms;
    $('pleasantTerms').value = settings.pleasantTerms;
    $('askExport').checked = !!settings.askExport;
    $('autoOpen').checked = !!settings.autoOpen;
    $('highlight').checked = !!settings.highlightOnPage;
    $('loadLimit').value = settings.loadLimit;
    $('noLimit').checked = !!settings.noLimit;
    $('loadLimit').disabled = !!settings.noLimit;
    $('throttleMs').value = settings.throttleMs;
    updateCount();
  }

  function activeTab(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => cb(tabs && tabs[0]));
  }

  function ask(msg, cb) {
    activeTab((tab) => {
      if (!tab) return cb(null);
      chrome.tabs.sendMessage(tab.id, msg, (res) => {
        void chrome.runtime.lastError; // no content script in this tab
        cb(res || null);
      });
    });
  }

  // ---------------- Tab status and load progress ----------------

  function showTabStatus(res) {
    const onApp = !!(res && res.appPage);
    $('showBtn').disabled = !onApp;
    $('exportBtn').disabled = !onApp || (res.loader && res.loader.running);
    $('exportBtn').title = onApp && res.loader && res.loader.running ? 'Available when loading finishes (or stop it first).' : '';
    $('loadSwitch').disabled = !onApp || (res.loader.ended && !res.loader.running);

    if (!res) {
      $('tabStatus').textContent = 'Open a Google Play app page to scan its reviews. If the page was already open when you installed or updated the extension, reload it.';
    } else if (!onApp) {
      $('tabStatus').textContent = 'This Play Store page is not an app page. Open an app to scan its reviews.';
    } else {
      $('tabStatus').textContent = fmt(res.flagged) + ' of ' + fmt(res.scanned) + ' reviews on this page contain flagged words.';
    }
    showProgress(onApp ? res : null);
  }

  function showProgress(res) {
    const L = res && res.loader;
    $('loadSwitch').setAttribute('aria-checked', String(!!(L && L.running)));
    const box = $('progress');
    const status = $('loadStatus');
    if (!L || (!L.running && !L.finished && !L.error && !L.ended)) { box.hidden = true; return; }
    box.hidden = false;
    box.classList.toggle('indeterminate', L.running && !L.target);
    $('progressFill').style.width = L.running && L.target ? Math.min(100, (L.loaded / L.target) * 100) + '%'
      : L.running ? '' : '100%';
    status.classList.toggle('error', !!L.error && !L.running);
    if (L.running) {
      status.textContent = 'Loading… ' + fmt(L.loaded) + (L.target ? ' of ' + fmt(L.target) : '') + ' loaded, ' +
        fmt(res.flagged) + ' flagged so far. You can switch tabs.';
    } else if (L.error) {
      status.textContent = 'Stopped: ' + L.error + '.';
    } else if (L.ended) {
      status.textContent = 'All ' + fmt(L.total) + ' reviews loaded. ' + fmt(res.flagged) + ' flagged.';
    } else {
      status.textContent = 'Loaded ' + fmt(L.total) + ' reviews. ' + fmt(res.flagged) + ' flagged. Switch on again to load ' +
        (res.limit ? 'the next ' + fmt(res.limit) : 'the rest') + '.';
    }
  }

  // Keep the popup's progress live while it's open.
  function poll() { ask({ type: 'rwf-stats' }, showTabStatus); }
  poll();
  setInterval(poll, 1000);

  $('loadSwitch').addEventListener('click', () => {
    const on = $('loadSwitch').getAttribute('aria-checked') !== 'true';
    $('loadSwitch').setAttribute('aria-checked', String(on));
    saveLoadOptions(() => ask({ type: 'rwf-load', on }, showTabStatus));
  });

  // ---------------- Load options (saved as you change them) ----------------

  function saveLoadOptions(done) {
    const limit = parseInt($('loadLimit').value, 10);
    const ms = parseInt($('throttleMs').value, 10);
    const values = {
      noLimit: $('noLimit').checked,
      loadLimit: Number.isFinite(limit) && limit > 0 ? limit : RWF.DEFAULT_SETTINGS.loadLimit,
      throttleMs: Number.isFinite(ms) ? Math.max(0, Math.min(RWF.MAX_THROTTLE_MS, ms)) : RWF.DEFAULT_SETTINGS.throttleMs
    };
    $('loadLimit').value = values.loadLimit;
    $('throttleMs').value = values.throttleMs;
    $('loadLimit').disabled = values.noLimit;
    chrome.storage.sync.set(values, () => {
      if (chrome.runtime.lastError) setStatus('Could not save: ' + chrome.runtime.lastError.message, true);
      if (done) done();
    });
  }
  ['loadLimit', 'throttleMs', 'noLimit'].forEach((id) => $(id).addEventListener('change', () => saveLoadOptions()));

  // The two checkboxes save as soon as they change, like the load options.
  $('autoOpen').addEventListener('change', () => chrome.storage.sync.set({ autoOpen: $('autoOpen').checked }));
  $('askExport').addEventListener('change', () => chrome.storage.sync.set({ askExport: $('askExport').checked }));

  // Chrome only shows a Save dialog after a click on the page itself, so this
  // opens the export prompt on the Play page and closes the popup.
  $('exportBtn').addEventListener('click', () => {
    ask({ type: 'rwf-export' }, (res) => {
      showTabStatus(res);
      if (res && res.appPage) window.close();
    });
  });
  $('highlight').addEventListener('change', () => chrome.storage.sync.set({ highlightOnPage: $('highlight').checked }));

  // ---------------- Word list ----------------

  chrome.storage.sync.get(RWF.DEFAULT_SETTINGS, fill);

  $('terms').addEventListener('input', () => { updateCount(); setStatus(''); });
  $('pleasantTerms').addEventListener('input', () => { updateCount(); setStatus(''); });

  $('showBtn').addEventListener('click', () => {
    ask({ type: 'rwf-open' }, (res) => {
      showTabStatus(res);
      if (res && res.appPage) window.close();
    });
  });

  $('saveBtn').addEventListener('click', () => {
    const terms = $('terms').value;
    if (!RWF.parseTerms(terms).length) {
      setStatus('Add at least one word or phrase.', true);
      return;
    }
    chrome.storage.sync.set({ terms, pleasantTerms: $('pleasantTerms').value }, () => {
      if (chrome.runtime.lastError) {
        setStatus('Could not save: ' + chrome.runtime.lastError.message, true);
      } else {
        setStatus('Saved. Open Play Store tabs rescan straight away (reviews loaded automatically need loading again).');
      }
    });
  });

  $('resetBtn').addEventListener('click', () => {
    $('terms').value = RWF.DEFAULT_SETTINGS.terms;
    $('pleasantTerms').value = RWF.DEFAULT_SETTINGS.pleasantTerms;
    updateCount();
    setStatus('Default words restored. Press Save words to keep them.');
  });
})();
