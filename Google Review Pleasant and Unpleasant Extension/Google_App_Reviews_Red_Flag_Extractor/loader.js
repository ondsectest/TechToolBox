/*
 * Review Red Flags: fetches review batches straight from Google Play.
 *
 * The "See all reviews" dialog only loads its next batch while the page is
 * drawn on screen, which Chrome pauses in background tabs. So instead of
 * scrolling the dialog, "Load all reviews" asks Play for the same batches
 * the dialog would load (the page's own UsvDTd request, sorted by "Most
 * relevant"). Network requests keep running when the tab is in the background.
 *
 * Two ways to send it:
 *  - "anonymous" (default): no Google cookies. Reviews are public, and this
 *    leaves your account out of it entirely.
 *  - "session": exactly like the Play page does it, with your cookies plus the
 *    page's anti-forgery token (SNlM0e). When you're signed in, Google answers
 *    HTTP 400 to any request that carries your cookies but not this token.
 *
 * Built by Santhosh Tuppad.
 */
(function (root) {
  'use strict';

  const RPC = 'UsvDTd';
  const SORT_MOST_RELEVANT = 1;
  const MAX_BATCH = 200;

  /**
   * Values the Play page embeds in its WIZ_global_data script: the
   * anti-forgery token (only present when signed in), session id and build.
   * Read from the script's text, since a content script can't see page variables.
   */
  function readPageTokens() {
    const out = { at: null, fsid: null, bl: null };
    for (const s of document.querySelectorAll('script')) {
      const text = s.textContent;
      if (!text || text.indexOf('WIZ_global_data') === -1) continue;
      const grab = (key) => {
        const m = text.match(new RegExp('"' + key + '":"((?:\\\\.|[^"\\\\])*)"'));
        return m ? JSON.parse('"' + m[1] + '"') : null;
      };
      out.at = grab('SNlM0e');
      out.fsid = grab('FdrFJe');
      out.bl = grab('cfb2h');
      break;
    }
    return out;
  }

  function requestUrl(params, session) {
    const q = new URLSearchParams({ rpcids: RPC, 'source-path': '/store/apps/details' });
    if (session && session.fsid) q.set('f.sid', session.fsid);
    if (session && session.bl) q.set('bl', session.bl);
    if (params.hl) q.set('hl', params.hl);
    if (params.gl) q.set('gl', params.gl);
    if (session) q.set('_reqid', String(Math.floor(Math.random() * 900000) + 100000));
    return '/_/PlayStoreUi/data/batchexecute?' + q.toString();
  }

  function requestBody(appId, count, token, session) {
    const inner = JSON.stringify([null, null, [2, SORT_MOST_RELEVANT, [count, null, token || null], null, []], [appId, 7]]);
    let body = 'f.req=' + encodeURIComponent(JSON.stringify([[[RPC, inner, null, 'generic']]]));
    if (session && session.at) body += '&at=' + encodeURIComponent(session.at);
    return body + '&';
  }

  /** Pull the UsvDTd payload out of a batchexecute response. */
  function parseResponse(raw) {
    const text = String(raw).replace(/^\)\]\}'\s*/, '');
    const candidates = [];
    try { candidates.push(JSON.parse(text)); } catch (e) {
      // Chunked form: length lines interleaved with JSON lines.
      text.split('\n').forEach((line) => {
        if (line.startsWith('[')) { try { candidates.push(JSON.parse(line)); } catch (e2) { /* skip */ } }
      });
    }
    for (const envelope of candidates) {
      for (const entry of envelope || []) {
        if (Array.isArray(entry) && entry[0] === 'wrb.fr' && entry[1] === RPC) {
          if (typeof entry[2] !== 'string') return { reviews: [], token: null };
          const data = JSON.parse(entry[2]);
          return {
            reviews: ((data && data[0]) || []).map(toReview).filter(Boolean),
            token: (data && data[1] && data[1][1]) || null
          };
        }
      }
    }
    throw new Error('Unexpected response from Google Play');
  }

  function toReview(r) {
    if (!Array.isArray(r) || typeof r[0] !== 'string') return null;
    const seconds = r[5] && r[5][0];
    return {
      id: r[0],
      author: (r[1] && r[1][0]) || 'Google user',
      rating: typeof r[2] === 'number' ? r[2] : null,
      text: typeof r[4] === 'string' ? r[4] : '',
      date: seconds ? formatDate(seconds * 1000) : '',
      ts: seconds ? seconds * 1000 : null,
      thumbs: typeof r[6] === 'number' ? r[6] : 0,
      replied: !!(r[7] && r[7][1]),
      version: typeof r[10] === 'string' ? r[10] : null
    };
  }

  function formatDate(ms) {
    try {
      return new Date(ms).toLocaleDateString(document.documentElement.lang || undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return new Date(ms).toDateString();
    }
  }

  /**
   * Fetch one batch. Resolves to {reviews, token}; token is null at the end.
   * opts.mode is "anonymous" (default) or "session".
   * Throws an Error with .status set for HTTP failures.
   */
  async function fetchReviewBatch(appId, count, token, opts) {
    const o = opts || {};
    const session = o.mode === 'session' ? readPageTokens() : null;
    const res = await fetch(requestUrl(o, session), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: requestBody(appId, Math.max(1, Math.min(MAX_BATCH, count)), token, session),
      credentials: session ? 'same-origin' : 'omit',
      signal: o.signal
    });
    if (!res.ok) {
      const err = new Error('Google Play answered with HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return parseResponse(await res.text());
  }

  root.ReviewRedFlags = Object.assign(root.ReviewRedFlags || {}, {
    MAX_BATCH,
    fetchReviewBatch,
    readPageTokens,
    parseReviewResponse: parseResponse
  });
})(globalThis);
