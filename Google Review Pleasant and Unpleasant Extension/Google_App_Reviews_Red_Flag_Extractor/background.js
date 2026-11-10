/*
 * Review Red Flags: background service worker.
 *
 * 1. Shows each tab's progress on the toolbar icon: a number on the icon and a
 *    hover tooltip, so you can follow "Load all reviews" from any tab.
 * 2. Keeps time for the pause between review requests. Chrome slows timers in
 *    background tabs, but not here, so the delay you set stays accurate.
 *
 * Built by Santhosh Tuppad.
 */
'use strict';

const BLUE = '#1a73e8';
const RED = '#c62828';
const GREY = '#5f6670';

function short(n) {
  if (n < 1000) return String(n);
  if (n < 10000) return (Math.floor(n / 100) / 10) + 'k';
  if (n < 1000000) return Math.floor(n / 1000) + 'k';
  return Math.floor(n / 100000) / 10 + 'm';
}

const num = (n) => Number(n).toLocaleString();

function showStatus(tabId, s) {
  const L = s.loader || {};
  let text = '';
  let color = RED;
  let title = 'Review Red Flags';

  if (!s.appPage) {
    title += '\nOpen a Google Play app page to scan its reviews.';
  } else if (L.running) {
    text = short(L.loaded);
    color = BLUE;
    title += '\nLoading reviews… ' + num(L.loaded) + (L.target ? ' of ' + num(L.target) : '') + ' loaded' +
      '\n' + num(s.flagged) + ' flagged of ' + num(s.scanned) + ' scanned so far' +
      '\nPause between requests: ' + num(s.throttleMs) + ' ms';
  } else {
    text = s.flagged ? short(s.flagged) : '';
    color = s.flagged ? RED : GREY;
    title += '\n' + num(s.flagged) + ' flagged of ' + num(s.scanned) + ' reviews scanned';
    if (L.error) {
      text = '!';
      color = RED;
      title += '\nLoading stopped: ' + L.error;
    } else if (L.ended) {
      title += '\nAll reviews loaded.';
    } else if (L.finished) {
      title += '\nLoaded ' + num(L.total) + '. Click for options or to load more.';
    }
  }

  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
  chrome.action.setTitle({ tabId, title });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.type === 'rwf-status' && sender.tab) {
    showStatus(sender.tab.id, msg.status || {});
    reply({ ok: true });
    return;
  }
  if (msg.type === 'rwf-sleep') {
    const ms = Math.max(0, Math.min(20000, Number(msg.ms) || 0));
    setTimeout(() => reply({ ok: true }), ms);
    return true; // reply asynchronously
  }
});
