// RESpawn: Reddit Enhancement Suite features for New Reddit.
// Runs on www.reddit.com pages. Reads only what is already on the page; votes and other
// actions press Reddit's own buttons. Settings live in the browser (chrome.storage or localStorage).
(() => {
  if (window.__respawnLoaded) return;
  // Reddit's raw data and error-text addresses (.json and the like) are not pages: nothing to add there
  if (document.contentType && document.contentType !== 'text/html') return;
  window.__respawnLoaded = true;

  const html = document.documentElement;
  const DEFAULTS = { enabled: true, shortcuts: [], showShortcuts: true, leftNav: 'slide', navHover: false, font: 'reddit', fullWidth: true, hideRecent: true, hideAds: true, hideBadges: true, hideSuggested: true, filterline: true, filters: {}, filterScore: 0, scMode: 'mine', mySubsSort: 'visits', subStyles: true, subStyleOverrides: {}, pinHeader: false, keys: true, linkFriends: true, linkMod: true, feeds: {}, hoverCards: true, highlight: true, tags: {}, blockWords: [], blockSubs: [], blockSites: [], autoReplies: true, pauseEvery: 0, maxVideos: 2, hideChat: false, topButton: true, hideKids: false, hideMyName: false, linkDashboard: true, classicHome: true, classicSubs: true, simulateLastVisitHoursAgo: 0 };
  let cfg = { ...DEFAULTS, ...(window.__RS_CFG || {}) };
  // Fonts every computer already has (nothing is downloaded). Reddit's own is your computer's font (Segoe UI on
  // Windows, San Francisco on a Mac); Old Reddit is the Verdana stack old Reddit used.
  const FONTS = [['reddit', 'Reddit'], ['old', 'Old Reddit'], ['arial', 'Arial'], ['tahoma', 'Tahoma'], ['georgia', 'Georgia']];

  // ---------- small helpers ----------
  // Our own fixed icon drawings (never text from a page), read once and copied in without innerHTML
  const svgCache = new Map();
  const svgOf = (src) => {
    if (!svgCache.has(src)) svgCache.set(src, new DOMParser().parseFromString(src.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), 'image/svg+xml').documentElement);
    return document.importNode(svgCache.get(src), true);
  };
  const el = (tag, attrs = {}, kids = []) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.replaceChildren(svgOf(v)); // only our own fixed icon drawings
      else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(kids)) if (c) e.append(c);
    return e;
  };
  const ago = (iso) => {
    const s = Math.max(1, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `${Math.round(s / 3600)} hr`;
    return `${Math.round(s / 86400)} d`;
  };
  // Writing the same words again still counts as a page change to the watcher below, which would start another pass,
  // which writes them again: so words that are redrawn on every pass are only written when they change.
  const setText = (e, t) => { if (e && e.textContent !== t) e.textContent = t; };
  const num = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
  const subOf = () => (location.pathname.match(/^\/r\/([^/]+)/) || [])[1];
  const isCommentsPage = () => !!document.querySelector('shreddit-post[view-context="CommentsPage"]');

  const ICON = {
    video: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4.5v11l9-5.5z" fill="currentColor"/></svg>',
    text: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M4 9h12M4 13h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
    image: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M5 14l3.5-4 2.5 3 2-2 2 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/></svg>',
    gallery: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="3" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 6v9a2 2 0 0 0 2 2h9" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
    close: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    up: '<svg viewBox="0 0 20 20" aria-hidden="true"><path class="rs-fill" d="M10 3.2 3.6 10.1h3.9V16.8h5V10.1h3.9z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 20 20" aria-hidden="true"><path class="rs-fill" d="M10 16.8 3.6 9.9h3.9V3.2h5v6.7h3.9z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  };

  // ---------- settings ----------
  const store = typeof chrome !== 'undefined' && chrome.storage?.local;
  const loadCfg = () => new Promise((res) => {
    if (!store) return res();
    store.get(['respawn'], (r) => { cfg = { ...cfg, ...(r?.respawn || {}) }; res(); });
  });
  let away = false; // this page is in old Reddit's design: RESpawn stays out of it (see "run" at the end)
  const saveCfg = (patch) => { if (away) return; cfg = { ...cfg, ...patch }; if (store) store.set({ respawn: cfg }); else localStorage.setItem('respawn-cfg', JSON.stringify(cfg)); };
  if (!store) { try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem('respawn-cfg') || '{}'), ...(window.__RS_CFG || {}) }; } catch { /* ignore */ } }

  // ---------- page arranged before it shows ----------
  // RESpawn starts as the page starts, so the sidebar, ads and the rest never appear and then vanish. The add-on's own
  // storage answers a moment too late for that, so a copy of just these on/off switches is kept in the site's storage.
  const BOOT_KEY = 'rs-boot';
  const BOOT_FIELDS = ['enabled', 'hideAds', 'hideBadges', 'hideRecent', 'hideSuggested', 'showShortcuts', 'leftNav', 'navHover', 'font', 'fullWidth', 'filterline', 'pinHeader', 'highlight', 'hideChat', 'classicHome', 'classicSubs'];
  // Old Reddit's lists (see "old Reddit's lists" below) live on / : r/all at /#all..., Home at / unless that is switched off;
  // and on a subreddit's own list addresses (/r/kings/, /r/kings/new/, /r/kings/top/?t=week) unless that is switched off.
  // Special lists that only look like subreddits, and Reddit's flair filter (?f=), keep Reddit's own page.
  const subListOf = (path = location.pathname, search = location.search) => {
    const m = path.match(/^\/r\/([A-Za-z0-9_]{2,21})(?:\/(hot|new|rising|controversial|top))?\/?$/);
    return m && !/^(all|popular|mod|friends|random|randnsfw|myrandom)$/i.test(m[1]) && !new URLSearchParams(search).has('f') ? { sub: m[1], sort: m[2] || 'hot' } : null;
  };
  // Combined subreddits, old Reddit's r/a+b+c addresses. New Reddit has no page for them: www.reddit.com answers every
  // one with old Reddit's own page design (checked 11/9, even r/pics+aww). So RESpawn shows them as one of its own lists
  // on Home's page, at /#r/a+b+c (/#r/a+b+c/new, /#r/a+b+c/top/week), and sends the old address there as the page
  // starts. Each name must be a real subreddit name (no special lists like all or popular), at most 150 of them.
  const MULTI_MAX = 150;
  const MULTI_TIMES = ['hour', 'day', 'week', 'month', 'year', 'all'];
  const multiNames = (s) => {
    const n = String(s || '').split('+');
    return n.length >= 2 && n.length <= MULTI_MAX && n.every((x) => /^[A-Za-z0-9_]{2,21}$/.test(x) && !/^(all|popular|mod|friends|random|randnsfw|myrandom)$/i.test(x)) ? n : null;
  };
  const multiTime = (sort, t) => (sort === 'top' || sort === 'controversial' ? (MULTI_TIMES.includes(t) ? t : 'day') : '');
  // the old address (/r/a+b/top/?t=week) and RESpawn's own (#r/a+b/top/week)
  const multiOf = (path = location.pathname, search = location.search) => {
    const m = path.match(/^\/r\/([A-Za-z0-9_+]+)(?:\/(hot|new|rising|controversial|top))?\/?$/);
    return m && multiNames(m[1]) ? { subs: m[1], sort: m[2] || 'hot', t: multiTime(m[2], new URLSearchParams(search).get('t')) } : null;
  };
  const multiHashOf = (hash = location.hash) => {
    const p = hash.replace(/^#/, '').split('/');
    if (p[0] !== 'r' || !multiNames(p[1]) || p.length > 4) return null;
    const sort = ['hot', 'new', 'rising', 'controversial', 'top'].includes(p[2]) ? p[2] : 'hot';
    return { subs: p[1], sort, t: multiTime(sort, p[3]) };
  };
  const multiHash = (m) => `#r/${m.subs}${m.sort === 'hot' ? '' : `/${m.sort}`}${m.t ? `/${m.t}` : ''}`;
  const multiOldHref = (m) => `/r/${m.subs}/${m.sort === 'hot' ? '' : `${m.sort}/`}${m.t ? `?t=${m.t}` : ''}`;
  const isClassicUrl = (c) => !!c.enabled && ((location.pathname === '/' && !new URLSearchParams(location.search).has('feed') && (/^#all(\/|$)/.test(location.hash) || !!multiHashOf() || !!c.classicHome)) || (!!c.classicSubs && !!subListOf()));
  const setPageClasses = (c) => {
    const on = {
      'rs-on': !!c.enabled, 'rs-hide-ads': !!c.hideAds, 'rs-hide-badges': !!c.hideBadges, 'rs-hide-recent': !!c.hideRecent,
      'rs-hide-suggested': !!c.hideSuggested, 'rs-no-shortcuts': !c.showShortcuts, 'rs-left-slide': c.leftNav === 'slide',
      'rs-left-hide': c.leftNav === 'hide', 'rs-left-hover': !!c.navHover, 'rs-fl-hidden': !c.filterline, 'rs-pin-header': !!c.pinHeader, 'rs-hl': !!c.highlight,
      'rs-no-chat': !!c.hideChat, 'rs-full': !!c.fullWidth,
    };
    for (const [f] of FONTS.slice(1)) on[`rs-font-${f}`] = c.font === f;
    for (const [k, v] of Object.entries(on)) html.classList.toggle(k, v);
  };
  const saveBoot = () => { try { localStorage.setItem(BOOT_KEY, JSON.stringify(Object.fromEntries(BOOT_FIELDS.map((k) => [k, cfg[k]])))); } catch { /* storage full or blocked */ } };
  let boot = cfg;
  try { boot = { ...cfg, ...(store ? JSON.parse(localStorage.getItem(BOOT_KEY) || '{}') : {}) }; } catch { /* keep the defaults */ }
  // A combined list's old address goes straight to RESpawn's own list, in place of this page in the tab's history (so
  // Back still goes where you came from). The old page is stopped first, so none of it shows on the way.
  const multiAway = (m) => { window.stop(); location.replace(`/${multiHash(m)}`); };
  { const m = boot.enabled && multiOf(); if (m) { multiAway(m); return; } }
  setPageClasses(boot);
  html.classList.toggle('rs-classic', isClassicUrl(boot)); // Reddit's own Home (or subreddit) feed never shows under it
  html.classList.add(/^\/(r\/[^/]+\/|user\/[^/]+\/)?comments\//.test(location.pathname) ? 'rs-comments' : 'rs-feed'); // checked again once the page is in

  // ---------- light or dark (Reddit's Display Mode) ----------
  // Reddit keeps Display Mode in a cookie named theme: none = Auto (follows the computer), 1 = Light, 2 = Dark. Setting it
  // the same way keeps Reddit's own menu in agreement, and every page opens in that mode from the start.
  const themeNow = () => ({ 1: 'light', 2: 'dark' })[(document.cookie.match(/(?:^|;\s*)theme=(\d)/) || [])[1]] || 'auto';
  const darkShown = () => { const t = themeNow(); return t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); };
  const setTheme = (t) => {
    document.cookie = t === 'auto' ? 'theme=; domain=.reddit.com; path=/; max-age=0; secure; samesite=lax'
      : `theme=${t === 'dark' ? 2 : 1}; domain=.reddit.com; path=/; max-age=31536000; secure; samesite=lax`;
    html.classList.toggle('theme-dark', t === 'dark'); html.classList.toggle('theme-light', t === 'light');
    paintTheme();
  };
  const MOON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.2 12.6A6.8 6.8 0 0 1 7.4 3.8a6.8 6.8 0 1 0 8.8 8.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const SUN = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 1.8v2.4M10 15.8v2.4M1.8 10h2.4M15.8 10h2.4M4.2 4.2l1.7 1.7M14.1 14.1l1.7 1.7M4.2 15.8l1.7-1.7M14.1 5.9l1.7-1.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  // One click flips what you see now; Auto is in the settings panel (and Reddit's own menu).
  const paintTheme = () => {
    const b = document.getElementById('rs-theme');
    if (b) {
      const dark = darkShown(), t = dark ? 'Switch to light mode' : 'Switch to dark mode';
      if (b.dataset.dark !== String(dark)) { b.dataset.dark = String(dark); b.replaceChildren(svgOf(dark ? SUN : MOON)); }
      b.title = t; b.setAttribute('aria-label', t);
    }
    document.querySelectorAll('#rs-panel .rs-seg[data-key="theme"] button').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.v === themeNow())));
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintTheme);

  // ---------- on/off switch (bottom-left, see-through) ----------
  const applyEnabled = () => {
    // switched off on a combined list: Reddit's own page for it (old Reddit's design) takes its place
    const mh = !cfg.enabled && location.pathname === '/' && multiHashOf();
    if (mh) { saveBoot(); location.replace(multiOldHref(mh)); return; }
    setPageClasses(cfg); saveBoot(); clMount();
    document.querySelector('#rs-sorts .rs-funnel')?.setAttribute('aria-pressed', String(!!cfg.filterline));
    applySubStyle();
    paintGear();
    if (!cfg.enabled) releaseHolds();
    topButton(); hideMyName(true);
    setTimeout(fitBars, 50); // a new font or width setting changes how much fits on the sort and filter lines
  };
  // On/off lives at the top of the gear's settings panel (the gear stays in Reddit's top bar while RESpawn is off).
  const paintGear = () => {
    const g = document.getElementById('rs-gear');
    if (!g) return;
    g.classList.toggle('rs-gear-off', !cfg.enabled);
    const t = cfg.enabled ? 'RESpawn settings' : 'RESpawn is off. Click to turn it back on.';
    g.title = t; g.setAttribute('aria-label', t);
  };

  // ---------- gear + settings panel ----------
  const GEAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 6.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zm7 4.1v-1.8l-2-.4a5.6 5.6 0 0 0-.6-1.4l1.2-1.7-1.3-1.3-1.7 1.2a5.6 5.6 0 0 0-1.4-.6l-.4-2H9.1l-.4 2a5.6 5.6 0 0 0-1.4.6L5.6 4.3 4.3 5.6l1.2 1.7a5.6 5.6 0 0 0-.6 1.4l-2 .4v1.8l2 .4c.1.5.3 1 .6 1.4l-1.2 1.7 1.3 1.3 1.7-1.2c.4.3.9.5 1.4.6l.4 2h1.8l.4-2c.5-.1 1-.3 1.4-.6l1.7 1.2 1.3-1.3-1.2-1.7c.3-.4.5-.9.6-1.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  // The gear sits in Reddit's top bar, left of your picture. On a phone-width window Reddit's bar has no room left, so
  // it moves to the start of the shortcut bar (and back when the window widens).
  const PHONE = 560;
  const addGear = () => {
    let gear = document.getElementById('rs-gear');
    if (!gear) {
      gear = el('button', { id: 'rs-gear', type: 'button', title: 'RESpawn settings', 'aria-label': 'RESpawn settings', html: GEAR });
      gear.onclick = (e) => { e.stopPropagation(); togglePanel(); };
      paintGear();
    }
    let theme = document.getElementById('rs-theme');
    if (!theme) {
      theme = el('button', { id: 'rs-theme', type: 'button' });
      theme.onclick = () => setTheme(darkShown() ? 'light' : 'dark');
    }
    const bar = innerWidth <= PHONE && cfg.showShortcuts ? document.getElementById('rs-shortcuts') : null;
    const user = document.querySelector('#expand-user-drawer-button');
    const actions = user?.closest('.ps-lg') || user?.closest('nav');
    let slot = null;
    if (!bar && actions) { slot = user; while (slot.parentElement && slot.parentElement !== actions) slot = slot.parentElement; }
    const want = bar ? 'bar' : actions ? 'header' : 'float';
    if (gear.dataset.at !== want || !gear.isConnected || theme.nextElementSibling !== gear) {
      gear.dataset.at = want;
      gear.classList.toggle('rs-gear-float', want === 'float'); theme.classList.toggle('rs-theme-float', want === 'float');
      if (want === 'bar') bar.prepend(theme, gear);
      else if (want === 'header') { actions.insertBefore(gear, slot); gear.before(theme); }
      else document.body.append(theme, gear);
      paintTheme();
    }
  };
  // ---------- settings window (RES's settings console, in the new look) ----------
  // RES groups its modules into categories with one search over all of them; this does the same for RESpawn's settings.
  // Each row says what it is in a few words; the longer "what does this do" sits behind a small (i) and is also what the
  // search reads, along with a few extra words people might type for it ("dark" finds Light or dark).
  // Row kinds: an on/off switch (the default), choices, a number, Edit/Show (opens another window), Save/Load (a file).
  // The functions an Edit row opens are named, not referenced, because they are defined further down this file.
  const PN_ICON = {
    look: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.8a7.2 7.2 0 0 0 0 14.4c1.2 0 1.8-.7 1.8-1.5 0-1-.9-1.3-.9-2.2 0-.8.7-1.4 1.5-1.4h1.7a3.2 3.2 0 0 0 3.1-3.2c0-3.4-3.2-6.1-7.2-6.1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="6.4" cy="9.6" r="1.1" fill="currentColor"/><circle cx="8.3" cy="6.4" r="1.1" fill="currentColor"/><circle cx="11.9" cy="6.2" r="1.1" fill="currentColor"/></svg>',
    feed: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3.5" width="14" height="5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="11.5" width="14" height="5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    bar: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.2h8a1 1 0 0 1 1 1v12.6l-5-3.3-5 3.3V4.2a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    comments: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.2 3.8h11.6a1.7 1.7 0 0 1 1.7 1.7v7.1a1.7 1.7 0 0 1-1.7 1.7H9.3l-3.8 3v-3H4.2a1.7 1.7 0 0 1-1.7-1.7V5.5a1.7 1.7 0 0 1 1.7-1.7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    people: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="6.8" r="3.3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.6 17c.6-3.3 3.1-5.2 6.4-5.2s5.8 1.9 6.4 5.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    keys: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.3" y="4.8" width="15.4" height="10.4" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.6 8.3h.1M8.6 8.3h.1M11.4 8.3h.1M14.4 8.3h.1M7 11.8h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    backup: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.8" y="3.5" width="14.4" height="4" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.3 7.5v7.8a1.2 1.2 0 0 0 1.2 1.2h9a1.2 1.2 0 0 0 1.2-1.2V7.5M8 11h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    search: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.8" cy="8.8" r="5.3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12.8 12.8l4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    info: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 9.2v4.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="10" cy="6.5" r="1" fill="currentColor"/></svg>',
    edit: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.8 3.9l3.3 3.3L7.4 15.9H4.1v-3.3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    save: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v8.8M6.4 8.8l3.6 3.6 3.6-3.6M4 14.4v1.4a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    load: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 12.3V3.5M6.4 7.1 10 3.5l3.6 3.6M4 14.4v1.4a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dash: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="5.8" height="5.8" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11.2" y="3" width="5.8" height="5.8" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="11.2" width="5.8" height="5.8" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11.2" y="11.2" width="5.8" height="5.8" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    out: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 4.5H5.2a1 1 0 0 0-1 1v9.3a1 1 0 0 0 1 1h9.3a1 1 0 0 0 1-1v-3.3M11.5 4.5h4v4M15.3 4.7 9.5 10.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const SETTINGS = [
    { id: 'look', name: 'Appearance', icon: PN_ICON.look, words: 'look style layout clutter', groups: [
      ['Colors and text', [
        { key: 'theme', label: 'Light or dark', choices: [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], info: true, tip: "Auto follows your computer. This is Reddit's own Display Mode, so Reddit's menu changes with it.", words: 'theme dark mode light mode night display' },
        { key: 'font', label: 'Font', kind: 'font', info: true, tip: "Old Reddit is Verdana, the font old Reddit used. Reddit is your computer's own font. Posts, comments and sidebars change as you pick.", words: 'typeface verdana arial tahoma georgia text size' },
        { key: 'subStyles', label: 'Subreddit styles', info: true, tip: "Each subreddit's own colors and banner. The switch on a subreddit's side card changes that one subreddit only.", words: 'community theme css custom' },
      ]],
      ['Layout', [
        { key: 'fullWidth', label: 'Use full width', info: true, tip: "Posts and comments use the whole window like old Reddit, with small even margins. When off, Reddit's wider margins come back.", words: 'wide margins gutters space stretch' },
        { key: 'leftNav', label: 'Left sidebar', choices: [['show', 'Show'], ['slide', 'Slide out'], ['hide', 'Hide']], info: true, tip: "Reddit's left menu. Slide out keeps it tucked away behind a tab on the left edge.", words: 'menu navigation communities' },
        { key: 'navHover', label: 'Open sidebar on hover', child: true, when: () => cfg.leftNav === 'slide', info: true, tip: 'When off, a slim tab on the left edge opens the sidebar with a click. When on, it slides out as soon as the mouse reaches the left edge.', words: 'auto open mouse point slide out left menu' },
        { key: 'pinHeader', label: 'Keep top bar on screen', info: true, tip: "When off, Reddit's top bar scrolls away with the page, like old Reddit's header.", words: 'header sticky pinned fixed' },
        { key: 'topButton', label: 'Back to top button', tip: 'A round button in the bottom right corner once you scroll down. It jumps back to the top.', words: 'scroll up jump' },
      ]],
      ['Clutter', [
        { key: 'hideAds', label: 'Hide ads', tip: 'Promoted posts in the feed and ads beside it.', words: 'promoted sponsored' },
        { key: 'hideRecent', label: 'Hide "Recent posts"', tip: 'The list of posts you opened lately, on the right side of the feed.', words: 'history recently viewed sidebar' },
        { key: 'hideSuggested', label: 'Hide suggestions and games', info: true, tip: "Reddit's suggested communities and its games, in the feed and the left menu.", words: 'recommended communities' },
        { key: 'hideBadges', label: 'Hide "Top 1%" badges', tip: 'The Top 1% poster and commenter badges beside names.', words: 'flair award' },
        { key: 'hideChat', label: 'Hide chat', tip: "Reddit's chat button in the top bar and its chat window.", words: 'messages' },
      ]],
    ] },
    { id: 'feed', name: 'Feed', icon: PN_ICON.feed, words: 'posts list', groups: [
      ["Old Reddit's lists", [
        { key: 'classicHome', label: "Old Reddit's list on Home", info: true, tip: "Home shows old Reddit's front page, in old Reddit's order. When off, Home is Reddit's own feed.", words: 'front page classic best hot order' },
        { key: 'classicSubs', label: "Old Reddit's list on subreddits", info: true, tip: "A subreddit's Hot, New, Top and other lists come from old Reddit, in old Reddit's order. Its header and sidebar stay.", words: 'classic hot new top rising controversial order' },
      ]],
      ['Filters', [
        { key: 'filterline', label: 'Filter bar', info: true, tip: 'Buttons above the feed that show only, or hide, NSFW posts, spoilers, posts you have opened and more.', words: 'filterline visited expando' },
        { key: 'filterScore', label: 'Score filter', kind: 'number', info: true, tip: "The filter bar's score button picks posts with more than this many points.", words: 'points upvotes karma minimum' },
        { key: 'filterLists', label: 'Hide by word, subreddit or site', kind: 'edit', count: 'filterLists', tip: 'Posts with a word from your list in the title, from a subreddit on your list, or linking to a site on your list never show.', words: 'block mute keyword domain' },
      ]],
      ['Scrolling and videos', [
        { key: 'pauseEvery', label: 'Pages before a pause', kind: 'number', hint: '0 = never pause', info: true, tip: 'Endless scrolling stops after this many pages and waits for you to press Load more.', words: 'never ending infinite scroll' },
        { key: 'maxVideos', label: 'Videos playing at once', kind: 'number', hint: '0 = no limit', tip: 'Starting one more video pauses the one that started first.', words: 'autoplay limit' },
      ]],
    ] },
    { id: 'bar', name: 'Shortcut bar', icon: PN_ICON.bar, words: 'subreddit manager favorites', groups: [
      ['', [
        { key: 'showShortcuts', label: 'Show shortcut bar', tip: "Your subreddits in a bar under Reddit's top bar, like RES's subreddit bar.", words: 'subreddit manager' },
        { key: 'scMode', label: 'Bar shows', choices: [['mine', 'My list'], ['visits', 'Most visited']], info: true, tip: 'My list is the shortcuts you pick. Most visited fills the bar with the subreddits you open most.', words: 'frequent' },
        { key: 'editShortcuts', label: 'Your shortcuts', kind: 'edit', count: 'editShortcuts', tip: 'Add, rename, reorder and group the subreddits on the bar.', words: 'add remove reorder rename groups' },
      ]],
      ['Extra links', [
        { key: 'linkDashboard', label: 'Dashboard link', info: true, tip: 'Opens the RESpawn dashboard: your saved comments, tags and hide lists.', words: 'saved' },
        { key: 'linkFriends', label: 'Friends link', info: true, tip: 'A feed of posts from your friends and the people you follow.', words: 'follow following' },
        { key: 'linkMod', label: 'Mod and Mod queue links', info: true, tip: 'Only shows when you moderate a subreddit.', words: 'moderator queue' },
      ]],
    ] },
    { id: 'people', name: 'Comments and people', icon: PN_ICON.comments, words: 'post page thread replies users names', groups: [
      ['Comments', [
        { key: 'autoReplies', label: 'Load more replies as you scroll', tip: 'Presses "more replies" for you when you reach it.', words: 'expand continue thread' },
        { key: 'hideKids', label: 'Start with replies hidden', tip: 'Post pages open with only the top comments. Each one shows how many replies it has.', words: 'collapse fold children threads' },
      ]],
      ['People', [
        { key: 'hoverCards', label: 'Hover cards', info: true, tip: 'Point at a username or subreddit name for a moment to see a card about it.', words: 'user info popup karma' },
        { key: 'highlight', label: 'Color the poster, mods and friends', tip: 'In comments, the person who made the post, moderators and your friends get colored names.', words: 'highlight op submitter moderator' },
        { key: 'tagList', label: 'Your tags', kind: 'edit', count: 'tagList', info: true, tip: 'Tag anyone from their hover card. The tag shows beside their name.', words: 'label tagger ignore' },
        { key: 'hideMyName', label: 'Hide your username', tip: 'Your name shows as "anonymous" on screen, handy for screenshots.', words: 'privacy screenshot anonymous' },
      ]],
    ] },
    { id: 'keys', name: 'Keyboard', icon: PN_ICON.keys, words: 'keys hotkeys keyboard shortcuts', groups: [
      ['', [
        { key: 'keys', label: 'Keyboard shortcuts', tip: 'Move through posts and comments, vote, open and save with single keys, like RES.', words: 'navigation' },
        { key: 'keyHelp', label: 'List of keys', kind: 'show', hint: 'Or press ?' },
      ]],
    ] },
    { id: 'backup', name: 'Backup', icon: PN_ICON.backup, words: 'backup file export import restore', groups: [
      ['Settings file', [
        { key: 'saveFile', label: 'Save to a file', kind: 'save', info: true, tip: 'Your settings, shortcuts, tags and hide lists, saved to your Downloads folder.', words: 'export download' },
        { key: 'loadFile', label: 'Load from a file', kind: 'load', tip: 'Replaces your settings with the ones in a file you saved.', words: 'import restore upload' },
      ]],
    ] },
  ];
  const PN_CAT = 'rs-settings-cat'; // the category you had open, so the window reopens on it
  const PN_NARROW = matchMedia('(max-width: 699px)'); // categories turn into a row of icons above the settings
  let panel = null; // the dimmed backdrop holding the window
  const pn = {}; // the window's parts while it is open
  const closePanel = (back = true) => {
    if (!panel) return;
    const had = panel.contains(document.activeElement);
    panel.remove(); panel = null;
    window.removeEventListener('keydown', pnKeys, true);
    const g = document.getElementById('rs-gear');
    g?.setAttribute('aria-expanded', 'false');
    if (back && had) g?.focus({ preventScroll: true }); // keyboard users land back where they started
  };
  const pnCatNow = () => { const c = localStorage.getItem(PN_CAT); return SETTINGS.some((s) => s.id === c) ? c : SETTINGS[0].id; };
  const pnWords = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);
  // Matched words are marked, built from text nodes (never parsed as HTML)
  const pnMark = (text, words) => {
    if (!words?.length) return [text];
    const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return text.split(re).map((p, i) => (i % 2 ? el('mark', { text: p }) : p));
  };
  const pnFind = (words) => {
    const out = [];
    for (const cat of SETTINGS) for (const [, rows] of cat.groups) for (const s of rows) {
      const hay = [s.label, s.hint, s.tip, s.words, (s.choices || []).map((c) => c[1]).join(' '), cat.name, cat.words].join(' ').toLowerCase();
      if ((!s.when || s.when()) && words.every((w) => hay.includes(w))) out.push({ cat, s });
    }
    return out;
  };
  // One shared tooltip for the (i) buttons. It lives in the window itself so it closes with it, and is kept inside it.
  const pnTipShow = (b) => {
    const tip = pn.tip, box = pn.win.getBoundingClientRect(), r = b.getBoundingClientRect();
    tip.textContent = b.dataset.tip; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.max(8, Math.min(box.width - w - 8, r.left - box.left + r.width / 2 - w / 2));
    const above = r.top - box.top - h - 8;
    tip.style.left = `${left}px`; tip.style.top = `${above >= 8 ? above : r.bottom - box.top + 8}px`;
    pn.tipFor?.removeAttribute('aria-describedby');
    pn.tipFor = b; b.setAttribute('aria-describedby', 'rs-pn-tip');
  };
  const pnTipHide = () => { if (pn.tip) pn.tip.hidden = true; pn.tipFor?.removeAttribute('aria-describedby'); pn.tipFor = null; };
  const pnCount = (k) => ({ editShortcuts: () => scList().length, tagList: () => Object.keys(cfg.tags || {}).length, filterLists: blockCount })[k]?.() || 0;
  // One settings row: the words on the left (label, then a short hint only where it helps), the control on the right.
  const pnRow = (s, words, why) => {
    const id = `rs-pn-${s.key}`, hintId = s.hint || why ? `${id}-h` : null;
    const n = s.count ? pnCount(s.count) : 0;
    const one = !s.choices && !['edit', 'show', 'save', 'load', 'font'].includes(s.kind); // a single box or switch the words can name
    const name = el(one ? 'label' : 'span', { class: 'rs-pn-label', id: `${id}-l`, for: one ? id : null }, pnMark(s.label, words));
    const info = s.info && !why ? el('button', { type: 'button', class: 'rs-pn-i', 'aria-label': `About ${s.label}`, 'data-tip': s.tip, html: PN_ICON.info }) : null;
    const text = el('div', { class: 'rs-pn-text' }, [
      el('div', { class: 'rs-pn-name' }, [name, n ? el('span', { class: 'rs-pn-count', text: String(n) }) : null, info]),
      hintId ? el('div', { class: 'rs-pn-hint', id: hintId }, pnMark(why ? s.tip : s.hint, words)) : null,
    ]);
    let ctl;
    if (s.choices) {
      ctl = el('div', { class: 'rs-seg', role: 'radiogroup', 'aria-labelledby': `${id}-l`, 'data-key': s.key });
      const now = s.key === 'theme' ? themeNow() : cfg[s.key]; // light or dark is Reddit's own setting, not kept in ours
      for (const [v, t] of s.choices) {
        const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(now === v), 'data-v': v, text: t });
        b.onclick = () => {
          if (s.key === 'theme') { setTheme(v); return; }
          saveCfg({ [s.key]: v }); applyEnabled(); if (s.key === 'scMode') shortcutBar(); ctl.querySelectorAll('button').forEach((o) => o.setAttribute('aria-checked', String(o === b)));
          pnWhen();
        };
        ctl.append(b);
      }
    } else if (s.kind === 'font') {
      // Each name is drawn in its own font, and the page behind the window changes the moment you pick one
      ctl = el('div', { class: 'rs-pn-fonts', role: 'radiogroup', 'aria-labelledby': `${id}-l`, 'data-key': s.key });
      for (const [v, t] of FONTS) {
        const b = el('button', { type: 'button', role: 'radio', class: 'rs-pn-font', 'data-v': v, 'aria-checked': String((cfg.font || 'reddit') === v), text: t });
        b.onclick = () => { saveCfg({ font: v }); applyEnabled(); ctl.querySelectorAll('button').forEach((o) => o.setAttribute('aria-checked', String(o === b))); };
        ctl.append(b);
      }
    } else if (s.kind === 'number') {
      const score = s.key === 'filterScore';
      ctl = el('input', { type: 'number', id, class: 'rs-num', step: '1', min: score ? null : '0', max: score ? null : '99', 'aria-describedby': hintId });
      ctl.value = String(cfg[s.key] ?? 0);
      ctl.onchange = () => {
        saveCfg({ [s.key]: Math.max(score ? -99999 : 0, Math.min(score ? 99999 : 99, parseInt(ctl.value, 10) || 0)) }); ctl.value = String(cfg[s.key]);
        if (score) refilter(); else if (s.key === 'pauseEvery') { if (!cfg.pauseEvery) releaseHolds(); } else vTrim();
      };
    } else if (s.kind === 'edit' || s.kind === 'show') {
      ctl = el('button', { type: 'button', class: 'rs-btn rs-pn-btn', id, 'aria-labelledby': `${id} ${id}-l` }, [el('span', { class: 'rs-pn-bi', html: s.kind === 'show' ? PN_ICON.keys : PN_ICON.edit }), s.kind === 'show' ? 'Show' : 'Edit']);
      ctl.onclick = () => { closePanel(false); ({ keyHelp: openKeyHelp, editShortcuts: openScEditor, tagList: openTagList, filterLists: openBlockEditor })[s.key](); };
    } else if (s.kind === 'save' || s.kind === 'load') {
      const save = s.kind === 'save';
      ctl = el('button', { type: 'button', class: 'rs-btn rs-pn-btn', id, 'aria-labelledby': `${id}-l` }, [el('span', { class: 'rs-pn-bi', html: save ? PN_ICON.save : PN_ICON.load }), save ? 'Save' : 'Load']);
      ctl.onclick = save ? saveSettingsFile : loadSettingsFile;
    } else {
      ctl = toggle(s.key);
      ctl.id = id; if (hintId) ctl.setAttribute('aria-describedby', hintId);
    }
    const row = el('div', { class: `rs-pn-row${s.child ? ' rs-pn-child' : ''}${s.kind === 'font' ? ' rs-pn-wrap' : ''}`, 'data-key': s.key, hidden: !!s.when && !s.when() }, [text, ctl]);
    // The whole row of a switch is a target, not only the small switch
    if (ctl.type === 'checkbox') row.addEventListener('click', (e) => { if (!e.target.closest('button, input, label, a')) ctl.click(); });
    return row;
  };
  // A row that only matters with another choice (Open sidebar on hover needs Left sidebar: Slide out) shows only then
  const pnWhen = () => {
    for (const r of pn.win?.querySelectorAll('.rs-pn-row') || []) {
      const s = SETTINGS.flatMap((c) => c.groups.flatMap((g) => g[1])).find((x) => x.key === r.dataset.key);
      if (s?.when) r.hidden = !s.when();
    }
  };
  const pnGroup = (title, rows) => el('section', { class: 'rs-pn-group' }, [title ? el('h4', { class: 'rs-pn-sub' }, title) : null, el('div', { class: 'rs-pn-card' }, rows)]);
  // The Keyboard page also shows the keys themselves, the same list "?" opens over a page
  const pnKeyList = () => {
    const col = (title, rows) => el('div', { class: 'rs-pn-kcol' }, [el('h5', { text: title }), el('dl', {}, rows.filter(([k]) => k !== '?').flatMap(([k, t]) => [
      el('dt', {}, k.split(' ').map((p) => (p === '/' || p === 'or' ? ` ${p} ` : el('kbd', { text: p })))), el('dd', { text: t })]))]);
    return pnGroup('Keys', [el('div', { class: 'rs-pn-keys' }, [col('In a feed', KEYS.feed), col('On a post', KEYS.comments)])]);
  };
  // The Backup page says what a saved file will hold, with your own numbers
  const pnHolds = () => {
    const tile = (n, t) => el('div', { class: 'rs-pn-tile' }, [el('b', { text: num(n) }), el('span', { text: t })]);
    return pnGroup('What the file holds', [el('div', { class: 'rs-pn-tiles' }, [
      tile(scList().length, 'Shortcuts'), tile(Object.keys(cfg.tags || {}).length, 'Tags'), tile(blockCount(), 'Hide-list entries'), tile(Object.keys(subVisits()).length, 'Subreddits visited'),
    ])]);
  };
  // Draws the right side: the chosen category, or what the search found across every category
  const pnDraw = () => {
    pnTipHide();
    const q = pn.search.value.trim(), words = pnWords(q), cur = pnCatNow();
    pn.win.classList.toggle('rs-pn-searching', !!words.length);
    pn.clear.hidden = !q;
    const found = words.length ? pnFind(words) : null;
    for (const b of pn.cats.querySelectorAll('[role="tab"]')) {
      const on = b.dataset.cat === cur;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      const n = found ? found.filter((f) => f.cat.id === b.dataset.cat).length : 0;
      b.querySelector('.rs-pn-n').textContent = found && n ? String(n) : '';
      b.classList.toggle('rs-pn-none', !!found && !n);
    }
    const pane = pn.pane;
    pane.replaceChildren();
    if (!found) {
      const cat = SETTINGS.find((c) => c.id === cur);
      pane.setAttribute('aria-labelledby', `rs-pn-tab-${cat.id}`); pane.removeAttribute('aria-label');
      pane.append(el('h3', { class: 'rs-pn-title' }, [el('span', { class: 'rs-pn-ti', html: cat.icon }), cat.name]));
      for (const [title, rows] of cat.groups) pane.append(pnGroup(title, rows.map((s) => pnRow(s))));
      if (cat.id === 'keys') pane.append(pnKeyList());
      if (cat.id === 'backup') pane.append(pnHolds());
    } else if (!found.length) {
      pane.removeAttribute('aria-labelledby'); pane.setAttribute('aria-label', 'Search');
      const clear = el('button', { type: 'button', class: 'rs-btn', text: 'Clear search' });
      clear.onclick = () => { pn.search.value = ''; pnDraw(); pn.search.focus(); };
      pane.append(el('div', { class: 'rs-pn-empty', role: 'status' }, [el('span', { class: 'rs-pn-ei', html: PN_ICON.search }), el('p', {}, ['No settings match ', el('b', { text: `"${q}"` })]), clear]));
    } else {
      pane.removeAttribute('aria-labelledby'); pane.setAttribute('aria-label', 'Search');
      pane.append(el('h3', { class: 'rs-pn-title rs-pn-found', role: 'status' }, `${found.length} matching setting${found.length === 1 ? '' : 's'}`));
      for (const cat of SETTINGS) {
        const mine = found.filter((f) => f.cat === cat);
        if (!mine.length) continue;
        // A match found only in the longer explanation shows that explanation, so you can see why it is here
        const rows = mine.map(({ s }) => pnRow(s, words, !!s.tip && !words.every((w) => `${s.label} ${s.hint || ''}`.toLowerCase().includes(w)) && words.some((w) => s.tip.toLowerCase().includes(w))));
        pane.append(pnGroup([el('span', { class: 'rs-pn-si', html: cat.icon }), cat.name], rows));
      }
    }
    pane.scrollTop = 0;
  };
  const pnGo = (id, focus) => {
    try { localStorage.setItem(PN_CAT, id); } catch { /* storage full */ }
    pn.search.value = '';
    pnDraw();
    if (focus) pn.cats.querySelector(`[data-cat="${id}"]`)?.focus();
  };
  const pnOff = () => { pn.off.hidden = !!cfg.enabled; pn.state.textContent = cfg.enabled ? 'On' : 'Off'; };
  // Keys while the window is open: Esc clears the search first and then closes, "/" or Ctrl+F jumps to the search,
  // and Tab stays inside the window.
  const pnKeys = (e) => {
    if (!panel) return;
    const typing = e.target.tagName === 'INPUT' && e.target.type !== 'checkbox';
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (pn.tipFor) pnTipHide();
      else if (pn.search.value) { pn.search.value = ''; pnDraw(); pn.search.focus(); } else closePanel();
    } else if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === 'f')) {
      e.preventDefault(); e.stopPropagation(); pn.search.focus(); pn.search.select();
    } else if (e.key === 'Tab') {
      const all = [...pn.win.querySelectorAll('button, input, a[href]')].filter((x) => x.tabIndex >= 0 && !x.disabled && x.getClientRects().length);
      const first = all[0], last = all[all.length - 1];
      if (!pn.win.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  const togglePanel = () => {
    if (panel) return closePanel();
    const win = el('div', { id: 'rs-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rs-pn-name' });
    pn.win = win;
    // Header: name, one search over every setting, the main on/off switch, and the X
    pn.search = el('input', { type: 'search', class: 'rs-pn-q', placeholder: 'Search settings', 'aria-label': 'Search settings', autocomplete: 'off', spellcheck: 'false' });
    pn.search.oninput = pnDraw;
    pn.clear = el('button', { type: 'button', class: 'rs-pn-clear', 'aria-label': 'Clear search', hidden: true, html: ICON.close });
    pn.clear.onclick = () => { pn.search.value = ''; pnDraw(); pn.search.focus(); };
    pn.state = el('span', { class: 'rs-pn-state', 'aria-hidden': 'true' });
    const master = toggle('enabled', pnOff);
    master.setAttribute('aria-label', 'RESpawn');
    const x = el('button', { type: 'button', class: 'rs-panel-x', 'aria-label': 'Close', title: 'Close (Esc)', html: ICON.close });
    x.onclick = () => closePanel();
    win.append(el('div', { class: 'rs-pn-head' }, [
      el('div', { class: 'rs-pn-brand' }, [el('span', { class: 'rs-pn-logo', 'aria-hidden': 'true' }), el('h2', { id: 'rs-pn-name', text: 'RESpawn' })]),
      el('div', { class: 'rs-pn-find' }, [el('span', { class: 'rs-pn-qi', html: PN_ICON.search }), pn.search, pn.clear]),
      el('label', { class: 'rs-pn-master', title: 'Turn RESpawn off to see Reddit as it normally looks' }, [pn.state, master]),
      x,
    ]));
    pn.off = el('div', { class: 'rs-pn-off', role: 'status', text: 'RESpawn is off, so Reddit shows as it normally does.' });
    win.append(pn.off);
    // Left: the categories (a row of icons in a narrow window). Arrow keys move between them.
    pn.cats = el('div', { class: 'rs-pn-cats', role: 'tablist', 'aria-label': 'Categories', 'aria-orientation': PN_NARROW.matches ? 'horizontal' : 'vertical' });
    for (const c of SETTINGS) {
      const b = el('button', { type: 'button', role: 'tab', id: `rs-pn-tab-${c.id}`, 'aria-controls': 'rs-pn-pane', 'data-cat': c.id, title: c.name },
        [el('span', { class: 'rs-pn-ci', html: c.icon }), el('span', { class: 'rs-pn-cn', text: c.name }), el('span', { class: 'rs-pn-n', 'aria-hidden': 'true' })]);
      b.onclick = () => pnGo(c.id);
      pn.cats.append(b);
    }
    pn.cats.onkeydown = (e) => {
      const tabs = [...pn.cats.querySelectorAll('[role="tab"]')], i = tabs.indexOf(document.activeElement);
      const to = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined || i < 0) return;
      e.preventDefault();
      pnGo(tabs[(to + tabs.length) % tabs.length].dataset.cat, true);
    };
    pn.pane = el('div', { class: 'rs-pn-pane', id: 'rs-pn-pane', role: 'tabpanel' });
    pn.pane.addEventListener('scroll', pnTipHide, { passive: true });
    win.append(el('div', { class: 'rs-pn-body' }, [pn.cats, pn.pane]));
    // Footer: about, the dashboard, the version, and Done
    const ver = (() => { try { return chrome.runtime.getManifest().version || ''; } catch { return ''; } })();
    const dashB = el('button', { type: 'button', class: 'rs-btn rs-pn-btn' }, [el('span', { class: 'rs-pn-bi', html: PN_ICON.dash }), 'Dashboard']);
    dashB.onclick = () => openDash();
    const done = el('button', { type: 'button', class: 'rs-done', text: 'Done' });
    done.onclick = () => closePanel();
    win.append(el('div', { class: 'rs-pn-foot' }, [
      el('a', { class: 'rs-pn-about', href: 'https://github.com/humangenome/RESpawn', target: '_blank', rel: 'noopener' }, ['About RESpawn', el('span', { class: 'rs-pn-bi', html: PN_ICON.out })]),
      ver ? el('span', { class: 'rs-pn-ver', text: `Version ${ver}` }) : null,
      el('span', { class: 'rs-set-btns' }, [dashB, done]),
    ]));
    pn.tip = el('div', { class: 'rs-pn-tip', id: 'rs-pn-tip', role: 'tooltip', hidden: true });
    win.append(pn.tip);
    // (i): shown while pointed at or focused, and on a tap for touch screens
    win.addEventListener('mouseover', (e) => { const b = e.target.closest?.('.rs-pn-i'); if (b && b !== pn.tipFor) pnTipShow(b); });
    win.addEventListener('mouseout', (e) => { if (pn.tipFor && e.target.closest?.('.rs-pn-i') === pn.tipFor && !pn.tipFor.contains(e.relatedTarget)) pnTipHide(); });
    win.addEventListener('focusin', (e) => { if (e.target.classList?.contains('rs-pn-i')) pnTipShow(e.target); else if (pn.tipFor) pnTipHide(); });
    win.addEventListener('click', (e) => { const b = e.target.closest?.('.rs-pn-i'); if (b) pnTipShow(b); else if (pn.tipFor) pnTipHide(); });
    // The dimmed page behind: a click on it closes the window (only a click that started there, not a text selection
    // dragged out of the window), and the wheel never scrolls Reddit's page behind it.
    panel = el('div', { id: 'rs-shade' }, [win]);
    let downOnShade = false;
    panel.addEventListener('pointerdown', (e) => { downOnShade = e.target === panel; });
    panel.addEventListener('click', (e) => { if (e.target === panel && downOnShade) closePanel(); });
    panel.addEventListener('wheel', (e) => { const sc = e.target.closest?.('.rs-pn-pane, .rs-pn-cats'); if (!sc || sc.scrollHeight <= sc.clientHeight) e.preventDefault(); }, { passive: false });
    pnOff(); pnDraw();
    document.body.append(panel);
    document.getElementById('rs-gear')?.setAttribute('aria-expanded', 'true');
    window.addEventListener('keydown', pnKeys, true);
    pn.search.focus();
  };
  PN_NARROW.addEventListener('change', () => pn.cats?.setAttribute('aria-orientation', PN_NARROW.matches ? 'horizontal' : 'vertical'));
  const toggle = (key, after) => {
    const i = el('input', { type: 'checkbox', role: 'switch', class: 'rs-switch-input' });
    i.checked = !!cfg[key];
    i.onchange = () => { saveCfg({ [key]: i.checked }); applyEnabled(); if (['showShortcuts', 'linkFriends', 'linkMod', 'linkDashboard'].includes(key)) shortcutBar(); const card = document.getElementById('rs-about'); if (card) paintCard(card); after?.(); };
    return i;
  };

  // ---------- settings file (RES's backup and restore) ----------
  // Everything you set up (settings, shortcuts, tags, hide lists) plus your subreddit visit counts, in one file you keep.
  // A loaded file is checked value by value: anything unknown or malformed is left out.
  const FILE_KIND = 'RESpawn settings';
  const FEED_PATH = /^\/user\/[A-Za-z0-9_-]{3,20}\/m\/[A-Za-z0-9_]{1,64}\/$/;
  const saveSettingsFile = () => {
    const data = { kind: FILE_KIND, version: 1, saved: new Date().toISOString(), settings: { ...cfg, simulateLastVisitHoursAgo: undefined }, visits: subVisits() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    const d = new Date(), two = (n) => String(n).padStart(2, '0');
    const a = el('a', { href: url, download: `respawn-settings-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Settings saved to your Downloads folder.');
  };
  const cleanSettings = (o) => {
    const out = {};
    for (const k of ['enabled', 'showShortcuts', 'hideRecent', 'hideAds', 'hideBadges', 'hideSuggested', 'filterline', 'subStyles', 'pinHeader', 'keys', 'linkFriends', 'linkMod', 'hoverCards', 'highlight', 'autoReplies', 'hideChat', 'topButton', 'hideKids', 'hideMyName', 'linkDashboard', 'classicHome', 'classicSubs', 'navHover', 'fullWidth']) if (typeof o[k] === 'boolean') out[k] = o[k];
    for (const [k, ok] of [['leftNav', ['show', 'slide', 'hide']], ['scMode', ['mine', 'visits']], ['mySubsSort', ['visits', 'az']], ['font', FONTS.map(([f]) => f)]]) if (ok.includes(o[k])) out[k] = o[k];
    for (const [k, lo, hi] of [['filterScore', -99999, 99999], ['pauseEvery', 0, 99], ['maxVideos', 0, 99]]) if (Number.isFinite(o[k])) out[k] = Math.max(lo, Math.min(hi, Math.round(o[k])));
    if (Array.isArray(o.shortcuts)) {
      out.shortcuts = o.shortcuts.map((x) => {
        const v = typeof x === 'string' ? { sub: x } : x && typeof x === 'object' ? x : {};
        if (typeof v.feed === 'string') return FEED_PATH.test(v.feed) ? { feed: v.feed, name: clip(v.name, 40) } : null;
        if (!validSub(v.sub) && !multiNames(v.sub)) return null;
        const name = clip(typeof v.name === 'string' ? v.name.trim() : '', 40);
        return name ? { sub: v.sub, name } : v.sub;
      }).filter(Boolean).slice(0, 300);
    }
    if (o.feeds && typeof o.feeds === 'object') {
      out.feeds = {};
      for (const k of ['friends', 'mod']) {
        const f = o.feeds[k];
        if (!f || typeof f.path !== 'string' || !FEED_PATH.test(f.path)) continue;
        const ids = {};
        for (const [n, id] of Object.entries(f.ids && typeof f.ids === 'object' ? f.ids : {})) if (/^[a-z0-9_-]{2,23}$/.test(n) && /^t5_[a-z0-9]{1,12}$/.test(id)) ids[n] = id;
        out.feeds[k] = { path: f.path, ids };
      }
    }
    if (o.tags && typeof o.tags === 'object') {
      out.tags = {};
      for (const t of Object.values(o.tags).slice(0, 5000)) {
        if (!t || !validUser(t.name)) continue;
        const text = clip(typeof t.text === 'string' ? t.text.trim() : '', 40), ignore = t.ignore === true;
        if (text || ignore) out.tags[t.name.toLowerCase()] = { name: t.name, text, color: TAG_COLORS.some(([c]) => c === t.color) ? t.color : 'blue', ignore };
      }
    }
    const strs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string').join('\n') : '');
    if (Array.isArray(o.blockWords)) out.blockWords = parseWords(strs(o.blockWords));
    if (Array.isArray(o.blockSubs)) out.blockSubs = parseSubList(strs(o.blockSubs));
    if (Array.isArray(o.blockSites)) out.blockSites = parseSites(strs(o.blockSites));
    if (o.filters && typeof o.filters === 'object') { out.filters = {}; for (const k of FILTER_KEYS) if (['only', 'hide'].includes(o.filters[k])) out.filters[k] = o.filters[k]; }
    if (o.subStyleOverrides && typeof o.subStyleOverrides === 'object') { out.subStyleOverrides = {}; for (const [k, v] of Object.entries(o.subStyleOverrides)) if (validSub(k) && typeof v === 'boolean') out.subStyleOverrides[k.toLowerCase()] = v; }
    return out;
  };
  const cleanVisits = (v) => {
    const out = {};
    for (const x of Object.values(v && typeof v === 'object' ? v : {}).slice(0, 5000)) if (x && validSub(x.name) && Number.isFinite(x.n) && Number.isFinite(x.t)) out[x.name.toLowerCase()] = { name: x.name, n: Math.max(0, Math.min(1e6, Math.round(x.n))), t: x.t };
    return out;
  };
  const loadSettingsFile = () => {
    const inp = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    inp.onchange = async () => {
      const f = inp.files?.[0];
      inp.remove();
      if (!f) return;
      const bad = () => toast('That file is not RESpawn settings.');
      if (f.size > 4e6) return bad();
      let data;
      try { data = JSON.parse(await f.text()); } catch { return bad(); }
      if (data?.kind !== FILE_KIND || !data.settings || typeof data.settings !== 'object') return bad();
      const when = Date.parse(data.saved) ? new Date(data.saved).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'earlier';
      if (!window.confirm(`Replace your RESpawn settings with the ones saved ${when}?`)) return;
      const { simulateLastVisitHoursAgo, ...base } = DEFAULTS;
      saveCfg({ ...base, ...cleanSettings(data.settings) });
      if (data.visits) { try { localStorage.setItem('rs-subvisits', JSON.stringify(cleanVisits(data.visits))); } catch { /* storage full */ } }
      closePanel(); applyEnabled(); shortcutBar(); scButton(true); refilter();
      for (const b of document.querySelectorAll('.rs-ut')) paintTag(b);
      toast('Settings loaded.');
    };
    document.body.append(inp);
    inp.click();
  };

  // ---------- left sidebar slide-out ----------
  // Reddit's left menu waits off screen. By default a slim tab on the left edge opens it with a click: having it open
  // by itself whenever the mouse passed the edge got in the way. "Open sidebar on hover" brings that back.
  const LEFT_TAB = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const leftSlide = () => {
    if (document.getElementById('rs-left-edge')) return;
    const edge = el('div', { id: 'rs-left-edge', 'aria-hidden': 'true' });
    const tab = el('button', { type: 'button', id: 'rs-left-tab', 'aria-controls': 'left-sidebar-container', 'aria-expanded': 'false', html: LEFT_TAB });
    document.body.append(edge, tab);
    const nav = () => document.getElementById('left-sidebar-container');
    let t;
    const paintTab = () => {
      const o = html.classList.contains('rs-left-open'), say = o ? 'Close the left sidebar' : 'Open the left sidebar';
      tab.setAttribute('aria-expanded', String(o)); tab.setAttribute('aria-label', say); tab.title = say;
    };
    const open = () => { clearTimeout(t); html.classList.add('rs-left-open'); paintTab(); };
    const shut = () => { clearTimeout(t); t = setTimeout(() => { html.classList.remove('rs-left-open'); paintTab(); }, 250); };
    const shutNow = () => { clearTimeout(t); html.classList.remove('rs-left-open'); paintTab(); };
    paintTab();
    edge.addEventListener('mouseenter', () => { if (cfg.navHover) open(); });
    document.addEventListener('mouseover', (e) => { const n = nav(); if (!cfg.navHover || !html.classList.contains('rs-left-slide') || !n) return; if (n.contains(e.target) || e.target === edge) open(); else if (html.classList.contains('rs-left-open')) shut(); });
    // Click to open: the tab opens and closes it; a click anywhere else, Esc, or following a link in the menu closes it.
    // Clicks RESpawn makes itself are not yours and never close it.
    tab.onclick = (e) => {
      if (html.classList.contains('rs-left-open')) return shutNow();
      open();
      // Opened from the keyboard (Enter or Space): the cursor moves into the menu, since the tab sits at the page's end.
      // Reddit draws most of the menu inside its own sealed-off parts, which RESpawn can still look into.
      // A link first (Home), not Reddit's own collapse button at the menu's top.
      const first = (root, sel, depth = 0) => {
        for (const x of root.querySelectorAll('*')) {
          if (x.matches(sel) && x.getClientRects().length) return x;
          const y = x.shadowRoot && depth < 3 && first(x.shadowRoot, sel, depth + 1);
          if (y) return y;
        }
        return null;
      };
      if (!e.detail) setTimeout(() => { const n = nav(); (n && (first(n, 'a[href]') || first(n, 'button')))?.focus({ preventScroll: true }); }, 200);
    };
    const clickOpen = () => !cfg.navHover && html.classList.contains('rs-left-slide') && html.classList.contains('rs-left-open');
    document.addEventListener('click', (e) => {
      if (!e.isTrusted || !clickOpen()) return;
      const n = nav(), path = e.composedPath();
      if (path.includes(tab)) return;
      if (!n || !path.includes(n) || path.some((x) => x.tagName === 'A' && x.hasAttribute('href'))) shutNow();
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !clickOpen()) return;
      const inside = nav()?.contains(document.activeElement);
      shutNow();
      if (inside) tab.focus();
    }, true);
  };

  // ---------- right side: "Recent posts" ----------
  const tagRecent = () => {
    const rail = document.getElementById('right-sidebar-container') || document;
    for (const h of rail.querySelectorAll('h2, h3, span, div, p')) {
      if (h.childElementCount > 2 || !/^\s*recent posts\s*$/i.test(h.textContent)) continue;
      let box = h;
      const top = document.getElementById('right-sidebar-contents');
      while (box.parentElement && box.parentElement !== top && box.parentElement !== rail && box.parentElement.tagName !== 'ASIDE') box = box.parentElement;
      box.classList.add('rs-recent');
    }
  };

  // ---------- shortcut bar (RES's subreddit manager) ----------
  // Shortcuts are kept as "sub", { sub, name } (name = what the bar shows) or { feed, name } for a Reddit custom feed
  // (a group of subreddits: the new-design version of old Reddit's r/a+b+c links). A sub can also be a combined list,
  // "a+b+c" (see "Combined subreddits" at the top), opened as RESpawn's own list at /#r/a+b+c.
  const scList = () => (cfg.shortcuts || []).map((x) => (typeof x === 'string' ? { sub: x } : x)).filter((x) => x?.sub || x?.feed);
  const scSave = (list) => { saveCfg({ shortcuts: list.map(({ sub, feed, name }) => (feed ? { feed, name } : name && name.toLowerCase() !== sub.toLowerCase() ? { sub, name } : sub)) }); shortcutBar(); scButton(true); const card = document.getElementById('rs-about'); if (card) paintCard(card); multiShow(true); };
  // a combined list is the same list whatever the order or capitals of its names
  const scKey = (sub) => String(sub).toLowerCase().split('+').sort().join('+');
  const scIndex = (sub) => scList().findIndex((x) => x.sub && scKey(x.sub) === scKey(sub));
  const scFeedIndex = (path) => scList().findIndex((x) => x.feed && x.feed.toLowerCase() === String(path).toLowerCase());
  const scHref = (x) => x.feed || (x.sub.includes('+') ? `/#r/${x.sub}` : `/r/${x.sub}/`);
  // a combined list with no name of its own shows its first name and how many more ("aww+pics", "ClaudeAI +94")
  const multiShort = (subs) => { const n = subs.split('+'); return n.length <= 2 ? n.join('+') : `${n[0]} +${n.length - 1}`; };
  const scName = (x) => x.name || (x.sub?.includes('+') ? multiShort(x.sub) : x.sub) || x.feed.replace(/\/$/, '').split('/').pop();
  const scWhat = (x) => (x.feed ? `the ${scName(x)} feed` : x.sub.includes('+') ? scName(x) : `r/${x.sub}`);
  const scFeedToggle = (f) => {
    const l = scList(), i = scFeedIndex(f.path);
    if (i >= 0) l.splice(i, 1); else l.push({ feed: f.path, name: f.name });
    scSave(l);
    toast(i >= 0 ? `Removed ${f.name} from your shortcuts.` : `Added ${f.name} to your shortcuts.`);
  };
  const scToggle = (sub) => {
    const l = scList(), i = scIndex(sub);
    if (i >= 0) l.splice(i, 1); else l.push({ sub });
    scSave(l);
    toast(i >= 0 ? `Removed r/${sub} from your shortcuts.` : `Added r/${sub} to your shortcuts.`);
  };
  const cleanSub = (v) => String(v || '').trim().replace(/^(https?:\/\/[^/]+)?\/?r\//i, '').replace(/\/.*$/, '');
  const validSub = (v) => /^[A-Za-z0-9_]{2,21}$/.test(v);
  // Subreddit visits, counted in this browser, for "Most visited".
  const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
  const subVisits = () => readJSON('rs-subvisits');
  const countVisit = () => {
    const s = subOf();
    if (!s || s.includes('+') || /^(popular|all|mod|friends)$/i.test(s)) return;
    const v = subVisits(), k = s.toLowerCase();
    if (countVisit.last === k) return; // a sort change inside the same subreddit is not a new visit
    countVisit.last = k;
    v[k] = { name: v[k]?.name || s, n: (v[k]?.n || 0) + 1, t: Date.now() };
    try { localStorage.setItem('rs-subvisits', JSON.stringify(v)); } catch { /* storage full */ }
  };
  // Reddit's left menu loads only once it is open on screen. When you keep it collapsed (or RESpawn slides it
  // away) its contents never arrive, so ask Reddit's own loader for them. This does not change your setting.
  const ensureNav = () => {
    const p = document.querySelector('#left-sidebar-container faceplate-partial[src*="left-nav"]');
    if (!p || p.dataset.rsLoaded) return null;
    p.dataset.rsLoaded = '1';
    // Changing its "loading" setting to eager makes Reddit's loader fetch right away. (Calling its load() directly
    // only works from inside Reddit's own page, not from an add-on.)
    p.setAttribute('loading', 'eager');
    return new Promise((res) => setTimeout(res, 600));
  };
  // Your joined communities: Reddit puts the whole list (with icons) in its left menu. Keep a copy for pages without it.
  const joined = () => {
    const c = document.querySelector('left-nav-communities-controller[initialstatejson]');
    if (c) {
      try {
        const list = JSON.parse(c.getAttribute('initialstatejson')).map((x) => ({ name: String(x.prefixedName || '').replace(/^r\//, ''), id: x.id || '', icon: x.styles?.icon64 || x.styles?.legacyIcon?.url || '' }))
          .filter((x) => x.name && !/^u\//.test(x.name) && validSub(x.name));
        localStorage.setItem('rs-joined', JSON.stringify(list));
        return list;
      } catch { /* fall back to the copy */ }
    }
    try { return JSON.parse(localStorage.getItem('rs-joined') || '[]'); } catch { return []; }
  };
  // Your Reddit custom feeds, from the same left menu.
  const myFeeds = () => {
    const c = document.querySelector('left-nav-multireddits-controller[initialstatejson]');
    if (c) {
      try {
        const list = JSON.parse(c.getAttribute('initialstatejson')).map((x) => ({ path: x.path, name: x.displayName || '', icon: x.icon || '' })).filter((x) => /^\/user\/[^/]+\/m\/[^/]+\/$/i.test(x.path || ''));
        localStorage.setItem('rs-feeds', JSON.stringify(list));
        return list;
      } catch { /* fall back to the copy */ }
    }
    try { return JSON.parse(localStorage.getItem('rs-feeds') || '[]'); } catch { return []; }
  };
  const mostVisited = (limit = 40) => Object.values(subVisits()).sort((a, b) => b.n - a.n || b.t - a.t).slice(0, limit).map((v) => ({ sub: v.name }));
  const loggedIn = () => document.querySelector('shreddit-app')?.getAttribute('user-logged-in') === 'true';

  const ARROW = { l: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', r: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', d: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' };
  const shortcutBar = () => {
    let bar = document.getElementById('rs-shortcuts');
    if (!cfg.showShortcuts) { bar?.remove(); return; }
    if (!bar) bar = el('nav', { id: 'rs-shortcuts', 'aria-label': 'Shortcut bar' });
    const header = document.querySelector('reddit-header-large');
    if (header && bar.previousElementSibling !== header) header.after(bar);
    else if (!header && !bar.isConnected) document.body.prepend(bar);
    const mine = el('button', { type: 'button', class: 'rs-mine', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, [document.createTextNode('My subreddits'), el('span', { html: ARROW.d })]);
    mine.onclick = (e) => { e.stopPropagation(); toggleMySubs(mine); };
    bar.replaceChildren(mine);
    if (cfg.linkDashboard) {
      const d = el('button', { type: 'button', class: 'rs-fixed rs-dash-link', 'aria-haspopup': 'dialog', 'aria-expanded': String(!!dash), title: 'Your saved comments, tags and hide lists', text: 'DASHBOARD' });
      d.onclick = () => (dash ? closeDash() : openDash());
      bar.append(d);
    }
    bar.classList.remove('rs-dragging'); // a finished drag rebuilds the bar
    const path = location.pathname;
    const allOn = path === '/' && /^#all(\/|$)/.test(location.hash), multiOn = path === '/' && multiHashOf();
    const fixed = [['HOME', '/', !allOn && !multiOn && (path === '/' || /^\/(best|hot|new|top|rising)\/?$/.test(path))], ['POPULAR', '/r/popular/', /^\/r\/popular/i.test(path)], ['ALL', '/#all', allOn || /^\/r\/all/i.test(path)]];
    const link = ([label, href, on]) => el('a', { href, class: on ? 'rs-fixed rs-cur' : 'rs-fixed', text: label });
    for (const f of fixed) bar.append(link(f));
    if (loggedIn()) {
      if (cfg.linkFriends) bar.append(specialLink('friends'));
      bar.dataset.mods = String(modded().length);
      if (cfg.linkMod && modded().length) bar.append(specialLink('mod'), link(['MODQUEUE', '/mod/queue', /^\/mod\/queue/i.test(path)]));
      bar.append(link(['SAVED', '/user/me/saved/', /^\/user\/[^/]+\/saved/i.test(path)]));
    }
    bar.append(el('span', { class: 'rs-sep', 'aria-hidden': 'true' }));
    const auto = cfg.scMode === 'visits';
    const items = auto ? mostVisited() : scList();
    const list = el('div', { class: 'rs-sc-list' });
    const cur = (subOf() || '').toLowerCase(), here = location.pathname.toLowerCase();
    items.forEach((x, i) => {
      const on = x.feed ? here.startsWith(x.feed.toLowerCase()) : x.sub.includes('+') ? !!multiOn && scKey(multiOn.subs) === scKey(x.sub) : cur === x.sub.toLowerCase();
      const a = el('a', { href: scHref(x), class: [on ? 'rs-cur' : '', x.feed ? 'rs-sc-feed' : ''].join(' ').trim() || null, title: x.feed ? `${scName(x)} (custom feed)` : x.sub.includes('+') ? `${x.sub.split('+').length} subreddits` : `r/${x.sub}`, text: scName(x).toUpperCase(), 'data-i': String(i), draggable: auto ? null : 'true' });
      list.append(a);
    });
    if (!items.length) list.append(el('span', { class: 'rs-sc-hint', text: auto ? 'Visit a few subreddits and your most visited show up here.' : 'Add shortcuts with "+ Shortcut" on any subreddit, or from My subreddits.' }));
    const left = el('button', { type: 'button', class: 'rs-sc-arrow', 'aria-label': 'Scroll shortcuts left', html: ARROW.l });
    const right = el('button', { type: 'button', class: 'rs-sc-arrow', 'aria-label': 'Scroll shortcuts right', html: ARROW.r });
    left.onclick = () => list.scrollBy({ left: -list.clientWidth * 0.7, behavior: 'smooth' });
    right.onclick = () => list.scrollBy({ left: list.clientWidth * 0.7, behavior: 'smooth' });
    const edit = el('button', { type: 'button', class: 'rs-sc-edit', text: 'EDIT' });
    edit.onclick = (e) => { e.stopPropagation(); openScEditor(); };
    const trash = el('div', { class: 'rs-sc-trash', text: 'Drop here to remove' });
    bar.append(left, list, right, trash, edit);
    const arrows = () => { const over = list.scrollWidth > list.clientWidth + 2; left.hidden = !over || list.scrollLeft < 2; right.hidden = !over || list.scrollLeft + list.clientWidth >= list.scrollWidth - 2; };
    list.addEventListener('scroll', arrows, { passive: true });
    list.addEventListener('wheel', (e) => { if (list.scrollWidth > list.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { list.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    requestAnimationFrame(() => { list.querySelector('.rs-cur')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }); arrows(); });
    if (!auto) dragShortcuts(bar, list, trash);
  };
  // Drag a shortcut left or right to move it; drop it on the bin to remove it.
  const dragShortcuts = (bar, list, trash) => {
    let from = -1;
    const clear = () => list.querySelectorAll('.rs-drop-before, .rs-drop-after').forEach((a) => a.classList.remove('rs-drop-before', 'rs-drop-after'));
    list.addEventListener('dragstart', (e) => {
      const a = e.target.closest?.('a[data-i]');
      if (!a) return;
      from = +a.dataset.i;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', a.title);
      bar.classList.add('rs-dragging');
    });
    list.addEventListener('dragover', (e) => {
      const a = e.target.closest?.('a[data-i]');
      if (from < 0 || !a) return;
      e.preventDefault();
      clear();
      const r = a.getBoundingClientRect();
      a.classList.add(e.clientX < r.left + r.width / 2 ? 'rs-drop-before' : 'rs-drop-after');
    });
    list.addEventListener('drop', (e) => {
      const a = e.target.closest?.('a[data-i]');
      if (from < 0 || !a) return;
      e.preventDefault();
      let to = +a.dataset.i + (a.classList.contains('rs-drop-after') ? 1 : 0);
      const l = scList(); const [moved] = l.splice(from, 1);
      if (to > from) to--;
      l.splice(to, 0, moved);
      from = -1; scSave(l);
    });
    trash.addEventListener('dragover', (e) => { if (from >= 0) { e.preventDefault(); trash.classList.add('rs-over'); } });
    trash.addEventListener('dragleave', () => trash.classList.remove('rs-over'));
    trash.addEventListener('drop', (e) => { if (from < 0) return; e.preventDefault(); const l = scList(); const [gone] = l.splice(from, 1); from = -1; scSave(l); toast(`Removed ${scWhat(gone)} from your shortcuts.`); });
    list.addEventListener('dragend', () => { from = -1; clear(); bar.classList.remove('rs-dragging'); trash.classList.remove('rs-over'); });
  };

  // "+ Shortcut" button next to Join on every subreddit page.
  const scButton = (repaint) => {
    const hb = document.querySelector('shreddit-subreddit-header-buttons[name]');
    let b = document.getElementById('rs-sc-btn');
    if (!hb) { b?.remove(); return; }
    const sub = hb.getAttribute('name');
    if (!b || !b.isConnected || b.dataset.sub !== sub) {
      b?.remove();
      b = el('button', { id: 'rs-sc-btn', type: 'button', 'data-sub': sub });
      b.onclick = () => scToggle(sub);
      hb.before(b);
      repaint = true;
    }
    if (!repaint) return;
    const on = scIndex(sub) >= 0;
    b.textContent = on ? '− Shortcut' : '+ Shortcut';
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? `Remove r/${sub} from your shortcut bar` : `Add r/${sub} to your shortcut bar`;
  };

  // ---------- subreddit styles (RES's "use subreddit style") ----------
  // Reddit keeps each community's colors in one stylesheet; switching it off is instant and needs no reload.
  const curSub = () => (document.querySelector('shreddit-subreddit-header[name]')?.getAttribute('name') || subOf() || '').toLowerCase();
  const subStyleOn = (sub = curSub()) => { const o = (cfg.subStyleOverrides || {})[sub]; return o === undefined ? !!cfg.subStyles : !!o; };
  const applySubStyle = () => {
    const on = !cfg.enabled || subStyleOn();
    const st = document.getElementById('community-styles-style-element');
    if (st && st.disabled === on) st.disabled = !on;
    html.classList.toggle('rs-sub-plain', !on);
  };
  const setSubStyle = (sub, on) => {
    const o = { ...(cfg.subStyleOverrides || {}) };
    if (on === !!cfg.subStyles) delete o[sub]; else o[sub] = on;
    saveCfg({ subStyleOverrides: o }); applySubStyle();
  };

  // ---------- sidebar: our own card at the top of the right side ----------
  const linkify = (text) => {
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      const url = m[0].replace(/[.,;:!?*]+$/, '');
      frag.append(el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') }));
      last = m.index + url.length;
    }
    if (last < text.length) frag.append(text.slice(last));
    return frag;
  };
  // Reddit's own Join button for this subreddit: in the header on its pages, in the side box's shadow on post pages
  // (that one was missed before, so the card showed no Join or Leave on posts).
  const joinButton = (sub) => {
    const L = [document.querySelector('shreddit-subreddit-header-buttons')?.shadowRoot?.querySelector('shreddit-join-button'),
      document.querySelector('#right-sidebar-container shreddit-subreddit-header')?.shadowRoot?.querySelector('shreddit-join-button')];
    return L.find((b) => b && (!sub || String(b.getAttribute('name')).toLowerCase() === sub.toLowerCase())) || null;
  };
  const paintJoin = (card) => {
    const jb = joinButton(card.dataset.sub), join = card.querySelector('.rs-ab-join');
    const on = !!jb?.hasAttribute('subscribed'), text = jb ? (on ? 'Leave' : 'Join') : '';
    if (join.hidden !== !jb) join.hidden = !jb;
    if (jb && join.textContent !== text) { join.textContent = text; join.setAttribute('aria-pressed', String(on)); join.title = on ? `Leave r/${card.dataset.sub}` : `Join r/${card.dataset.sub}`; }
  };
  // "Show my flair" (old Reddit's sidebar line): your name with your flair here, a switch, and "edit".
  // What Reddit has on file comes from the subreddit's about.json. Reddit's own flair box can't be pressed for the
  // switch: it starts unticked even while your flair shows (checked 11/9 against about.json). So the switch sends the
  // request that box sends when only its "Show my user flair" tick changes (watched 11/9: shouldUpdateUserFlair false,
  // so the flair itself is never touched). "edit" opens Reddit's own flair box under this card; while it is closed it
  // is tucked away, so the two don't repeat each other.
  const myFlair = { sub: '', d: null, failed: false };
  const flairWidget = (sub) => {
    const f = document.querySelector('#right-sidebar-container community-author-flair');
    return f && String(f.getAttribute('subreddit-name')).toLowerCase() === sub.toLowerCase() ? f : null;
  };
  const loadMyFlair = (card) => {
    const sub = card.dataset.sub;
    if (myFlair.sub === sub || !loggedIn()) return;
    myFlair.sub = sub; myFlair.d = null; myFlair.failed = false;
    fetch(`/r/${sub}/about.json?raw_json=1`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
      if (myFlair.sub !== sub) return;
      if (j?.data) myFlair.d = j.data; else myFlair.failed = true; // no flair line; Reddit's own section stays
      paintFlairRow(card);
    });
  };
  const paintFlairRow = (card) => {
    const row = card.querySelector('.rs-ab-flair');
    if (!row) return;
    const sub = card.dataset.sub, f = flairWidget(sub), d = myFlair.sub === sub ? myFlair.d : null;
    const open = f?.getAttribute('aria-expanded') === 'true';
    if (card.rsFlairOpen && !open) { myFlair.sub = ''; loadMyFlair(card); } // you may have changed it in Reddit's box
    card.rsFlairOpen = open;
    const show = !!(f && d && (d.user_can_flair_in_sr || d.user_flair_text));
    if (row.hidden !== !show) row.hidden = !show;
    // Reddit's own "User flair" section, and the divider that would then start its box; tucked away already while
    // about.json is on its way, so the side column doesn't jump when the line arrives
    const sec = f?.closest('#right-sidebar-container .px-md');
    const tuck = !open && (show || (!!f && !d && !myFlair.failed && myFlair.sub === sub && loggedIn()));
    sec?.classList.toggle('rs-hide-flairsec', tuck);
    let hr = sec?.nextElementSibling;
    while (hr && hr.tagName !== 'HR' && !hr.getBoundingClientRect().height) hr = hr.nextElementSibling;
    for (const x of document.querySelectorAll('.rs-hide-flairhr')) if (x !== hr || !tuck) x.classList.remove('rs-hide-flairhr');
    if (hr?.tagName === 'HR' && tuck) hr.classList.add('rs-hide-flairhr');
    if (!show || row.dataset.busy) return;
    const on = d.user_sr_flair_enabled !== false, name = f.getAttribute('username') || '';
    const sig = JSON.stringify([name, on, d.user_flair_text, d.user_flair_richtext]);
    if (row.dataset.sig === sig) return;
    row.dataset.sig = sig;
    row.querySelector('input').checked = on;
    row.classList.toggle('rs-off', !on);
    const me = row.querySelector('.rs-ab-fl-me');
    me.replaceChildren(el('span', { class: 'rs-ab-fl-name', text: name }), aflairBox(d.user_flair_richtext, d.user_flair_text) || '', me.rsEdit);
  };
  const flairEnable = async (card, on) => {
    const row = card.querySelector('.rs-ab-flair'), d = myFlair.d, f = flairWidget(card.dataset.sub);
    if (!d || !f || row.dataset.busy || needLogin('change your flair')) { paintFlairRow(card); return; }
    row.dataset.busy = '1';
    try {
      await gql('UpdateUserFlairAndEnabledStatus', { subredditId: f.getAttribute('subreddit-id') || d.name, isEnabled: on, flairTemplateId: null, text: null, shouldUpdateUserFlair: false, shouldUpdateUserFlairEnabledStatus: true, username: f.getAttribute('username') }, true);
      d.user_sr_flair_enabled = on;
    } catch { toast('Reddit did not take that. Try again.'); }
    delete row.dataset.busy; delete row.dataset.sig;
    paintFlairRow(card);
  };
  const paintCard = (card) => {
    const sub = card.dataset.sub;
    paintJoin(card);
    paintFlairRow(card);
    const sc = card.querySelector('.rs-ab-sc'), inList = scIndex(sub) >= 0;
    sc.textContent = inList ? '− Shortcut' : '+ Shortcut'; sc.setAttribute('aria-pressed', String(inList));
    card.querySelector('.rs-ab-style input').checked = subStyleOn(sub.toLowerCase());
  };
  const sideCard = () => {
    const hdr = document.querySelector('#right-sidebar-container shreddit-subreddit-header[name]');
    let card = document.getElementById('rs-about');
    if (!hdr) { card?.remove(); return; }
    const sub = hdr.getAttribute('name');
    if (card?.isConnected && card.dataset.sub === sub) { paintJoin(card); paintFlairRow(card); return; } // Reddit's parts can change (or arrive late)
    card?.remove();
    const g = (k) => hdr.getAttribute(k) || '';
    // The community icon: the picture Reddit marks as this community's icon (header, or the post's own header on
    // post pages), else its style-folder icon, else your joined list.
    const sid = g('subreddit-id');
    const iconSrc = document.querySelector('.masthead img.shreddit-subreddit-icon__icon')?.getAttribute('src')
      || (sid && document.querySelector(`shreddit-post[subreddit-id="${sid}"] img.shreddit-subreddit-icon__icon`)?.getAttribute('src'))
      || (sid && document.querySelector(`img[src*="/${sid}/styles/communityIcon"]`)?.getAttribute('src'))
      || joined().find((j) => j.name.toLowerCase() === sub.toLowerCase())?.icon || '';
    const created = (hdr.querySelector('[slot="community-details"]')?.textContent.match(/Created\s+([A-Z][a-z]+ \d{1,2}, \d{4})/) || [])[1];
    const visitors = +g('weekly-active-users') || 0, posts = +g('weekly-contributions') || 0;
    card = el('section', { id: 'rs-about', 'data-sub': sub, 'aria-label': `About r/${sub}` });
    const desc = el('p', { class: 'rs-ab-desc' }, [linkify(g('description'))]);
    const more = el('button', { type: 'button', class: 'rs-ab-more', text: 'Show more', hidden: true });
    more.onclick = () => { const open = desc.classList.toggle('rs-open'); more.textContent = open ? 'Show less' : 'Show more'; };
    const join = el('button', { type: 'button', class: 'rs-ab-join rs-btn' });
    join.onclick = () => {
      const jb = joinButton(sub);
      if (!jb) return;
      (jb.shadowRoot?.querySelector('button') || jb).click();
      setTimeout(() => paintJoin(card), 800); setTimeout(() => paintJoin(card), 2500);
    };
    const sc = el('button', { type: 'button', class: 'rs-ab-sc rs-btn' });
    sc.onclick = () => { scToggle(sub); paintCard(card); };
    const style = el('input', { type: 'checkbox', role: 'switch', class: 'rs-switch-input' });
    style.onchange = () => setSubStyle(sub.toLowerCase(), style.checked);
    const flairSw = el('input', { type: 'checkbox', role: 'switch', class: 'rs-switch-input' });
    flairSw.onchange = () => flairEnable(card, flairSw.checked);
    const flairMe = el('div', { class: 'rs-ab-fl-me' });
    flairMe.rsEdit = el('a', { href: '#', role: 'button', class: 'rs-ab-fl-edit', text: 'edit', title: 'Change your flair in this subreddit' });
    flairMe.rsEdit.onclick = (e) => {
      e.preventDefault();
      const f = flairWidget(sub);
      if (!f) return;
      if (f.getAttribute('aria-expanded') !== 'true') (f.querySelector('[slot="toggle"] button') || f.shadowRoot?.querySelector('[role="button"]'))?.click();
      paintFlairRow(card);
      requestAnimationFrame(() => f.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    };
    card.append(
      el('div', { class: 'rs-ab-head' }, [
        iconSrc ? el('img', { src: iconSrc, alt: '' }) : el('span', { class: 'rs-ms-noicon', text: 'r/' }),
        (() => {
          const title = g('display-name').trim();
          const same = !title || title.replace(/^r\//i, '').toLowerCase() === sub.toLowerCase();
          return el('div', {}, [el('b', { text: same ? `r/${sub}` : title }), same ? null : el('a', { href: `/r/${sub}/`, text: `r/${sub}` })]);
        })(),
      ]),
      g('description') ? desc : null, more,
      el('div', { class: 'rs-ab-stats' }, [
        visitors ? el('span', {}, [el('b', { text: num(visitors) }), ' weekly visitors']) : null,
        posts ? el('span', {}, [el('b', { text: num(posts) }), ' weekly posts and comments']) : null,
      ]),
      created ? el('div', { class: 'rs-ab-created', text: `Created ${created}` }) : null,
      el('div', { class: 'rs-ab-acts' }, [join, sc]),
      el('div', { class: 'rs-ab-flair', hidden: true }, [el('label', { class: 'rs-ab-fl-top' }, [el('span', { text: 'Show my flair' }), flairSw]), flairMe]),
      el('label', { class: 'rs-ab-style' }, [el('span', { text: 'Use subreddit style' }), style]),
    );
    const top = document.getElementById('right-sidebar-contents') || hdr.closest('#right-sidebar-container');
    const info = document.getElementById('rs-postinfo');
    if (info?.isConnected) info.after(card); else top.prepend(card);
    hdr.classList.add('rs-hide-about');
    loadMyFlair(card);
    paintCard(card);
    requestAnimationFrame(() => { more.hidden = desc.scrollHeight <= desc.clientHeight + 2; });
  };

  // ---------- "My subreddits" menu: your communities, most visited first ----------
  let mySubs = null;
  const closeMySubs = () => { mySubs?.remove(); mySubs = null; document.querySelector('#rs-shortcuts .rs-mine')?.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', mySubsOutside, true); document.removeEventListener('keydown', mySubsEsc, true); };
  const mySubsOutside = (e) => { if (e.isTrusted && mySubs && !mySubs.contains(e.target) && !e.target.closest?.('.rs-mine')) closeMySubs(); };
  const mySubsEsc = (e) => { if (e.key === 'Escape') closeMySubs(); };
  const toggleMySubs = (btn) => {
    closeFeedAsk();
    if (mySubs) return closeMySubs();
    let all = [];
    const collect = () => {
      const byName = new Map();
      for (const j of joined()) byName.set(j.name.toLowerCase(), { name: j.name, icon: j.icon, n: 0, t: 0 });
      for (const [k, v] of Object.entries(subVisits())) { const x = byName.get(k) || { name: v.name, icon: '', n: 0, t: 0 }; x.n = v.n; x.t = v.t; byName.set(k, x); }
      all = [...byName.values()];
    };
    collect();
    const pending = !document.querySelector('left-nav-communities-controller[initialstatejson]') && ensureNav();
    mySubs = el('div', { id: 'rs-mysubs', role: 'dialog', 'aria-label': 'My subreddits' });
    const search = el('input', { type: 'search', class: 'rs-ms-search', placeholder: 'Find a subreddit', 'aria-label': 'Find a subreddit', spellcheck: 'false' });
    const seg = el('div', { class: 'rs-seg', role: 'radiogroup', 'aria-label': 'Sort' });
    const rows = el('div', { class: 'rs-ms-rows' });
    const draw = () => {
      const q = search.value.trim().toLowerCase().replace(/^r\//, '');
      const list = all.filter((x) => !q || x.name.toLowerCase().includes(q))
        .sort(cfg.mySubsSort === 'az' ? (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : (a, b) => b.n - a.n || b.t - a.t || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      rows.replaceChildren();
      const feeds = myFeeds().filter((f) => !q || f.name.toLowerCase().includes(q));
      if (feeds.length) {
        rows.append(el('div', { class: 'rs-ms-sec', text: 'Custom feeds' }));
        for (const f of feeds) {
          const on = scFeedIndex(f.path) >= 0;
          const icon = f.icon ? el('img', { src: f.icon, alt: '', loading: 'lazy' }) : el('span', { class: 'rs-ms-noicon', text: 'm/' });
          const add = el('button', { type: 'button', class: 'rs-ms-add', 'aria-pressed': String(on), title: on ? 'Remove from shortcut bar' : 'Add to shortcut bar', text: on ? '− Shortcut' : '+ Shortcut' });
          add.onclick = (e) => { e.preventDefault(); e.stopPropagation(); scFeedToggle(f); draw(); };
          rows.append(el('a', { class: 'rs-ms-row', href: f.path }, [icon, el('span', { class: 'rs-ms-name', text: f.name }), el('span', { class: 'rs-ms-n' }), add]));
        }
        if (list.length) rows.append(el('div', { class: 'rs-ms-sec', text: 'Communities' }));
      }
      for (const x of list) {
        const on = scIndex(x.name) >= 0;
        const icon = x.icon ? el('img', { src: x.icon, alt: '', loading: 'lazy' }) : el('span', { class: 'rs-ms-noicon', text: 'r/' });
        const add = el('button', { type: 'button', class: 'rs-ms-add', 'aria-pressed': String(on), title: on ? 'Remove from shortcut bar' : 'Add to shortcut bar', text: on ? '− Shortcut' : '+ Shortcut' });
        add.onclick = (e) => { e.preventDefault(); e.stopPropagation(); scToggle(x.name); draw(); };
        rows.append(el('a', { class: 'rs-ms-row', href: `/r/${x.name}/` }, [icon, el('span', { class: 'rs-ms-name', text: `r/${x.name}` }), el('span', { class: 'rs-ms-n', text: x.n ? `${x.n} visit${x.n === 1 ? '' : 's'}` : '' }), add]));
      }
      if (!list.length && !feeds.length) rows.append(el('div', { class: 'rs-ms-empty', text: q ? 'No match.' : 'Your communities show up here once Reddit lists them.' }));
    };
    for (const [v, t] of [['visits', 'Most visited'], ['az', 'A–Z']]) {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(cfg.mySubsSort === v), text: t });
      b.onclick = () => { saveCfg({ mySubsSort: v }); seg.querySelectorAll('button').forEach((o) => o.setAttribute('aria-checked', String(o === b))); draw(); };
      seg.append(b);
    }
    search.oninput = draw;
    search.onkeydown = (e) => { if (e.key === 'Enter') { const first = rows.querySelector('.rs-ms-row'); if (first) location.assign(first.href); } };
    const newGroup = el('button', { type: 'button', class: 'rs-btn rs-btn-quiet rs-ms-group', text: 'New group' });
    newGroup.onclick = (e) => { e.stopPropagation(); closeMySubs(); openScEditor({ group: true }); };
    mySubs.append(el('div', { class: 'rs-ms-head' }, [search, seg]), rows, el('div', { class: 'rs-ms-foot' }, [newGroup]));
    draw();
    if (pending) {
      const box = mySubs;
      let tries = 0;
      const wait = () => { if (box !== mySubs) return; if (document.querySelector('left-nav-communities-controller[initialstatejson]') || ++tries > 20) { collect(); draw(); } else setTimeout(wait, 150); };
      pending.then(wait);
    }
    const r = btn.getBoundingClientRect();
    mySubs.style.left = `${Math.max(8, Math.round(r.left))}px`;
    mySubs.style.top = `${Math.round(r.bottom + 6)}px`;
    document.body.append(mySubs);
    btn.setAttribute('aria-expanded', 'true');
    search.focus();
    setTimeout(() => { document.addEventListener('click', mySubsOutside, true); document.addEventListener('keydown', mySubsEsc, true); }, 0);
  };

  // ---------- FRIENDS and MOD: old Reddit's r/friends and r/mod, rebuilt for the new design ----------
  // Reddit shows r/friends and r/mod only in the old design (even its own "r/Mod" menu link opens old Reddit). So each
  // becomes a private custom feed on your account: made when you first click it (after you say yes), kept up to date after.
  const navLoaded = () => !!document.querySelector('left-nav-communities-controller[initialstatejson]');
  const modded = () => {
    const c = document.querySelector('left-nav-moderation-controller[initialstatejson]');
    if (c || navLoaded()) {
      const raw = c ? c.getAttribute('initialstatejson') : '[]';
      if (raw === modded.raw) return modded.list;
      try {
        const list = JSON.parse(raw).map((x) => ({ name: String(x.prefixedName || '').replace(/^r\//, ''), id: x.id || '' })).filter((x) => x.name && /^t5_/.test(x.id));
        localStorage.setItem('rs-modded', JSON.stringify(list));
        modded.raw = raw; modded.list = list;
        return list;
      } catch { /* fall back to the copy */ }
    }
    try { return JSON.parse(localStorage.getItem('rs-modded') || '[]'); } catch { return []; }
  };
  // People you follow: Reddit lists their profiles with your communities, as u/name.
  const followed = () => {
    const c = document.querySelector('left-nav-communities-controller[initialstatejson]');
    if (!c) return null;
    try { return JSON.parse(c.getAttribute('initialstatejson')).filter((x) => /^u\//.test(x.prefixedName || '') && /^t5_/.test(x.id || '')).map((x) => ({ name: `u_${x.prefixedName.slice(2)}`, id: x.id })); } catch { return null; }
  };
  const profileId = async (user) => {
    const ids = readJSON('rs-profileids'), k = user.toLowerCase();
    if (ids[k]) return ids[k];
    await new Promise((r) => setTimeout(r, 120)); // one lookup at a time, gently
    const r = await fetch(`/user/${encodeURIComponent(user)}/about.json`, { credentials: 'include' });
    const id = r.ok ? (await r.json().catch(() => null))?.data?.subreddit?.name : null;
    if (!/^t5_/.test(id || '')) return null;
    ids[k] = id;
    try { localStorage.setItem('rs-profileids', JSON.stringify(ids)); } catch { /* storage full */ }
    return id;
  };
  // Your friends list plus the people you follow. "complete" = both lists were read, so a person missing from them
  // really left (only then does the feed drop anyone).
  const friendsList = async (say) => {
    const out = new Map(), fol = followed();
    for (const f of fol || []) out.set(f.name.toLowerCase(), f);
    const r = await fetch('/prefs/friends.json', { credentials: 'include' });
    const j = r.ok ? await r.json().catch(() => null) : null;
    const names = ((Array.isArray(j) ? j[0] : j)?.data?.children || []).map((c) => c?.name).filter((n) => /^[A-Za-z0-9_-]{3,20}$/.test(n || ''));
    let i = 0;
    for (const n of names) {
      say?.(`Checking ${++i} of ${names.length}…`);
      if (out.has(`u_${n}`.toLowerCase())) continue;
      const id = await profileId(n).catch(() => null);
      if (id) out.set(`u_${n}`.toLowerCase(), { name: `u_${n}`, id });
    }
    return { list: [...out.values()], complete: !!j && !!fol };
  };
  const SPECIAL = {
    friends: { label: 'FRIENDS', title: 'Friends feed', name: 'Friends', tip: 'Posts from your friends and the people you follow, in the new look.', empty: 'Your friends list is empty and you follow nobody yet.', want: friendsList },
    mod: { label: 'MOD', title: 'Mod feed', name: 'Mod', tip: 'Posts from the communities you moderate, in the new look.', empty: 'You do not moderate any communities.', want: async () => ({ list: modded(), complete: navLoaded() }) },
  };
  const specialFeed = (k) => (cfg.feeds || {})[k];
  const setSpecial = (k, v) => { const f = { ...(cfg.feeds || {}) }; if (v) f[k] = v; else delete f[k]; saveCfg({ feeds: f }); };
  const feedMembers = async (path) => {
    const r = await fetch(`/api/multi${path.replace(/\/$/, '')}.json`, { credentials: 'include' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`feed ${r.status}`);
    return ((await r.json()).data?.subreddits || []).map((x) => x.name).filter(Boolean);
  };
  // Keep a feed in step: add who is new, drop who left. At most every 10 minutes per feed.
  const syncing = {};
  const syncSpecial = async (k) => {
    const f = specialFeed(k);
    if (!f || syncing[k] || Date.now() - (syncing[`${k}At`] || 0) < 10 * 60e3 || !csrf()) return;
    syncing[k] = true; syncing[`${k}At`] = Date.now();
    try {
      const have = await feedMembers(f.path);
      if (have === null) { setSpecial(k, null); shortcutBar(); return; } // deleted on Reddit: offer to make it again
      const { list, complete } = await SPECIAL[k].want();
      const haveSet = new Set(have.map((n) => n.toLowerCase())), wantSet = new Set(list.map((x) => x.name.toLowerCase()));
      const add = list.filter((x) => !haveSet.has(x.name.toLowerCase()));
      const ids = { ...(f.ids || {}) };
      for (const x of list) ids[x.name.toLowerCase()] = x.id;
      if (complete) {
        const drop = [];
        for (const n of have.filter((h) => !wantSet.has(h.toLowerCase()))) { const id = ids[n.toLowerCase()] || (await subId(n).catch(() => null))?.id; if (id) drop.push(id); }
        if (drop.length) await gql('CustomFeedRemoveSubreddits', { label: f.path, subredditIds: drop }, true);
      }
      const room = 100 - (complete ? have.filter((h) => wantSet.has(h.toLowerCase())).length : have.length); // Reddit's limit
      if (add.length && room > 0) await gql('CustomFeedAddSubreddits', { label: f.path, subredditIds: add.slice(0, room).map((x) => x.id) }, true);
      setSpecial(k, { ...f, ids });
    } catch { /* try again next time */ } finally { syncing[k] = false; }
  };
  let feedAsk = null;
  const closeFeedAsk = () => { feedAsk?.remove(); feedAsk = null; document.removeEventListener('click', feedAskOutside, true); document.removeEventListener('keydown', feedAskEsc, true); };
  const feedAskOutside = (e) => { if (e.isTrusted && feedAsk && !feedAsk.contains(e.target) && !e.target.closest?.('.rs-special')) closeFeedAsk(); };
  const feedAskEsc = (e) => { if (e.key === 'Escape') closeFeedAsk(); };
  const askSpecial = (k, btn) => {
    const again = feedAsk?.dataset.k === k;
    closeFeedAsk(); closeMySubs();
    if (again) return;
    const S = SPECIAL[k];
    feedAsk = el('div', { id: 'rs-feedask', role: 'dialog', 'aria-label': S.title, 'data-k': k });
    const msg = el('p', { class: 'rs-fa-msg', role: 'status' });
    const no = el('button', { type: 'button', class: 'rs-btn rs-btn-quiet', text: 'Not now' });
    const make = el('button', { type: 'button', class: 'rs-done', text: 'Make it' });
    no.onclick = closeFeedAsk;
    make.onclick = async () => {
      if (needLogin('make this feed')) return;
      const busy = (on) => { make.disabled = on; no.disabled = on; };
      const say = (t) => { msg.textContent = t; };
      busy(true);
      try {
        say('Getting the list…');
        const { list } = await S.want(say);
        if (!list.length) { say(S.empty); busy(false); return; }
        const use = list.slice(0, 100);
        say('Making the feed…');
        const d = await gql('CustomFeedCreate', { displayName: S.name, descriptionMd: 'Kept up to date by RESpawn.', visibility: 'PRIVATE', subredditIds: use.map((x) => x.id) });
        const path = d?.multireddit?.path;
        if (!path) throw new Error('no feed');
        setSpecial(k, { path, ids: Object.fromEntries(use.map((x) => [x.name.toLowerCase(), x.id])) });
        say(list.length > 100 ? `Made it with the first 100 of ${list.length}. Opening…` : 'Made it. Opening…');
        location.assign(path);
      } catch (err) { say(err.reddit ? `Reddit said: ${err.reddit}` : 'Reddit did not take that. Try again.'); busy(false); }
    };
    feedAsk.append(
      el('b', { class: 'rs-fa-title', text: S.title }),
      el('p', { class: 'rs-fa-tip', text: `${S.tip} Saved on Reddit as a private custom feed named ${S.name}, kept up to date.` }),
      msg, el('div', { class: 'rs-fa-foot' }, [no, make]),
    );
    const r = btn.getBoundingClientRect();
    feedAsk.style.left = `${Math.max(8, Math.min(Math.round(r.left), innerWidth - 360))}px`;
    feedAsk.style.top = `${Math.round(r.bottom + 6)}px`;
    document.body.append(feedAsk);
    btn.setAttribute('aria-expanded', 'true');
    make.focus();
    setTimeout(() => { document.addEventListener('click', feedAskOutside, true); document.addEventListener('keydown', feedAskEsc, true); }, 0);
  };
  const specialLink = (k) => {
    const S = SPECIAL[k], f = specialFeed(k);
    if (!f) {
      const b = el('button', { type: 'button', class: 'rs-fixed rs-special', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', text: S.label });
      b.onclick = (e) => { e.stopPropagation(); askSpecial(k, b); };
      return b;
    }
    const on = location.pathname.toLowerCase().startsWith(f.path.toLowerCase());
    // Deleted on Reddit? Your feed list no longer has it: check once and offer to make it again.
    const listed = document.querySelector('left-nav-multireddits-controller[initialstatejson]') ? myFeeds().some((x) => x.path.toLowerCase() === f.path.toLowerCase()) : true;
    if (!listed && !syncing[`${k}Checked`]) { syncing[`${k}Checked`] = true; syncing[`${k}At`] = 0; }
    if (on || !listed) syncSpecial(k);
    const a = el('a', { href: f.path, class: `rs-fixed rs-special${on ? ' rs-cur' : ''}`, title: `${S.title} (private custom feed)`, text: S.label });
    a.addEventListener('click', () => syncSpecial(k));
    a.addEventListener('auxclick', () => syncSpecial(k));
    return a;
  };

  // ---------- shortcut editor ----------
  let editor = null;
  const closeScEditor = () => { editor?.remove(); editor = null; document.removeEventListener('keydown', editorEsc, true); };
  const editorEsc = (e) => { if (e.key === 'Escape' && !e.target.closest?.('input')) closeScEditor(); };
  // Groups: several subreddits under one shortcut. Old Reddit did this with r/a+b+c links, which Reddit now shows only
  // in the old design, so a group is made as a private Reddit custom feed (Reddit's own grouping, up to 100 subreddits).
  const parseSubs = (t) => {
    const out = new Map();
    for (const tok of String(t).split(/[\s,;]+/)) {
      const m = tok.match(/\/r\/([^/?#\s]+)/i);
      for (const n of (m ? m[1] : tok.replace(/^\/?r\//i, '')).split('+')) if (validSub(n) && !out.has(n.toLowerCase())) out.set(n.toLowerCase(), n);
    }
    return [...out.values()];
  };
  const subId = async (name) => {
    const j = joined().find((x) => x.id && x.name.toLowerCase() === name.toLowerCase());
    if (j) return { id: j.id, name: j.name };
    await new Promise((r) => setTimeout(r, 120)); // one lookup at a time, gently
    const r = await fetch(`/r/${encodeURIComponent(name)}/about.json`, { credentials: 'include' });
    if (!r.ok) return null;
    const d = (await r.json().catch(() => null))?.data;
    return /^t5_/.test(d?.name || '') ? { id: d.name, name: d.display_name || name } : null;
  };
  const makeGroup = async (name, names, say) => {
    const found = [], missing = [];
    for (const [i, n] of names.entries()) {
      say(`Checking ${i + 1} of ${names.length}…`);
      try { const x = await subId(n); if (x) found.push(x); else missing.push(n); } catch { missing.push(n); }
    }
    if (!found.length) throw new Error(`Could not find ${missing.map((m) => `r/${m}`).join(', ')}.`);
    say('Making the group…');
    const d = await gql('CustomFeedCreate', { displayName: name, descriptionMd: '', visibility: 'PRIVATE', subredditIds: found.map((x) => x.id) });
    const path = d?.multireddit?.path;
    if (!path) throw new Error('Reddit did not make the group. Try again.');
    return { path, found, missing };
  };
  const openScEditor = (opts = {}) => {
    closeMySubs();
    if (editor) return closeScEditor();
    editor = el('div', { id: 'rs-sc-editor', class: 'rs-modal', role: 'dialog', 'aria-label': 'Edit shortcuts' });
    const x = el('button', { type: 'button', class: 'rs-panel-x', 'aria-label': 'Close', html: ICON.close });
    x.onclick = closeScEditor;
    const rows = el('div', { class: 'rs-ed-rows' });
    const addIn = el('input', { type: 'text', class: 'rs-ed-add', placeholder: 'Add a subreddit, e.g. movies', 'aria-label': 'Add a subreddit', spellcheck: 'false' });
    const addBtn = el('button', { type: 'button', class: 'rs-btn', text: 'Add' });
    const msg = el('div', { class: 'rs-ed-msg', role: 'status' });
    const add = () => {
      const v = cleanSub(addIn.value);
      if (!validSub(v)) { msg.textContent = 'Type a subreddit name, like movies.'; return; }
      if (scIndex(v) >= 0) { msg.textContent = `r/${v} is already on your bar.`; return; }
      scSave([...scList(), { sub: v }]); addIn.value = ''; msg.textContent = ''; draw();
    };
    addBtn.onclick = add;
    addIn.onkeydown = (e) => { if (e.key === 'Enter') add(); };
    let from = -1;
    const draw = () => {
      rows.replaceChildren();
      scList().forEach((x, i) => {
        const { sub, feed, name } = x;
        const nameIn = el('input', { type: 'text', class: 'rs-ed-name', placeholder: scName(x).toUpperCase(), 'aria-label': `Name shown for ${scWhat(x)}`, spellcheck: 'false' });
        nameIn.value = name || '';
        if (feed) nameIn.placeholder = scName({ feed }).toUpperCase();
        nameIn.onchange = () => { const l = scList(); const v = nameIn.value.trim(); l[i] = feed ? { feed, name: v || scName({ feed }) } : { sub, name: v }; scSave(l); };
        const del = el('button', { type: 'button', class: 'rs-ed-del', 'aria-label': `Remove ${scWhat(x)}`, html: ICON.close });
        del.onclick = () => { const l = scList(); l.splice(i, 1); scSave(l); draw(); };
        const row = el('div', { class: 'rs-ed-row', draggable: 'true', 'data-i': String(i) }, [el('span', { class: 'rs-ed-grip', 'aria-hidden': 'true', text: '⋮⋮' }), feed ? el('a', { class: 'rs-ed-sub rs-ed-feed', href: feed, title: 'Open this custom feed on Reddit to change its subreddits', text: 'Custom feed ↗' }) : sub.includes('+') ? el('span', { class: 'rs-ed-sub', title: sub.split('+').join(', '), text: `${sub.split('+').length} subreddits` }) : el('span', { class: 'rs-ed-sub', text: `r/${sub}` }), nameIn, del]);
        row.addEventListener('dragstart', (e) => { if (e.target.closest('input, a')) { e.preventDefault(); return; } from = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', scName(x)); row.classList.add('rs-moving'); });
        row.addEventListener('dragover', (e) => { if (from < 0) return; e.preventDefault(); const r = row.getBoundingClientRect(); rows.querySelectorAll('.rs-ed-row').forEach((o) => o.classList.remove('rs-drop-before', 'rs-drop-after')); row.classList.add(e.clientY < r.top + r.height / 2 ? 'rs-drop-before' : 'rs-drop-after'); });
        row.addEventListener('drop', (e) => {
          if (from < 0) return;
          e.preventDefault();
          let to = i + (row.classList.contains('rs-drop-after') ? 1 : 0);
          const l = scList(); const [m] = l.splice(from, 1); if (to > from) to--; l.splice(to, 0, m);
          from = -1; scSave(l); draw();
        });
        row.addEventListener('dragend', () => { from = -1; draw(); });
        rows.append(row);
      });
      if (!scList().length) rows.append(el('div', { class: 'rs-ms-empty', text: 'No shortcuts yet.' }));
      count.textContent = `${scList().length} shortcut${scList().length === 1 ? '' : 's'}`;
    };
    const count = el('span', { class: 'rs-ed-count' });
    const az = el('button', { type: 'button', class: 'rs-btn rs-btn-quiet', text: 'Sort A–Z' });
    az.onclick = () => { scSave(scList().sort((a, b) => scName(a).localeCompare(scName(b), undefined, { sensitivity: 'base' }))); draw(); };
    const top = el('button', { type: 'button', class: 'rs-btn rs-btn-quiet', text: 'Add my most visited' });
    top.onclick = () => { const l = scList(); for (const v of mostVisited(15)) if (!l.some((x) => x.sub && x.sub.toLowerCase() === v.sub.toLowerCase())) l.push(v); scSave(l); draw(); };
    const done = el('button', { type: 'button', class: 'rs-done', text: 'Done' });
    done.onclick = closeScEditor;
    const groupBtn = el('button', { type: 'button', class: 'rs-btn rs-btn-quiet', 'aria-expanded': 'false', text: 'New group' });
    const gName = el('input', { type: 'text', class: 'rs-ed-add', placeholder: 'Group name, e.g. AI', 'aria-label': 'Group name', maxlength: '50', spellcheck: 'false' });
    const gSubs = el('textarea', { class: 'rs-ed-subs', rows: '3', placeholder: 'movies, television  or paste an old r/a+b link', 'aria-label': 'Subreddits in the group', spellcheck: 'false' });
    const gGo = el('button', { type: 'button', class: 'rs-done', text: 'Make group' });
    const gMsg = el('div', { class: 'rs-ed-gmsg', role: 'status' });
    const group = el('div', { class: 'rs-ed-group', role: 'group', 'aria-label': 'New group' }, [el('p', { class: 'rs-ed-tip', text: 'Saved on Reddit as a private custom feed.' }), gName, gSubs, el('div', { class: 'rs-ed-gfoot' }, [gMsg, gGo])]);
    const showGroup = (on) => { group.hidden = !on; groupBtn.setAttribute('aria-expanded', String(on)); if (on) gName.focus(); };
    groupBtn.onclick = () => showGroup(group.hidden);
    gGo.onclick = async () => {
      if (needLogin('make groups')) return;
      const name = gName.value.trim(), names = parseSubs(gSubs.value);
      if (!name) { gMsg.textContent = 'Give the group a name.'; gName.focus(); return; }
      if (names.length < 2) { gMsg.textContent = 'Add at least two subreddits.'; gSubs.focus(); return; }
      if (names.length > 100) { gMsg.textContent = `Reddit allows 100 subreddits in a group. That list has ${names.length}.`; return; }
      gGo.disabled = true;
      try {
        const { path, found, missing } = await makeGroup(name, names, (t) => { gMsg.textContent = t; });
        scSave([...scList(), { feed: path, name }]);
        try { localStorage.setItem('rs-feeds', JSON.stringify([...myFeeds().filter((f) => f.path !== path), { path, name, icon: '' }])); } catch { /* storage full */ }
        gMsg.textContent = `Made ${name} with ${found.length} subreddits.${missing.length ? ` Not found: ${missing.map((m) => `r/${m}`).join(', ')}.` : ''}`;
        gName.value = ''; gSubs.value = ''; draw();
      } catch (e) {
        gMsg.textContent = e.reddit ? `Reddit said: ${e.reddit}` : /refused|Failed to fetch|^CustomFeed/.test(e.message) ? 'Reddit did not take that. Try again.' : e.message;
      }
      gGo.disabled = false;
    };
    showGroup(!!opts.group);
    editor.append(
      el('div', { class: 'rs-panel-head' }, [el('b', { text: 'Shortcuts' }), x]),
      el('p', { class: 'rs-ed-tip', text: 'Drag to reorder. The name box changes what the bar shows.' }),
      el('div', { class: 'rs-ed-addrow' }, [addIn, addBtn, groupBtn]), group, msg, el('div', { class: 'rs-ed-scroll' }, [rows]),
      el('div', { class: 'rs-panel-foot' }, [el('div', { class: 'rs-ed-tools' }, [count, az, top]), done]),
    );
    draw();
    document.body.append(editor);
    if (opts.group) gName.focus(); else addIn.focus();
    setTimeout(() => document.addEventListener('keydown', editorEsc, true), 0);
  };

  // ---------- sort tabs ----------
  const FUNNEL = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4.5h14l-5.4 6.3v4.6l-3.2 1.6v-6.2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  // RES's "show images": every picture, gallery and video on the page opens in place, videos paused until you press
  // their play button; pressed again, they all close. Posts open as they come near the screen, so a long page doesn't
  // load everything at once, and posts loaded further down open too while it is on (it stays on for this page only).
  let showAll = null; // the page's address while "Show images" is on
  const SHOW_AHEAD = 1000; // how far below the screen posts already open
  const showIO = new IntersectionObserver((es) => {
    // Top to bottom; each one opened pushes the rest down, and those it pushed out of reach wait until you scroll to them
    for (const e of es.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)) {
      if (showAll !== location.href) return;
      if (e.target.getBoundingClientRect().top > innerHeight + SHOW_AHEAD) continue;
      showIO.unobserve(e.target);
      if (!e.target.closest('.rs-filtered, .rs-gone, .rs-dup')) e.target.rsShow?.(true, true);
    }
  }, { rootMargin: `0px 0px ${SHOW_AHEAD}px 0px` }); // not above the screen: opening those would push what you are reading down
  const paintShowAll = () => { for (const b of document.querySelectorAll('.rs-expand-all')) setText(b.querySelector('span'), showAll === location.href ? 'Hide images' : 'Show images'); };
  const showAllOff = (close) => {
    showAll = null; showIO.disconnect();
    for (const b of document.querySelectorAll('.rs-row .rs-x')) { b.rsSio = false; if (close && b.rsQuiet) b.rsShow?.(false); }
    paintShowAll();
  };
  const showSweep = () => {
    if (!showAll) return;
    if (showAll !== location.href) { showAllOff(false); return; }
    for (const b of document.querySelectorAll('.rs-row .rs-x')) if (b.rsQuiet && !b.rsSio) { b.rsSio = true; showIO.observe(b); }
  };
  const showImagesBtn = () => {
    const all = el('button', { type: 'button', class: 'rs-expand-all', title: 'Open every picture, gallery and video on this page (X)' }, [svgOf(ICON.image), el('span', { text: showAll === location.href ? 'Hide images' : 'Show images' })]);
    all.onclick = () => { if (showAll === location.href) showAllOff(true); else { showAll = location.href; showSweep(); paintShowAll(); } };
    return all;
  };
  // Profile pages (Overview, Posts, Saved ...) have no sort bar: "Show images" goes at the right end of the row with
  // Reddit's own "Feed options" button. Comments there are left as they are.
  const profileBar = () => {
    const old = document.getElementById('rs-profbar');
    const m = location.pathname.match(/^\/user\/[^/]+\/?(?:([A-Za-z]+)\/?)?$/);
    if (!cfg.enabled || !m || /^comments$/i.test(m[1] || '') || isCommentsPage()) { old?.remove(); return; }
    if (old?.isConnected && old.dataset.url === location.href) return;
    const opts = document.querySelector('main rpl-dropdown[data-faceplate-tracking-context*="feed_options"], main button[aria-label="Feed options"]');
    const row = opts?.closest('shreddit-layout-event-setter')?.parentElement;
    old?.remove();
    if (!row) return;
    row.classList.add('rs-prof-row');
    row.append(el('div', { id: 'rs-profbar', 'data-url': location.href }, [showImagesBtn()]));
  };
  const funnelBtn = () => {
    const funnel = el('button', { type: 'button', class: 'rs-funnel', title: 'Filter bar', 'aria-label': 'Show or hide the filter bar', 'aria-pressed': String(!!cfg.filterline), html: FUNNEL });
    funnel.onclick = () => { saveCfg({ filterline: !cfg.filterline }); applyEnabled(); };
    return funnel;
  };
  const sortTabs = () => {
    const old = document.getElementById('rs-sortbar');
    if (old?.isConnected && old.dataset.url === location.href) return;
    if (html.classList.contains('rs-classic')) { // old Reddit's list has its own bar
      if (old && !old.closest('#rs-classic')) old.remove();
      for (const f of document.querySelectorAll('#rs-filterline')) if (!f.closest('#rs-classic')) f.remove();
      return;
    }
    old?.remove(); document.getElementById('rs-filterline')?.remove();
    if (isCommentsPage()) return;
    // Subreddits and the home "Following" feed have a "Sort by" menu; "For You" only has the "View" menu.
    const dd = document.querySelector('shreddit-sort-dropdown[header-text="Sort by"]');
    const view = document.querySelector('shreddit-sort-dropdown[header-text="View"]');
    if (!dd && !view) return;
    // The tabs mirror Reddit's own sort menu: real links on subreddits, its own buttons on "Following".
    // The home "For You" feed has no sort menu, so it gets no tabs.
    const tabs = el('div', { id: 'rs-sorts', role: 'tablist', 'aria-label': 'Sort' });
    const items = dd ? [...dd.querySelectorAll('[slot="dropdown-items"] data[value]')] : [];
    for (const d of items) {
      const label = (d.querySelector('.text-body-2') || d).textContent.trim();
      if (!label) continue;
      const a = d.querySelector('a[href]');
      const on = !!d.querySelector('[aria-selected="true"], [rpl-selected]');
      const tab = el(a ? 'a' : 'button', { href: a?.getAttribute('href'), type: a ? null : 'button', role: 'tab', 'aria-selected': String(on), class: on ? 'rs-cur' : null, text: label });
      if (!a) {
        tab.onclick = () => {
          (d.querySelector('[tabindex]') || d.querySelector('li') || d).click();
          tabs.querySelectorAll('[role="tab"]').forEach((t) => { t.classList.toggle('rs-cur', t === tab); t.setAttribute('aria-selected', String(t === tab)); });
        };
      }
      tabs.append(tab);
    }
    tabs.append(funnelBtn(), showImagesBtn());
    const wrap = el('div', { id: 'rs-sortbar', 'data-url': location.href }, [tabs]);
    const holder = dd ? (dd.closest('div') || dd.parentElement) : (view.closest('shreddit-layout-event-setter') || view);
    holder.parentElement.insertBefore(wrap, holder);
    // Reddit's row is only as wide as its contents; let it stretch, then put the filter bar on its own line under it.
    const feedW = (document.querySelector('shreddit-feed') || document.querySelector('main'))?.getBoundingClientRect().width || 0;
    let row = wrap.parentElement;
    for (let i = 0; row && i < 4 && row.getBoundingClientRect().width < feedW * 0.9; row = row.parentElement, i++) row.classList.add('rs-grow');
    if (row && row !== document.body) { row.classList.add('rs-grow-row'); row.after(filterLine()); } else wrap.after(filterLine());
    // Some pages (custom feeds) keep an invisible placeholder at the start of that row: drop the empty space it leaves.
    if (row && row !== document.body) for (const k of row.children) if (!k.contains(wrap) && getComputedStyle(k).visibility === 'hidden') k.classList.add('rs-nospace');
    // On home the bar sits after Reddit's "For You / Following" tabs: give it a divider.
    const feedL = (document.querySelector('shreddit-feed') || document.querySelector('main'))?.getBoundingClientRect().left || 0;
    wrap.classList.toggle('rs-after-tabs', wrap.getBoundingClientRect().left - feedL > 40);
    paintFilters();
  };

  // ---------- filter bar (RES's "filterline") ----------
  // Each chip cycles: off -> show only matching posts -> hide matching posts -> off. Right-click turns it off.
  const FILTER_KEYS = ['nsfw', 'spoiler', 'visited', 'comments', 'expando', 'score'];
  const fdef = (k) => {
    const n = +cfg.filterScore || 0;
    return {
      nsfw: ['nsfw', 'no nsfw', 'NSFW posts'],
      spoiler: ['spoiler', 'no spoilers', 'spoilers'],
      visited: ['visited', 'not visited', 'posts you have opened'],
      comments: ['comments opened', 'comments not opened', 'posts whose comments you have opened'],
      expando: ['expando', 'no expando', 'posts with an expand button'],
      score: [`score > ${n}`, `score ≤ ${n}`, `posts with more than ${n} points`],
    }[k];
  };
  const fstate = (k) => (cfg.filters || {})[k] || 'off';
  const flag = (p, a) => p.hasAttribute(a) && p.getAttribute(a) !== 'false';
  // "Visited" = you opened the post from a RESpawn row, or opened its comments. Kept in this browser only.
  let seen = null;
  const seenMap = () => { if (!seen) { try { seen = JSON.parse(localStorage.getItem('rs-seen') || '{}'); } catch { seen = {}; } } return seen; };
  const markSeen = (id) => {
    if (!id) return;
    const m = seenMap(); m[id] = Date.now();
    const ids = Object.keys(m);
    if (ids.length > 4000) for (const old of ids.sort((a, b) => m[a] - m[b]).slice(0, ids.length - 3000)) delete m[old];
    try { localStorage.setItem('rs-seen', JSON.stringify(m)); } catch { /* storage full */ }
  };
  const commentsOpened = (id) => localStorage.getItem(`rs-visit-${id}`) !== null;
  const matches = (post, row, k) => {
    const id = post.id;
    switch (k) {
      case 'nsfw': return flag(post, 'nsfw') || flag(post, 'subreddit-nsfw');
      case 'spoiler': return flag(post, 'spoiler');
      case 'visited': return !!seenMap()[id] || commentsOpened(id);
      case 'comments': return commentsOpened(id);
      case 'expando': return !!row.querySelector('.rs-x');
      case 'score': return (+post.getAttribute('score') || 0) > (+cfg.filterScore || 0);
      default: return false;
    }
  };
  // A row is judged once per filter setting, so a post never vanishes the moment you open it.
  let fVer = 0;
  const applyFilters = () => {
    const on = FILTER_KEYS.filter((k) => fstate(k) !== 'off');
    let hidden = 0;
    for (const row of document.querySelectorAll('.rs-row')) {
      const post = row.rsPost;
      if (!post) continue;
      if (row.rsFv !== fVer) {
        row.rsFv = fVer;
        row.rsHide = blocked(post) || on.some((k) => (fstate(k) === 'only' ? !matches(post, row, k) : matches(post, row, k)));
        row.classList.toggle('rs-filtered', row.rsHide);
        row.classList.toggle('rs-ignored', ignored(post.getAttribute('author')));
      }
      if (row.rsHide) hidden++;
    }
    const count = document.querySelector('#rs-filterline .rs-fl-count');
    const txt = hidden ? `${hidden} hidden` : '';
    if (count && count.textContent !== txt) count.textContent = txt;
    document.querySelector('#rs-sorts .rs-funnel')?.classList.toggle('rs-fl-active', on.length > 0);
    const clear = document.querySelector('#rs-filterline .rs-fl-clear');
    if (clear) clear.hidden = !on.length;
  };
  const paintFilters = () => {
    for (const chip of document.querySelectorAll('#rs-filterline .rs-chip')) {
      const k = chip.dataset.f, s = fstate(k), [label, not, what] = fdef(k);
      chip.dataset.state = s;
      chip.textContent = s === 'only' ? `only ${label}` : s === 'hide' ? not : label;
      chip.title = s === 'only' ? `Showing only ${what}. Click to hide them instead. Right-click to turn off.`
        : s === 'hide' ? `Hiding ${what}. Click to turn off.`
          : `Click to show only ${what}. Click again to hide them.`;
    }
  };
  const refilter = () => { fVer++; seen = null; paintFilters(); applyFilters(); };
  const setFilter = (k, s) => { saveCfg({ filters: { ...(cfg.filters || {}), [k]: s } }); refilter(); };
  const filterLine = () => {
    const bar = el('div', { id: 'rs-filterline', role: 'toolbar', 'aria-label': 'Filter posts' }, [el('span', { class: 'rs-fl-icon', html: FUNNEL })]);
    for (const k of FILTER_KEYS) {
      const chip = el('button', { type: 'button', class: 'rs-chip', 'data-f': k });
      chip.onclick = () => setFilter(k, { off: 'only', only: 'hide', hide: 'off' }[fstate(k)]);
      chip.oncontextmenu = (e) => { e.preventDefault(); setFilter(k, 'off'); };
      bar.append(chip);
    }
    const clear = el('button', { type: 'button', class: 'rs-fl-clear', text: 'Clear', hidden: true });
    clear.onclick = () => { saveCfg({ filters: {} }); refilter(); };
    const lists = el('button', { type: 'button', class: 'rs-fl-lists', title: 'Hide posts by words in the title, by subreddit or by website', 'aria-label': 'Hide words, subs, sites' },
      [el('span', { class: 'rs-fl-plus', 'aria-hidden': 'true', text: '+' }), el('span', { class: 'rs-fl-long', text: ' Hide words, subs, sites' }), el('span', { class: 'rs-fl-brief', text: ' Hide…' })]);
    lists.onclick = (e) => { e.stopPropagation(); openBlockEditor(); };
    bar.append(el('span', { class: 'rs-fl-count', role: 'status' }), clear, lists);
    return bar;
  };

  // ---------- sort tabs and filter bar stay on one line ----------
  // Ryan: the tabs broke mid-word ("Bes / t") in a narrow window, and the filter bar "should always be on one line".
  // When the tabs run out of room they first tighten, then Show images, the time range and the last tabs (never the one
  // you are on) fold into a More menu. The filter bar first shortens its last button to "Hide…", and past that its
  // chips slide sideways inside the bar. Checked when the width or the font changes, not on every pass.
  const MORE = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4.5" cy="10" r="1.6" fill="currentColor"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/><circle cx="15.5" cy="10" r="1.6" fill="currentColor"/></svg>';
  const fitsIn = (box) => { const r = box.getBoundingClientRect(), pad = parseFloat(getComputedStyle(box).paddingRight) || 0; return [...box.children].every((k) => !k.getClientRects().length || k.getBoundingClientRect().right <= r.right - pad + 0.5); };
  const fontNow = () => (html.className.match(/rs-font-\w+/) || [''])[0];
  const closeMore = () => { const m = document.querySelector('.rs-more-menu:not([hidden])'); if (m) { m.hidden = true; m.rsBtn?.setAttribute('aria-expanded', 'false'); } };
  document.addEventListener('click', (e) => { if (e.isTrusted && !e.target.closest?.('.rs-more, .rs-more-menu')) closeMore(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.querySelector('.rs-more-menu:not([hidden])')) { closeMore(); e.stopPropagation(); } }, true);
  const fitSorts = () => {
    const bar = document.getElementById('rs-sorts'), wrap = bar?.parentElement;
    if (!bar?.isConnected || !wrap || !bar.offsetWidth) return;
    const sig = `${bar.clientWidth}|${fontNow()}|${innerWidth <= PHONE}`;
    if (bar.rsFit === sig) return;
    bar.rsFit = sig;
    let more = bar.querySelector(':scope > .rs-more'), menu = wrap.querySelector(':scope > .rs-more-menu');
    if (!bar.rsAll) bar.rsAll = [...bar.children];
    // everything back in its place, then fold only as much as needed
    closeMore();
    for (const k of bar.rsAll) bar.insertBefore(k, more); // in their first order (a folded one would come back last)
    if (more) more.hidden = true;
    bar.classList.remove('rs-tight');
    if (innerWidth <= PHONE || fitsIn(bar)) return; // phone widths keep their own swipe-along tabs
    bar.classList.add('rs-tight');
    if (fitsIn(bar)) return;
    if (!more) {
      more = el('button', { type: 'button', class: 'rs-more', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, [el('span', { class: 'rs-more-i', html: MORE }), 'More']);
      menu = el('div', { class: 'rs-more-menu', hidden: true });
      menu.rsBtn = more;
      more.onclick = () => { const open = menu.hidden; closeMore(); menu.hidden = !open; more.setAttribute('aria-expanded', String(open)); };
      menu.addEventListener('click', (e) => { if (e.target.closest('a, button')) setTimeout(closeMore, 0); });
      bar.append(more); wrap.append(menu);
    }
    more.hidden = false;
    const feeds = [...bar.querySelectorAll('.rs-cl-feed')], div = bar.querySelector('.rs-cl-div');
    const order = [bar.querySelector('.rs-expand-all'), bar.querySelector('.rs-cl-time'), ...[...bar.querySelectorAll('[role="tab"]:not(.rs-cur)')].reverse(), ...feeds.reverse()].filter(Boolean);
    const out = [];
    for (const k of order) {
      if (fitsIn(bar)) break;
      out.push(k); k.remove();
      if (feeds.includes(k) && div?.parentElement === bar) { out.push(div); div.remove(); }
    }
    menu.replaceChildren(...out.sort((a, b) => bar.rsAll.indexOf(a) - bar.rsAll.indexOf(b)));
  };
  const fitFilters = () => {
    const bar = document.getElementById('rs-filterline');
    if (!bar?.isConnected || !bar.offsetWidth) return;
    const sig = `${bar.clientWidth}|${fontNow()}|${bar.textContent}`;
    if (bar.rsFit === sig) return;
    bar.rsFit = sig;
    bar.classList.remove('rs-fl-tight');
    if (!fitsIn(bar)) bar.classList.add('rs-fl-tight');
  };
  const fitBars = () => { fitSorts(); fitFilters(); };

  // ---------- your hide lists (RES's filteReddit): words in titles, subreddits, websites ----------
  // Words match whole words or phrases, any capitals. A hidden subreddit still shows when you visit it. A website
  // covers its subdomains (x.com covers mobile.x.com).
  const clip = (v, n) => String(v || '').slice(0, n);
  const parseWords = (t) => [...new Map(String(t).split(/[\n,]+/).map((w) => clip(w.trim().replace(/\s+/g, ' '), 60)).filter(Boolean).map((w) => [w.toLowerCase(), w])).values()].slice(0, 300);
  const parseSites = (t) => [...new Set(String(t).split(/[\s,]+/).map((x) => x.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '')).filter((x) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(x)))].slice(0, 300);
  const parseSubList = (t) => [...new Set(String(t).split(/[\s,]+/).map((x) => cleanSub(x).toLowerCase()).filter(validSub))].slice(0, 300);
  const blockCount = () => (cfg.blockWords || []).length + (cfg.blockSubs || []).length + (cfg.blockSites || []).length;
  let wordRe = { key: null, re: null };
  const wordsRe = () => {
    const key = (cfg.blockWords || []).join('\n');
    if (wordRe.key !== key) {
      const esc = (cfg.blockWords || []).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
      wordRe = { key, re: esc.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${esc.join('|')})(?![\\p{L}\\p{N}])`, 'iu') : null };
    }
    return wordRe.re;
  };
  const siteOf = (post) => { try { return new URL(post.getAttribute('content-href') || '', location.origin).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
  const blocked = (post) => {
    const re = wordsRe();
    if (re && re.test(post.getAttribute('post-title') || '')) return true;
    const sub = String(post.getAttribute('subreddit-name') || post.getAttribute('subreddit-prefixed-name') || '').replace(/^r\//i, '').toLowerCase();
    if (sub && (cfg.blockSubs || []).includes(sub) && (subOf() || '').toLowerCase() !== sub) return true;
    const sites = cfg.blockSites || [];
    if (sites.length) {
      const hosts = [String(post.getAttribute('domain') || '').toLowerCase(), siteOf(post)].filter(Boolean);
      if (hosts.some((h) => sites.some((x) => h === x || h.endsWith(`.${x}`)))) return true;
    }
    return false;
  };
  const toggleBlockSub = (sub) => {
    const k = sub.toLowerCase(), l = cfg.blockSubs || [], on = l.includes(k);
    saveCfg({ blockSubs: on ? l.filter((x) => x !== k) : [...l, k] }); refilter();
    toast(on ? `Posts from r/${sub} show in your feeds again.` : `Hiding r/${sub} from your feeds. It still shows when you visit it.`);
  };
  let blockEd = null;
  const closeBlockEditor = () => { if (blockEd?.rsSave) blockEd.rsSave(); blockEd?.remove(); blockEd = null; document.removeEventListener('keydown', blockEdEsc, true); };
  const blockEdEsc = (e) => { if (e.key === 'Escape') closeBlockEditor(); };
  const openBlockEditor = () => {
    closeMySubs();
    if (blockEd) return closeBlockEditor();
    blockEd = el('div', { id: 'rs-blocked', class: 'rs-modal', role: 'dialog', 'aria-label': 'Hide posts by word, subreddit or website' });
    const x = el('button', { type: 'button', class: 'rs-panel-x', 'aria-label': 'Close', html: ICON.close });
    x.onclick = closeBlockEditor;
    const field = (label, tip, value, ph) => {
      const ta = el('textarea', { class: 'rs-ed-subs', rows: '3', placeholder: ph, 'aria-label': label, spellcheck: 'false' });
      ta.value = value;
      return [ta, el('label', { class: 'rs-bl-field' }, [el('b', { text: label }), el('span', { class: 'rs-ed-tip', text: tip }), ta])];
    };
    const [words, wBox] = field('Words in titles', 'Whole words or phrases, separated by commas or new lines.', (cfg.blockWords || []).join(', '), 'For example: trailer, leaked');
    const [subs, sBox] = field('Subreddits', 'Still shown when you visit that subreddit.', (cfg.blockSubs || []).join(', '), 'For example: politics, news');
    const [sites, xBox] = field('Websites', 'A site covers its subdomains.', (cfg.blockSites || []).join(', '), 'For example: x.com, tiktok.com');
    const msg = el('span', { class: 'rs-ed-count', role: 'status' });
    const save = () => {
      saveCfg({ blockWords: parseWords(words.value), blockSubs: parseSubList(subs.value), blockSites: parseSites(sites.value) });
      words.value = cfg.blockWords.join(', '); subs.value = cfg.blockSubs.join(', '); sites.value = cfg.blockSites.join(', '); // shows how it was read
      refilter();
      const n = document.querySelectorAll('.rs-row.rs-filtered').length;
      msg.textContent = n ? `${n} post${n === 1 ? '' : 's'} hidden on this page` : '';
    };
    blockEd.rsSave = save;
    for (const ta of [words, subs, sites]) ta.addEventListener('change', save);
    const done = el('button', { type: 'button', class: 'rs-done', text: 'Done' });
    done.onclick = closeBlockEditor;
    blockEd.append(el('div', { class: 'rs-panel-head' }, [el('b', { text: 'Hide posts' }), x]), wBox, sBox, xBox, el('div', { class: 'rs-panel-foot' }, [msg, done]));
    document.body.append(blockEd);
    save();
    words.focus();
    setTimeout(() => document.addEventListener('keydown', blockEdEsc, true), 0);
  };
  const trackOpens = (e) => {
    const a = e.target.closest?.('a');
    const row = a?.closest('.rs-row');
    if (row && !a.closest('.rs-by')) markSeen(row.dataset.rsId);
  };
  document.addEventListener('click', trackOpens, true);
  document.addEventListener('auxclick', trackOpens, true);

  // ---------- endless scrolling with a pause (RES's "Never-Ending Reddit") ----------
  // Reddit loads the next page by itself near the bottom of a feed. Each page gets a small "Page N" divider, like RES,
  // and every N pages (a setting) RESpawn holds Reddit's loader back behind a "Load more" button, which hands it back.
  const LOADER = ':scope > faceplate-partial[slot="load-after"]';
  const releaseHolds = () => { for (const b of document.querySelectorAll('.rs-pause button')) b.click(); };
  const pager = () => {
    const feed = isCommentsPage() || html.classList.contains('rs-classic') ? null : document.querySelector('shreddit-feed');
    const p = feed?.querySelector(LOADER);
    if (!p || p.id === feed.rsLoader) return;
    const first = feed.rsLoader === undefined;
    feed.rsLoader = p.id;
    // Reddit draws only a few posts at first and loads the rest of page 1 straight away: that load is still page 1.
    feed.rsPages = first ? (feed.querySelectorAll('shreddit-post').length < 10 ? 0 : 1) : (feed.rsPages || 0) + 1;
    if (!cfg.enabled || !feed.rsPages) return;
    p.before(el('div', { class: 'rs-page', 'aria-hidden': 'true', text: `Page ${feed.rsPages + 1}` }));
    const every = +cfg.pauseEvery || 0;
    if (!every || feed.rsPages % every) return;
    const go = el('button', { type: 'button', class: 'rs-btn', text: 'Load more' });
    const bar = el('div', { class: 'rs-pause', role: 'status' }, [el('span', { text: `Paused after ${feed.rsPages} pages.` }), go]);
    go.onclick = () => { p.setAttribute('loading', 'eager'); bar.replaceWith(p); }; // eager = Reddit loads it right away
    p.replaceWith(bar);
  };

  // ---------- videos: at most N playing at once (RES's limit) ----------
  // Starting one more pauses the one that started first. Players RESpawn can't pause (some outside sites) are closed.
  const playing = []; // oldest first: { key, pause }
  const vStop = (key) => { const i = playing.findIndex((x) => x.key === key); if (i >= 0) playing.splice(i, 1); };
  const vTrim = () => { const max = +cfg.maxVideos || 0; while (cfg.enabled && max > 0 && playing.length > max) { const old = playing.shift(); try { old.pause(); } catch { /* already gone */ } } };
  const vStart = (key, pause) => { vStop(key); playing.push({ key, pause }); vTrim(); };
  // Reddit's player keeps its <video> inside its own sealed-off part of the page, which RESpawn can still look into.
  const deepVideos = (root, out, depth = 0) => {
    for (const v of root.querySelectorAll('video')) out.push(v);
    if (depth < 3) for (const x of root.querySelectorAll('*')) if (x.shadowRoot) deepVideos(x.shadowRoot, out, depth + 1);
    return out;
  };
  const watchVideos = () => {
    if (!cfg.enabled || !(+cfg.maxVideos > 0)) return;
    const vids = [...document.querySelectorAll('video')];
    for (const pl of document.querySelectorAll('shreddit-player, shreddit-player-2')) if (pl.shadowRoot && pl.getClientRects().length) deepVideos(pl.shadowRoot, vids);
    for (const v of vids) {
      if (v.rsWatched) continue;
      v.rsWatched = true;
      const start = () => { if (v.getClientRects().length) vStart(v, () => v.pause()); }; // hidden players don't count
      v.addEventListener('play', start);
      v.addEventListener('pause', () => vStop(v));
      v.addEventListener('ended', () => vStop(v));
      if (!v.paused) start();
    }
  };
  // Highest quality: Reddit's player (post pages, and rows where RESpawn shows Reddit's own) plays one of several ready-made
  // files of a video, picked by the player's size and the connection, or a stream that starts low and climbs. Once it
  // has started, it is moved to the best file once, at the same moment and still playing or paused as it was. (RESpawn's
  // own player in rows already plays Reddit's best file, the one its post details name.)
  const PACKED = /^https:\/\/packaged-media\.redd\.it\/[^?]+\.mp4(\?|$)/;
  const pinTop = (pl, v) => {
    const cur = v.currentSrc || '';
    if (v.rsTop || !cur || cur.startsWith('blob:')) return; // not started, or a stream run by Reddit's own code (left alone)
    let files;
    try { files = JSON.parse(pl.getAttribute('packaged-media-json') || '{}').playbackMp4s?.permutations?.map((x) => x.source).filter((x) => PACKED.test(x?.url || '') && x.dimensions); } catch { return; }
    v.rsTop = true;
    if (!files?.length) return;
    const path = (u) => u.split('?')[0], area = (x) => x.dimensions.width * x.dimensions.height;
    const now = files.find((x) => path(x.url) === path(cur));
    if (!now && !/\.m3u8(\?|$)/.test(cur)) return; // something else: leave it
    const vp9 = (x) => /\/m2-vp9-/.test(x.url);
    const same = files.filter((x) => (now ? vp9(x) === vp9(now) : !vp9(x))).sort((a, b) => area(b) - area(a))[0];
    if (!same || (now && area(same) <= area(now))) return;
    const t = v.currentTime, playing = !v.paused;
    v.addEventListener('loadedmetadata', () => { try { v.currentTime = t; } catch { /* not seekable */ } }, { once: true });
    v.src = same.url;
    if (playing) v.play().catch(() => {}); // (Reddit's player loads nothing ahead, so it only loads once asked to play)
  };
  const topQuality = () => {
    for (const pl of document.querySelectorAll('shreddit-player, shreddit-player-2')) {
      const v = pl.shadowRoot?.querySelector('video');
      if (!v || v.rsTop) continue;
      if (v.currentSrc) pinTop(pl, v);
      else if (!v.rsTopWait) { v.rsTopWait = true; v.addEventListener('loadedmetadata', () => pinTop(pl, v), { once: true }); }
    }
  };
  setInterval(() => { watchVideos(); if (cfg.enabled) topQuality(); }, 1500);
  // YouTube and Vimeo players say when they play or pause, and take a pause request, through messages.
  const YT_ORIGIN = 'https://www.youtube-nocookie.com', VIMEO_ORIGIN = 'https://player.vimeo.com';
  const frameSay = (f, msg) => { try { f.contentWindow?.postMessage(JSON.stringify(msg), f.rsOrigin); } catch { /* closed */ } };
  window.addEventListener('message', (e) => {
    if (e.origin !== YT_ORIGIN && e.origin !== VIMEO_ORIGIN) return;
    const f = [...document.querySelectorAll('iframe.rs-yt')].find((x) => x.contentWindow === e.source);
    if (!f) return;
    let d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
    if (!d || typeof d !== 'object') return;
    if (e.origin === VIMEO_ORIGIN) {
      if (d.event === 'ready') for (const ev of ['play', 'pause', 'ended']) frameSay(f, { method: 'addEventListener', value: ev });
      else if (d.event === 'play') vStart(f, f.rsPause);
      else if (d.event === 'pause' || d.event === 'ended') vStop(f);
      return;
    }
    const st = d.event === 'onStateChange' ? d.info : d.info?.playerState;
    if (st === 1) vStart(f, f.rsPause); else if (st === 0 || st === 2) vStop(f);
  });

  // ---------- expando: open the post's content right in the feed ----------
  const ytId = (url) => {
    try {
      const u = new URL(url);
      if (/(^|\.)youtu\.be$/.test(u.hostname)) return u.pathname.slice(1).split('/')[0];
      if (/(^|\.)youtube\.com$/.test(u.hostname)) return u.searchParams.get('v') || (u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/) || [])[2];
    } catch { /* not a url */ }
    return null;
  };
  // Outside video sites whose players Reddit's own page allows (it blocks the rest, such as X). Twitch's player is blocked
  // too, but a Twitch clip plays through Reddit's own player page for the post (redditmedia.com), as on old Reddit.
  const urlOf = (href) => { try { const u = new URL(href); return { h: u.hostname.replace(/^(www|m)\./, ''), p: u.pathname, u }; } catch { return null; } };
  const embedOf = (href, postId) => {
    const x = urlOf(href);
    if (!x) return null;
    const { h, p } = x;
    let m;
    if (postId && (h === 'clips.twitch.tv' || (h === 'twitch.tv' && /^\/(?:\w+\/)?clip\/[\w-]+/.test(p)))) return { src: `https://www.redditmedia.com/mediaembed/${postId.replace(/^t3_/, '')}` };
    if (h === 'streamable.com' && (m = p.match(/^\/(?:[eo]\/)?([a-z0-9]{4,12})\/?$/i))) return { src: `https://streamable.com/e/${m[1]}?autoplay=1`, plays: true };
    if (h === 'vimeo.com' && (m = p.match(/^\/(\d{5,})(?:\/([a-f0-9]{6,}))?\/?$/))) return { src: `${VIMEO_ORIGIN}/video/${m[1]}?autoplay=1${m[2] ? `&h=${m[2]}` : ''}`, origin: VIMEO_ORIGIN };
    if (h === 'player.vimeo.com' && (m = p.match(/^\/video\/(\d{5,})/))) return { src: `${VIMEO_ORIGIN}/video/${m[1]}?autoplay=1`, origin: VIMEO_ORIGIN };
    if (/^(v3\.)?redgifs\.com$/.test(h) && (m = p.match(/^\/(?:watch|ifr)\/([a-z]+)/i))) return { src: `https://www.redgifs.com/ifr/${m[1].toLowerCase()}`, plays: true };
    if (h === 'tiktok.com' && (m = p.match(/\/video\/(\d{8,})/))) return { src: `https://www.tiktok.com/embed/v2/${m[1]}`, tall: true };
    if (h === 'instagram.com' && (m = p.match(/^\/(p|reel|tv)\/([\w-]{5,})/))) return { src: `https://www.instagram.com/${m[1]}/${m[2]}/embed/`, tall: true };
    return null;
  };
  // Pictures on other sites: direct picture links, Imgur and Giphy (their short videos open as moving pictures).
  const picOf = (href) => {
    const x = urlOf(href);
    if (!x || x.u.protocol !== 'https:') return '';
    const { h, p } = x;
    let m;
    if (h === 'i.imgur.com' && (m = p.match(/^\/(\w{5,8})\.(gifv|mp4|webm)$/i))) return `https://i.imgur.com/${m[1]}.gif`;
    if (h === 'imgur.com' && (m = p.match(/^\/(\w{5,8})\/?$/))) return `https://i.imgur.com/${m[1]}.jpg`;
    if (/(^|\.)giphy\.com$/.test(h) && !/\.gif$/i.test(p) && (m = p.match(/^\/(?:gifs|media|clips)\/(?:[\w-]*-)?([a-zA-Z0-9]{8,})(?:\/|$)/))) return `https://i.giphy.com/${m[1]}.gif`;
    if (/\.(jpe?g|png|gif|webp)$/i.test(p)) return x.u.href;
    return '';
  };
  const kindOf = (post) => {
    if (post.rsJson) return clKind(post.rsJson);
    const type = post.getAttribute('post-type') || '';
    const href = post.getAttribute('content-href') || '';
    const media = post.querySelector(':scope > [slot="post-media-container"]');
    if ((type === 'text' || type === 'multi_media') && post.querySelector('shreddit-post-text-body')) return 'text';
    if (ytId(href)) return 'youtube';
    if (type === 'video' && media?.querySelector('shreddit-player, shreddit-player-2, video')) return 'video';
    if (type === 'gallery' && media) return 'gallery';
    if (type === 'image' && media) return 'image';
    if (type === 'crosspost' && media) return 'gallery';
    if (embedOf(href, post.id)) return 'embed';
    if (picOf(href)) return 'image';
    if (media?.querySelector('shreddit-embed')) return 'rembed'; // Reddit's own player for another site
    return null;
  };
  // ---------- opened pictures, galleries and videos: sizes, drag to resize ----------
  // Reddit keeps a few smaller copies of each of its pictures besides the original. The smallest copy that is still sharp
  // at the size it is shown is used: an original can be a phone photo of several megabytes, which made each picture of a
  // gallery slow to come up. (sizes: [{ u, w }] smallest first, the original last)
  const sharp = (sizes, w) => { const need = w * Math.min(devicePixelRatio || 1, 2); return sizes.find((s) => s.w >= need) || sizes[sizes.length - 1]; };
  const srcsetSizes = (img) => (img?.getAttribute('srcset') || '').split(',').map((s) => s.trim().split(/\s+/))
    .filter(([u, w]) => FLAIR_IMG.test(u || '') && /^\d+w$/.test(w || '')).map(([u, w]) => ({ u, w: parseInt(w, 10) })).sort((a, b) => a.w - b.w);
  const mediaMaxH = () => Math.round(innerHeight * 0.75);
  // How big a w x h picture shows in `room` pixels: never past its own size or 75% of the window's height, unless you
  // have resized it yourself (then it is exactly as wide as you made it).
  const fitSize = (w, h, room, zoomed) => {
    const r = w && h ? h / w : 0.75;
    let dw = zoomed ? room : Math.min(room, w || room);
    if (!zoomed && dw * r > mediaMaxH()) dw = mediaMaxH() / r;
    return { w: Math.round(dw), h: Math.round(dw * r) };
  };
  // Drag to resize (RES): dragging on a picture, on a video above its controls, or on the grip at its bottom-right corner
  // makes it bigger or smaller as you move, keeping its shape, up to the right edge of the window. The grip sits right on
  // the corner's edge and shows while the pointer is on the picture; double-click it for the normal size again. A click
  // without a drag still does what it always did (opens the picture, plays the video), and nothing gets selected or
  // dragged out as a file. o: width() its width now, set(w), reset(), done() after a drag, surface (where a drag may
  // start besides the grip), controls (the height of a video's own control bar, left to the video).
  // The grip is 26 px square and hangs 8 px past the corner, so its lines sit just inside the corner (18, 18).
  const GRIP_ICON = '<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M17 8 8 17M17 13l-4 4" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="4" stroke-linecap="round"/><path d="M17 8 8 17M17 13l-4 4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';
  const zoomable = (wrap, o) => {
    const grip = el('span', { class: 'rs-grip', title: 'Drag to resize · double-click for normal size', html: GRIP_ICON });
    wrap.classList.add('rs-zoom');
    wrap.append(grip);
    grip.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); wrap.classList.remove('rs-zoomed'); o.reset(); });
    const begin = (e, onGrip) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (!onGrip && o.controls && e.clientY > o.surface.getBoundingClientRect().bottom - o.controls) return;
      e.preventDefault();
      const box = wrap.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, w0 = o.width();
      const diag = (x, y) => Math.hypot(Math.max(1, x - box.left), Math.max(1, y - box.top));
      const d0 = diag(x0, y0);
      let moved = false, frame = 0, last = e;
      const apply = () => { frame = 0; const room = document.documentElement.clientWidth - box.left - 12; o.set(Math.round(Math.max(120, Math.min(room, w0 * diag(last.clientX, last.clientY) / d0)))); };
      const move = (ev) => {
        if (!(ev.buttons & 1)) { stop(); return; }
        last = ev;
        if (!moved) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
          moved = true; html.classList.add('rs-resizing'); wrap.classList.add('rs-zoomed');
        }
        if (!frame) frame = requestAnimationFrame(apply);
      };
      const stop = () => {
        window.removeEventListener('mousemove', move, true); window.removeEventListener('mouseup', stop, true);
        if (!moved) return;
        if (frame) { cancelAnimationFrame(frame); apply(); }
        html.classList.remove('rs-resizing');
        // the click that ends a drag opens nothing and doesn't start the video
        const eat = (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); };
        window.addEventListener('click', eat, true); setTimeout(() => window.removeEventListener('click', eat, true), 0);
        o.done?.();
      };
      window.addEventListener('mousemove', move, true); window.addEventListener('mouseup', stop, true);
    };
    grip.addEventListener('mousedown', (e) => { e.stopPropagation(); begin(e, true); });
    if (o.surface) { o.surface.addEventListener('mousedown', (e) => begin(e, false)); o.surface.addEventListener('dragstart', (e) => e.preventDefault()); }
  };
  // A picture in a row. info { w, h, sizes } (Reddit's own pictures) lets it take its room before it loads, in the copy
  // that is sharp at that size; a picture made bigger by hand gets a sharper copy once you let go.
  const picture = (box, src, href, alt, info = {}) => {
    const { w, h, sizes } = info;
    const fit = w && h ? fitSize(w, h, box.clientWidth || 700, false) : null;
    let cur = fit && sizes?.length ? sharp(sizes, fit.w) : null;
    const img = el('img', { class: 'rs-media-img', src: cur ? cur.u : src, alt: alt || '', draggable: 'false' });
    const a = el('a', { href: href || src, target: '_blank', rel: 'noopener' }, [img]);
    const wrap = el('div', { class: fit ? 'rs-pic rs-sized' : 'rs-pic' }, [a]);
    const normal = () => { wrap.style.width = fit ? `min(100%, ${fit.w}px)` : ''; wrap.style.maxWidth = ''; };
    if (fit) { normal(); img.style.aspectRatio = `${w} / ${h}`; }
    img.onerror = () => wrap.replaceWith(el('p', { class: 'rs-media-err' }, ['That picture would not load here. ', el('a', { href: href || src, target: '_blank', rel: 'noopener', text: 'Open it' })]));
    zoomable(wrap, {
      surface: a, width: () => wrap.getBoundingClientRect().width, reset: normal,
      set: (px) => { wrap.style.width = `${px}px`; wrap.style.maxWidth = 'none'; },
      done: () => {
        if (!cur) return;
        const want = sharp(sizes, wrap.getBoundingClientRect().width);
        if (want.w <= cur.w) return;
        const big = new Image(); big.src = want.u;
        big.decode().then(() => { img.src = want.u; cur = want; }, () => { /* keeps the copy it has */ });
      },
    });
    box.append(wrap);
  };
  // A gallery: previous, count and next on a bar above the picture, so they stay put whatever size the pictures are.
  // Each picture is fetched in the copy that is sharp at the size it shows and is fully drawn before it swaps in: the
  // next and previous ones ahead of time, the rest one after another once the first is up (opened by "Show images":
  // once you point at it). The picture area keeps the height of the tallest picture, so the page under it never jumps.
  // The left and right arrow keys turn it while the pointer is on it or its row is picked.
  // items: [{ w, h, sizes, full }]
  const CHEV_L = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHEV_R = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let galHover = null;
  const gallery = (box, items, title, quiet) => {
    let i = 0, W = 0, zoomed = false, seq = 0, rest = false, resting = false;
    const pics = [];
    const prev = el('button', { type: 'button', class: 'rs-gal-btn', title: 'Previous picture', 'aria-label': 'Previous picture', html: CHEV_L });
    const next = el('button', { type: 'button', class: 'rs-gal-btn', title: 'Next picture', 'aria-label': 'Next picture', html: CHEV_R });
    const count = el('span', { class: 'rs-gal-n', 'aria-live': 'polite' });
    const link = el('a', { class: 'rs-gal-link', target: '_blank', rel: 'noopener' });
    const stage = el('div', { class: 'rs-gal-stage' }, [link]);
    const root = el('div', { class: 'rs-gal' }, [items.length > 1 ? el('div', { class: 'rs-gal-nav' }, [prev, count, next]) : null, stage]);
    // The picture area is as wide as the picture on screen (the grip sits on its corner) and as tall as the tallest
    // picture when they are all about the same height; when they differ a lot (tall and wide ones mixed) it takes each
    // picture's own height instead of leaving a big gap under the wide ones (the bar on top stays put either way).
    let shownK = 0, steady = true, tallest = 0;
    const sizeOf = (k) => fitSize(items[k].w, items[k].h, zoomed ? W : (box.clientWidth || 700), zoomed);
    const place = (img, k) => {
      const s = sizeOf(k);
      shownK = k;
      if (img) { img.style.width = `${s.w}px`; img.style.height = `${s.h}px`; }
      stage.style.width = `${s.w}px`; stage.style.height = `${steady ? tallest : s.h}px`;
    };
    const layout = () => {
      const hs = items.map((_, k) => sizeOf(k).h);
      tallest = Math.max(...hs); steady = tallest <= Math.min(...hs) * 1.3;
      stage.style.maxWidth = zoomed ? 'none' : '';
      place(link.querySelector('img'), shownK);
    };
    // picture k in the copy sharp at its size; when it is shown bigger later, a sharper copy takes over once drawn
    const load = (k) => {
      if (k < 0 || k >= items.length) return null;
      const want = sharp(items[k].sizes, sizeOf(k).w), had = pics[k];
      if (had && (had.bad || had.size.w >= want.w)) return had;
      const img = new Image();
      img.decoding = 'async'; img.draggable = false; img.alt = title || ''; img.className = 'rs-gal-img';
      img.src = want.u;
      const p = { img, size: want, ok: false, bad: false };
      p.done = img.decode().then(() => { p.ok = true; }, () => { if (img.complete && img.naturalWidth) p.ok = true; else p.bad = true; });
      pics[k] = p;
      return p;
    };
    const show = (k) => {
      i = k;
      const my = ++seq, p = load(i);
      setText(count, `${i + 1} / ${items.length}`);
      prev.disabled = i === 0; next.disabled = i === items.length - 1;
      link.href = items[i].full;
      const put = () => {
        if (my !== seq) return; // turned again meanwhile
        stage.removeAttribute('aria-busy');
        if (p.bad) { link.replaceChildren(el('span', { class: 'rs-media-err', text: 'This picture would not load here. Click to open it.' })); return; }
        place(p.img, i);
        if (link.firstChild !== p.img) link.replaceChildren(p.img);
      };
      if (p.ok || p.bad) put(); else { stage.setAttribute('aria-busy', 'true'); p.done.then(put); }
      load(i + 1); load(i - 1);
    };
    const preloadRest = async () => {
      if (resting) return;
      rest = resting = true;
      for (let d = 2; d < items.length; d++) {
        for (const k of [i + d, i - d]) {
          if (!root.isConnected || box.hidden) { resting = false; return; }
          const p = load(k);
          if (p && !p.ok && !p.bad) await p.done;
        }
      }
      resting = false;
    };
    const step = (d) => { const k = i + d; if (k >= 0 && k < items.length) show(k); if (!rest) preloadRest(); };
    prev.onclick = () => step(-1);
    next.onclick = () => step(1);
    const api = { root, step, relayout: () => { if (!zoomed) layout(); } };
    root.rsGal = api;
    root.addEventListener('mouseenter', () => { galHover = api; if (!rest) preloadRest(); });
    root.addEventListener('mouseleave', () => { if (galHover === api) galHover = null; });
    zoomable(stage, {
      surface: link, width: () => stage.getBoundingClientRect().width,
      set: (w) => { zoomed = true; W = w; layout(); },
      reset: () => { zoomed = false; layout(); },
      done: () => show(i), // a sharper copy if it is bigger now
    });
    box.append(root);
    layout(); show(0);
    if (!quiet && items.length > 1) pics[0].done.then(() => setTimeout(() => { if (!rest) preloadRest(); }, 150));
  };
  window.addEventListener('resize', () => { clearTimeout(gallery.t); gallery.t = setTimeout(() => { for (const g of document.querySelectorAll('.rs-gal')) g.rsGal?.relayout(); }, 150); }, { passive: true });
  // "Show images" opens a video paused. Reddit's own player (shown when RESpawn can't read the post) may start by itself
  // when it comes on screen, so for a few seconds it is stopped again unless you pressed something in it.
  const holdStill = (box) => {
    box.addEventListener('pointerdown', () => { box.rsTouched = true; }, { capture: true, once: true });
    const t0 = Date.now(), iv = setInterval(() => {
      if (box.rsTouched || Date.now() - t0 > 8000) { clearInterval(iv); return; }
      for (const v of deepVideos(box, [])) if (!v.paused) { v.pause(); try { v.currentTime = 0; } catch { /* not seekable yet */ } }
    }, 200);
  };
  const player = (box, src, opts, close, title, quiet) => {
    // opened by "Show images": the player waits for its play button
    if (quiet) src = src.replace(/([?&])autoplay=1(&|$)/, (m, a, b) => (b ? a : '')).replace(/[?&]$/, '');
    const f = el('iframe', { class: `rs-yt${opts.tall ? ' rs-tall' : ''}`, src, title, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen' });
    f.rsOrigin = opts.origin || '';
    if (opts.origin === YT_ORIGIN) f.rsPause = () => frameSay(f, { event: 'command', func: 'pauseVideo', args: [] });
    else if (opts.origin === VIMEO_ORIGIN) f.rsPause = () => frameSay(f, { method: 'pause' });
    f.addEventListener('load', () => {
      if (opts.origin === YT_ORIGIN) frameSay(f, { event: 'listening', id: 1, channel: 'widget' });
      else if (opts.plays && !quiet) vStart(f, close); // plays by itself and can't be paused from here: closed when over the limit
    });
    // one that can't say when it plays, opened paused: pressing into it counts as starting it
    if (opts.plays && quiet) f.rsClose = close;
    if (opts.tall) { box.append(f); return; }
    const wrap = el('div', { class: 'rs-frame' }, [f]);
    const normal = () => { wrap.style.width = ''; wrap.style.maxWidth = ''; };
    zoomable(wrap, { width: () => wrap.getBoundingClientRect().width, reset: normal, set: (px) => { wrap.style.width = `${px}px`; wrap.style.maxWidth = 'none'; } });
    box.append(wrap);
  };
  window.addEventListener('blur', () => setTimeout(() => {
    const f = document.activeElement;
    if (f?.tagName === 'IFRAME' && f.rsClose && !playing.some((x) => x.key === f)) vStart(f, f.rsClose);
  }, 0));
  // The address a post's content comes from (its link, or for a crosspost the original's)
  const hrefOf = (post) => (post.rsJson ? clUrl(clMedia(post.rsJson)) : post.getAttribute('content-href') || '');
  // What "Show images" may open: pictures, galleries, Reddit's videos and the outside players that wait for their play
  // button (not ones that start by themselves, such as RedGifs, or players RESpawn knows nothing about).
  const quietOk = (post, kind) => {
    if (kind === 'image' || kind === 'gallery' || kind === 'video' || kind === 'youtube') return true;
    if (kind !== 'embed') return false;
    const e = embedOf(hrefOf(post), post.rsJson ? clMedia(post.rsJson).name : post.id);
    return !!e && !/redgifs\.com|redditmedia\.com/.test(e.src);
  };
  const fillBox = (box, post, kind, close, quiet) => {
    if (post.rsJson) { clFill(box, post, kind, close, quiet); box.dataset.filled = '1'; return; }
    const href = post.getAttribute('content-href') || '';
    const title = post.getAttribute('post-title') || 'Video';
    const media = post.querySelector(':scope > [slot="post-media-container"]');
    // Reddit's own player or carousel, moved into the row
    const moved = () => {
      const m = post.querySelector(':scope > [slot="post-media-container"]');
      if (!m) { box.append(el('p', { class: 'rs-media-err' }, ['Nothing to show here. ', el('a', { href: post.getAttribute('permalink') || '/', text: 'Open the post' })])); return; }
      if (quiet) for (const pl of m.querySelectorAll('shreddit-player, shreddit-player-2')) pl.removeAttribute('autoplay');
      m.classList.add('rs-moved-media'); box.append(m);
      if (quiet) holdStill(box);
      for (const t of [300, 1200, 3000]) setTimeout(watchVideos, t); // Reddit's player builds its video a moment later
    };
    if (kind === 'text') {
      const md = post.querySelector('shreddit-post-text-body [id$="-post-rtjson-content"], shreddit-post-text-body .md');
      const copy = md ? md.cloneNode(true) : el('p', { text: 'No text.' });
      copy.removeAttribute('id'); copy.className = 'rs-text md';
      box.append(copy);
    } else if (kind === 'youtube') {
      player(box, `${YT_ORIGIN}/embed/${ytId(href)}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`, { origin: YT_ORIGIN }, close, title, quiet);
    } else if (kind === 'embed') {
      const e = embedOf(href, post.id);
      player(box, e.src, e, close, title, quiet);
    } else if (kind === 'image' && picOf(href)) {
      // Reddit's own pictures list their smaller copies on the post's picture
      const pic = picOf(href), im = media?.querySelector('img[srcset]:not(.post-background-image-filter)');
      const w = +im?.getAttribute('width') || 0, h = +im?.getAttribute('height') || 0, sizes = srcsetSizes(im);
      const own = /^https:\/\/i\.redd\.it\//.test(pic) && !/\.gif$/i.test(pic) && w && h && sizes.length;
      picture(box, pic, href, title, own ? { w, h, sizes: [...sizes.filter((s) => s.w < w), { u: pic, w }] } : {});
    } else if (kind === 'video' || kind === 'gallery') {
      // Reddit's own videos and galleries open in RESpawn's player and gallery, as on old Reddit's lists, from the post's
      // details: they then resize, keep the gallery's bar on top and open paused for "Show images". Should Reddit not
      // send the details, its own player or carousel is shown instead.
      box.append(el('p', { class: 'rs-media-wait', text: 'Loading…' }));
      (post.rsFull ||= clFull({ id: post.id.replace(/^t3_/, '') })).then((d) => {
        const k = clKind(d);
        if (!(k === 'video' || k === 'image' || (k === 'gallery' && clMedia(d).is_gallery))) throw new Error('not ours');
        box.replaceChildren(); clFill(box, { rsJson: d }, k, close, quiet);
      }).catch(() => { post.rsFull = null; box.replaceChildren(); moved(); });
    } else moved(); // crossposts, other pictures
    box.dataset.filled = '1';
  };
  const XICON = { youtube: 'video', embed: 'video', rembed: 'video' };
  const xButton = (post, kind, row) => {
    const icon = XICON[kind] || kind;
    const label = { text: 'Show text', video: 'Play video', youtube: 'Play video', embed: 'Play video', rembed: 'Show', image: 'Show picture', gallery: 'Show pictures' }[kind];
    const b = el('button', { type: 'button', class: 'rs-x', 'data-kind': icon, 'aria-expanded': 'false', title: label, html: ICON[icon] });
    let box = null;
    const close = () => { if (b.getAttribute('aria-expanded') === 'true') b.click(); };
    // quiet: opened by "Show images", so a video waits for its play button
    const toggle = (open, quiet) => {
      if (!box) { box = el('div', { class: `rs-box rs-box-${kind}` }); row.append(box); }
      if (open && !box.dataset.filled) fillBox(box, post, kind, close, quiet);
      box.hidden = !open;
      if (open) box.querySelector('.rs-gal')?.rsGal?.relayout();
      if (!open) {
        for (const v of deepVideos(box, [])) v.pause();
        // an outside player is closed for good (some can't be paused); it loads again when opened again
        const frames = box.querySelectorAll('iframe.rs-yt');
        for (const f of frames) vStop(f);
        if (frames.length) { box.replaceChildren(); delete box.dataset.filled; }
      }
      b.setAttribute('aria-expanded', String(open));
      b.replaceChildren(svgOf(open ? ICON.close : ICON[icon]));
      b.title = open ? 'Close' : label;
    };
    b.onclick = (ev) => { ev?.preventDefault?.(); toggle(b.getAttribute('aria-expanded') !== 'true', false); };
    b.rsShow = (open, quiet) => { if ((b.getAttribute('aria-expanded') === 'true') !== open) toggle(open, quiet); };
    b.rsQuiet = quietOk(post, kind);
    return b;
  };

  // ---------- dense rows ----------
  // Votes go straight to Reddit with the same request its own button sends. (Reddit's own buttons
  // do nothing while the original post is hidden, so pressing them is not enough.)
  const csrf = () => (document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) || [])[1] || '';
  const voteStateOf = (post) => {
    if (post.rsJson) return post.rsJson.likes === true ? 'UP' : post.rsJson.likes === false ? 'DOWN' : 'NONE';
    const up = post.shadowRoot?.querySelector('button[upvote]'), down = post.shadowRoot?.querySelector('button[downvote]');
    return up?.getAttribute('aria-pressed') === 'true' ? 'UP' : down?.getAttribute('aria-pressed') === 'true' ? 'DOWN' : 'NONE';
  };
  // The same small requests Reddit's own buttons send (checked by watching its vote, Save and Hide).
  // Most take their values under "input"; a few (adding to or removing from a custom feed) take them as they are.
  const gql = async (operation, input, plain = false) => {
    const r = await fetch('/svc/shreddit/graphql', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation, variables: plain ? input : { input }, csrf_token: csrf() }),
    });
    if (!r.ok) throw new Error(`${operation} ${r.status}`);
    const j = await r.json().catch(() => ({}));
    const d = j?.data ? Object.values(j.data)[0] : null;
    if (j?.errors?.length || d?.ok === false || d?.errors?.length) {
      const err = new Error(`${operation} refused`);
      err.reddit = String(j?.errors?.[0]?.message || d?.errors?.[0]?.message || '').slice(0, 160);
      throw err;
    }
    return d;
  };
  const sendVote = (postId, voteState) => gql('UpdatePostVoteState', { postId, voteState });
  const toast = (msg) => {
    document.querySelectorAll('.rs-toast').forEach((t) => t.remove());
    const t = el('div', { class: 'rs-toast', role: 'status', text: msg });
    document.body.append(t); setTimeout(() => t.remove(), 3500);
  };
  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* no clipboard access: fall back */ }
    const ta = el('textarea', { readonly: true, style: 'position:fixed;left:-9999px;top:0' });
    ta.value = text; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* nothing else to try */ }
    ta.remove(); return ok;
  };
  const needLogin = (what) => { if (loggedIn() && csrf()) return false; toast(`Log in to Reddit to ${what}.`); return true; };

  // share / save / hide under each row, like old Reddit
  const shareBtn = (perma) => {
    const b = el('button', { type: 'button', text: 'share', title: 'Copy the link to this post' });
    b.onclick = async () => toast((await copyText(new URL(perma, location.origin).href)) ? 'Link copied.' : 'Could not copy the link.');
    return b;
  };
  const saveBtn = (post) => {
    const menu = () => post.querySelector('shreddit-post-overflow-menu'); // Reddit marks saved posts on its own "..." menu
    let saved = post.rsJson ? !!post.rsJson.saved : !!menu()?.hasAttribute('is-post-saved');
    const b = el('button', { type: 'button', class: 'rs-save' });
    const paint = () => { b.textContent = saved ? 'unsave' : 'save'; b.title = saved ? 'Remove from your saved posts' : 'Save this post'; };
    b.onclick = async () => {
      if (needLogin('save posts')) return;
      saved = !saved; paint(); b.disabled = true;
      try { await gql('UpdatePostSaveState', { postId: post.id, saveState: saved ? 'SAVED' : 'NONE' }); if (post.rsJson) post.rsJson.saved = saved; else menu()?.toggleAttribute('is-post-saved', saved); }
      catch { saved = !saved; paint(); toast('Reddit did not take that. Try again.'); }
      b.disabled = false;
    };
    paint(); return b;
  };
  const hideBtn = (post, row) => {
    const b = el('button', { type: 'button', class: 'rs-hide', text: 'hide', title: 'Hide this post' });
    b.onclick = async () => {
      if (needLogin('hide posts')) return;
      b.disabled = true;
      try { await gql('UpdatePostHideState', { postId: post.id, hideState: 'HIDDEN' }); } catch { b.disabled = false; toast('Reddit did not take that. Try again.'); return; }
      const undo = el('button', { type: 'button', text: 'Undo' });
      const note = el('div', { class: 'rs-hidden-note', role: 'status' }, [el('span', { text: 'Post hidden.' }), undo]);
      row.classList.add('rs-gone'); row.after(note); undo.focus();
      undo.onclick = async () => {
        undo.disabled = true;
        try { await gql('UpdatePostHideState', { postId: post.id, hideState: 'NONE' }); } catch { undo.disabled = false; toast('Reddit did not take that. Try again.'); return; }
        row.classList.remove('rs-gone'); note.remove(); b.disabled = false; b.focus();
      };
    };
    return b;
  };
  const voteBox = (post) => {
    const base = +post.getAttribute('score') || 0;
    let state = voteStateOf(post);
    const start = state === 'UP' ? base - 1 : state === 'DOWN' ? base + 1 : base; // score without my vote
    const up = el('button', { type: 'button', class: 'rs-up', title: 'Upvote', 'aria-label': 'Upvote', html: ICON.up });
    const down = el('button', { type: 'button', class: 'rs-down', title: 'Downvote', 'aria-label': 'Downvote', html: ICON.down });
    const score = el('div', { class: 'rs-score' });
    const box = el('div', { class: 'rs-vote' }, [up, score, down]);
    const ratio = parseFloat(post.getAttribute('upvote-ratio'));
    const paint = () => {
      box.dataset.vote = state;
      up.setAttribute('aria-pressed', String(state === 'UP'));
      down.setAttribute('aria-pressed', String(state === 'DOWN'));
      const v = start + (state === 'UP' ? 1 : state === 'DOWN' ? -1 : 0);
      score.textContent = num(v);
      score.title = `${v.toLocaleString()} point${v === 1 ? '' : 's'}${Number.isFinite(ratio) && ratio > 0 && ratio <= 1 ? `, ${Math.round(ratio * 100)}% upvoted` : ''}`;
    };
    const click = async (dir) => {
      if (!document.cookie.includes('csrf_token')) { toast('Log in to Reddit to vote.'); return; }
      const before = state;
      state = state === dir ? 'NONE' : dir;
      paint();
      try { await sendVote(post.id, state); } catch { state = before; paint(); toast('Reddit did not take that vote. Try again.'); }
    };
    up.onclick = () => click('UP');
    down.onclick = () => click('DOWN');
    paint();
    return box;
  };
  // Each post keeps the number it first got in this feed. Far down a feed Reddit unloads old posts and brings them back
  // when you scroll up again; they keep their number. (Reddit's own position count includes ads, so it skips numbers.)
  // Numbers start again on a new page, or when Reddit swaps in a different feed on the same page (For You / Following);
  // a feed it redraws after Back keeps them. Pinned posts sit outside the feed and count first.
  let rankBook = { key: '', feed: null, map: new Map() };
  const rankOf = (post) => {
    const key = location.pathname + location.search, feed = post.closest('shreddit-feed');
    if (rankBook.key !== key) rankBook = { key, feed, map: new Map() };
    else if (feed && rankBook.feed !== feed) {
      const firstPost = feed.querySelector('shreddit-post');
      if (rankBook.feed && firstPost && !rankBook.map.has(firstPost.id)) rankBook.map = new Map();
      rankBook.feed = feed;
    }
    const m = rankBook.map;
    if (!m.has(post.id)) m.set(post.id, m.size + 1);
    return m.get(post.id);
  };
  // When Reddit redraws a feed in a new order (For You / Following, or Home fetched fresh after Back) the kept numbers
  // stop running in order: then count again from the top. A post Reddit shows twice keeps its first number.
  // Reddit shows a pinned post twice, in "Community highlights" and again down the feed, which put its number in the
  // middle of the list a second time. Old Reddit shows it once, so the second copy is hidden while the first one is
  // on screen (folding the highlights away brings it back).
  const rankCheck = () => {
    if (html.classList.contains('rs-classic')) return;
    const rows = [], seen = new Set(), firstRow = new Map();
    for (const r of document.querySelectorAll('.rs-row')) {
      const id = r.rsPost?.id, f = r.closest('shreddit-feed');
      if (id) {
        const a = firstRow.get(id), dup = !!a && shown(a);
        if (!a) firstRow.set(id, r);
        if (r.classList.contains('rs-dup') !== dup) r.classList.toggle('rs-dup', dup);
      }
      if (id && !seen.has(id) && rankBook.map.has(id) && (!f || !rankBook.feed || f === rankBook.feed)) { seen.add(id); rows.push(r); }
    }
    if (rows.every((r, i) => i === 0 || rankBook.map.get(r.rsPost.id) > rankBook.map.get(rows[i - 1].rsPost.id))) return;
    rankBook.map = new Map(rows.map((r, i) => [r.rsPost.id, i + 1]));
    for (const r of document.querySelectorAll('.rs-row')) {
      const n = r.rsPost && rankBook.map.get(r.rsPost.id), box = r.querySelector('.rs-rank');
      if (n && box && box.textContent !== String(n)) box.textContent = String(n);
    }
  };
  // A post's tag from old Reddit's list data: its words, with the subreddit's little emoji pictures where the list data
  // has :codes: (":snoo_hearteyes: Wholesome Moments"). Pictures only from Reddit's own picture addresses.
  const FLAIR_IMG = /^https:\/\/([a-z0-9-]+\.)*(redditmedia\.com|redd\.it|redditstatic\.com)\//i;
  const flairOf = (J) => {
    const rich = Array.isArray(J.link_flair_richtext) ? J.link_flair_richtext : [];
    if (!rich.some((p) => p?.e === 'emoji')) { const t = (J.link_flair_text || '').trim(); return t ? el('span', { class: 'rs-flair', text: t }) : null; }
    const s = el('span', { class: 'rs-flair' });
    for (const p of rich) {
      if (p?.e === 'text' && p.t) s.append(p.t);
      else if (p?.e === 'emoji' && FLAIR_IMG.test(p.u || '')) s.append(el('img', { class: 'rs-flair-emoji', src: p.u, alt: '', loading: 'lazy' }));
    }
    if (s.firstChild?.nodeType === 3) s.firstChild.textContent = s.firstChild.textContent.trimStart();
    if (s.lastChild?.nodeType === 3) s.lastChild.textContent = s.lastChild.textContent.trimEnd();
    return s.childNodes.length && (s.textContent.trim() || s.querySelector('img')) ? s : null;
  };
  // One compact row for a post: Reddit's own post card, or a post from old Reddit's list (classic HOME and ALL), which
  // carries the same details as attributes plus its list data in rsJson.
  const makeRow = (post, rank) => {
      const g = (k) => post.getAttribute(k) || '';
      const link = g('content-href'), perma = g('permalink');
      const isSelf = /^self\./.test(g('domain'));
      const J = post.rsJson;
      const img = J ? null : post.querySelector('[slot="post-media-container"] img[src*="redd.it"], [slot="thumbnail"] img, [slot="post-media-container"] img');
      const thumbSrc = J ? clThumb(J) : img && (img.currentSrc || img.src);
      const flair = J ? flairOf(J) : post.querySelector('shreddit-post-flair')?.innerText.trim();
      const kind = kindOf(post);
      // Pinned posts get old Reddit's green title, so the ones the mods keep on top read as different
      const row = el('div', { class: post.hasAttribute('stickied') ? 'rs-row rs-stickied' : 'rs-row', 'data-rs-id': g('id') });
      row.rsPost = post;
      const thumbKids = thumbSrc ? [el('img', { src: thumbSrc, alt: '', loading: 'lazy' })] : [el('span', { html: isSelf ? ICON.text : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 12l4-4M7 9l-1.5 1.5a2.5 2.5 0 0 0 3.5 3.5L10.5 12.5M13 11l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5L9.5 7.5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>' })];
      const thumb = el('a', { class: 'rs-thumb', href: isSelf ? perma : link, tabindex: '-1', 'aria-hidden': 'true' }, thumbKids);
      const titleLine = el('div', { class: 'rs-tline' }, [
        el('a', { class: 'rs-title', href: isSelf ? perma : link, text: g('post-title') }),
        flag(post, 'nsfw') ? el('span', { class: 'rs-tag rs-tag-nsfw', text: 'nsfw' }) : null,
        flag(post, 'spoiler') ? el('span', { class: 'rs-tag rs-tag-spoiler', text: 'spoiler' }) : null,
        typeof flair === 'string' ? (flair ? el('span', { class: 'rs-flair', text: flair }) : null) : flair,
        g('domain') ? el('span', { class: 'rs-domain', text: `(${g('domain')})` }) : null, // old Reddit's page gives some crossposts no site
      ]);
      const meta = el('div', { class: 'rs-meta' });
      if (kind) meta.append(xButton(post, kind, row));
      const by = el('span', { class: 'rs-by' });
      by.append(`submitted ${ago(g('created-timestamp'))} ago by `, el('a', { href: `/user/${g('author')}/`, class: friendSet().has(g('author').toLowerCase()) ? 'rs-author rs-friend' : 'rs-author', text: g('author') }), nameTag(g('author')));
      const sub = subOf();
      if (!sub || sub.includes('+') || sub === 'popular' || sub === 'all') by.append(' to ', el('a', { href: `/${g('subreddit-prefixed-name')}/`, text: g('subreddit-prefixed-name') }));
      // Crossposts (RES's x-post links): Reddit gives the original post's address as the content link.
      const orig = post.hasAttribute('is-crosspost') && link.match(/^\/r\/([A-Za-z0-9_]{2,21})\/comments\/[a-z0-9]+\//i);
      if (orig) by.append(' crossposted from ', el('a', { href: link, class: 'rs-xpost', title: 'Open the original post', text: `r/${orig[1]}` }));
      meta.append(by);
      const n = +g('comment-count') || 0;
      const acts = el('div', { class: 'rs-acts' }, [
        el('a', { href: perma, text: `${num(n)} comment${n === 1 ? '' : 's'}` }),
        shareBtn(perma), saveBtn(post), hideBtn(post, row),
        isSelf ? null : el('a', { href: link, target: '_blank', rel: 'noopener', title: 'Open link and comments', text: '[l+c]' }),
      ]);
      const main = el('div', { class: 'rs-main' }, [titleLine, meta, acts]);
      row.append(el('div', { class: 'rs-rank', text: String(rank) }), voteBox(post), thumb, main);
      return row;
  };
  const densify = () => {
    if (isCommentsPage() || html.classList.contains('rs-classic')) return;
    for (const post of document.querySelectorAll('shreddit-post')) {
      if (post.rsRow?.isConnected || post.hasAttribute('data-rs-failed')) continue; // already has its row (a post Reddit brings back after Back gets a new one)
      try {
        post.setAttribute('data-rs', '1');
        const row = makeRow(post, rankOf(post));
        post.rsRow = row;
        (post.closest('article') || post).before(row);
      } catch (e) { post.removeAttribute('data-rs'); post.setAttribute('data-rs-failed', ''); post.rsRow?.remove(); post.rsRow = null; } // Reddit's own card stays
    }
  };

  // ---------- old Reddit's lists: HOME, ALL and subreddits ----------
  // Reddit's new Home is its own pick of posts, and the new site has dropped r/all (its address now opens Home). So HOME
  // shows the list old Reddit shows (setting "HOME shows old Reddit's list", on by default) and ALL always shows old
  // Reddit's r/all, in RESpawn's rows with old Reddit's sorts. Addresses: / is Home (best); /#hot, /#top/week ... its
  // other sorts; /#all, /#all/new, /#all/top/week is r/all. Reddit's own Home stays at /?feed=home and /?feed=following.
  // A subreddit opens on new Reddit's "Best", a few posts at a time; old Reddit opens it on Hot, 25 at once, pinned posts
  // first. So a subreddit's own list addresses (/r/kings/, /r/kings/new/, /r/kings/top/?t=week) show old Reddit's list
  // instead of Reddit's feed (setting "Subreddits show old Reddit's list", on by default); its header and sidebar stay.
  // A combined list (r/a+b+c) has no new-design page at all, so it always shows here, at /#r/a+b+c, /#r/a+b+c/new,
  // /#r/a+b+c/top/week, with its own heading and a "These subreddits" card (see "Combined subreddits" at the top).
  // Where each list comes from: a subreddit's hot, top and controversial are the very same list on this site (checked
  // post by post against old Reddit), so they are read here. Home's lists come in a different order here, and Reddit
  // refuses list data for new and rising, so those are read from old.reddit.com by the background helper (new, rising
  // and Home's hot from old Reddit's ordinary page; such a post's full details are fetched when you open it).
  // Old Reddit is closing: Reddit said (Sept 2026) it will soon open only for accounts that used it in the last six
  // months, and its list data ends in March 2027. So when old Reddit says no, a list falls back to this site's own copy
  // where there is one, and otherwise the page goes back to Reddit's own feed: never a dead end.
  const CL_SORTS = { home: ['best', 'hot', 'new', 'rising', 'controversial', 'top'], all: ['hot', 'new', 'rising', 'controversial', 'top'], sub: ['hot', 'new', 'rising', 'controversial', 'top'], multi: ['hot', 'new', 'rising', 'controversial', 'top'] };
  const CL_TIMES = [['hour', 'Past hour'], ['day', 'Past 24 hours'], ['week', 'Past week'], ['month', 'Past month'], ['year', 'Past year'], ['all', 'All time']];
  const CL_LABEL = { best: 'Best', hot: 'Hot', new: 'New', rising: 'Rising', controversial: 'Controversial', top: 'Top' };
  // Old Reddit saying no to a signed-in account (its log-in page, or a refusal) is remembered for a few hours, so pages
  // stop asking it first. A list that had to go back to Reddit's own feed stays that way in this tab for a while, so
  // loading the page again shows Reddit's feed instead of asking again.
  const OLD_OFF = 'rs-old-off', CL_BACK = 'rs-cl-back';
  const oldOff = () => Date.now() - (+localStorage.getItem(OLD_OFF) || 0) < 6 * 3600e3;
  const clBacked = () => { try { return JSON.parse(sessionStorage.getItem(CL_BACK) || '{}') || {}; } catch { return {}; } };
  const clRoute = (c = cfg) => {
    if (!isClassicUrl(c)) return null;
    // Old Reddit needs an account now, so a signed-out visitor keeps Reddit's own Home or subreddit (ALL explains itself)
    const out = !!document.querySelector('shreddit-app') && !loggedIn();
    const s = subListOf(), mh = location.pathname === '/' && multiHashOf();
    let r;
    if (mh) r = { list: 'multi', sub: mh.subs, sort: mh.sort, t: mh.t }; // a combined list (see "Combined subreddits" at the top)
    else if (s) {
      if (out) return null;
      const t = new URLSearchParams(location.search).get('t');
      r = { list: 'sub', sub: s.sub, sort: s.sort, t: s.sort === 'top' || s.sort === 'controversial' ? (CL_TIMES.some(([v]) => v === t) ? t : 'day') : '' };
    } else {
      const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
      const list = parts[0] === 'all' ? 'all' : 'home';
      if (list === 'home' && out) return null;
      if (list === 'all') parts.shift();
      const sort = CL_SORTS[list].includes(parts[0]) ? parts[0] : list === 'all' ? 'hot' : 'best';
      const timed = sort === 'top' || sort === 'controversial';
      r = { list, sort, t: timed ? (CL_TIMES.some(([v]) => v === parts[1]) ? parts[1] : 'day') : '' };
    }
    // ALL and combined lists have nothing else to show; other lists old Reddit won't give (and this site has no copy of)
    // stay Reddit's own
    if (r.list !== 'all' && r.list !== 'multi' && (Date.now() - (clBacked()[clHref(r)] || 0) < 10 * 60e3 || (oldOff() && !clWww(r)))) return null;
    return r;
  };
  const clHref = (r) => {
    const tail = `${r.sort}${r.t ? `/${r.t}` : ''}`;
    if (r.list === 'sub') return `/r/${r.sub}/${r.sort === 'hot' ? '' : `${r.sort}/`}${r.t ? `?t=${r.t}` : ''}`;
    if (r.list === 'all') return r.sort === 'hot' ? '/#all' : `/#all/${tail}`;
    if (r.list === 'multi') return `/${multiHash({ subs: r.sub, sort: r.sort, t: r.t })}`;
    return r.sort === 'best' ? '/' : `/#${tail}`;
  };
  // This site's own copy of a list, where there is one: a subreddit's hot, top and controversial (the same order as old
  // Reddit's) and Home's best, top and controversial (near old Reddit's). Used only when old Reddit won't answer: old
  // Reddit's own list comes first, as it follows your old Reddit settings (thumbnails: always, never or the subreddit's
  // choice) the way old Reddit itself does.
  const clWww = (r) => {
    // A combined list: this site has all of it. Hot, top and controversial come as list data; new and rising (whose list
    // data Reddit refuses) as the page in old Reddit's design that this site serves for every combined address.
    if (r.list === 'multi') {
      const page = r.sort === 'new' || r.sort === 'rising';
      const u = new URL(`/r/${r.sub}/${r.sort === 'hot' ? '' : `${r.sort}/`}${page ? '' : '.json'}`, location.origin);
      if (!page) { u.searchParams.set('limit', '25'); u.searchParams.set('raw_json', '1'); }
      if (r.t) u.searchParams.set('t', r.t);
      u.rsPage = page;
      return u;
    }
    if (r.list === 'all' || r.sort === 'new' || r.sort === 'rising' || (r.list === 'home' && r.sort === 'hot')) return null;
    const u = new URL(r.list === 'sub' ? `/r/${r.sub}/${r.sort === 'hot' ? '' : `${r.sort}/`}.json` : `/${r.sort}/.json`, location.origin);
    u.searchParams.set('limit', '25'); u.searchParams.set('raw_json', '1');
    if (r.t) u.searchParams.set('t', r.t);
    return u;
  };
  const clMedia = (d) => d.crosspost_parent_list?.[0] || d;
  const clUrl = (x) => x.url_overridden_by_dest || x.url || '';
  const clThumb = (d) => {
    const x = clMedia(d), im = x.preview?.images?.[0];
    const pick = (list) => (list || []).find((r) => r.width >= 140) || (list || []).at(-1);
    if (d.spoiler) return pick(im?.variants?.obfuscated?.resolutions)?.url || '';
    // Reddit already follows your "Blur mature (18+) images" setting in the small picture it sends (checked 11/9 on old
    // Reddit's page and the JSON): a clear one when blurring is off; the word "nsfw" or no picture when it is on. So its
    // own picture comes first, and the blurred copy only when it sent none.
    if (/^https:\/\//.test(d.thumbnail || '')) return d.thumbnail;
    if (d.over_18 || x.over_18) return pick(im?.variants?.nsfw?.resolutions)?.url || '';
    return pick(im?.resolutions)?.url || '';
  };
  const clKind = (d) => {
    const x = clMedia(d), href = clUrl(x);
    if (x.is_self) return x.selftext_html || x._hasText ? 'text' : null;
    if (ytId(href)) return 'youtube';
    if (x.is_video || /^https:\/\/v\.redd\.it\//.test(href)) return 'video';
    if (x.is_gallery) return 'gallery';
    if (embedOf(href, x.name)) return 'embed';
    if (picOf(href)) return 'image';
    if (x.post_hint === 'image' && x.preview?.images?.[0]?.source?.url) return 'image';
    if (x.secure_media_embed?.content || x.media_embed?.content) return 'rembed';
    if (x._partial && /^\/r\/[^/]+\/comments\//.test(href)) return 'gallery'; // a crosspost from old Reddit's page: details on opening
    return null;
  };
  // A post from old Reddit's list, dressed like Reddit's own post card so the same row, votes, filters and keys work.
  const clPost = (d) => {
    const p = document.createElement('rs-post');
    const set = (k, v) => { if (v !== undefined && v !== null && v !== false && v !== '') p.setAttribute(k, v === true ? '' : String(v)); };
    const x = d.crosspost_parent_list?.[0], url = clUrl(d);
    const xpost = !!x || (!!d._partial && !d.is_self && /^\/r\/[^/]+\/comments\//.test(url));
    p.id = d.name;
    set('post-title', d.title); set('permalink', d.permalink);
    set('content-href', d.is_self ? d.permalink : x ? x.permalink : url);
    set('domain', d.domain); set('author', d.author); set('subreddit-prefixed-name', d.subreddit_name_prefixed);
    set('created-timestamp', new Date((d.created_utc || 0) * 1000).toISOString());
    set('comment-count', d.num_comments ?? 0); set('score', d.score ?? 0); set('upvote-ratio', d.upvote_ratio);
    set('nsfw', !!d.over_18); set('spoiler', !!d.spoiler); set('is-crosspost', xpost); set('stickied', !!d.stickied);
    p.rsJson = d;
    return p;
  };
  // old Reddit's ordinary page, read for new and rising: each post row carries its details as data- attributes
  const clFromPage = (text) => {
    // its inline onclick= bits are dropped first: nothing runs in a parsed page, but Reddit's page rules would complain
    const doc = new DOMParser().parseFromString(String(text).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ''), 'text/html');
    const children = [];
    for (const t of doc.querySelectorAll('#siteTable > .thing.link')) {
      const a = (k) => t.getAttribute(`data-${k}`) || '';
      if (a('promoted') === 'true' || !/^t3_[a-z0-9]+$/.test(a('fullname'))) continue;
      const domain = a('domain'), th = t.querySelector('a.thumbnail img')?.getAttribute('src') || '', mid = t.querySelector('.midcol');
      children.push({ kind: 't3', data: {
        _partial: true, name: a('fullname'), id: a('fullname').slice(3), title: t.querySelector('a.title')?.textContent || '',
        permalink: a('permalink'), url: a('url'), domain, author: a('author'), subreddit_name_prefixed: a('subreddit-prefixed'),
        created_utc: (+a('timestamp') || 0) / 1000, num_comments: +a('comments-count') || 0, score: +a('score') || 0,
        over_18: a('nsfw') === 'true', spoiler: a('spoiler') === 'true', is_self: /^self\./.test(domain), is_gallery: a('is-gallery') === 'true',
        is_video: domain === 'v.redd.it', thumbnail: ((u) => (FLAIR_IMG.test(u) ? u : ''))(th.startsWith('//') ? `https:${th}` : th), // Reddit's own picture addresses only
        _hasText: !!t.querySelector('.expando-button.selftext'), // old Reddit gives a text post with a body its own open button
        link_flair_text: t.querySelector('.linkflairlabel')?.textContent || '',
        // old Reddit draws a tag's emoji as an empty span with the picture as its background
        link_flair_richtext: [...(t.querySelector('.linkflairlabel')?.childNodes || [])].map((n) => (n.classList?.contains('flairemoji')
          ? { e: 'emoji', u: ((n.getAttribute('style') || '').match(/url\(\s*["']?([^"')\s]+)/) || [])[1]?.replace(/^\/\//, 'https://') || '' }
          : { e: 'text', t: n.textContent })),
        likes: mid?.classList.contains('likes') ? true : mid?.classList.contains('dislikes') ? false : null, saved: t.classList.contains('saved'),
        stickied: t.classList.contains('stickied'),
      } });
    }
    const next = doc.querySelector('.next-button a')?.getAttribute('href') || '';
    return { after: (next.match(/[?&]after=(t3_[a-z0-9]+)/) || [])[1] || null, children };
  };
  // The background helper reads old.reddit.com (a page on www.reddit.com can't).
  const clAsk = (msg) => new Promise((res, rej) => {
    const rt = typeof chrome !== 'undefined' && chrome.runtime;
    if (!rt?.sendMessage) { rej(new Error('no helper')); return; }
    try { rt.sendMessage(msg, (a) => { const e = rt.lastError; if (e) rej(new Error(e.message)); else res(a); }); } catch (e) { rej(e); }
  });
  const clWwwGet = async (u, after, count) => {
    if (after) { u.searchParams.set('after', after); u.searchParams.set('count', String(count)); }
    if (u.rsPage) {
      const res = await fetch(u, { credentials: 'include', headers: { accept: 'text/html' } });
      const text = res.ok ? await res.text() : '';
      if (!/id="siteTable"/.test(text)) throw new Error(`Reddit answered ${res.status}`);
      return clFromPage(text.slice(0, 3_000_000));
    }
    const res = await fetch(u, { credentials: 'include', headers: { accept: 'application/json' } });
    const j = res.ok ? await res.json().catch(() => null) : null;
    if (!j?.data) throw new Error(`Reddit answered ${res.status}`);
    return { after: j.data.after || null, children: j.data.children || [] };
  };
  const clOld = async (r, after, count) => {
    const a = await clAsk({ type: 'rs-list', list: r.list, sub: r.sub, sort: r.sort, t: r.t, after, count });
    if (a?.data) return a.data;
    if (a?.html) return clFromPage(a.html);
    const e = a?.error || 'no answer';
    // its log-in page while you are logged in here, or no list where there always is one: old Reddit won't open for you
    // (a subreddit can say no by itself: private, banned or quarantined, so only Home's and r/all's missing list count)
    if ((e === 'login' && loggedIn()) || (e === 'no list' && r.list !== 'sub' && r.list !== 'multi')) { try { localStorage.setItem(OLD_OFF, String(Date.now())); } catch { /* storage blocked */ } }
    throw new Error(e);
  };
  const clFetch = async (r, after, count) => {
    const www = clWww(r);
    if (!www || !oldOff()) {
      try { return await clOld(r, after, count); } catch (e) { if (!www || (e.message === 'login' && !loggedIn() && r.list !== 'multi')) throw e; }
    }
    return clWwwGet(www, after, count);
  };
  const clFull = async (d) => {
    const res = await fetch(`/comments/${d.id || d.name.replace(/^t3_/, '')}/.json?limit=1&raw_json=1`, { credentials: 'include', headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    const full = j?.[0]?.data?.children?.[0]?.data;
    if (!full) throw new Error('no post');
    return full;
  };
  // Post text from Reddit, copied in tag by tag: only plain formatting and links survive.
  const SAFE_TAGS = new Set(['P', 'A', 'EM', 'STRONG', 'B', 'I', 'U', 'DEL', 'S', 'SUP', 'SUB', 'CODE', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'SPAN', 'DIV']);
  const safeHtml = (src) => {
    const doc = new DOMParser().parseFromString(src || '', 'text/html');
    const clean = (n) => {
      for (const c of [...n.childNodes]) {
        if (c.nodeType === 3) continue;
        if (c.nodeType !== 1) { c.remove(); continue; }
        if (!SAFE_TAGS.has(c.tagName)) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE|SVG|MATH|FORM|INPUT|BUTTON|IMG|VIDEO|AUDIO)$/.test(c.tagName)) c.remove(); else { clean(c); c.replaceWith(...c.childNodes); } continue; }
        for (const at of [...c.attributes]) {
          const ok = (c.tagName === 'A' && at.name === 'href' && /^(https?:\/\/|\/(?!\/))/i.test(at.value.trim())) || (at.name === 'class' && at.value === 'md-spoiler-text')
            || ((c.tagName === 'TD' || c.tagName === 'TH') && at.name === 'align' && /^(left|right|center)$/.test(at.value)); // numbers in tables line up right, as written
          if (!ok) c.removeAttribute(at.name);
        }
        if (c.tagName === 'A') { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener nofollow'); }
        clean(c);
      }
    };
    clean(doc.body);
    const frag = document.createDocumentFragment();
    for (const c of [...doc.body.childNodes]) frag.append(document.importNode(c, true));
    return frag;
  };
  // A gallery from Reddit's details of the post: each picture's smaller copies and its original, in the post's order
  // (pictures Reddit could not process are left out; a moving one plays from its original).
  const clGallery = (box, x, quiet) => {
    const order = (x.gallery_data?.items || []).map((g) => g.media_id);
    const items = (order.length ? order : Object.keys(x.media_metadata || {})).map((id) => {
      const m = x.media_metadata?.[id], s = m?.s;
      const full = s && (s.u || s.gif);
      if (!full || m.status === 'failed') return null;
      const w = +s.x || 0, h = +s.y || 0;
      const sizes = s.u ? (m.p || []).filter((r) => r?.u && +r.x && (!w || +r.x < w)).map((r) => ({ u: r.u, w: +r.x })).sort((a, b) => a.w - b.w) : [];
      sizes.push({ u: full, w: w || 99999 });
      return { w, h, sizes, full };
    }).filter(Boolean);
    if (!items.length) { box.append(el('p', { class: 'rs-media-err' }, ['These pictures would not load here. ', el('a', { href: x.permalink, text: 'Open the post' })])); return; }
    gallery(box, items, x.title || '', quiet);
  };
  // Reddit's own videos: the picture track and the sound track are separate files, played together.
  // quiet: opened by "Show images", so it waits for its play button (and fetches its sound only then).
  const redditVideo = (box, x, title, quiet) => {
    const rv = x.secure_media?.reddit_video || x.media?.reddit_video;
    const src = rv?.fallback_url || '';
    if (!src) { box.append(el('p', { class: 'rs-media-err' }, ['This video would not load here. ', el('a', { href: x.permalink, text: 'Open the post' })])); return; }
    const v = el('video', { class: 'rs-media-video', controls: true, playsinline: true, preload: 'metadata', poster: x.preview?.images?.[0]?.source?.url || null, title });
    v.src = src;
    if (rv.has_audio !== false) {
      const base = src.replace(/\?.*$/, '').replace(/\/[^/]*$/, '');
      const names = ['CMAF_AUDIO_128.mp4', 'CMAF_AUDIO_64.mp4', 'DASH_AUDIO_128.mp4', 'DASH_AUDIO_64.mp4', 'DASH_audio.mp4']; // newer videos keep it in CMAF_ files
      const tries = (/\/CMAF_/.test(src) ? names : names.slice(2).concat(names.slice(0, 2))).map((f) => `${base}/${f}`);
      const a = new Audio();
      let i = 0;
      a.preload = quiet ? 'none' : 'auto';
      a.onerror = () => { if (i < tries.length) { a.src = tries[i++]; if (!v.paused) a.play().catch(() => {}); } };
      a.src = tries[i++];
      const sync = () => { if (Math.abs(a.currentTime - v.currentTime) > 0.3) a.currentTime = v.currentTime; };
      v.addEventListener('play', () => { sync(); a.play().catch(() => {}); });
      v.addEventListener('playing', () => { sync(); if (a.paused) a.play().catch(() => {}); });
      for (const ev of ['pause', 'waiting', 'ended']) v.addEventListener(ev, () => a.pause());
      v.addEventListener('seeked', sync);
      v.addEventListener('timeupdate', sync);
      v.addEventListener('volumechange', () => { a.volume = v.volume; a.muted = v.muted; });
      v.addEventListener('ratechange', () => { a.playbackRate = v.playbackRate; });
      v.rsAudio = a;
    }
    // its own shape from the start, so the page doesn't jump when it loads; drag on it (above its controls) to resize
    const wrap = el('div', { class: 'rs-vid' }, [v]);
    const fit = +rv.width && +rv.height ? fitSize(+rv.width, +rv.height, box.clientWidth || 700, false) : null;
    const normal = () => { wrap.style.width = fit ? `min(100%, ${fit.w}px)` : ''; wrap.style.maxWidth = ''; };
    if (fit) { wrap.classList.add('rs-sized'); v.style.aspectRatio = `${rv.width} / ${rv.height}`; normal(); }
    zoomable(wrap, { surface: v, controls: 56, width: () => wrap.getBoundingClientRect().width, reset: normal, set: (px) => { wrap.style.width = `${px}px`; wrap.style.maxWidth = 'none'; } });
    box.append(wrap);
    if (!quiet) v.play().catch(() => {}); // opened with a click, so it starts like Reddit's own player
    setTimeout(watchVideos, 100); // counts toward "Videos playing at once"
  };
  const clFill = async (box, post, kind, close, quiet) => {
    let d = post.rsJson;
    if (d._partial) {
      box.append(el('p', { class: 'rs-media-wait', text: 'Loading…' }));
      try { d = post.rsJson = await clFull(d); } catch {
        box.replaceChildren(el('p', { class: 'rs-media-err' }, ['Reddit did not send this post. ', el('a', { href: d.permalink, text: 'Open it' })]));
        return;
      }
      box.replaceChildren();
      kind = clKind(d) || kind;
    }
    const x = clMedia(d), href = clUrl(x), title = d.title || 'Video';
    if (kind === 'text') {
      const body = el('div', { class: 'rs-text md' });
      body.append(x.selftext_html ? safeHtml(x.selftext_html) : el('p', { text: 'No text.' }));
      box.append(body);
    } else if (kind === 'youtube') player(box, `${YT_ORIGIN}/embed/${ytId(href)}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`, { origin: YT_ORIGIN }, close, title, quiet);
    else if (kind === 'embed') { const e = embedOf(href, x.name); player(box, e.src, e, close, title, quiet); }
    else if (kind === 'video') redditVideo(box, x, title, quiet);
    else if (kind === 'gallery' && x.is_gallery) clGallery(box, x, quiet);
    else if (kind === 'image' || kind === 'gallery') {
      const im = x.preview?.images?.[0], pic = picOf(href), src = pic || im?.source?.url;
      // Reddit's own still pictures come in smaller copies too
      const own = +im?.source?.width && +im.source.height && (!pic || (/^https:\/\/i\.redd\.it\//.test(pic) && !/\.gif$/i.test(pic)));
      const sizes = own ? [...(im.resolutions || []).filter((r) => r?.url && +r.width < +im.source.width).map((r) => ({ u: r.url, w: +r.width })), { u: im.source.url, w: +im.source.width }] : null;
      if (src) picture(box, src, href, title, own ? { w: +im.source.width, h: +im.source.height, sizes } : {});
      else box.append(el('p', { class: 'rs-media-err' }, ['Nothing to show here. ', el('a', { href: d.permalink, text: 'Open the post' })]));
    } else if (kind === 'rembed') player(box, `https://www.redditmedia.com/mediaembed/${x.id || x.name.replace(/^t3_/, '')}`, {}, close, title);
  };
  const clBar = (r) => {
    const tabs = el('div', { id: 'rs-sorts', role: 'tablist', 'aria-label': 'Sort' });
    if (r.list === 'home') tabs.append(el('a', { href: '/?feed=home', class: 'rs-cl-feed', text: 'For You' }), el('a', { href: '/?feed=following', class: 'rs-cl-feed', text: 'Following' }), el('span', { class: 'rs-cl-div', 'aria-hidden': 'true' }));
    for (const s of CL_SORTS[r.list]) {
      const on = s === r.sort, timed = s === 'top' || s === 'controversial', to = { ...r, sort: s, t: timed ? (r.t || 'day') : '' };
      const tab = el('a', { href: clHref(to), role: 'tab', 'aria-selected': String(on), class: on ? 'rs-cur' : null, text: CL_LABEL[s] });
      // pointing at a tab for a moment already asks for its list, so it is there (or nearly) when you click
      if (!on) {
        tab.addEventListener('pointerenter', () => { clearTimeout(tab.rsT); tab.rsT = setTimeout(() => { if (tab.isConnected && cl?.key !== clHref(to) && clFirst?.key !== clHref(to) && (clWww(to) || !oldOff())) { clFirst = { key: clHref(to), p: clFetch(to, null, 0), at: Date.now() }; clFirst.p.catch(() => { /* asked again on the click */ }); } }, 120); });
        tab.addEventListener('pointerleave', () => clearTimeout(tab.rsT));
      }
      tabs.append(tab);
    }
    if (r.t) {
      const sel = el('select', { class: 'rs-cl-time', 'aria-label': 'Time range' });
      for (const [v, t] of CL_TIMES) { const o = el('option', { value: v, text: t }); o.selected = v === r.t; sel.append(o); }
      sel.onchange = () => clGo(clHref({ ...r, t: sel.value }));
      tabs.append(sel);
    }
    tabs.append(funnelBtn(), showImagesBtn());
    return el('div', { id: 'rs-sortbar', class: 'rs-cl-bar' }, [tabs]);
  };
  let cl = null, clFresh = false, clFirst = null;
  const clKept = new Map(); // lists you left in this tab, by address: Back brings one back as you left it, not reloaded
  const clHere = () => location.pathname + location.search + location.hash;
  const clBuild = (r, key) => {
    const st = { r, key, after: null, count: 0, page: 0, loading: false, done: false, y: null, seen: new Set(), resume: false };
    st.list = el('div', { class: 'rs-cl-list' });
    st.more = el('div', { class: 'rs-cl-more' });
    st.root = el('div', { id: 'rs-classic', 'data-list': r.list }, [r.list === 'multi' ? el('h1', { class: 'rs-cl-title' }) : null, clBar(r), filterLine(), st.list, st.more]);
    st.io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) clLoad(st); }, { rootMargin: '0px 0px 1500px 0px' });
    st.io.observe(st.more);
    return st;
  };
  // A list that can't be had goes back to Reddit's own feed: Reddit's page under it already holds that address's own
  // feed (Reddit loads its page for every change of address, RESpawn's included), so the list just steps aside.
  const clHandBack = (st) => {
    const b = clBacked(); b[st.key] = Date.now();
    let kept = true;
    try { sessionStorage.setItem(CL_BACK, JSON.stringify(b)); } catch { kept = false; /* storage blocked: steps aside for now only */ }
    // (should Reddit's page under it still show another sort, the address change having gone unnoticed, it loads again)
    const d = [...document.querySelectorAll('shreddit-sort-dropdown[header-text="Sort by"] [slot="dropdown-items"] data[value]')].find((x) => x.querySelector('[aria-selected="true"], [rpl-selected]'));
    const shown = (d?.getAttribute('value') || '').toLowerCase();
    if (kept && st.r.list === 'sub' && st.r.sort !== 'hot' && shown && shown !== st.r.sort) { location.reload(); return; }
    if (st === cl) { st.root.remove(); st.io.disconnect(); cl = null; }
    html.classList.remove('rs-classic');
    clMount();
  };
  const clLoad = async (st) => {
    if (st.loading || st.done || st !== cl || !st.root.isConnected) return;
    const every = +cfg.pauseEvery || 0;
    if (st.page && every && st.page % every === 0 && !st.resume) { // RES's pause every few pages
      if (!st.more.querySelector('.rs-pause')) {
        const go = el('button', { type: 'button', class: 'rs-btn', text: 'Load more' });
        go.onclick = () => { st.resume = true; clLoad(st); };
        st.more.replaceChildren(el('div', { class: 'rs-pause', role: 'status' }, [el('span', { text: `Paused after ${st.page} pages.` }), go]));
      }
      return;
    }
    st.loading = true; st.resume = false;
    st.more.replaceChildren(el('div', { class: 'rs-cl-wait', role: 'status', text: 'Loading…' }));
    let d;
    try {
      const early = !st.page && clFirst?.key === st.key && Date.now() - clFirst.at < 30e3 ? clFirst.p : null; // asked for as the page started, or as you pointed at its tab
      if (!st.page) clFirst = null;
      d = await (early ? early.catch(() => clFetch(st.r, null, 0)) : clFetch(st.r, st.after, st.count));
    } catch (e) {
      st.loading = false;
      if (st !== cl) return;
      // nothing from old Reddit or this site for a subreddit or Home: Reddit's own feed takes over
      if (!st.page && st.r.list !== 'all' && st.r.list !== 'multi' && loggedIn()) { clHandBack(st); return; }
      if (!st.page && st.r.list !== 'multi' && (e?.message === 'login' || !loggedIn() || oldOff())) {
        st.more.replaceChildren(el('div', { class: 'rs-cl-err', role: 'status' }, [
          el('span', { text: loggedIn() ? 'r/all is only on old Reddit now, and old Reddit would not open for your account.' : st.r.list === 'all' ? 'r/all is only on old Reddit now, and old Reddit needs you to log in.' : 'This list comes from old Reddit, which needs you to log in.' }),
          loggedIn() ? null : el('a', { class: 'rs-btn', href: '/login/', text: 'Log in' }), el('a', { class: 'rs-btn rs-btn-quiet', href: '/r/popular/', text: 'Popular' }),
        ]));
        return;
      }
      const again = el('button', { type: 'button', class: 'rs-btn', text: 'Try again' });
      again.onclick = () => clLoad(st);
      st.more.replaceChildren(el('div', { class: 'rs-cl-err', role: 'status' }, [el('span', { text: 'Reddit did not send the list.' }), again]));
      return;
    }
    st.loading = false;
    if (st !== cl) return; // another list was opened meanwhile
    const posts = (d.children || []).filter((c) => c?.kind === 't3' && /^t3_[a-z0-9]+$/.test(c.data?.name || '') && !c.data.promoted && !st.seen.has(c.data.name));
    if (st.page && posts.length) st.list.append(el('div', { class: 'rs-page', 'aria-hidden': 'true', text: `Page ${st.page + 1}` }));
    for (const c of posts) { st.seen.add(c.data.name); try { st.list.append(makeRow(clPost(c.data), st.count + 1)); st.count++; } catch { /* a post that won't draw is left out */ } }
    st.page++; st.after = d.after; st.done = !d.after || !posts.length;
    st.more.replaceChildren(st.done ? el('div', { class: 'rs-cl-end', text: st.count ? 'No more posts.' : 'No posts here.' }) : '');
    if (!st.done && st.more.getBoundingClientRect().top < innerHeight + 1500) setTimeout(() => clLoad(st), 60); // still near the end
  };
  // Shows, keeps or puts away old Reddit's list for the address now. A list you leave (opening a post, or another sort)
  // is kept, and Back brings it back where you were, without loading it again. A list opened by a click is fresh.
  const clMount = () => {
    const r = clRoute();
    html.classList.toggle('rs-classic', !!r);
    if (!r) { cl?.root.remove(); return; }
    const main = document.getElementById('main-content');
    if (!main) return;
    const key = clHref(r);
    let fresh = false;
    if (!cl || cl.key !== key || clFresh) {
      if (cl) { cl.root.remove(); if (cl.key !== key) clKept.set(cl.key, cl); else cl.io.disconnect(); }
      cl = (!clFresh && clKept.get(key)) || null;
      clKept.delete(key); clFresh = false;
      if (!cl) { cl = clBuild(r, key); fresh = true; } else { const sel = cl.root.querySelector('.rs-cl-time'); if (sel) sel.value = cl.r.t; } // its time menu may show the range picked when you left it
      for (const [k, old] of clKept) { if (clKept.size <= 6) break; old.io.disconnect(); clKept.delete(k); }
    }
    cl.at = clHere();
    if (cl.root.parentElement === main) return;
    main.prepend(cl.root);
    paintFilters();
    if (fresh) { if (scrollY > 200) scrollTo(0, 0); } else if (cl.y != null) { const y = cl.y; requestAnimationFrame(() => scrollTo(0, y)); setTimeout(() => scrollTo(0, y), 400); }
    if (!cl.page) clLoad(cl);
  };
  // where you are in the list, kept as you scroll (by the time a post opens, the list may already be off the page)
  window.addEventListener('scroll', () => { if (cl?.root.isConnected && cl.at === clHere()) cl.y = scrollY; }, { passive: true });
  // Opens a list. On Home only the part after # changes: Reddit re-routes any other change of address made on its page
  // (to its own Home), but leaves # alone. Coming from Reddit's own Home (/?feed=...) the list opens fresh. On a
  // subreddit the address changes at once and the list is asked for straight away, while Reddit loads its own page for
  // the new address underneath, out of sight.
  const clGo = (href) => {
    clFresh = true;
    const u = new URL(href, location.href);
    if (subListOf(u.pathname, u.search)) {
      if (u.pathname + u.search !== location.pathname + location.search || location.hash) history.pushState(null, '', u.pathname + u.search);
      clMount();
      return;
    }
    if (new URLSearchParams(location.search).has('feed')) { location.assign(href); return; }
    const h = href.includes('#') ? href.slice(href.indexOf('#')) : location.hash ? '#best' : '';
    if (h !== location.hash) location.hash = h; // hashchange then shows the list
    else clMount();
  };
  window.addEventListener('popstate', () => clMount());
  window.addEventListener('hashchange', () => clMount());
  // Reaching a list through a link (Reddit's own too, say the subreddit's name on a post) opens it fresh, at the top;
  // Back and Forward bring back the one you left.
  window.navigation?.addEventListener('navigate', (e) => {
    if (e.navigationType === 'traverse') clFresh = false;
    else if (e.navigationType === 'push' && e.destination?.url !== location.href) clFresh = true;
  });
  // Links to these lists (HOME, ALL, the sort tabs) switch the list in place on Home, or open it fresh from other pages
  // (Reddit's own page change would drop the part after #). A subreddit's sort tabs switch its list in place too.
  // Listened for on the window, ahead of Reddit's own link handling, which would otherwise turn them into its own pages.
  window.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !cfg.enabled) return;
    const a = e.target.closest?.('a[href]');
    if (!a || a.target === '_blank') return;
    const u = new URL(a.getAttribute('href'), location.href);
    if (u.origin !== location.origin) return;
    // a combined list's old address (r/a+b+c) opens as RESpawn's own list without a trip through old Reddit's page
    const mu = multiOf(u.pathname, u.search);
    if (mu) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (location.pathname === '/') clGo(`/${multiHash(mu)}`); else location.assign(`/${multiHash(mu)}`);
      return;
    }
    const to = cfg.classicSubs && subListOf(u.pathname, u.search), now = subListOf();
    if (to) {
      if (!now || !cl?.root.isConnected || cl.r.list !== 'sub' || to.sub.toLowerCase() !== now.sub.toLowerCase()) return;
      e.preventDefault(); e.stopImmediatePropagation();
      clGo(u.pathname + u.search);
      return;
    }
    if (u.pathname !== '/' || u.search) return;
    if (!/^#all(\/|$)/.test(u.hash) && !multiHashOf(u.hash) && !cfg.classicHome) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (location.pathname === '/') clGo(u.pathname + u.hash);
    else location.assign(u.pathname + u.hash);
  }, true);
  // The first list is asked for as the page starts, alongside Reddit's own page, so it can show the moment the page is in.
  // (A list handed back to Reddit's own feed, see above, lets that feed show from the start.)
  { const r = clRoute(boot); if (r) { clFirst = { key: clHref(r), p: clFetch(r, null, 0), at: Date.now() }; clFirst.p.catch(() => { /* asked again when shown */ }); } else html.classList.remove('rs-classic'); }

  // ---------- combined lists: their heading, the tab's title and "These subreddits" ----------
  // Named like old Reddit's own page for them would be, or by your shortcut's name once you have one.
  const multiTitle = (subs) => {
    const i = scIndex(subs), n = subs.split('+');
    if (i >= 0 && scList()[i].name) return scList()[i].name;
    return n.length <= 3 ? n.map((x) => `r/${x}`).join(' + ') : `r/${n[0]} + ${n.length - 1} more`;
  };
  const MULTI_FOLD = 12; // names shown before "Show all"
  let multiTitleOwn = '', multiTitleShown = '';
  const multiShow = (repaint) => {
    const r = cfg.enabled && cl?.root.isConnected && cl.r.list === 'multi' ? cl.r : null;
    let card = document.getElementById('rs-multi');
    // the tab's title: ours while the list shows, Reddit's own back after (unless Reddit has set a new one meanwhile)
    const t = r ? multiTitle(r.sub) : '';
    if (t && document.title !== t) { if (document.title !== multiTitleShown) multiTitleOwn = document.title; document.title = t; }
    if (!t && multiTitleShown && document.title === multiTitleShown) document.title = multiTitleOwn;
    multiTitleShown = t;
    if (!r) { card?.remove(); return; }
    setText(cl.root.querySelector('.rs-cl-title'), t);
    // The card sits at the top of the right column, or above the list when the window is too narrow for that column
    // (Reddit then hides the column itself, or a box around it)
    const box = document.getElementById('right-sidebar-container');
    const rail = !html.classList.contains('rs-no-rail') && box?.getClientRects().length ? document.getElementById('right-sidebar-contents') || box : null;
    const spot = rail || cl.root;
    if (card && card.dataset.subs === r.sub && !repaint) {
      if (card.parentElement !== spot) { if (rail) { rail.prepend(card); railCheck(); } else cl.root.querySelector('#rs-sortbar')?.before(card); }
      return;
    }
    const open = card?.dataset.subs === r.sub && card.classList.contains('rs-open');
    card?.remove();
    const names = r.sub.split('+'), icons = new Map(joined().map((j) => [j.name.toLowerCase(), j.icon]));
    card = el('section', { id: 'rs-multi', 'data-subs': r.sub, 'aria-label': 'These subreddits', class: open ? 'rs-open' : null });
    const list = el('ul', { class: 'rs-mu-list' });
    for (const n of names) {
      const icon = icons.get(n.toLowerCase());
      list.append(el('li', {}, [el('a', { href: `/r/${n}/` }, [icon ? el('img', { src: icon, alt: '' }) : el('span', { class: 'rs-ms-noicon', 'aria-hidden': 'true', text: 'r/' }), el('span', { text: `r/${n}` })])]));
    }
    const more = names.length > MULTI_FOLD ? el('button', { type: 'button', class: 'rs-mu-more', 'aria-expanded': String(open), text: open ? 'Show fewer' : `Show all ${names.length}` }) : null;
    if (more) more.onclick = () => { const o = card.classList.toggle('rs-open'); more.textContent = o ? 'Show fewer' : `Show all ${names.length}`; more.setAttribute('aria-expanded', String(o)); };
    // "+ Shortcut" sits on the card's title line; adding asks for the name the bar shows (yours, or the suggested one)
    // right below it. Saving or taking it away redraws the card through scSave.
    const sc = el('button', { type: 'button', class: 'rs-btn rs-mu-sc' });
    const form = el('div', { class: 'rs-mu-form', hidden: true });
    const inList = scIndex(r.sub);
    sc.textContent = inList >= 0 ? '− Shortcut' : '+ Shortcut';
    sc.setAttribute('aria-pressed', String(inList >= 0));
    sc.title = inList >= 0 ? `Remove ${scName(scList()[inList])} from your shortcut bar` : 'Add this list to your shortcut bar';
    if (inList < 0) sc.setAttribute('aria-expanded', 'false');
    const shut = () => { form.hidden = true; form.replaceChildren(); sc.setAttribute('aria-expanded', 'false'); };
    sc.onclick = () => {
      const j = scIndex(r.sub);
      if (j >= 0) { const l = scList(); const [gone] = l.splice(j, 1); scSave(l); toast(`Removed ${scWhat(gone)} from your shortcuts.`); return; }
      if (!form.hidden) { shut(); return; }
      const name = el('input', { type: 'text', class: 'rs-ed-add', maxlength: '40', spellcheck: 'false', 'aria-label': 'Shortcut name', placeholder: 'Shortcut name' });
      name.value = multiShort(r.sub);
      const add = el('button', { type: 'button', class: 'rs-done', text: 'Add' });
      const cancel = el('button', { type: 'button', class: 'rs-btn rs-btn-quiet', text: 'Cancel' });
      const save = () => { const v = name.value.trim() || multiShort(r.sub); if (scIndex(r.sub) < 0) scSave([...scList(), { sub: r.sub, name: v }]); toast(`Added ${v} to your shortcuts.`); };
      add.onclick = save;
      cancel.onclick = () => { shut(); sc.focus(); };
      name.onkeydown = (e) => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') { e.stopPropagation(); shut(); sc.focus(); } };
      form.replaceChildren(name, add, cancel); form.hidden = false; sc.setAttribute('aria-expanded', 'true');
      name.focus(); name.select();
    };
    card.append(el('div', { class: 'rs-mu-head' }, [el('b', {}, ['These subreddits', el('span', { class: 'rs-mu-n', text: String(names.length) })]), sc]), form, list);
    if (more) card.append(more);
    if (rail) { rail.prepend(card); railCheck(); } else cl.root.querySelector('#rs-sortbar')?.before(card);
  };

  // ---------- page header + side clutter ----------
  const tidy = () => {
    const h1 = document.querySelector('.masthead h1');
    if (h1) {
      const top = h1.getBoundingClientRect().top;
      for (const im of document.querySelectorAll('.masthead img')) {
        if (h1.contains(im) || im.closest('button') || im.getBoundingClientRect().bottom > top + 4) continue;
        let box = im;
        while (box.parentElement && box.parentElement.children.length === 1 && !box.parentElement.matches('section, .masthead')) box = box.parentElement;
        box.classList.add('rs-hide-icon');
      }
    }
    for (const h of document.querySelectorAll('summary, h2, span')) {
      if (/^\s*games on reddit\s*$/i.test(h.textContent)) { (h.closest('faceplate-expandable-section-helper, details, section') || h.parentElement).classList.add('rs-hide-games'); break; }
    }
  };

  // ---------- post info box (old Reddit's "this post was submitted on ...") ----------
  const postInfo = () => {
    const post = document.querySelector('shreddit-post[view-context="CommentsPage"]');
    let box = document.getElementById('rs-postinfo');
    const rail = document.getElementById('right-sidebar-contents') || document.getElementById('right-sidebar-container');
    if (!post || !rail) { box?.remove(); return; }
    if (box?.isConnected && box.dataset.id === post.id) return;
    box?.remove();
    const g = (k) => post.getAttribute(k) || '';
    const when = new Date(g('created-timestamp'));
    const score = +g('score') || 0, ratio = parseFloat(g('upvote-ratio'));
    const short = `https://redd.it/${post.id.replace(/^t3_/, '')}`;
    const link = el('input', { type: 'text', class: 'rs-pi-link', readonly: true, 'aria-label': 'Short link', value: short });
    link.onfocus = () => link.select();
    const copy = el('button', { type: 'button', class: 'rs-btn', text: 'Copy' });
    copy.onclick = async () => { if (await copyText(short)) toast('Short link copied.'); else { link.select(); toast('Press Ctrl+C to copy the link.'); } };
    box = el('section', { id: 'rs-postinfo', 'data-id': post.id, 'aria-label': 'About this post' }, [
      el('div', { class: 'rs-pi-when', text: `Submitted ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` }),
      el('div', { class: 'rs-pi-score' }, [el('b', { text: score.toLocaleString() }), ` point${score === 1 ? '' : 's'}`, Number.isFinite(ratio) ? el('span', { text: ` (${Math.round((ratio <= 1 ? ratio * 100 : ratio))}% upvoted)` }) : null]),
      el('div', { class: 'rs-pi-short' }, [link, copy]),
    ]);
    rail.prepend(box);
  };

  // ---------- app posts: the text version under the app's picture ----------
  // Some posts are Reddit apps (game threads, polls, puzzles) that draw their own picture. Old Reddit can't run apps, so
  // it shows the text the app writes alongside (a game thread's box score as tables), which is why the two designs looked
  // completely different. That text comes with the post itself (one request); old Reddit's "not supported here" note is
  // left out, since this is the full post.
  const appText = () => {
    const post = document.querySelector('shreddit-post[view-context="CommentsPage"][post-type="customPost"]');
    const box = document.getElementById('rs-apptext');
    if (!post) { box?.remove(); return; }
    if ((box?.isConnected && box.dataset.id === post.id) || appText.tried === post) return;
    box?.remove();
    appText.tried = post; // once per post: a post with no text, or a failed request, is not asked again
    fetch(`/comments/${post.id.replace(/^t3_/, '')}/.json?limit=1&raw_json=1`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => {
        const d = j?.[0]?.data?.children?.[0]?.data;
        if (!d?.selftext_html || !post.isConnected) return;
        const body = el('div', { class: 'rs-text md' });
        body.append(safeHtml(d.selftext_html));
        for (const p of body.querySelectorAll('p')) {
          if (!/content not supported on old reddit/i.test(p.textContent)) continue;
          if (p.previousElementSibling?.tagName === 'HR') p.previousElementSibling.remove();
          p.remove();
        }
        // the app writes its links for old Reddit; on this design they open here
        for (const a of body.querySelectorAll('a[href^="https://old.reddit.com/"]')) a.href = a.href.replace('https://old.reddit.com/', 'https://www.reddit.com/');
        if (!body.textContent.trim()) return;
        // under the picture and the app's own "Privacy" line, which belongs to the picture
        const media = [...post.querySelectorAll(':scope > [slot="post-media-container"]')].pop();
        const privacy = [...post.children].find((k) => !k.slot && k.querySelector('activate-feature[name^="DevvitPrivacy"]'));
        if (!media && !privacy) return;
        document.getElementById('rs-apptext')?.remove();
        const box = el('section', { id: 'rs-apptext', 'data-id': post.id, 'aria-label': 'Text version' }, [el('div', { class: 'rs-at-label', text: 'Text version' }), body]);
        if (privacy) privacy.after(box); else { box.slot = 'post-media-container'; media.after(box); }
      }).catch(() => { /* the app's picture stays on its own */ });
  };

  // ---------- remembered collapsed comments (RES) ----------
  // Reddit folds a comment by closing the <details> inside it. Remember which ones you folded and fold them again next time.
  const collapsedMap = () => readJSON('rs-collapsed');
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d?.tagName !== 'DETAILS' || d.parentElement?.tagName !== 'SHREDDIT-COMMENT' || !cfg.enabled) return;
    if (!d.open) foldInfo(d.parentElement);
    if (d.parentElement.rsQuiet) { d.parentElement.rsQuiet = false; return; }
    const id = d.parentElement.getAttribute('thingid');
    if (!id) return;
    const m = collapsedMap();
    if (d.open) delete m[id]; else m[id] = Date.now();
    const ids = Object.keys(m);
    if (ids.length > 5000) for (const old of ids.sort((a, b) => m[a] - m[b]).slice(0, ids.length - 4000)) delete m[old];
    try { localStorage.setItem('rs-collapsed', JSON.stringify(m)); } catch { /* storage full */ }
  }, true);

  // ---------- the post's own video on its page ----------
  // Reddit's player box spans the whole content column and caps its height, so on a wide window the video sat in a wide
  // black strip (and RESpawn's own cap on post pictures then cut off its controls). Its box now takes the video's own
  // shape: as wide as the column allows while the whole video, controls included, stays on screen under the title.
  // Drag on it (above its controls) or on the corner grip to resize it, up to the window's right edge.
  const postVideo = () => {
    if (!cfg.enabled || !isCommentsPage()) return;
    const pl = document.querySelector('shreddit-post[view-context="CommentsPage"] > [slot="post-media-container"] :is(shreddit-player, shreddit-player-2)');
    if (!pl || pl.rsSized) return;
    const shape = pl.closest('[style*="aspect-ratio"]'), frame = shape?.parentElement; // Reddit's box with the video's shape, and the black box round it
    const ar = parseFloat((shape?.getAttribute('style') || '').match(/aspect-ratio:\s*([\d.]+)/)?.[1]);
    if (!(ar > 0.2 && ar < 6) || !frame?.closest('[slot="post-media-container"]')) return;
    pl.rsSized = true;
    shape.classList.add('rs-pv-in'); frame.classList.add('rs-pv'); frame.style.setProperty('--rs-ar', String(ar));
    const normal = () => { frame.style.removeProperty('width'); frame.style.removeProperty('max-width'); };
    zoomable(frame, {
      surface: pl, controls: 56, width: () => frame.getBoundingClientRect().width, reset: normal,
      set: (px) => { frame.style.setProperty('width', `${px}px`, 'important'); frame.style.setProperty('max-width', 'none', 'important'); },
    });
  };

  // ---------- comment pages ----------
  // "parent" jumps up to the comment this one answers and flashes it; if that comment isn't on the page, it opens it.
  const parentLink = (c) => {
    const a = el('a', { href: c.getAttribute('parent-permalink') || c.getAttribute('permalink') || '#', text: 'parent', title: 'Go to the comment this replies to' });
    a.onclick = (e) => {
      const p = document.querySelector(`shreddit-comment[thingid="${c.getAttribute('parentid')}"]`);
      if (!p || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault();
      const own = [...p.querySelectorAll('[slot="commentMeta"], [slot="comment"]')].filter((x) => x.closest('shreddit-comment') === p);
      (own[0] || p).scrollIntoView({ block: 'center', behavior: 'smooth' });
      own.forEach((x) => { x.classList.add('rs-flash'); clearTimeout(x.rsFlash); x.rsFlash = setTimeout(() => x.classList.remove('rs-flash'), 1500); });
    };
    return a;
  };
  // The rest of old RES's row under each comment. Each link uses Reddit's own part where there is one (its Reply button,
  // Report in its "..." menu); save sends the same request as Reddit's own Save. Reddit's comment list, read once per post
  // page (see loadFlairs), says which comments you saved and holds each comment as written, for "source".
  const ownOf = (c, css, root = c) => [...root.querySelectorAll(css)].find((x) => x.closest('shreddit-comment') === c);
  const linkBtn = (text, title, fn, cls) => {
    const a = el('a', { href: '#', role: 'button', class: cls || null, text, title });
    a.onclick = (e) => { e.preventDefault(); fn(a); };
    return a;
  };
  // "source": the comment as its writer typed it (markdown), in a box under the comment to read or copy
  const srcToggle = async (c, a) => {
    if (c.rsSrc?.isConnected) { c.rsSrc.remove(); c.rsSrc = null; a.setAttribute('aria-expanded', 'false'); return; }
    const body = ownOf(c, '[slot="comment"]');
    if (!body) return;
    const id = c.getAttribute('thingid');
    const ta = el('textarea', { class: 'rs-src-text', readonly: true, spellcheck: 'false', rows: '2', 'aria-label': 'Comment source' });
    const copy = el('button', { type: 'button', class: 'rs-btn', text: 'Copy' });
    const close = el('button', { type: 'button', class: 'rs-btn', text: 'Close' });
    copy.onclick = async () => toast((await copyText(ta.value)) ? 'Source copied.' : 'Press Ctrl+C to copy it.');
    close.onclick = () => srcToggle(c, a);
    const box = c.rsSrc = el('div', { class: 'rs-src' }, [ta, el('div', { class: 'rs-src-bar' }, [copy, close])]);
    body.after(box);
    a.setAttribute('aria-expanded', 'true');
    let text = aflair.body.get(id);
    if (typeof text !== 'string') {
      ta.value = 'Loading…'; copy.disabled = true;
      try {
        const j = await (await fetch(`${c.getAttribute('permalink')}.json?raw_json=1&limit=1&depth=1`, { credentials: 'include' })).json();
        const x = j?.[1]?.data?.children?.[0]?.data;
        if (x?.name === id && typeof x.body === 'string') { text = x.body; aflair.body.set(id, text); }
      } catch { /* said below */ }
      if (c.rsSrc !== box) return;
      if (typeof text !== 'string') { ta.value = 'Reddit did not send this comment. Try again.'; return; }
    }
    ta.value = text; copy.disabled = false;
    ta.style.height = `${Math.min(ta.scrollHeight + 2, 320)}px`;
  };
  const paintSave = (a) => { const on = savedComments.has(a.dataset.id); setText(a, on ? 'unsave' : 'save'); a.title = on ? 'Remove from your saved comments' : 'Save this comment'; };
  const paintSaves = (id) => document.querySelectorAll(id ? `.rs-csave[data-id="${id}"]` : '.rs-csave').forEach(paintSave);
  const saveToggle = async (c, a) => {
    const id = c.getAttribute('thingid');
    if (a.dataset.busy || needLogin('save')) return;
    const on = !savedComments.has(id);
    a.dataset.busy = '1';
    try {
      await gql('UpdateCommentSaveState', { commentId: id, saveState: on ? 'SAVED' : 'NONE' });
      if (on) savedComments.add(id); else savedComments.delete(id);
      paintSaves(id);
    } catch { toast('Reddit did not take that. Try again.'); }
    delete a.dataset.busy;
  };
  // Reddit's own report window, from the Report item in its "..." menu for this comment
  const reportOpen = (c) => {
    const menu = ownOf(c, 'shreddit-overflow-menu')?.shadowRoot;
    const item = menu?.querySelector('faceplate-tracker[noun="report"] li, li.report-menu-button');
    if (!item) { toast('Reddit has not finished loading that comment. Try again.'); return; }
    menu.querySelector('#overflow-trigger')?.click(); // open the menu first, as a click would
    requestAnimationFrame(() => (item.querySelector('[tabindex]') || item).click());
  };
  // Reddit's own Reply button: it opens the reply box under this comment with the cursor in it
  const replyOpen = (c) => {
    const b = ownOf(c, '[slot="comment-reply"] button');
    if (b) b.click(); else toast('Reddit has not finished loading that comment. Try again.');
  };
  // "hide child comments" folds this comment's replies only (RES); the comment itself stays open
  const kidsToggle = (c, a) => {
    const shut = c.toggleAttribute('rs-kids-shut');
    setText(a, shut ? 'show child comments' : 'hide child comments');
    a.setAttribute('aria-expanded', String(!shut));
    updateNav();
  };
  const commentLinks = (c) => {
    const id = c.getAttribute('thingid');
    const src = linkBtn('source', 'Show this comment as it was written', (a) => srcToggle(c, a));
    src.setAttribute('aria-expanded', 'false');
    const save = linkBtn('save', '', (a) => saveToggle(c, a), 'rs-csave');
    save.dataset.id = id; paintSave(save);
    const kidsA = linkBtn('hide child comments', 'Fold the replies to this comment', (a) => kidsToggle(c, a), 'rs-kids-me');
    kidsA.setAttribute('aria-expanded', 'true');
    if (c.getAttribute('depth') === '0') kidsA.dataset.top = ''; // "Hide all replies" gives top comments their own link
    return [src, save, linkBtn('report', 'Report this comment to the moderators', () => reportOpen(c)), linkBtn('reply', 'Reply to this comment', () => replyOpen(c)), kidsA];
  };
  // Author flair right after the name, in old Reddit's small grey box. Reddit draws it on a second line and leaves it
  // out on some comments (often a person's later comments in the same thread, and picture-only flair), so the post's
  // comments are read once per post page (one request) and every comment by that person gets it.
  const aflair = { post: '', byId: new Map(), byName: new Map(), body: new Map(), done: false };
  // Reddit doesn't mark saved comments on the page; its comment list does, and comments saved here are added
  const savedComments = new Set();
  const aflairBox = (rich, text) => {
    const s = el('span', { class: 'rs-aflair' });
    const parts = Array.isArray(rich) && rich.length ? rich : [{ e: 'text', t: text || '' }];
    for (const p of parts) {
      if (p?.e === 'text' && p.t) s.append(p.t);
      else if (p?.e === 'emoji' && FLAIR_IMG.test(p.u || '')) s.append(el('img', { class: 'rs-flair-emoji', src: p.u, alt: '', loading: 'lazy' }));
    }
    s.normalize();
    if (s.firstChild?.nodeType === 3) s.firstChild.textContent = s.firstChild.textContent.trimStart();
    if (s.lastChild?.nodeType === 3) s.lastChild.textContent = s.lastChild.textContent.trimEnd();
    if (!s.textContent.trim() && !s.querySelector('img')) return null;
    s.title = s.textContent.trim();
    return s;
  };
  const paintFlair = (c) => {
    if (c.hasAttribute('rs-aflair')) return;
    const trig = c.querySelector(':scope > details > summary [slot="commentMeta"] .author-hovercard-trigger');
    if (!trig) return;
    const own = [...c.querySelectorAll('author-flair-event-handler')].find((f) => f.closest('shreddit-comment') === c);
    const j = aflair.byId.get(c.getAttribute('thingid')) || aflair.byName.get(String(c.getAttribute('author')).toLowerCase());
    // Reddit's own words when it drew them (text only), else the post's comment list; pictures only from the list
    const domText = own && !own.querySelector('img') ? own.textContent.replace(/\s+/g, ' ').trim() : '';
    const box = j ? aflairBox(j.rich, j.text) : domText ? aflairBox(null, domText) : null;
    if (!box) return;
    trig.after(box);
    c.setAttribute('rs-aflair', '');
  };
  const loadFlairs = (postId) => {
    if (aflair.post === postId) return;
    aflair.post = postId; aflair.byId = new Map(); aflair.byName = new Map(); aflair.body = new Map(); aflair.done = false;
    fetch(`/comments/${postId.replace(/^t3_/, '')}/.json?limit=500&raw_json=1`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (aflair.post !== postId || !Array.isArray(d)) return;
        const walk = (L) => {
          for (const k of L || []) {
            const x = k?.kind === 't1' && k.data;
            if (!x) continue;
            if (typeof x.body === 'string') aflair.body.set(`t1_${x.id}`, x.body); // for "source"
            if (x.saved) savedComments.add(`t1_${x.id}`);
            if (x.author_flair_text || x.author_flair_richtext?.length) {
              const f = { text: String(x.author_flair_text || ''), rich: x.author_flair_richtext };
              aflair.byId.set(`t1_${x.id}`, f);
              if (validUser(x.author)) aflair.byName.set(x.author.toLowerCase(), f);
            }
            walk(x.replies?.data?.children);
          }
        };
        walk(d[1]?.data?.children);
        aflair.done = true;
        for (const c of document.querySelectorAll('shreddit-comment[data-rs]:not([rs-aflair])')) paintFlair(c);
        paintSaves();
      }).catch(() => { /* Reddit's own flair stays */ });
  };
  const comments = () => {
    const page = document.querySelector('shreddit-post[view-context="CommentsPage"]');
    if (!page) return;
    const op = page.getAttribute('author');
    const pa = page.querySelector('[slot="authorName"] a.author-name');
    if (pa && validUser(op) && !page.querySelector('[slot="authorName"] .rs-ut')) (pa.closest('faceplate-hovercard') || pa).after(nameTag(op));
    // Reddit has its own small card on the post's author: with RESpawn's hover cards on, only ours opens there
    pa?.closest('faceplate-hovercard')?.classList.toggle('rs-own-card', !!cfg.hoverCards);
    if (cfg.enabled && page.id) loadFlairs(page.id);
    const key = `rs-visit-${page.getAttribute('id')}`;
    if (comments.started !== key) {
      nav?.remove(); nav = null; navI = -1;
      comments.started = key;
      if (cfg.simulateLastVisitHoursAgo) localStorage.setItem(key, String(Date.now() - cfg.simulateLastVisitHoursAgo * 3600e3));
      comments.last = +localStorage.getItem(key) || 0;
      localStorage.setItem(key, String(Date.now()));
      addNavigator();
      html.classList.toggle('rs-kids-hidden', !!cfg.hideKids);
    }
    let folded = null; // your folded comments, read only when there are new comments to look at
    const me = myName();
    for (const c of document.querySelectorAll('shreddit-comment:not([data-rs])')) {
      const meta = c.querySelector('[slot="commentMeta"]');
      if (!meta) continue;
      c.setAttribute('data-rs', '1');
      if ((folded ||= collapsedMap())[c.getAttribute('thingid')]) { const d = c.querySelector(':scope > details'); if (d?.open) d.open = false; }
      const author = c.getAttribute('author') || '';
      if (author === op || c.getAttribute('is-op') === 'true') c.setAttribute('rs-op', '');
      if (me && author.toLowerCase() === me) c.setAttribute('rs-me', '');
      if (c.getAttribute('is-mod-distinguished') === 'true') c.setAttribute('rs-mod', '');
      if (friendSet().has(author.toLowerCase())) c.setAttribute('rs-friend', '');
      const nm = meta.querySelector('.author-name-meta');
      if (nm && validUser(author)) (nm.closest('.author-hovercard-trigger') || nm).after(nameTag(author));
      paintFlair(c);
      // Reddit's "Top 1% Commenter" now sits in its own box under the name, outside the badges the setting hides
      for (const b of meta.querySelectorAll('.author-hovercard-trigger img[alt^="Profile Badge"]')) b.closest('.author-hovercard-trigger').classList.add('rs-pbadge');
      if (ignored(author)) ignoreComment(c, true);
      if (comments.last && Date.parse(c.getAttribute('created')) > comments.last) { c.setAttribute('rs-new', ''); meta.append(el('span', { class: 'rs-badge rs-is-new', text: 'new' })); }
      const links = el('span', { class: 'rs-cacts' }, [el('a', { href: c.getAttribute('permalink') || '#', text: 'permalink' })]);
      if (+c.getAttribute('depth') > 0 && c.getAttribute('parentid')) links.append(parentLink(c));
      links.append(...commentLinks(c));
      c.rsLinks = links;
      placeLinks(c);
      if (c.querySelector(':scope > details:not([open])')) foldInfo(c);
    }
    for (const c of document.querySelectorAll('shreddit-comment[rs-links-wait]')) placeLinks(c);
    kids(); updateNav(); moreReplies();
  };
  // Reddit draws a comment's buttons only once it scrolls into view. Links put in before that sat at the left and then
  // jumped right when the buttons came (seen on 134 of 150 comments), so they wait for Reddit's buttons.
  const placeLinks = (c) => {
    const row = c.querySelector(':scope > details [slot="actionRow"]');
    if (row && !row.querySelector(':scope > shreddit-comment-action-row')) { c.setAttribute('rs-links-wait', ''); return; }
    c.removeAttribute('rs-links-wait');
    c.rsLinks.querySelectorAll('.rs-csave').forEach(paintSave);
    (row || c.querySelector('[slot="commentMeta"]')).append(c.rsLinks);
  };
  // Hide all replies (RES's "hide child comments"): only the top comments show, each with its own "show N replies".
  // A button next to Reddit's comment sort switches it for this page; a setting starts every post that way.
  const kidsOf = (c) => [...c.querySelectorAll(':scope > details [slot^="children"]')];
  const kidsCount = (c) => {
    let n = c.querySelectorAll('shreddit-comment').length;
    for (const b of c.querySelectorAll('faceplate-partial[loading="action"] button')) n += +(b.textContent.match(/(\d+)\s+more repl/i) || [])[1] || 0;
    return n;
  };
  // A folded comment still says its points and how many replies sit under it, like RES ("-14 points ... (3 children)").
  // Drawn into Reddit's name line, shown only while the comment is folded, and brought up to date each time it folds.
  const foldInfo = (c) => {
    const meta = c.querySelector(':scope > details > summary [slot="commentMeta"]');
    const trig = meta?.querySelector('.author-hovercard-trigger');
    const row = trig?.parentElement || meta?.querySelector('faceplate-timeago')?.closest('div'); // deleted comments have no name link
    if (!row) return;
    let pts = c.rsFoldPts, n = c.rsFoldKids;
    if (!pts?.isConnected) {
      pts = c.rsFoldPts = el('span', { class: 'rs-fold rs-fold-pts' });
      n = c.rsFoldKids = el('span', { class: 'rs-fold rs-fold-kids' });
      let at = trig;
      while (at?.nextElementSibling?.matches('.rs-ut, .rs-aflair')) at = at.nextElementSibling;
      if (at) at.after(pts); else row.append(pts);
      row.append(n);
    }
    // Reddit gives no score for deleted comments; those show only their replies, as on old Reddit
    const s = c.getAttribute('score');
    pts.textContent = s === null || s === '' || Number.isNaN(+s) ? '' : `${(+s).toLocaleString()} point${Math.abs(+s) === 1 ? '' : 's'}`;
    const k = kidsCount(c);
    n.textContent = `(${k.toLocaleString()} ${k === 1 ? 'child' : 'children'})`;
  };
  const kidsPaint = () => {
    const b = document.getElementById('rs-kids');
    if (b) { const on = html.classList.contains('rs-kids-hidden'); setText(b, on ? 'Show all replies' : 'Hide all replies'); b.setAttribute('aria-pressed', String(on)); }
  };
  const kids = () => {
    const sort = document.querySelector('shreddit-comments-sort-dropdown');
    if (sort && !document.getElementById('rs-kids')) {
      const b = el('button', { type: 'button', id: 'rs-kids', class: 'rs-btn', title: 'Show only the top comments, or every reply' });
      b.onclick = () => {
        html.classList.toggle('rs-kids-hidden');
        for (const c of document.querySelectorAll('shreddit-comment[rs-kids-open]')) c.removeAttribute('rs-kids-open');
        kidsPaint(); kids(); updateNav();
      };
      sort.after(b);
    }
    kidsPaint();
    if (!html.classList.contains('rs-kids-hidden')) return;
    for (const c of document.querySelectorAll('shreddit-comment[depth="0"][data-rs]')) {
      let t = c.rsKids;
      if (!t?.isConnected) {
        if (!kidsOf(c).length) continue;
        t = el('a', { href: '#', class: 'rs-kids-one', role: 'button' });
        t.onclick = (e) => { e.preventDefault(); c.toggleAttribute('rs-kids-open'); kids(); updateNav(); };
        [...c.querySelectorAll('.rs-cacts')].find((x) => x.closest('shreddit-comment') === c)?.append(t);
        c.rsKids = t;
      }
      const n = kidsCount(c);
      setText(t, c.hasAttribute('rs-kids-open') ? 'hide replies' : `show ${n} repl${n === 1 ? 'y' : 'ies'}`);
    }
  };
  // Comment navigator (RES): jump between new comments, the poster's, mods', friends', your own, people you tagged.
  // A slim column of buttons in the bottom-right corner (back-to-top sits on top of it), so it covers no comments:
  // the kind to jump between (its menu opens to the left), up, how many, down.
  let nav = null, navI = -1, navKind = 'new';
  const NAV = [['new', 'New comments', '[rs-new]', 'New'], ['op', 'By the poster (OP)', '[rs-op]', 'OP'], ['mod', 'Moderators', '[rs-mod]', 'Mod'], ['friend', 'Friends', '[rs-friend]', 'Frnd'], ['me', 'Your comments', '[rs-me]', 'You'], ['tagged', 'People you tagged', '', 'Tag']];
  const NAV_UP = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 12.5l5-5 5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const NAV_DOWN = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const navOf = (k) => NAV.find((n) => n[0] === k) || NAV[0];
  const navList = (k) => {
    const css = navOf(k)[2];
    const L = [...document.querySelectorAll(`shreddit-comment[data-rs]${css}`)].filter((c) => shown(ownParts(c)[0]));
    return k === 'tagged' ? L.filter((c) => tagOf(c.getAttribute('author'))) : L;
  };
  const addNavigator = () => {
    nav = el('div', { id: 'rs-nav', role: 'navigation', 'aria-label': 'Comment navigator' });
    const kind = el('button', { type: 'button', class: 'rs-nav-kind', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
    const prev = el('button', { type: 'button', class: 'rs-nav-prev', html: NAV_UP }), next = el('button', { type: 'button', class: 'rs-nav-next', html: NAV_DOWN });
    const go = (d) => {
      const L = navList(navKind);
      if (!L.length) return updateNav();
      navI = (Math.min(navI, L.length - 1) + d + L.length) % L.length;
      const c = L[navI];
      ownParts(c)[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (cfg.keys) select(c, false);
      updateNav();
    };
    prev.onclick = () => go(-1); next.onclick = () => go(1);
    kind.onclick = (e) => { e.stopPropagation(); if (!closeNavMenu(true)) openNavMenu(); };
    nav.append(kind, prev, el('span', { class: 'rs-count' }), next);
    document.body.append(nav);
    updateNav();
  };
  // The kinds to jump between, in a small menu to the left of the column (arrow keys move, Enter picks, Esc closes)
  const navMenuOutside = (e) => { if (!e.target.closest?.('#rs-nav')) closeNavMenu(); };
  const closeNavMenu = (focus) => {
    const m = document.getElementById('rs-nav-menu');
    document.removeEventListener('click', navMenuOutside, true);
    if (!m) return false;
    m.remove();
    const k = nav?.querySelector('.rs-nav-kind');
    k?.setAttribute('aria-expanded', 'false');
    if (focus) k?.focus();
    return true;
  };
  const openNavMenu = () => {
    const k = nav?.querySelector('.rs-nav-kind');
    if (!k) return;
    const m = el('div', { id: 'rs-nav-menu', role: 'menu', 'aria-label': 'Jump between' });
    for (const [v, t] of NAV) {
      const o = el('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(v === navKind), tabindex: '-1', text: t });
      o.onclick = (e) => { e.stopPropagation(); navKind = v; navI = -1; closeNavMenu(true); updateNav(); };
      m.append(o);
    }
    m.onkeydown = (e) => {
      const L = [...m.children], i = L.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') L[(i + (e.key === 'ArrowDown' ? 1 : -1) + L.length) % L.length].focus();
      else if (e.key === 'Home' || e.key === 'End') L[e.key === 'Home' ? 0 : L.length - 1].focus();
      else if (e.key === 'Escape') closeNavMenu(true);
      else { if (e.key === 'Tab') closeNavMenu(); return; }
      e.preventDefault(); e.stopPropagation();
    };
    nav.append(m);
    k.setAttribute('aria-expanded', 'true');
    (m.querySelector('[aria-checked="true"]') || m.firstChild).focus();
    setTimeout(() => document.addEventListener('click', navMenuOutside, true), 0);
  };
  const updateNav = () => {
    if (!nav) return;
    const [, label, , short] = navOf(navKind), L = navList(navKind), n = L.length ? Math.max(Math.min(navI, L.length - 1) + 1, 0) : 0;
    const k = nav.querySelector('.rs-nav-kind'), count = nav.querySelector('.rs-count');
    setText(k, short);
    k.title = `Jump between: ${label}. Click to change.`; k.setAttribute('aria-label', `Jump between: ${label}`);
    for (const [c, t] of [['.rs-nav-prev', 'Previous'], ['.rs-nav-next', 'Next']]) { const b = nav.querySelector(c); b.title = `${t}: ${label}`; b.setAttribute('aria-label', b.title); }
    setText(count, `${n}/${L.length}`);
    count.title = `${n} of ${L.length}: ${label}`;
  };
  // Your Reddit name, for "Your comments". Asked of Reddit once a day.
  const myName = () => {
    const c = readJSON('rs-me');
    if (loggedIn() && !myName.busy && Date.now() - (+c.t || 0) > 864e5) {
      myName.busy = true;
      fetch('/api/me.json', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        const n = j?.data?.name || j?.name;
        if (validUser(n)) { try { localStorage.setItem('rs-me', JSON.stringify({ name: n.toLowerCase(), t: Date.now() })); } catch { /* storage full */ } }
      }).catch(() => { /* next time */ });
    }
    return loggedIn() ? c.name || '' : '';
  };
  // "N more replies" and "View more comments" load by themselves as they come near the bottom of the screen
  // (RES's never-ending comments). One at a time, a moment apart; "Continue this thread" pages are left alone.
  const moreQ = [];
  let moreBusy = false;
  const moreIO = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting && !e.target.rsPressed && !moreQ.includes(e.target)) moreQ.push(e.target);
    pressMore();
  }, { rootMargin: '0px 0px 500px 0px' }) : null;
  const pressMore = () => {
    if (moreBusy) return;
    const b = moreQ.shift();
    if (!b) return;
    if (!b.isConnected || b.rsPressed || !shown(b) || !cfg.enabled || !cfg.autoReplies) { pressMore(); return; }
    moreBusy = true; b.rsPressed = true; moreIO?.unobserve(b);
    b.click();
    setTimeout(() => { moreBusy = false; pressMore(); }, 700);
  };
  const moreReplies = () => {
    if (!moreIO || !cfg.enabled || !cfg.autoReplies) return;
    for (const b of document.querySelectorAll('faceplate-partial[loading="action"] button')) {
      if (b.rsWatched || !/more repl|view more comments/i.test(b.textContent)) continue;
      b.rsWatched = true; moreIO.observe(b);
    }
  };

  // ---------- keyboard (RES's keys) ----------
  // In a feed the keys move through our rows; on a post page through the post and every comment you can see.
  // Reddit has its own keys, but in a feed they go to the cards RESpawn hides, so RESpawn answers the keys it uses.
  const KEYS = {
    feed: [['j / k', 'Next / previous post'], ['J / K', 'Last / first post'], ['a / z', 'Upvote / downvote'], ['Enter', 'Open the link (Shift: new tab)'],
      ['c', 'Open comments (Shift: new tab)'], ['x', 'Expand or close'], ['X', 'Show images or hide them'], ['s', 'Save or unsave'], ['h', 'Hide'],
      ['l', 'Copy the link'], ['r', 'Go to the subreddit'], ['u', 'Go to the poster']],
    comments: [['j / k', 'Next / previous comment'], ['J / K', 'Next / previous at the same level'], ['p', 'Parent comment'], ['t', 'Top of this thread'],
      ['Enter or f', 'Fold or unfold'], ['a / z', 'Upvote / downvote'], ['r', 'Reply'], ['s', 'Save or unsave'], ['l', 'Copy the link'], ['u', 'Go to the poster'], ['?', 'This list']],
  };
  let keyHelp = null;
  const closeKeyHelp = () => { keyHelp?.remove(); keyHelp = null; };
  const openKeyHelp = () => {
    if (keyHelp) return closeKeyHelp();
    keyHelp = el('div', { id: 'rs-keyhelp', class: 'rs-modal', role: 'dialog', 'aria-label': 'Keyboard shortcuts' });
    const x = el('button', { type: 'button', class: 'rs-panel-x', 'aria-label': 'Close', html: ICON.close });
    x.onclick = closeKeyHelp;
    const keyCell = (k) => el('dt', {}, k.split(' ').map((p) => (p === '/' || p === 'or' ? ` ${p} ` : el('kbd', { text: p }))));
    const list = (title, rows) => el('section', {}, [el('h3', { text: title }), el('dl', {}, rows.flatMap(([k, t]) => [keyCell(k), el('dd', { text: t })]))]);
    const done = el('button', { type: 'button', class: 'rs-done', text: 'Done' });
    done.onclick = closeKeyHelp;
    keyHelp.append(el('div', { class: 'rs-panel-head' }, [el('b', { text: 'Keyboard shortcuts' }), x]),
      el('div', { class: 'rs-kh-cols' }, [list('In a feed', KEYS.feed), list('On a post', KEYS.comments)]),
      el('div', { class: 'rs-panel-foot' }, [el('span'), done]));
    document.body.append(keyHelp);
    done.focus();
  };

  let sel = null;
  const lastSel = new Map(); // page address -> post you were on, so Back lands on it again
  const shown = (e) => !!(e && e.isConnected && e.getClientRects().length);
  const ownParts = (c) => [...c.querySelectorAll('[slot="commentMeta"], [slot="comment"]')].filter((x) => x.closest('shreddit-comment') === c);
  const isComment = (x) => x?.tagName === 'SHREDDIT-COMMENT';
  const items = () => {
    if (!isCommentsPage()) return [...document.querySelectorAll('.rs-row')].filter(shown);
    const post = document.querySelector('shreddit-post[view-context="CommentsPage"]');
    return [post, ...[...document.querySelectorAll('shreddit-comment')].filter((c) => shown(ownParts(c)[0]))].filter(Boolean);
  };
  const topGap = () => {
    let g = 0;
    for (const x of document.querySelectorAll('reddit-header-large, reddit-header-large header, #rs-shortcuts')) {
      const p = getComputedStyle(x).position;
      if (p === 'fixed' || p === 'sticky') g = Math.max(g, x.getBoundingClientRect().bottom);
    }
    return g;
  };
  const partsOf = (x) => (isComment(x) ? ownParts(x) : [x]);
  const topOf = (x) => (partsOf(x)[0] || x).getBoundingClientRect().top;
  const select = (it, scroll = true) => {
    for (const x of document.querySelectorAll('.rs-sel')) x.classList.remove('rs-sel');
    sel = it || null;
    if (!sel) return;
    const parts = partsOf(sel);
    parts.forEach((x) => x.classList.add('rs-sel'));
    if (scroll && parts.length) {
      const top = parts[0].getBoundingClientRect().top, bottom = parts[parts.length - 1].getBoundingClientRect().bottom, g = topGap() + 8;
      if (top < g || bottom > innerHeight - 8) window.scrollBy({ top: top - g, behavior: 'instant' });
    }
    if (isComment(sel)) sel.querySelector(':scope > details')?.focus({ preventScroll: true }); // Reddit's own keys follow focus
    else if (document.activeElement && document.activeElement !== document.body && !document.activeElement.closest?.('#rs-keyhelp')) document.activeElement.blur?.();
    if (sel.classList.contains('rs-row')) lastSel.set(location.href, sel.dataset.rsId);
  };
  const move = (d) => {
    const L = items();
    if (!L.length) return;
    const i = L.indexOf(sel);
    if (i >= 0) return select(L[Math.max(0, Math.min(L.length - 1, i + d))]);
    const g = topGap();
    const first = L.findIndex((x) => topOf(x) >= g - 4); // nothing picked yet: start with what's on screen
    select(L[first < 0 ? L.length - 1 : first]);
  };
  const moveLevel = (d) => {
    const L = items(), i = L.indexOf(sel);
    if (i < 0 || !isComment(sel)) return move(d);
    const dp = +sel.getAttribute('depth') || 0;
    for (let k = i + d; k >= 1 && k < L.length; k += d) if ((+L[k].getAttribute('depth') || 0) <= dp) return select(L[k]);
  };
  const parentOf = (c) => document.querySelector(`shreddit-comment[thingid="${c.getAttribute('parentid')}"]`);
  const toParent = () => { if (isComment(sel) && +sel.getAttribute('depth') > 0) { const p = parentOf(sel); if (p) select(p); } };
  const toTop = () => { let c = sel; while (isComment(c) && +c.getAttribute('depth') > 0 && parentOf(c)) c = parentOf(c); if (c && c !== sel) select(c); };
  const fold = () => {
    if (!isComment(sel)) return;
    const d = sel.querySelector(':scope > details');
    if (d) { d.open = !d.open; select(sel); }
  };
  const ownButton = (c, css) => [...c.querySelectorAll(css)].find((x) => x.closest('shreddit-comment') === c);
  const voteSel = (dir) => {
    if (!sel) return;
    if (sel.classList.contains('rs-row')) return sel.querySelector(dir === 'up' ? '.rs-up' : '.rs-down')?.click();
    const root = isComment(sel) ? ownButton(sel, 'shreddit-comment-action-row')?.shadowRoot : sel.shadowRoot;
    const b = root?.querySelector(dir === 'up' ? 'button[upvote]' : 'button[downvote]');
    if (b) b.click(); else toast('Reddit has not finished loading that one. Try again.');
  };
  const postOf = (x) => (x?.classList.contains('rs-row') ? x.rsPost : x?.tagName === 'SHREDDIT-POST' ? x : null);
  const linkOf = (x) => new URL(isComment(x) ? x.getAttribute('permalink') : postOf(x)?.getAttribute('permalink') || location.pathname, location.origin).href;
  const go = (path, newTab) => { if (newTab) window.open(new URL(path, location.origin).href, '_blank', 'noopener'); else location.assign(path); };
  const openIn = (a, newTab) => { if (!a) return; if (newTab) window.open(a.href, '_blank', 'noopener'); else a.click(); };
  // s on a post page. Reddit's own s saves the post even when a comment is picked, so RESpawn answers it.
  // Which comments you saved comes from Reddit's comment list (see savedComments), shared with the "save" links.
  const saveSel = async () => {
    if (!sel || needLogin('save')) return;
    try {
      if (isComment(sel)) {
        const id = sel.getAttribute('thingid'), on = !savedComments.has(id);
        await gql('UpdateCommentSaveState', { commentId: id, saveState: on ? 'SAVED' : 'NONE' });
        if (on) savedComments.add(id); else savedComments.delete(id);
        paintSaves(id);
        toast(on ? 'Comment saved. Press s again to unsave.' : 'Comment removed from saved.');
      } else if (sel.tagName === 'SHREDDIT-POST') {
        const menu = sel.querySelector('shreddit-post-overflow-menu'), on = !menu?.hasAttribute('is-post-saved');
        await gql('UpdatePostSaveState', { postId: sel.id, saveState: on ? 'SAVED' : 'NONE' });
        menu?.toggleAttribute('is-post-saved', on);
        toast(on ? 'Post saved.' : 'Post removed from saved.');
      }
    } catch { toast('Reddit did not take that. Try again.'); }
  };
  const hideSel = async () => {
    const L = items(), i = L.indexOf(sel), row = sel;
    await row.querySelector('.rs-hide')?.onclick?.();
    if (row.classList.contains('rs-gone')) select(L[i + 1] || L[i - 1]);
  };
  const KEYMAP = {
    feed: {
      j: () => move(1), k: () => move(-1), J: () => { const L = items(); select(L[L.length - 1]); }, K: () => select(items()[0]),
      a: () => voteSel('up'), z: () => voteSel('down'),
      Enter: (e) => openIn(sel?.querySelector('.rs-title'), e.shiftKey),
      c: () => openIn(sel?.querySelector('.rs-acts a'), false), C: () => openIn(sel?.querySelector('.rs-acts a'), true),
      x: () => sel?.querySelector('.rs-x')?.click(), X: () => document.querySelector('.rs-expand-all')?.click(),
      s: () => sel?.querySelector('.rs-save')?.click(), h: () => sel && hideSel(),
      l: async () => sel && toast((await copyText(linkOf(sel))) ? 'Link copied.' : 'Could not copy the link.'),
      r: () => { const p = postOf(sel); if (p) go(`/${p.getAttribute('subreddit-prefixed-name')}/`); },
      u: () => { const p = postOf(sel); if (p?.getAttribute('author')) go(`/user/${p.getAttribute('author')}/`); },
    },
    comments: {
      j: () => move(1), k: () => move(-1), J: () => moveLevel(1), K: () => moveLevel(-1), p: toParent, t: toTop, Enter: fold, f: fold,
      a: () => voteSel('up'), z: () => voteSel('down'),
      r: () => { if (isComment(sel)) ownButton(sel, '[slot="comment-reply"] button')?.click(); },
      s: saveSel,
      l: async () => sel && toast((await copyText(linkOf(sel))) ? 'Link copied.' : 'Could not copy the link.'),
      u: () => { const a = sel?.getAttribute('author'); if (a) go(`/user/${a}/`); },
      // Reddit's own h and x act on the post whatever is picked, so they do nothing here
      h: () => {}, x: () => {},
    },
  };
  const REPEATS = new Set(['j', 'k', 'J', 'K']);
  const skipKey = (e) => {
    const path = e.composedPath(), t = path[0];
    if (!t?.closest) return false;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest('[contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return true;
    if ((e.key === 'Enter' || e.key === ' ') && t.closest('button, a, summary, [role="button"], [role="menuitem"]')) return true;
    return path.some((n) => n.getAttribute && n.id !== 'rs-keyhelp' && (n.tagName === 'DIALOG' || n.getAttribute('aria-modal') === 'true' || (n.getAttribute('role') === 'dialog' && n.id !== 'rs-panel')));
  };
  window.addEventListener('keydown', (e) => {
    if (!cfg.enabled || !cfg.keys || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || panel || editor || dash) return;
    if (keyHelp && (e.key === 'Escape' || e.key === '?')) { e.preventDefault(); e.stopImmediatePropagation(); closeKeyHelp(); return; }
    if (skipKey(e)) return;
    const fn = e.key === '?' ? openKeyHelp : KEYMAP[isCommentsPage() ? 'comments' : 'feed'][e.key];
    if (!fn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat && !REPEATS.has(e.key)) return;
    fn(e);
  }, true);
  // Left and right turn a gallery: the one under the pointer, else the picked row's open one. Otherwise they keep
  // their usual job (scrolling).
  window.addEventListener('keydown', (e) => {
    if (!cfg.enabled || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing || skipKey(e)) return;
    const t = e.composedPath()[0]; // keys meant for something else that has the focus (a menu, the settings window) stay theirs
    if (t && t !== document.body && t !== html && !t.closest?.('.rs-row')) return;
    const g = (galHover && shown(galHover.root) && galHover) || (sel?.classList?.contains('rs-row') && [...sel.querySelectorAll('.rs-box:not([hidden]) .rs-gal')].find(shown)?.rsGal);
    if (!g) return;
    e.preventDefault(); e.stopImmediatePropagation();
    g.step(e.key === 'ArrowRight' ? 1 : -1);
  }, true);
  // Clicking a post or comment picks it, like RES
  document.addEventListener('click', (e) => {
    if (!cfg.enabled || !cfg.keys || !e.isTrusted) return;
    const t = e.target;
    const it = t.closest?.('.rs-row') || (isCommentsPage() && (t.closest?.('shreddit-comment') || t.closest?.('shreddit-post[view-context="CommentsPage"]')));
    if (it && it !== sel) select(it, false);
  }, true);
  const restoreSel = () => {
    if (!cfg.keys || isCommentsPage() || sel?.isConnected) return;
    const id = lastSel.get(location.href);
    const row = id && document.querySelector(`.rs-row[data-rs-id="${id}"]`);
    if (row) select(row, false);
  };

  // ---------- people: your tags, ignoring, colored names (RES's user tagger and user highlighter) ----------
  // A tag is your own note on a person, shown next to their name everywhere. "Hide their posts and comments" (RES's
  // ignore) drops their posts from feeds and folds their comments. Kept in your RESpawn settings, never sent anywhere.
  const TAG_COLORS = [['gray', '#4b5563'], ['red', '#b91c1c'], ['orange', '#c2410c'], ['amber', '#a16207'], ['green', '#15803d'], ['teal', '#0f766e'], ['blue', '#1d4ed8'], ['purple', '#7e22ce'], ['pink', '#be185d']];
  const TAG_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 10.6V4.2a.7.7 0 0 1 .7-.7h6.4l6 6a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="7.3" cy="7.3" r="1.3" fill="currentColor"/></svg>';
  const validUser = (n) => /^[A-Za-z0-9_-]{3,20}$/.test(n || '');
  const tagOf = (name) => (cfg.tags || {})[String(name || '').toLowerCase()];
  const ignored = (name) => !!tagOf(name)?.ignore;
  const colorOf = (k) => (TAG_COLORS.find(([n]) => n === k) || TAG_COLORS[6])[1];
  const paintTag = (box) => {
    const name = box.dataset.user, t = tagOf(name);
    const kids = [];
    if (t?.text) kids.push(el('button', { type: 'button', class: 'rs-ut-label', style: `--rs-tc: ${colorOf(t.color)}`, title: `Your tag for u/${name}. Click to change it.`, text: t.text }));
    if (t?.ignore) kids.push(el('span', { class: 'rs-ut-ign', text: 'hidden' }));
    kids.push(el('button', { type: 'button', class: 'rs-ut-btn', title: t ? `Change your tag for u/${name}` : `Tag u/${name}`, 'aria-label': t ? `Change your tag for u/${name}` : `Tag u/${name}`, html: TAG_ICON }));
    box.replaceChildren(...kids);
  };
  const nameTag = (name) => { const box = el('span', { class: 'rs-ut', 'data-user': name }); paintTag(box); return box; };
  const ignoreComment = (c, on) => {
    const d = c.querySelector(':scope > details');
    c.toggleAttribute('rs-ignored', on);
    if (on && d?.open) { c.rsQuiet = true; c.rsIgnFolded = true; d.open = false; } else if (!on && c.rsIgnFolded && d && !d.open) { c.rsQuiet = true; c.rsIgnFolded = false; d.open = true; }
  };
  const setTag = (name, t) => {
    const all = { ...(cfg.tags || {}) }, k = name.toLowerCase();
    if (t && (t.text || t.ignore)) all[k] = { name, text: t.text, color: t.color, ignore: !!t.ignore }; else delete all[k];
    saveCfg({ tags: all });
    for (const b of document.querySelectorAll('.rs-ut')) paintTag(b);
    for (const c of document.querySelectorAll('shreddit-comment[data-rs]')) { const ig = ignored(c.getAttribute('author')); if (ig !== c.hasAttribute('rs-ignored')) ignoreComment(c, ig); }
    refilter();
    if (dash && dashTab === 'tags') drawDash(); else paintDashTabs();
  };
  // Your friends list from Reddit, for coloring their names. Read again every 30 minutes while you use Reddit.
  let friends = null;
  const friendSet = () => {
    if (!friends) { const c = readJSON('rs-friends'); friends = new Set(Array.isArray(c.names) ? c.names : []); friends.at = +c.t || 0; }
    if (cfg.enabled && cfg.highlight && !friendSet.busy && loggedIn() && Date.now() - friends.at > 30 * 60e3) {
      friendSet.busy = true; friends.at = Date.now();
      fetch('/prefs/friends.json', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!j) return;
        const names = ((Array.isArray(j) ? j[0] : j)?.data?.children || []).map((c) => String(c?.name || '').toLowerCase()).filter(validUser);
        friends = new Set(names); friends.at = Date.now();
        try { localStorage.setItem('rs-friends', JSON.stringify({ t: friends.at, names })); } catch { /* storage full */ }
        for (const c of document.querySelectorAll('shreddit-comment[data-rs]')) c.toggleAttribute('rs-friend', friends.has(String(c.getAttribute('author')).toLowerCase()));
        for (const a of document.querySelectorAll('.rs-by a.rs-author')) a.classList.toggle('rs-friend', friends.has(a.textContent.toLowerCase()));
      }).catch(() => { /* try again later */ }).finally(() => { friendSet.busy = false; });
    }
    return friends;
  };
  let tagger = null;
  const closeTagger = () => { tagger?.remove(); tagger = null; document.removeEventListener('mousedown', taggerOutside, true); document.removeEventListener('keydown', taggerEsc, true); };
  const taggerOutside = (e) => { if (tagger && !tagger.contains(e.target)) closeTagger(); };
  const taggerEsc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeTagger(); } };
  const openTagger = (name, anchor) => {
    const r = anchor.getBoundingClientRect(); // before the hover card it may sit in closes
    closeTagger(); closeHover();
    const t = tagOf(name) || {};
    let color = t.color || 'blue';
    tagger = el('div', { id: 'rs-tagger', role: 'dialog', 'aria-label': `Tag u/${name}` });
    const text = el('input', { type: 'text', class: 'rs-ed-add', maxlength: '40', placeholder: 'Your note, like "knows cars"', 'aria-label': 'Tag', spellcheck: 'false' });
    text.value = t.text || '';
    const sw = el('div', { class: 'rs-tg-colors', role: 'radiogroup', 'aria-label': 'Tag color' });
    for (const [k, c] of TAG_COLORS) {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(k === color), 'aria-label': k, title: k, style: `--rs-tc: ${c}` });
      b.onclick = () => { color = k; sw.querySelectorAll('button').forEach((o) => o.setAttribute('aria-checked', String(o === b))); };
      sw.append(b);
    }
    const ign = el('input', { type: 'checkbox', role: 'switch', class: 'rs-switch-input' });
    ign.checked = !!t.ignore;
    const save = el('button', { type: 'button', class: 'rs-done', text: 'Save' });
    const remove = el('button', { type: 'button', class: 'rs-btn rs-btn-quiet', text: 'Remove tag', hidden: !tagOf(name) });
    save.onclick = () => {
      const was = ignored(name);
      setTag(name, { text: text.value.trim(), color, ignore: ign.checked }); closeTagger();
      if (ign.checked && !was) toast(`Hiding posts and comments from u/${name}.`);
    };
    remove.onclick = () => { setTag(name, null); closeTagger(); };
    tagger.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); save.click(); } });
    tagger.append(
      el('b', { class: 'rs-fa-title', text: `Tag u/${name}` }), text, sw,
      el('label', { class: 'rs-set' }, [el('span', { text: 'Hide their posts and comments' }), ign]),
      el('div', { class: 'rs-fa-foot' }, [remove, save]),
    );
    document.body.append(tagger);
    const h = tagger.offsetHeight;
    tagger.style.left = `${Math.max(8, Math.min(Math.round(r.left), innerWidth - tagger.offsetWidth - 16))}px`;
    tagger.style.top = `${Math.round(r.bottom + 6 + h < innerHeight ? r.bottom + 6 : Math.max(8, r.top - 6 - h))}px`;
    text.focus();
    setTimeout(() => { document.addEventListener('mousedown', taggerOutside, true); document.addEventListener('keydown', taggerEsc, true); }, 0);
  };
  // The tag button sits inside Reddit's comment header, which folds the comment when clicked: take the click first.
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('.rs-ut button');
    if (!b || !cfg.enabled) return;
    e.preventDefault(); e.stopPropagation();
    openTagger(b.closest('.rs-ut').dataset.user, b);
  }, true);
  // Every tag in one list, so you can take back "hide" for someone whose posts you no longer see.
  let tagList = null;
  const closeTagList = () => { tagList?.remove(); tagList = null; document.removeEventListener('keydown', tagListEsc, true); };
  const tagListEsc = (e) => { if (e.key === 'Escape' && !tagger) closeTagList(); };
  const openTagList = () => {
    if (tagList) return closeTagList();
    tagList = el('div', { id: 'rs-taglist', class: 'rs-modal', role: 'dialog', 'aria-label': 'Your tags' });
    const x = el('button', { type: 'button', class: 'rs-panel-x', 'aria-label': 'Close', html: ICON.close });
    x.onclick = closeTagList;
    const rows = el('div', { class: 'rs-ed-rows' });
    const draw = () => {
      rows.replaceChildren();
      const all = Object.values(cfg.tags || {}).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      for (const t of all) {
        const del = el('button', { type: 'button', class: 'rs-ed-del', 'aria-label': `Remove your tag for u/${t.name}`, title: 'Remove', html: ICON.close });
        del.onclick = () => { setTag(t.name, null); draw(); };
        rows.append(el('div', { class: 'rs-tl-row' }, [el('a', { href: `/user/${t.name}/`, text: `u/${t.name}` }), nameTag(t.name), del]));
      }
      if (!all.length) rows.append(el('div', { class: 'rs-ms-empty', text: 'No tags yet. Click the tag icon next to any name.' }));
    };
    const done = el('button', { type: 'button', class: 'rs-done', text: 'Done' });
    done.onclick = closeTagList;
    tagList.append(el('div', { class: 'rs-panel-head' }, [el('b', { text: 'Your tags' }), x]), el('div', { class: 'rs-ed-scroll' }, [rows]), el('div', { class: 'rs-panel-foot' }, [el('span'), done]));
    draw();
    document.body.append(tagList);
    setTimeout(() => document.addEventListener('keydown', tagListEsc, true), 0);
  };

  // ---------- hover cards (RES's user and subreddit info) ----------
  // Point at a user or subreddit name in a post row for a moment and a small card shows who or what it is. Reddit's own
  // cards are gone from those rows (RESpawn draws them), so these stand in. One lookup per name, only after you pause on it.
  const HC_DELAY = 450, HC_LINGER = 250;
  const hcCache = new Map();
  let hc = null, hcLink = null, hcT = 0;
  // Names in our rows (relative addresses), and on a post page the comment authors and the post's own author (Reddit
  // writes those as full www.reddit.com addresses).
  const HC_PEOPLE = 'shreddit-comment .author-hovercard-trigger, shreddit-post[view-context="CommentsPage"] [slot="authorName"]';
  const hcTarget = (a) => {
    const row = a?.closest?.('.rs-row .rs-meta');
    if (!row && !a?.closest?.(HC_PEOPLE)) return null;
    const h = (a.getAttribute('href') || '').replace(/^https:\/\/(www\.)?reddit\.com(?=\/)/i, '');
    let m = h.match(/^\/(?:user|u)\/([A-Za-z0-9_-]{3,20})\/?$/);
    if (m) return { kind: 'user', name: m[1] };
    m = row && h.match(/^\/r\/([A-Za-z0-9_]{2,21})\/?$/);
    return m ? { kind: 'sub', name: m[1] } : null;
  };
  const hcData = ({ kind, name }) => {
    const key = `${kind}:${name.toLowerCase()}`;
    if (!hcCache.has(key)) {
      hcCache.set(key, fetch(kind === 'user' ? `/user/${encodeURIComponent(name)}/about.json` : `/r/${encodeURIComponent(name)}/about.json`, { credentials: 'include' })
        .then(async (r) => (r.ok ? (await r.json())?.data || { gone: 404 } : { gone: r.status }))
        .catch(() => { hcCache.delete(key); return { gone: 0 }; }));
    }
    return hcCache.get(key);
  };
  const unamp = (u) => String(u || '').replace(/&amp;/g, '&');
  const imgUrl = (u) => { const x = unamp(u); return /^https:\/\/([a-z0-9-]+\.)*(redd\.it|redditmedia\.com|redditstatic\.com)\//i.test(x) ? x : ''; };
  const dateOf = (sec) => new Date(sec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const closeHover = () => { clearTimeout(hcT); hc?.remove(); hc = null; hcLink = null; };
  const placeHover = (card, a) => {
    const r = a.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
    const below = r.bottom + 8 + h < innerHeight || r.top - 8 - h < 0;
    card.style.left = `${Math.max(8, Math.min(Math.round(r.left), innerWidth - w - 16))}px`;
    card.style.top = `${Math.round(below ? r.bottom + 8 : r.top - 8 - h)}px`;
  };
  // People you highlight from their card (RES's "Highlight"): their name stands out everywhere on the page until you
  // reload. Drawn as one style rule per name, so comments and rows that load later are covered too.
  const hlUsers = new Set();
  const paintHlUsers = () => {
    let st = document.getElementById('rs-hl-users');
    if (!hlUsers.size) { st?.remove(); return; }
    if (!st) { st = el('style', { id: 'rs-hl-users' }); document.head.append(st); }
    const names = [...hlUsers];
    st.textContent = `${names.map((n) => `html.rs-on shreddit-comment[author="${n}" i] > details > summary > [slot="commentMeta"] .author-name-meta a, html.rs-on .rs-by a.rs-author[href="/user/${n}/" i]`).join(', ')} { padding: 0 5px; border-radius: 4px; background: var(--rs-hluser) !important; color: #fff !important; text-decoration: none; }`;
  };
  const toggleHlUser = (name) => { const k = name.toLowerCase(); if (hlUsers.has(k)) hlUsers.delete(k); else hlUsers.add(k); paintHlUsers(); return hlUsers.has(k); };
  const sinceOf = (sec) => {
    const d = new Date(sec * 1000), y = Math.floor((Date.now() / 1000 - sec) / 31557600);
    return `${d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} (${y < 1 ? 'under a year' : `${y} year${y === 1 ? '' : 's'}`})`;
  };
  const userCard = (d, name) => {
    if (d.gone !== undefined) return [el('p', { class: 'rs-hc-note', text: d.gone === 403 && !loggedIn() ? 'Log in to Reddit to see who this is.' : d.gone === 404 ? `u/${name} was deleted or does not exist.` : 'Reddit did not answer. Try again in a moment.' })];
    if (d.is_suspended) return [el('div', { class: 'rs-hc-head' }, [el('b', { text: `u/${d.name || name}` })]), el('p', { class: 'rs-hc-note', text: 'This account is suspended.' })];
    const who = d.name || name;
    const icon = imgUrl(d.icon_img);
    const about = String(d.subreddit?.public_description || '').trim();
    const flags = [d.is_employee ? 'Reddit admin' : '', d.is_mod ? 'Moderator' : '', d.is_gold ? 'Premium' : '', friendSet().has(who.toLowerCase()) ? 'Friend' : ''].filter(Boolean);
    // Ignore and Highlight work like RES's buttons: Ignore hides their posts and comments (the same switch as in their tag)
    const ign = el('button', { type: 'button', class: 'rs-btn' });
    const paintIgn = () => { const on = ignored(who); ign.textContent = on ? 'Unignore' : 'Ignore'; ign.setAttribute('aria-pressed', String(on)); ign.title = on ? `Show u/${who}'s posts and comments again` : `Hide u/${who}'s posts and comments`; };
    ign.onclick = () => { const t = tagOf(who) || {}, on = !t.ignore; setTag(who, { text: t.text || '', color: t.color || 'blue', ignore: on }); paintIgn(); if (on) toast(`Hiding posts and comments from u/${who}.`); };
    const hl = el('button', { type: 'button', class: 'rs-btn', title: `Make u/${who}'s name stand out on this page` });
    const paintHl = () => { const on = hlUsers.has(who.toLowerCase()); hl.textContent = on ? 'Unhighlight' : 'Highlight'; hl.setAttribute('aria-pressed', String(on)); };
    hl.onclick = () => { toggleHlUser(who); paintHl(); };
    paintIgn(); paintHl();
    return [
      el('div', { class: 'rs-hc-head' }, [
        icon ? el('img', { class: 'rs-hc-icon rs-hc-round', src: icon, alt: '' }) : el('span', { class: 'rs-hc-icon rs-hc-round rs-ms-noicon', text: 'u/' }),
        el('div', { class: 'rs-hc-who' }, [
          el('a', { class: 'rs-hc-name', href: `/user/${who}/`, text: `u/${who}` }),
          el('span', { class: 'rs-hc-sub' }, [
            el('a', { href: `/user/${who}/submitted/`, text: 'Posts' }), el('a', { href: `/user/${who}/comments/`, text: 'Comments' }),
            /^[a-z0-9]{1,13}$/i.test(d.id || '') ? el('a', { href: `https://chat.reddit.com/user/t2_${d.id}/`, target: '_blank', rel: 'noopener', text: 'Chat' }) : null,
          ]),
        ]),
      ]),
      el('dl', { class: 'rs-hc-facts' }, [
        el('dt', { text: 'Redditor since' }), el('dd', { text: sinceOf(d.created_utc) }),
        el('dt', { text: 'Post karma' }), el('dd', { text: (+d.link_karma || 0).toLocaleString() }),
        el('dt', { text: 'Comment karma' }), el('dd', { text: (+d.comment_karma || 0).toLocaleString() }),
        el('dt', { text: 'Your tag' }), el('dd', {}, [nameTag(who)]),
      ]),
      flags.length ? el('div', { class: 'rs-hc-flags' }, flags.map((f) => el('span', { class: 'rs-hc-flag', text: f }))) : null,
      about ? el('p', { class: 'rs-hc-about', text: about }) : null,
      // Message = Reddit's private message form (RES's "send message"); Chat = the chat Reddit's own profile opens
      el('div', { class: 'rs-hc-btns' }, [ign, hl, el('a', { class: 'rs-btn', href: `/message/compose/?to=${encodeURIComponent(who)}`, title: `Send u/${who} a private message`, text: 'Message' })]),
    ];
  };
  const subCard = (d, name) => {
    if (d.gone !== undefined) return [el('p', { class: 'rs-hc-note', text: d.gone === 403 && !loggedIn() ? 'Log in to Reddit to see this subreddit.' : d.gone === 403 ? `r/${name} is private.` : d.gone === 404 ? `r/${name} does not exist.` : 'Reddit did not answer. Try again in a moment.' })];
    const sub = d.display_name || name;
    const icon = imgUrl(d.community_icon) || imgUrl(d.icon_img);
    const title = String(d.title || '').trim();
    const about = String(d.public_description || '').trim();
    const sc = el('button', { type: 'button', class: 'rs-btn' });
    const paint = () => { const on = scIndex(sub) >= 0; sc.textContent = on ? '− Shortcut' : '+ Shortcut'; sc.setAttribute('aria-pressed', String(on)); };
    sc.onclick = () => { scToggle(sub); paint(); };
    const hideSub = el('button', { type: 'button', class: 'rs-btn' });
    const paintHide = () => { const on = (cfg.blockSubs || []).includes(sub.toLowerCase()); hideSub.textContent = on ? 'Show in feeds' : 'Hide in feeds'; hideSub.setAttribute('aria-pressed', String(on)); };
    hideSub.onclick = () => { toggleBlockSub(sub); paintHide(); };
    paint(); paintHide();
    return [
      el('div', { class: 'rs-hc-head' }, [
        icon ? el('img', { class: 'rs-hc-icon rs-hc-round', src: icon, alt: '' }) : el('span', { class: 'rs-hc-icon rs-hc-round rs-ms-noicon', text: 'r/' }),
        el('div', {}, [el('b', {}, [`r/${sub}`, d.over18 ? el('span', { class: 'rs-tag rs-tag-nsfw', text: 'nsfw' }) : null]), title && title.toLowerCase() !== sub.toLowerCase() ? el('span', { class: 'rs-hc-sub', text: title }) : null]),
      ]),
      el('div', { class: 'rs-hc-stats' }, [
        el('span', {}, [el('b', { text: num(d.subscribers || 0) }), ' members']),
        d.created_utc ? el('span', { text: `Created ${dateOf(d.created_utc)}` }) : null,
      ]),
      about ? el('p', { class: 'rs-hc-about', text: about }) : null,
      el('div', { class: 'rs-hc-links' }, [el('a', { href: `/r/${sub}/`, text: d.user_is_subscriber ? 'Open (joined)' : 'Open' }), sc, hideSub]),
    ];
  };
  const openHover = async (a, t) => {
    closeHover();
    hcLink = a;
    const card = el('div', { id: 'rs-hover', role: 'tooltip', 'aria-busy': 'true' }, [el('p', { class: 'rs-hc-note', text: 'Loading…' })]);
    hc = card;
    document.body.append(card); placeHover(card, a);
    const d = await hcData(t);
    if (hc !== card) return;
    card.replaceChildren(...(t.kind === 'user' ? userCard(d, t.name) : subCard(d, t.name)).filter(Boolean));
    card.removeAttribute('aria-busy');
    placeHover(card, a);
  };
  document.addEventListener('mouseover', (e) => {
    if (!cfg.enabled || !cfg.hoverCards) return;
    if (hc && hc.contains(e.target)) { clearTimeout(hcT); return; }
    const a = e.target.closest?.('a[href]');
    const t = a && hcTarget(a);
    if (t) {
      if (a === hcLink) { clearTimeout(hcT); return; }
      clearTimeout(hcT);
      hcT = setTimeout(() => openHover(a, t), HC_DELAY);
    } else if (hc) { clearTimeout(hcT); hcT = setTimeout(closeHover, HC_LINGER); } else clearTimeout(hcT);
  });
  document.addEventListener('mousedown', (e) => { if (hc && !hc.contains(e.target)) closeHover(); }, true);
  window.addEventListener('scroll', () => { if (hc) closeHover(); }, { passive: true });

  // ---------- profile pages: post karma and comment karma apart (old Reddit) ----------
  // New Reddit's profile card gives one Karma number. Under it go the two old Reddit showed ("1,601 post karma",
  // "36,377 comment karma"), from the same lookup the hover cards use.
  const karmaSplit = () => {
    const m = cfg.enabled && location.pathname.match(/^\/(?:user|u)\/([A-Za-z0-9_-]{3,20})(?:\/|$)/);
    let box = document.getElementById('rs-karma');
    if (!m) { box?.remove(); return; }
    if (box?.isConnected && box.dataset.user === m[1].toLowerCase()) return;
    const side = document.getElementById('right-sidebar-contents');
    const label = side && [...side.querySelectorAll('p, span')].find((e) => !e.children.length && e.textContent.trim() === 'Karma');
    if (!label) return;
    box?.remove();
    box = el('div', { id: 'rs-karma', 'data-user': m[1].toLowerCase() });
    label.after(box);
    hcData({ kind: 'user', name: m[1] }).then((d) => {
      if (!box.isConnected || d.gone !== undefined || d.link_karma === undefined) return;
      box.append(el('span', { text: `${(+d.link_karma || 0).toLocaleString()} post karma` }), el('span', { text: `${(+d.comment_karma || 0).toLocaleString()} comment karma` }));
    });
  };

  // ---------- dashboard (RES's dashboard): your saved comments, tags and hide lists on one page ----------
  // Opens over the page you are on (DASHBOARD in the shortcut bar, or the settings panel). Saved comments come from your
  // Reddit account, 100 at a time; tags and hide lists are your RESpawn settings. Reddit's comment text is read into
  // plain paragraphs (never put on the page as Reddit's own markup).
  let dash = null, dashTab = 'saved';
  const saved = { items: [], after: null, busy: false, loaded: false, err: '', q: '' };
  const closeDash = () => {
    if (!dash) return;
    dash.rsSave?.(); dash.remove(); dash = null;
    html.classList.remove('rs-dash-open');
    document.removeEventListener('keydown', dashEsc, true);
    document.querySelectorAll('.rs-dash-link').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  };
  const dashEsc = (e) => { if (e.key === 'Escape' && !tagger) { e.stopPropagation(); closeDash(); } };
  const commentText = (markup) => {
    const doc = new DOMParser().parseFromString(String(markup || ''), 'text/html'); // a parsed copy runs nothing
    const root = doc.querySelector('.md') || doc.body, out = [];
    for (const b of root.children) {
      if (/^(UL|OL)$/.test(b.tagName)) { for (const li of b.children) out.push(['li', li.textContent.trim()]); }
      else out.push([b.tagName === 'BLOCKQUOTE' ? 'quote' : b.tagName === 'PRE' ? 'pre' : 'p', b.textContent.trim()]);
    }
    const kept = out.filter(([, t]) => t);
    return kept.length ? kept : [['p', root.textContent.trim()]];
  };
  const meNow = async () => {
    const n = myName();
    if (n || !loggedIn()) return n;
    try { const j = await (await fetch('/api/me.json', { credentials: 'include' })).json(); return validUser(j?.data?.name) ? j.data.name.toLowerCase() : ''; } catch { return ''; }
  };
  const loadSaved = async (more) => {
    if (saved.busy) return;
    saved.busy = true; saved.err = ''; drawDash();
    const me = await meNow();
    if (!me) { saved.busy = false; saved.err = 'login'; drawDash(); return; }
    try {
      const after = more && saved.after ? `&after=${encodeURIComponent(saved.after)}` : '';
      const r = await fetch(`/user/${encodeURIComponent(me)}/saved.json?type=comments&limit=100&raw_json=1${after}`, { credentials: 'include' });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const got = (j?.data?.children || []).filter((k) => k?.kind === 't1' && /^t1_[a-z0-9]+$/.test(k.data?.name || ''));
      saved.items = more ? [...saved.items, ...got] : got;
      saved.after = typeof j?.data?.after === 'string' ? j.data.after : null;
      saved.loaded = true;
    } catch { saved.err = 'net'; }
    saved.busy = false; drawDash();
  };
  const savedCard = (c) => {
    const d = c.data;
    const sub = validSub(d.subreddit) ? d.subreddit : '';
    const perma = typeof d.permalink === 'string' && /^\/r\/[A-Za-z0-9_]+\/comments\//.test(d.permalink) ? d.permalink : null;
    // A paragraph that is only a Reddit picture link shows the picture
    const para = ([k, t]) => (k === 'p' && /^https:\/\/(preview|i)\.redd\.it\/\S+$/.test(t) ? el('img', { class: 'rs-dc-img', src: t, alt: 'Picture in the comment', loading: 'lazy' }) : el('p', { class: `rs-dc-${k}`, text: k === 'li' ? `• ${t}` : t }));
    const body = el('div', { class: 'rs-dc-body' }, commentText(d.body_html).slice(0, 60).map(para));
    const more = el('button', { type: 'button', class: 'rs-dc-more', text: 'Show all', hidden: true });
    more.onclick = () => { const open = body.classList.toggle('rs-open'); more.textContent = open ? 'Show less' : 'Show all'; };
    const unsave = el('button', { type: 'button', class: 'rs-btn rs-btn-quiet', text: c.gone ? 'Undo' : 'Unsave', title: 'Remove from your saved comments on Reddit' });
    const card = el('article', { class: c.gone ? 'rs-dash-card rs-dc-gone' : 'rs-dash-card' });
    unsave.onclick = async () => {
      if (needLogin('change your saved comments')) return;
      unsave.disabled = true;
      try { await gql('UpdateCommentSaveState', { commentId: d.name, saveState: c.gone ? 'SAVED' : 'NONE' }); }
      catch { unsave.disabled = false; toast('Reddit did not take that. Try again.'); return; }
      c.gone = !c.gone;
      card.classList.toggle('rs-dc-gone', c.gone); unsave.textContent = c.gone ? 'Undo' : 'Unsave'; unsave.disabled = false;
    };
    const pts = +d.score || 0;
    const meta = [validUser(d.author) ? `u/${d.author}` : 'deleted account', `${num(pts)} point${pts === 1 ? '' : 's'}`, d.created_utc ? dateOf(d.created_utc) : ''].filter(Boolean).join(' · ');
    card.append(
      el('div', { class: 'rs-dc-head' }, [sub ? el('a', { href: `/r/${sub}/`, class: 'rs-dc-sub', text: `r/${sub}` }) : null, el(perma ? 'a' : 'span', { href: perma, class: 'rs-dc-title', text: String(d.link_title || '') })]),
      body, more,
      el('div', { class: 'rs-dc-foot' }, [el('span', { class: 'rs-dc-meta', text: meta }), el('span', { class: 'rs-dc-note', text: 'Removed from saved' }), perma ? el('a', { href: perma, class: 'rs-btn', text: 'Open' }) : null, unsave]),
    );
    requestAnimationFrame(() => { if (body.scrollHeight > body.clientHeight + 4) more.hidden = false; });
    return card;
  };
  const savedTab = (box) => {
    const search = el('input', { type: 'search', class: 'rs-dash-search', placeholder: 'Search saved comments', 'aria-label': 'Search saved comments', spellcheck: 'false' });
    search.value = saved.q;
    const count = el('span', { class: 'rs-dash-count', role: 'status' });
    const list = el('div', { class: 'rs-dash-list' });
    const draw = () => {
      const q = saved.q.trim().toLowerCase();
      const hit = (c) => !q || [c.data.body, c.data.link_title, c.data.subreddit, c.data.author].some((v) => String(v || '').toLowerCase().includes(q));
      const shownItems = saved.items.filter(hit);
      list.replaceChildren(...shownItems.map(savedCard));
      count.textContent = saved.loaded ? (q ? `${shownItems.length} of ${saved.items.length}` : `${saved.items.length}${saved.after ? '+' : ''} saved`) : '';
      if (saved.busy && !saved.items.length) list.append(el('p', { class: 'rs-dash-empty', text: 'Loading your saved comments…' }));
      else if (saved.err === 'login') list.append(el('p', { class: 'rs-dash-empty', text: 'Log in to Reddit to see your saved comments.' }));
      else if (saved.err === 'net' && !saved.items.length) {
        const again = el('button', { type: 'button', class: 'rs-btn', text: 'Try again' }); again.onclick = () => loadSaved(false);
        list.append(el('div', { class: 'rs-dash-empty' }, [el('p', { text: 'Reddit did not answer.' }), again]));
      } else if (saved.loaded && !saved.items.length) list.append(el('p', { class: 'rs-dash-empty', text: 'No saved comments yet. Save one from its "..." menu, or pick it and press s.' }));
      else if (q && !shownItems.length) list.append(el('p', { class: 'rs-dash-empty', text: 'No saved comments match.' }));
      if (saved.after && !q) {
        const b = el('button', { type: 'button', class: 'rs-btn rs-dash-more', text: saved.busy ? 'Loading…' : 'Load more', disabled: saved.busy });
        b.onclick = () => loadSaved(true);
        list.append(b);
      }
    };
    search.oninput = () => { saved.q = search.value; draw(); };
    box.append(el('div', { class: 'rs-dash-tools' }, [search, count]), list);
    draw();
    if (!saved.loaded && !saved.busy && !saved.err) loadSaved(false);
  };
  const tagsTab = (box) => {
    const all = Object.values(cfg.tags || {}).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    const list = el('div', { class: 'rs-dash-list' });
    for (const t of all) {
      const del = el('button', { type: 'button', class: 'rs-btn rs-btn-quiet', text: 'Remove', 'aria-label': `Remove your tag for u/${t.name}` });
      del.onclick = () => setTag(t.name, null);
      list.append(el('div', { class: 'rs-dt-row' }, [el('a', { href: `/user/${t.name}/`, class: 'rs-dt-name', text: `u/${t.name}` }), nameTag(t.name), del]));
    }
    if (!all.length) list.append(el('p', { class: 'rs-dash-empty', text: 'No tags yet. Click the tag icon next to any name.' }));
    box.append(el('div', { class: 'rs-dash-tools' }, [el('span', { class: 'rs-dash-count', text: all.length ? `${all.length} tag${all.length === 1 ? '' : 's'}` : '' })]), list);
  };
  const hideTab = (box) => {
    const field = (label, tip, value, ph) => {
      const ta = el('textarea', { class: 'rs-ed-subs', rows: '4', placeholder: ph, 'aria-label': label, spellcheck: 'false' });
      ta.value = value;
      return [ta, el('label', { class: 'rs-bl-field' }, [el('b', { text: label }), el('span', { class: 'rs-ed-tip', text: tip }), ta])];
    };
    const [words, wBox] = field('Words in titles', 'Whole words or phrases, separated by commas or new lines.', (cfg.blockWords || []).join(', '), 'For example: trailer, leaked');
    const [subs, sBox] = field('Subreddits', 'Still shown when you visit that subreddit.', (cfg.blockSubs || []).join(', '), 'For example: politics, news');
    const [sites, xBox] = field('Websites', 'A site covers its subdomains.', (cfg.blockSites || []).join(', '), 'For example: x.com, tiktok.com');
    const msg = el('span', { class: 'rs-dash-count', role: 'status' });
    const save = () => {
      const before = JSON.stringify([cfg.blockWords, cfg.blockSubs, cfg.blockSites]);
      saveCfg({ blockWords: parseWords(words.value), blockSubs: parseSubList(subs.value), blockSites: parseSites(sites.value) });
      words.value = cfg.blockWords.join(', '); subs.value = cfg.blockSubs.join(', '); sites.value = cfg.blockSites.join(', ');
      if (JSON.stringify([cfg.blockWords, cfg.blockSubs, cfg.blockSites]) !== before) { refilter(); msg.textContent = 'Saved'; paintDashTabs(); }
    };
    for (const ta of [words, subs, sites]) ta.addEventListener('change', save);
    dash.rsSave = save;
    box.append(wBox, sBox, xBox, msg);
  };
  const DASH_TABS = [['saved', 'Saved comments'], ['tags', 'Tags'], ['hide', 'Hide lists']];
  const paintDashTabs = () => {
    if (!dash) return;
    const n = { tags: Object.keys(cfg.tags || {}).length, hide: blockCount() };
    for (const b of dash.querySelectorAll('.rs-dash-tabs button')) {
      const k = b.dataset.tab, label = DASH_TABS.find((t) => t[0] === k)[1];
      b.textContent = n[k] ? `${label} (${n[k]})` : label;
      b.setAttribute('aria-selected', String(k === dashTab));
    }
  };
  const drawDash = () => {
    if (!dash) return;
    const box = dash.querySelector('.rs-dash-in');
    if (dashTab === 'saved' && box.rsTab === 'saved' && box.rsDraw) { box.rsDraw(); return; }
    dash.rsSave?.(); dash.rsSave = null;
    box.replaceChildren(); box.rsTab = dashTab; box.rsDraw = null;
    if (dashTab === 'saved') { const inner = el('div'); box.append(inner); savedTab(inner); box.rsDraw = () => { const keep = inner.querySelector('.rs-dash-search'); const pos = keep && document.activeElement === keep ? keep.selectionStart : null; inner.replaceChildren(); savedTab(inner); if (pos !== null) { const s = inner.querySelector('.rs-dash-search'); s.focus(); s.setSelectionRange(pos, pos); } }; }
    else if (dashTab === 'tags') tagsTab(box);
    else hideTab(box);
    box.append(el('footer', { class: 'rs-dash-foot' }, [el('a', { href: 'https://github.com/humangenome/RESpawn', target: '_blank', rel: 'noopener', text: 'About RESpawn' }), el('a', { href: 'https://github.com/humangenome/RESpawn/issues', target: '_blank', rel: 'noopener', text: 'Report a problem' })]));
    paintDashTabs();
  };
  const openDash = (tab) => {
    closePanel(); closeMySubs(); closeTagList(); closeBlockEditor(); closeHover();
    if (tab) dashTab = tab;
    if (dash) { drawDash(); return; }
    if (!saved.busy) { saved.loaded = false; saved.err = ''; } // read your saved comments again each time it opens
    dash = el('div', { id: 'rs-dash', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'RESpawn dashboard' });
    const x = el('button', { type: 'button', class: 'rs-panel-x', 'aria-label': 'Close the dashboard', title: 'Close (Esc)', html: ICON.close });
    x.onclick = closeDash;
    const tabs = el('div', { class: 'rs-dash-tabs', role: 'tablist' });
    for (const [k] of DASH_TABS) {
      const b = el('button', { type: 'button', role: 'tab', 'data-tab': k });
      b.onclick = () => { if (dashTab === k) return; dashTab = k; drawDash(); };
      tabs.append(b);
    }
    dash.append(
      el('div', { class: 'rs-dash-top' }, [el('div', { class: 'rs-dash-bar' }, [el('h2', { text: 'Dashboard' }), x, tabs])]),
      el('div', { class: 'rs-dash-main' }, [el('div', { class: 'rs-dash-in' })]),
    );
    // Sits under Reddit's top bar and the shortcut bar when they are on screen, so those still work while it is open
    const bar = document.getElementById('rs-shortcuts'), bottom = bar?.isConnected ? Math.round(bar.getBoundingClientRect().bottom) : 0;
    dash.style.top = `${Math.max(0, Math.min(bottom, 200))}px`;
    document.body.append(dash);
    html.classList.add('rs-dash-open');
    document.querySelectorAll('.rs-dash-link').forEach((b) => b.setAttribute('aria-expanded', 'true'));
    drawDash();
    dash.querySelector('.rs-dash-tabs [aria-selected="true"]')?.focus();
    setTimeout(() => document.addEventListener('keydown', dashEsc, true), 0);
  };

  // ---------- back to top (RES's page navigator) ----------
  const TOP_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h10M10 16.5V8M6 11.5l4-4 4 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const topShow = () => document.getElementById('rs-top')?.classList.toggle('rs-top-on', scrollY > innerHeight * 1.5);
  const topButton = () => {
    let b = document.getElementById('rs-top');
    if (!cfg.enabled || !cfg.topButton) { b?.remove(); return; }
    if (!b) {
      b = el('button', { type: 'button', id: 'rs-top', title: 'Back to top', 'aria-label': 'Back to top', html: TOP_ICON });
      b.onclick = () => window.scrollTo({ top: 0, behavior: 'instant' });
      document.body.append(b);
    }
    topShow();
  };
  window.addEventListener('scroll', topShow, { passive: true });

  // ---------- hide your username on screen (RES's username hider) ----------
  // For screenshots and screen sharing: wherever your Reddit name is written on the page, it shows as "anonymous".
  // Only what you see changes (links and Reddit itself are untouched), and typing boxes are left alone.
  // Reddit's search box (a filter chip "u/you" and "Search in u/you") is drawn in walled-off parts of the top bar, so those
  // are looked into too, along with the browser tab's title.
  const NAME_STANDIN = 'anonymous';
  const renamed = new Map(); // text node -> [its own text, what we showed instead]
  const renamedHint = new Map(); // element -> [its own placeholder, ours]
  let nameT = 0, nameLast = 0, titleOwn = '', titleShown = '';
  const swapText = (root, me, re) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.toLowerCase().includes(me) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.parentElement?.closest('textarea, input, script, style, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) continue;
      const shown = n.nodeValue.replace(re, NAME_STANDIN);
      if (shown === n.nodeValue) continue;
      renamed.set(n, [n.nodeValue, shown]);
      n.nodeValue = shown;
    }
  };
  const swapHint = (e, re) => {
    const own = e.getAttribute('placeholder') || '', shown = own.replace(re, NAME_STANDIN);
    if (shown !== own) { renamedHint.set(e, [own, shown]); e.setAttribute('placeholder', shown); }
  };
  const hideMyName = (now) => {
    const me = cfg.enabled && cfg.hideMyName ? myName() : '';
    if (!me) {
      for (const [n, [own, shown]] of renamed) if (n.nodeValue === shown) n.nodeValue = own;
      for (const [e, [own, shown]] of renamedHint) if (e.getAttribute('placeholder') === shown) e.setAttribute('placeholder', own);
      if (titleShown && document.title === titleShown) document.title = titleOwn;
      renamed.clear(); renamedHint.clear(); titleShown = ''; return;
    }
    if (!now && Date.now() - nameLast < 400) { clearTimeout(nameT); nameT = setTimeout(() => hideMyName(true), 450); return; }
    nameLast = Date.now();
    const re = new RegExp(`(?<![A-Za-z0-9_-])${me}(?![A-Za-z0-9_-])`, 'gi');
    swapText(document.body, me, re);
    const roots = [...document.querySelectorAll('reddit-header-large *, reddit-search-large')].filter((e) => e.shadowRoot).map((e) => e.shadowRoot);
    for (let i = 0; i < roots.length && i < 100; i++) {
      swapText(roots[i], me, re);
      for (const e of roots[i].querySelectorAll('*')) { if (e.shadowRoot) roots.push(e.shadowRoot); if (e.hasAttribute('placeholder')) swapHint(e, re); }
    }
    for (const e of document.querySelectorAll('reddit-header-large [placeholder], reddit-search-large [placeholder]')) swapHint(e, re);
    const t = document.title.replace(re, NAME_STANDIN);
    if (t !== document.title) { titleOwn = document.title; titleShown = t; document.title = t; }
    if (renamed.size > 2000) for (const n of renamed.keys()) if (!n.isConnected) renamed.delete(n);
    if (renamedHint.size > 200) for (const e of renamedHint.keys()) if (!e.isConnected) renamedHint.delete(e);
  };

  // ---------- run ----------
  let lastUrl = '';
  // Reddit often changes pages without reloading, and swaps the page parts in a moment later; so everything below
  // checks the page as it is on every pass instead of trusting the moment the address changed.
  const onRoute = () => { countVisit(); shortcutBar(); closeMySubs(); closeFeedAsk(); closeHover(); closeTagger(); closeBlockEditor(); closeDash(); };
  // Reddit hides its right sidebar in a narrower window; the page layout then gives its space to the posts
  // Home's right side holds only "Recent posts": with that hidden it is an empty column, so the posts get its space too.
  // (Emptiness is judged by size, not visibility, so content that arrives later still shows the column again.)
  // On feeds the right column also steps aside when it would leave the posts less than this (Ryan: in a half-screen
  // window the sort tabs broke mid-word next to it). Measured from the page's own box, which does not change when the
  // column goes, so it never flips back and forth.
  const MIN_POSTS = 600;
  const railCheck = () => {
    const sg = document.getElementById('subgrid-container'), mc = document.querySelector('.main-container');
    if (sg && mc) {
      const cs = getComputedStyle(sg), room = sg.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 316 - (parseFloat(getComputedStyle(mc).columnGap) || 0);
      html.classList.toggle('rs-rail-narrow', !isCommentsPage() && room < MIN_POSTS);
    }
    const r = document.getElementById('right-sidebar-container');
    const gone = !!r && getComputedStyle(r).display === 'none';
    html.classList.toggle('rs-no-rail', gone);
    const c = r && (r.querySelector('#right-sidebar-contents') || r);
    const empty = !!c && !gone && ![...c.querySelectorAll('*')].some((e) => { const b = e.getBoundingClientRect(); return b.width > 1 && b.height > 1; });
    html.classList.toggle('rs-rail-empty', empty);
    // Post pages: a comment that starts below the end of the right column also takes the column's width (it is empty
    // there), like text flowing around a box. Checked on every pass and whenever the post or the column changes
    // height (a thread folded or opened, a picture loaded), so a widened comment never ends up beside the column.
    const rail = !!r && !gone && !empty && isCommentsPage() ? r : null, main = rail && document.querySelector('main#main-content');
    if (railCheck.el !== rail || railCheck.main !== main) {
      railCheck.ro?.disconnect(); railCheck.el = rail; railCheck.main = main;
      if (main) { railCheck.ro ||= new ResizeObserver(() => railWide(railCheck.el)); for (const x of [main, ...rail.children]) railCheck.ro.observe(x); }
    }
    railWide(rail);
    // With no right column (narrow window) the post's column keeps clear of the navigator's buttons in the corner
    const edge = gone && isCommentsPage() ? navEdge() : null, m = edge !== null && document.querySelector('main#main-content');
    html.style.setProperty('--rs-nav-gutter', `${m ? Math.max(0, Math.ceil(m.getBoundingClientRect().right - edge + 12)) : 0}px`);
  };
  // Left edge of the navigator's column of buttons and back-to-top in the bottom-right corner (fixed on screen)
  const navEdge = () => {
    const xs = ['rs-nav', 'rs-top'].map((id) => document.getElementById(id)).filter((e) => e?.getClientRects().length).map((e) => e.getBoundingClientRect().left);
    return xs.length ? Math.min(...xs) : null;
  };
  const railWide = (r) => {
    if (!r?.isConnected) { for (const c of document.querySelectorAll('shreddit-comment.rs-wide')) c.classList.remove('rs-wide'); return; }
    // A widened comment reaches across the column's width, but stops short of the navigator's buttons in the corner
    // so they never sit over its words
    const box = r.getBoundingClientRect(), gap = parseFloat(getComputedStyle(r.parentElement).columnGap) || 0;
    const edge = navEdge(), right = r.parentElement.getBoundingClientRect().right;
    const reach = Math.ceil(box.width + gap) - (edge === null ? 0 : Math.max(0, Math.ceil(right - edge + 12)));
    html.style.setProperty('--rs-wide-reach', `${Math.max(0, reach)}px`);
    const end = Math.max(box.top, ...[...r.children].filter((k) => k.getClientRects().length).map((k) => k.getBoundingClientRect().bottom)); // where its content ends
    // Read every place first, then mark: widening a comment only moves the ones after it up, and they stay below too
    const all = [...document.querySelectorAll('main#main-content shreddit-comment')];
    const tops = all.map((c) => (c.getClientRects().length ? c.getBoundingClientRect().top : null));
    const wide = new Set(), inWide = new Set(); // replies inside a widened comment are wide already
    all.forEach((c, i) => {
      const up = c.parentElement?.closest('shreddit-comment');
      if (up && inWide.has(up)) inWide.add(c);
      else if (tops[i] !== null && tops[i] >= end) { wide.add(c); inWide.add(c); }
    });
    for (const c of all) if (c.classList.contains('rs-wide') !== wide.has(c)) c.classList.toggle('rs-wide', wide.has(c));
  };
  window.addEventListener('resize', () => { clearTimeout(railCheck.t); railCheck.t = setTimeout(() => { railCheck(); addGear(); multiShow(); fitBars(); }, 150); }, { passive: true });
  const tick = () => {
    if (location.href !== lastUrl) { lastUrl = location.href; onRoute(); }
    railCheck();
    const onComments = isCommentsPage();
    html.classList.toggle('rs-feed', !onComments);
    html.classList.toggle('rs-comments', onComments);
    if (!onComments && nav) { nav.remove(); nav = null; comments.started = null; }
    const bar = document.getElementById('rs-shortcuts'), header = document.querySelector('reddit-header-large');
    if (cfg.showShortcuts && (!bar?.isConnected || (header && bar.previousElementSibling !== header))) shortcutBar();
    else if (bar && bar.dataset.mods !== undefined && navLoaded() && String(modded().length) !== bar.dataset.mods) shortcutBar(); // Reddit's menu just told us you moderate
    clMount(); densify(); rankCheck(); pager(); sortTabs(); profileBar(); showSweep(); postVideo(); applyFilters(); fitBars(); scButton(); postInfo(); appText(); sideCard(); applySubStyle(); comments(); tagRecent(); addGear(); restoreSel(); topButton(); hideMyName();
    if (Date.now() - (tidy.t || 0) > 1500) { tidy.t = Date.now(); tidy(); }
    if (cfg.enabled && cfg.leftNav === 'slide') ensureNav();
    karmaSplit();
    multiShow();
  };
  // The page's own parts are read once the page is in; the switches above are already on it.
  const pageIn = new Promise((res) => { if (document.readyState !== 'loading') res(); else document.addEventListener('DOMContentLoaded', () => res(), { once: true }); });
  // A few addresses on www.reddit.com still come back in old Reddit's own page design (a combined list RESpawn did not
  // take over, say one with a special list in it, and a handful of old pages). RESpawn's bar, gear and the rest are made
  // for the new design, so on those pages it stays out entirely: never a second bar on top of old Reddit's own. Being
  // off here is never saved, so every other page keeps RESpawn as you set it.
  const oldDesign = () => !document.querySelector('shreddit-app') && !!document.querySelector('#sr-header-area, #header-bottom-left');
  Promise.all([loadCfg(), pageIn]).then(() => {
    if (oldDesign()) {
      const m = cfg.enabled && multiOf(); // the quick copy of the on/off switch said off, the real setting says on
      if (m) { multiAway(m); return; }
      cfg = { ...cfg, enabled: false }; away = true;
      for (const c of [...html.classList]) if (/^rs-/.test(c)) html.classList.remove(c);
      for (const e of document.querySelectorAll('[id^="rs-"]')) e.remove();
      return;
    }
    applyEnabled(); leftSlide(); tick();
    // Typing in a comment box, or dragging its corner, changes only that box: nothing there for a pass to do
    new MutationObserver((L) => {
      if (L.every((m) => m.target.closest?.('shreddit-composer, comment-composer-host'))) return;
      if (cl && !cl.root.isConnected && html.classList.contains('rs-classic')) clMount(); // Reddit swapped its page under the list: put it straight back
      clearTimeout(tick.t); tick.t = setTimeout(tick, 120);
    }).observe(document.body, { childList: true, subtree: true });
    setInterval(() => { if (location.href !== lastUrl) tick(); }, 800);
  });
  window.__respawn = { cfg: () => cfg, saveCfg };
})();
