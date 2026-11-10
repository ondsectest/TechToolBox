/*
 * Review Red Flags: shared word list and matching helpers.
 * Loaded by both the content script and the popup.
 * Built by Santhosh Tuppad.
 */
(function (root) {
  'use strict';

  // One entry per line in the popup. A trailing * matches word endings
  // ("crash*" matches crash, crashes, crashing). Phrases are allowed.
  // "# ..." lines are category headings; they group the list and match nothing.
  // The list is generic, for testing any app: feelings, red flags, and
  // complaint phrases for the features most apps have (login, profile,
  // payments, notifications...). Feature names alone ("login") are left out
  // on purpose, so a review that just mentions a feature isn't flagged.
  const DEFAULT_TERMS = [
    '# Feeling: anger and strong dislike',
    'worst', 'worst app', 'terrible', 'horrible', 'awful', 'pathetic',
    'ridiculous', 'disgusting', 'unacceptable', 'hate', 'hated', 'angry',
    'stupid', 'nonsense', 'garbage', 'trash', 'rubbish', 'sucks', 'bad',
    'bad app', 'very bad', 'worse', 'poor', 'useless', 'incompetent',
    'not a good app', 'not good', 'joke', 'a joke', 'embarrassing',
    '',
    '# Feeling: frustration',
    'annoy*', 'frustrat*', 'disappoint*', 'irritat*', 'infuriat*', 'stress*',
    'hassle', 'headache', 'nightmare', 'waste', 'wasted', 'waste of time',
    'fed up', 'sick of', 'tired of',
    '',
    '# Red flag: leaving or warning others',
    'uninstall*', 'deleting this app', 'deleted the app', 'deleting the app',
    'switch* to another', 'never again', "don't download", 'do not download',
    'avoid this app', 'stay away', 'not recommended', "don't recommend",
    'do not recommend', 'would not recommend', "wouldn't recommend",
    'zero stars', '0 stars', 'one star', '1 star', 'negative stars',
    '',
    '# Red flag: trust and honesty',
    'scam*', 'fraud*', 'fake', 'steal*', 'stole', 'stolen', 'rip off',
    'ripoff', 'sketchy', 'unreliable', 'misleading', 'false advertising',
    'lied', 'liars', 'cheat*', 'shady',
    '',
    '# Stability: crashes and freezes',
    'crash*', 'freez*', 'froze', 'frozen', 'hangs', 'keeps hanging',
    'keeps closing', 'closes itself', 'force clos*', 'shuts down',
    'not responding', 'stuck', 'black screen', 'white screen', 'blank screen',
    '',
    '# Stability: bugs and errors',
    'bug*', 'buggy', 'glitch*', 'error*', 'broken', 'broke', 'malfunction*',
    'not working', "doesn't work", 'does not work', 'stopped working',
    "isn't working", 'something went wrong', 'try again later',
    'unknown error', 'error code', 'never fixed', 'not fixed', 'still not fixed',
    '',
    '# Performance and battery',
    'slow', 'too slow', 'so slow', 'very slow', 'lag*', 'takes forever',
    'loading forever', 'keeps loading', 'infinite loading', 'stuck on loading',
    'battery drain*', 'drains battery', 'drains my battery', 'overheat*',
    'heats up', 'takes too much storage', 'uses too much data',
    '',
    '# Updates and regressions',
    'after update', 'after the update', 'after updating', 'since the update',
    'latest update', 'recent update', 'bring back', 'old version was better',
    'previous version', 'worse after', 'forced update',
    '',
    '# Install, open and compatibility',
    "won't open", "doesn't open", 'not opening', 'will not open',
    "won't install", "can't install", 'cannot install', 'not compatible',
    'incompatible', 'not supported', 'device not supported',
    '',
    '# Connection, servers and sync',
    'connection error', 'network error', 'server error', 'no connection',
    'connection lost', 'disconnect*', 'timed out', 'timeout',
    'server is down', 'servers are down', 'app is down', 'under maintenance',
    'not syncing', "doesn't sync", 'sync fail*', 'sync issue*',
    'not loading', "won't load", "doesn't load", 'fails to load', 'failed to load',
    '',
    '# Feature: login, sign-up and verification',
    "can't log in", "can't login", 'cannot log in', 'cannot login',
    'unable to log in', 'unable to login', 'login fail*', 'login error',
    'login issue*', 'log in issue*', 'logged out', 'keeps logging me out',
    'locked out', 'account locked', 'account blocked', 'account suspended',
    'account banned', 'banned', "can't sign up", 'cannot sign up',
    'unable to sign up', 'unable to register', 'registration fail*',
    "can't reset password", 'password reset not working', 'otp not received',
    "didn't receive otp", 'did not receive otp', 'no otp', 'otp not working',
    'code not received', "didn't receive the code", 'verification fail*',
    "can't verify", 'cannot verify', 'unable to verify',
    '',
    '# Feature: profile, account and settings',
    "can't update profile", 'cannot update profile', 'unable to update profile',
    'profile not updating', "can't change", 'cannot change', 'unable to change',
    "can't edit", 'cannot edit', 'unable to edit', 'not saving',
    "doesn't save", 'settings not saving', "can't delete my account",
    'cannot delete my account', 'unable to delete account',
    '',
    '# Feature: data, history and backups',
    'lost my data', 'lost all my', 'data lost', 'data is gone', 'everything is gone',
    'history is gone', 'disappeared', 'deleted my', 'backup fail*',
    "can't restore", 'cannot restore',
    '',
    '# Feature: payments, billing and subscriptions',
    'payment fail*', 'failed payment', 'transaction fail*', 'failed transaction',
    'charged twice', 'double charged', 'charged me', 'overcharg*',
    'hidden fee*', 'hidden charge*', 'refund*', 'no refund', 'money back',
    'deducted', 'not credited', 'lost my money', 'where is my money',
    "can't cancel", 'cannot cancel', 'unable to cancel', 'hard to cancel',
    'auto renew*', 'auto-renew*', 'unauthorized', 'unauthorised',
    'too expensive', 'overpriced', 'paywall*', 'pay to win', 'pay-to-win',
    'locked behind',
    '',
    '# Feature: orders, bookings and delivery',
    'order cancelled', 'order canceled', 'never arrived', 'never delivered',
    'wrong order', 'wrong item', 'missing item*', 'late delivery',
    'order not received', 'booking fail*', 'booking cancelled',
    '',
    '# Feature: notifications and messages',
    'notifications not working', 'no notifications', 'not receiving notifications',
    'not getting notifications', 'too many notifications', 'spam notifications',
    'messages not sending', "can't send", 'cannot send', 'unable to send',
    '',
    '# Feature: search, upload, camera and media',
    'search not working', 'search is useless', 'search is broken',
    "can't find anything", 'no results', 'upload fail*', "can't upload",
    'cannot upload', 'unable to upload', "can't download", 'download fail*',
    'camera not working', "camera doesn't work", 'no sound', 'video not playing',
    "won't play",
    '',
    '# Ads and spam',
    'too many ads', 'so many ads', 'full of ads', 'ads every', 'annoying ads',
    'intrusive ads', 'pop-up ads', 'pop up ads', 'popup ads', 'unskippable',
    'spam*',
    '',
    '# Usability, design and accessibility',
    'confusing', 'complicated', 'hard to use', 'difficult to use', 'not easy',
    'not user friendly', 'not user-friendly', 'not intuitive', 'unintuitive',
    'cluttered', 'clunky', 'hard to find', "can't find", 'too many steps',
    'hard to read', 'text too small', 'font too small', 'no dark mode',
    '',
    '# Security and privacy',
    'hacked', 'hacker*', 'data breach', 'leaked', 'privacy concern*',
    'privacy issue*', 'invasion of privacy', 'invades privacy',
    'sells my data', 'selling my data', 'sell my data', 'shares my data',
    'too many permissions', 'unnecessary permissions', 'spyware', 'malware',
    'virus', 'phishing', 'suspicious', 'not secure', 'insecure', 'unsafe',
    '',
    '# Customer support',
    'no response', 'no reply', 'no answer', 'no support', 'no help',
    'not helpful', 'unhelpful', 'bad customer service', 'poor customer service',
    'terrible customer service', 'bad support', 'poor support', 'terrible support',
    'support is useless', 'ignored', 'still waiting', 'waiting for days',
    'never resolved', 'not resolved', 'unresolved', "can't contact",
    'cannot contact', 'no way to contact', 'automated reply', 'bot reply'
  ];

  // Pleasant words, used to sort reviews into pleasant / mixed / neutral /
  // unpleasant for the HTML report.
  const DEFAULT_PLEASANT_TERMS = [
    '# Praise',
    'love*', 'great', 'excellent', 'amazing', 'awesome', 'wonderful', 'fantastic',
    'superb', 'perfect*', 'best', 'the best', 'good', 'good app', 'very good', 'nice',
    'satisfied', 'happy', 'recommend*', 'thank*', '5 stars', 'five stars',
    '',
    '# Works well',
    'helpful', 'convenient', 'convenience', 'easy', 'easier', 'fast', 'quick*',
    'smooth*', 'reliable', 'efficient', 'secure', 'safe', 'user friendly',
    'user-friendly', 'works well', 'works great', 'works perfectly', 'works fine',
    'works as expected', 'stable', 'responsive', 'lightweight', 'no problem*',
    'life saver', 'lifesaver',
    '',
    '# No problems (these win over the shorter unpleasant word inside them)',
    'no issues', 'no complaints', 'no crash*', 'never crash*', 'no bugs',
    'bug free', 'bug-free', 'no lag', 'no ads', 'never freezes',
    '',
    '# Easy to use and well designed',
    'intuitive', 'simple', 'straightforward', 'easy to use', 'easy to navigate',
    'clean', 'well designed', 'well-designed', 'beautiful', 'clear',
    '',
    '# Support and fixes',
    'great support', 'helpful support', 'great customer service', 'quick response',
    'responded quickly', 'resolved', 'fixed',
    '',
    '# Value and trust',
    'worth it', 'worth the money', 'value for money', 'affordable',
    'trustworthy', 'legit', 'trusted'
  ];

  const DEFAULT_SETTINGS = {
    pleasantTerms: DEFAULT_PLEASANT_TERMS.join('\n'),
    askExport: true,   // offer the HTML report when "Load all reviews" finishes
    terms: DEFAULT_TERMS.join('\n'),
    autoOpen: true,
    highlightOnPage: true,
    loadLimit: 1000,   // "Load all reviews" stops after this many per run
    noLimit: false,    // ...unless this is on
    throttleMs: 500    // pause between review requests, to avoid rate limits
  };
  // Kept under Chrome's 30-second idle limit for extension service workers,
  // which do the timing for this pause.
  const MAX_THROTTLE_MS = 20000;

  const WORD_CHAR = '[\\p{L}\\p{N}_]';

  /** Turn the newline-separated list into unique, lower-cased terms. */
  function parseTerms(text) {
    const seen = new Set();
    const out = [];
    String(text || '').split(/\r?\n/).forEach((line) => {
      const term = line.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!term || term.startsWith('#') || /^\*+$/.test(term) || seen.has(term)) return;
      seen.add(term);
      out.push(term);
    });
    return out;
  }

  function termToPattern(term) {
    return term
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex syntax
      .replace(/['’]/g, "['’]")                // straight or curly apostrophe
      .replace(/ /g, '\\s+')                   // any run of whitespace
      .replace(/\\\*/g, "[\\p{L}\\p{N}_'’]*"); // * = any word ending
  }

  /**
   * Build one case-insensitive regex with a capture group per term, so a
   * match can be traced back to the term that caused it. Longer terms go
   * first so "worst app" wins over "worst".
   */
  function buildMatcher(terms) {
    if (!terms || !terms.length) return null;
    const ordered = [...terms].sort((a, b) => b.length - a.length);
    const groups = ordered.map((t) => '(' + termToPattern(t) + ')').join('|');
    const source = '(?<!' + WORD_CHAR + ')(?:' + groups + ')(?!' + WORD_CHAR + ')';
    return { regex: new RegExp(source, 'giu'), terms: ordered };
  }

  /** Return [{start, end, text, term}] for every match in text. */
  function findMatches(text, matcher) {
    if (!matcher || !text) return [];
    const re = matcher.regex;
    const hits = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; }
      let term = m[0].toLowerCase();
      for (let i = 1; i < m.length; i++) {
        if (m[i] !== undefined) { term = matcher.terms[i - 1]; break; }
      }
      hits.push({ start: m.index, end: m.index + m[0].length, text: m[0], term });
    }
    return hits;
  }

  /**
   * Settle unpleasant (neg) and pleasant (pos) hits that overlap: the longer
   * phrase wins. "not good" stays unpleasant and drops the pleasant "good";
   * "no crashes" stays pleasant and drops the unpleasant "crashes".
   */
  function resolveOverlaps(neg, pos) {
    const covers = (a, b) => a.start <= b.start && b.end <= a.end && a.end - a.start > b.end - b.start;
    const hits = neg.filter((n) => !pos.some((p) => covers(p, n)));
    return { hits, pos: pos.filter((p) => !hits.some((n) => p.start < n.end && n.start < p.end)) };
  }

  /** How a term is shown to people: "crash*" reads as "crash…". */
  function displayTerm(term) {
    return term.replace(/\*+$/, '…');
  }

  root.ReviewRedFlags = Object.assign(root.ReviewRedFlags || {}, {
    DEFAULT_TERMS,
    DEFAULT_PLEASANT_TERMS,
    DEFAULT_SETTINGS,
    MAX_THROTTLE_MS,
    parseTerms,
    buildMatcher,
    findMatches,
    resolveOverlaps,
    displayTerm
  });
})(globalThis);
