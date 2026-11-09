// RESpawn: Reddit Enhancement Suite features for New Reddit.
// Runs on www.reddit.com pages. Reads only what is already on the page; votes and other
// actions press Reddit's own buttons. Settings live in the browser (chrome.storage or localStorage).
(() => {
  if (window.__respawnLoaded) return;
  window.__respawnLoaded = true;

  const html = document.documentElement;
  const DEFAULTS = { enabled: true, shortcuts: [], showShortcuts: true, leftNav: 'slide', hideRecent: true, hideAds: true, hideBadges: true, hideSuggested: true, filterline: true, filters: {}, filterScore: 0, scMode: 'mine', mySubsSort: 'visits', subStyles: true, subStyleOverrides: {}, pinHeader: false, keys: true, linkFriends: true, linkMod: true, feeds: {}, hoverCards: true, highlight: true, tags: {}, blockWords: [], blockSubs: [], blockSites: [], autoReplies: true, pauseEvery: 0, maxVideos: 2, hideChat: false, topButton: true, scoreColors: true, hideKids: false, hideMyName: false, linkDashboard: true, simulateLastVisitHoursAgo: 0 };
  let cfg = { ...DEFAULTS, ...(window.__RS_CFG || {}) };

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
  const saveCfg = (patch) => { cfg = { ...cfg, ...patch }; if (store) store.set({ respawn: cfg }); else localStorage.setItem('respawn-cfg', JSON.stringify(cfg)); };
  if (!store) { try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem('respawn-cfg') || '{}'), ...(window.__RS_CFG || {}) }; } catch { /* ignore */ } }

  // ---------- on/off switch (bottom-left, see-through) ----------
  const applyEnabled = () => {
    html.classList.toggle('rs-on', !!cfg.enabled);
    html.classList.toggle('rs-hide-ads', !!cfg.hideAds);
    html.classList.toggle('rs-hide-badges', !!cfg.hideBadges);
    html.classList.toggle('rs-hide-recent', !!cfg.hideRecent);
    html.classList.toggle('rs-hide-suggested', !!cfg.hideSuggested);
    html.classList.toggle('rs-no-shortcuts', !cfg.showShortcuts);
    html.classList.toggle('rs-left-slide', cfg.leftNav === 'slide');
    html.classList.toggle('rs-left-hide', cfg.leftNav === 'hide');
    html.classList.toggle('rs-fl-hidden', !cfg.filterline);
    html.classList.toggle('rs-pin-header', !!cfg.pinHeader);
    html.classList.toggle('rs-hl', !!cfg.highlight);
    html.classList.toggle('rs-no-chat', !!cfg.hideChat);
    html.classList.toggle('rs-score-colors', !!cfg.scoreColors);
    document.querySelector('#rs-sorts .rs-funnel')?.setAttribute('aria-pressed', String(!!cfg.filterline));
    applySubStyle();
    paintGear();
    if (!cfg.enabled) releaseHolds();
    topButton(); hideMyName(true); scorePaint.n = -1; scorePaint();
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
  const addGear = () => {
    if (document.getElementById('rs-gear')) return;
    const user = document.querySelector('#expand-user-drawer-button');
    const actions = user?.closest('.ps-lg') || user?.closest('nav');
    const gear = el('button', { id: 'rs-gear', type: 'button', title: 'RESpawn settings', 'aria-label': 'RESpawn settings', html: GEAR });
    gear.onclick = (e) => { e.stopPropagation(); togglePanel(); };
    if (actions) {
      let slot = user; while (slot.parentElement && slot.parentElement !== actions) slot = slot.parentElement;
      actions.insertBefore(gear, slot);
    } else { gear.classList.add('rs-gear-float'); document.body.append(gear); }
    paintGear();
  };
  const SETTINGS = [
    ['Layout', [
      ['leftNav', 'Left sidebar', [['show', 'Show'], ['slide', 'Slide out'], ['hide', 'Hide']]],
      ['pinHeader', 'Keep top bar on screen when scrolling'],
      ['hideRecent', 'Hide "Recent posts"'],
      ['hideSuggested', 'Hide suggestions and games'],
      ['hideAds', 'Hide ads'],
      ['hideBadges', 'Hide "Top 1%" badges'],
      ['hideChat', 'Hide chat'],
      ['topButton', 'Back-to-top button'],
      ['scoreColors', 'Color the highest scores'],
    ]],
    ['Filter bar', [
      ['filterline', 'Show filter bar'],
      ['filterScore', 'Score filter: more than', 'number'],
      ['filterLists', 'Hide by word, sub or site', 'button'],
    ]],
    ['Scrolling and videos', [
      ['pauseEvery', 'Pages before a pause', 'number', '0 = never pause'],
      ['maxVideos', 'Videos playing at once', 'number', '0 = no limit'],
    ]],
    ['Subreddit styles', [
      ['subStyles', 'Show subreddit styles'],
    ]],
    ['Shortcut bar', [
      ['showShortcuts', 'Show shortcut bar'],
      ['scMode', 'Bar shows', [['mine', 'My list'], ['visits', 'Most visited']]],
      ['linkDashboard', 'DASHBOARD link'],
      ['linkFriends', 'FRIENDS link'],
      ['linkMod', 'MOD and MODQUEUE links (moderators)'],
      ['editShortcuts', 'Your shortcuts', 'button'],
    ]],
    ['Hover cards', [
      ['hoverCards', 'Show when you point at a name'],
    ]],
    ['People', [
      ['highlight', 'Color the poster, mods and friends'],
      ['tagList', 'Your tags', 'button'],
      ['hideMyName', 'Hide your username on screen'],
    ]],
    ['Comments', [
      ['autoReplies', 'Load more replies as you scroll'],
      ['hideKids', 'Start with replies hidden'],
    ]],
    ['Keyboard', [
      ['keys', 'Keyboard shortcuts'],
      ['keyHelp', 'List of keys (or press ?)', 'button'],
    ]],
    ['Backup', [
      ['settingsFile', 'Settings file', 'file'],
    ]],
  ];
  let panel = null;
  const closePanel = () => { panel?.remove(); panel = null; document.removeEventListener('click', outside, true); document.removeEventListener('keydown', esc, true); };
  // Clicks RESpawn makes itself (pressing Reddit's "more replies") are not yours: they never close a menu or pick a comment.
  const outside = (e) => { if (e.isTrusted && panel && !panel.contains(e.target) && e.target.id !== 'rs-gear' && !e.target.closest?.('#rs-gear')) closePanel(); };
  const esc = (e) => { if (e.key === 'Escape') closePanel(); };
  const togglePanel = () => {
    if (panel) return closePanel();
    panel = el('div', { id: 'rs-panel', role: 'dialog', 'aria-label': 'RESpawn settings' });
    const x = el('button', { type: 'button', class: 'rs-panel-x', 'aria-label': 'Close', html: ICON.close });
    x.onclick = closePanel;
    const master = el('label', { class: 'rs-set rs-master' }, [el('span', { text: 'RESpawn on' }), toggle('enabled')]);
    panel.append(el('div', { class: 'rs-panel-head' }, [el('b', { text: 'Settings' }), x]), master);
    for (const [title, items] of SETTINGS) {
      panel.append(el('div', { class: 'rs-panel-sec', text: title }));
      for (const [key, label, choices, hint] of items) {
        if (choices === 'file') {
          const save = el('button', { type: 'button', class: 'rs-btn', text: 'Save', title: 'Save your RESpawn settings, shortcuts, tags and hide lists to a file' });
          const load = el('button', { type: 'button', class: 'rs-btn', text: 'Load', title: 'Load RESpawn settings from a file you saved' });
          save.onclick = saveSettingsFile; load.onclick = loadSettingsFile;
          panel.append(el('div', { class: 'rs-set' }, [el('span', { text: label }), el('span', { class: 'rs-set-btns' }, [save, load])]));
        } else if (choices === 'button') {
          const keysList = key === 'keyHelp';
          const b = el('button', { type: 'button', class: 'rs-btn', text: keysList ? 'Show' : 'Edit' });
          b.onclick = () => { closePanel(); ({ keyHelp: openKeyHelp, editShortcuts: openScEditor, tagList: openTagList, filterLists: openBlockEditor })[key](); };
          const n = { editShortcuts: () => scList().length, tagList: () => Object.keys(cfg.tags || {}).length, filterLists: blockCount }[key];
          panel.append(el('div', { class: 'rs-set' }, [el('span', { text: n ? `${label} (${n()})` : label }), b]));
        } else if (choices === 'number') {
          const score = key === 'filterScore';
          const n = el('input', { type: 'number', class: 'rs-num', step: '1', min: score ? null : '0', max: score ? null : '99', 'aria-label': label });
          n.value = String(cfg[key] ?? 0);
          n.onchange = () => {
            saveCfg({ [key]: Math.max(score ? -99999 : 0, Math.min(score ? 99999 : 99, parseInt(n.value, 10) || 0)) }); n.value = String(cfg[key]);
            if (score) refilter(); else if (key === 'pauseEvery') { if (!cfg.pauseEvery) releaseHolds(); } else vTrim();
          };
          panel.append(el('label', { class: hint ? 'rs-set rs-set-2' : 'rs-set' }, [el('span', {}, [label, hint ? el('small', { class: 'rs-set-hint', text: hint }) : null]), n]));
        } else if (choices) {
          const seg = el('div', { class: 'rs-seg', role: 'radiogroup', 'aria-label': label });
          for (const [v, t] of choices) {
            const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(cfg[key] === v), text: t });
            b.onclick = () => { saveCfg({ [key]: v }); applyEnabled(); if (key === 'scMode') shortcutBar(); seg.querySelectorAll('button').forEach((o) => o.setAttribute('aria-checked', String(o === b))); };
            seg.append(b);
          }
          panel.append(el('div', { class: 'rs-set' }, [el('span', { text: label }), seg]));
        } else panel.append(el('label', { class: 'rs-set' }, [el('span', { text: label }), toggle(key)]));
      }
    }
    const done = el('button', { type: 'button', class: 'rs-done', text: 'Done' });
    done.onclick = closePanel;
    const dashB = el('button', { type: 'button', class: 'rs-btn', text: 'Dashboard' });
    dashB.onclick = () => openDash();
    panel.append(el('div', { class: 'rs-panel-foot' }, [el('a', { href: 'https://github.com/humangenome/RESpawn', target: '_blank', rel: 'noopener', text: 'About RESpawn' }), el('span', { class: 'rs-set-btns' }, [dashB, done])]));
    document.body.append(panel);
    setTimeout(() => { document.addEventListener('click', outside, true); document.addEventListener('keydown', esc, true); }, 0);
  };
  const toggle = (key) => {
    const i = el('input', { type: 'checkbox', role: 'switch', class: 'rs-switch-input' });
    i.checked = !!cfg[key];
    i.onchange = () => { saveCfg({ [key]: i.checked }); applyEnabled(); if (['showShortcuts', 'linkFriends', 'linkMod', 'linkDashboard'].includes(key)) shortcutBar(); const card = document.getElementById('rs-about'); if (card) paintCard(card); };
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
    for (const k of ['enabled', 'showShortcuts', 'hideRecent', 'hideAds', 'hideBadges', 'hideSuggested', 'filterline', 'subStyles', 'pinHeader', 'keys', 'linkFriends', 'linkMod', 'hoverCards', 'highlight', 'autoReplies', 'hideChat', 'topButton', 'scoreColors', 'hideKids', 'hideMyName', 'linkDashboard']) if (typeof o[k] === 'boolean') out[k] = o[k];
    for (const [k, ok] of [['leftNav', ['show', 'slide', 'hide']], ['scMode', ['mine', 'visits']], ['mySubsSort', ['visits', 'az']]]) if (ok.includes(o[k])) out[k] = o[k];
    for (const [k, lo, hi] of [['filterScore', -99999, 99999], ['pauseEvery', 0, 99], ['maxVideos', 0, 99]]) if (Number.isFinite(o[k])) out[k] = Math.max(lo, Math.min(hi, Math.round(o[k])));
    if (Array.isArray(o.shortcuts)) {
      out.shortcuts = o.shortcuts.map((x) => {
        const v = typeof x === 'string' ? { sub: x } : x && typeof x === 'object' ? x : {};
        if (typeof v.feed === 'string') return FEED_PATH.test(v.feed) ? { feed: v.feed, name: clip(v.name, 40) } : null;
        if (!validSub(v.sub)) return null;
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
  const leftSlide = () => {
    if (document.getElementById('rs-left-edge')) return;
    const edge = el('div', { id: 'rs-left-edge', 'aria-hidden': 'true' });
    document.body.append(edge);
    const nav = () => document.getElementById('left-sidebar-container');
    let t;
    const open = () => { clearTimeout(t); html.classList.add('rs-left-open'); };
    const shut = () => { clearTimeout(t); t = setTimeout(() => html.classList.remove('rs-left-open'), 250); };
    edge.addEventListener('mouseenter', open);
    document.addEventListener('mouseover', (e) => { const n = nav(); if (!html.classList.contains('rs-left-slide') || !n) return; if (n.contains(e.target) || e.target === edge) open(); else if (html.classList.contains('rs-left-open')) shut(); });
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
  // (a group of subreddits: the new-design version of old Reddit's r/a+b+c links).
  const scList = () => (cfg.shortcuts || []).map((x) => (typeof x === 'string' ? { sub: x } : x)).filter((x) => x?.sub || x?.feed);
  const scSave = (list) => { saveCfg({ shortcuts: list.map(({ sub, feed, name }) => (feed ? { feed, name } : name && name.toLowerCase() !== sub.toLowerCase() ? { sub, name } : sub)) }); shortcutBar(); scButton(true); const card = document.getElementById('rs-about'); if (card) paintCard(card); };
  const scIndex = (sub) => scList().findIndex((x) => x.sub && x.sub.toLowerCase() === String(sub).toLowerCase());
  const scFeedIndex = (path) => scList().findIndex((x) => x.feed && x.feed.toLowerCase() === String(path).toLowerCase());
  const scHref = (x) => x.feed || `/r/${x.sub}/`;
  const scName = (x) => x.name || x.sub || x.feed.replace(/\/$/, '').split('/').pop();
  const scWhat = (x) => (x.feed ? `the ${scName(x)} feed` : `r/${x.sub}`);
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
    const fixed = [['HOME', '/', path === '/' || /^\/(best|hot|new|top|rising)\/?$/.test(path)], ['POPULAR', '/r/popular/', /^\/r\/popular/i.test(path)], ['ALL', '/r/all/', /^\/r\/all/i.test(path)]];
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
      const on = x.feed ? here.startsWith(x.feed.toLowerCase()) : cur === x.sub.toLowerCase();
      const a = el('a', { href: scHref(x), class: [on ? 'rs-cur' : '', x.feed ? 'rs-sc-feed' : ''].join(' ').trim() || null, title: x.feed ? `${scName(x)} (custom feed)` : `r/${x.sub}`, text: scName(x).toUpperCase(), 'data-i': String(i), draggable: auto ? null : 'true' });
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
  const joinButton = () => document.querySelector('shreddit-subreddit-header-buttons')?.shadowRoot?.querySelector('shreddit-join-button');
  const paintCard = (card) => {
    const sub = card.dataset.sub;
    const jb = joinButton(), join = card.querySelector('.rs-ab-join');
    if (jb) { const on = jb.hasAttribute('subscribed'); join.hidden = false; join.textContent = on ? 'Leave' : 'Join'; join.setAttribute('aria-pressed', String(on)); } else join.hidden = true;
    const sc = card.querySelector('.rs-ab-sc'), inList = scIndex(sub) >= 0;
    sc.textContent = inList ? '− Shortcut' : '+ Shortcut'; sc.setAttribute('aria-pressed', String(inList));
    card.querySelector('.rs-ab-style input').checked = subStyleOn(sub.toLowerCase());
  };
  const sideCard = () => {
    const hdr = document.querySelector('#right-sidebar-container shreddit-subreddit-header[name]');
    let card = document.getElementById('rs-about');
    if (!hdr) { card?.remove(); return; }
    const sub = hdr.getAttribute('name');
    if (card?.isConnected && card.dataset.sub === sub) return;
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
      const jb = joinButton();
      if (!jb) return;
      (jb.shadowRoot?.querySelector('button') || jb).click();
      setTimeout(() => paintCard(card), 800); setTimeout(() => paintCard(card), 2500);
    };
    const sc = el('button', { type: 'button', class: 'rs-ab-sc rs-btn' });
    sc.onclick = () => { scToggle(sub); paintCard(card); };
    const style = el('input', { type: 'checkbox', role: 'switch', class: 'rs-switch-input' });
    style.onchange = () => setSubStyle(sub.toLowerCase(), style.checked);
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
      el('label', { class: 'rs-ab-style' }, [el('span', { text: 'Use subreddit style' }), style]),
    );
    const top = document.getElementById('right-sidebar-contents') || hdr.closest('#right-sidebar-container');
    const info = document.getElementById('rs-postinfo');
    if (info?.isConnected) info.after(card); else top.prepend(card);
    hdr.classList.add('rs-hide-about');
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
        const row = el('div', { class: 'rs-ed-row', draggable: 'true', 'data-i': String(i) }, [el('span', { class: 'rs-ed-grip', 'aria-hidden': 'true', text: '⋮⋮' }), feed ? el('a', { class: 'rs-ed-sub rs-ed-feed', href: feed, title: 'Open this custom feed on Reddit to change its subreddits', text: 'Custom feed ↗' }) : el('span', { class: 'rs-ed-sub', text: `r/${sub}` }), nameIn, del]);
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
  const sortTabs = () => {
    const old = document.getElementById('rs-sortbar');
    if (old?.isConnected && old.dataset.url === location.href) return;
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
    const all = el('button', { type: 'button', class: 'rs-expand-all', text: 'Expand all' });
    all.onclick = () => {
      const open = all.textContent === 'Expand all';
      for (const b of document.querySelectorAll('.rs-row:not(.rs-filtered) .rs-x[data-kind="image"], .rs-row:not(.rs-filtered) .rs-x[data-kind="gallery"], .rs-row:not(.rs-filtered) .rs-x[data-kind="text"]')) if ((b.getAttribute('aria-expanded') === 'true') !== open) b.click();
      all.textContent = open ? 'Collapse all' : 'Expand all';
    };
    const funnel = el('button', { type: 'button', class: 'rs-funnel', title: 'Filter bar', 'aria-label': 'Show or hide the filter bar', 'aria-pressed': String(!!cfg.filterline), html: FUNNEL });
    funnel.onclick = () => { saveCfg({ filterline: !cfg.filterline }); applyEnabled(); };
    tabs.append(funnel, all);
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
    const lists = el('button', { type: 'button', class: 'rs-fl-lists', title: 'Hide posts by words in the title, by subreddit or by website' }, [el('span', { class: 'rs-fl-plus', 'aria-hidden': 'true', text: '+' }), ' Hide words, subs, sites']);
    lists.onclick = (e) => { e.stopPropagation(); openBlockEditor(); };
    bar.append(el('span', { class: 'rs-fl-count', role: 'status' }), clear, lists);
    return bar;
  };

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
    const feed = isCommentsPage() ? null : document.querySelector('shreddit-feed');
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
  setInterval(watchVideos, 1500);
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
  // Outside video sites whose players Reddit's own page allows (it blocks the rest, such as Twitch and X).
  const urlOf = (href) => { try { const u = new URL(href); return { h: u.hostname.replace(/^(www|m)\./, ''), p: u.pathname, u }; } catch { return null; } };
  const embedOf = (href) => {
    const x = urlOf(href);
    if (!x) return null;
    const { h, p } = x;
    let m;
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
    const type = post.getAttribute('post-type') || '';
    const href = post.getAttribute('content-href') || '';
    const media = post.querySelector(':scope > [slot="post-media-container"]');
    if ((type === 'text' || type === 'multi_media') && post.querySelector('shreddit-post-text-body')) return 'text';
    if (ytId(href)) return 'youtube';
    if (type === 'video' && media?.querySelector('shreddit-player, shreddit-player-2, video')) return 'video';
    if (type === 'gallery' && media) return 'gallery';
    if (type === 'image' && media) return 'image';
    if (type === 'crosspost' && media) return 'gallery';
    if (embedOf(href)) return 'embed';
    if (picOf(href)) return 'image';
    if (media?.querySelector('shreddit-embed')) return 'rembed'; // Reddit's own player for another site
    return null;
  };
  const player = (box, src, opts, close, title) => {
    const f = el('iframe', { class: `rs-yt${opts.tall ? ' rs-tall' : ''}`, src, title, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true });
    f.rsOrigin = opts.origin || '';
    if (opts.origin === YT_ORIGIN) f.rsPause = () => frameSay(f, { event: 'command', func: 'pauseVideo', args: [] });
    else if (opts.origin === VIMEO_ORIGIN) f.rsPause = () => frameSay(f, { method: 'pause' });
    f.addEventListener('load', () => {
      if (opts.origin === YT_ORIGIN) frameSay(f, { event: 'listening', id: 1, channel: 'widget' });
      else if (opts.plays) vStart(f, close); // plays by itself and can't be paused from here: closed when over the limit
    });
    box.append(f);
  };
  const fillBox = (box, post, kind, close) => {
    const href = post.getAttribute('content-href') || '';
    const title = post.getAttribute('post-title') || 'Video';
    if (kind === 'text') {
      const md = post.querySelector('shreddit-post-text-body [id$="-post-rtjson-content"], shreddit-post-text-body .md');
      const copy = md ? md.cloneNode(true) : el('p', { text: 'No text.' });
      copy.removeAttribute('id'); copy.className = 'rs-text md';
      box.append(copy);
    } else if (kind === 'youtube') {
      player(box, `${YT_ORIGIN}/embed/${ytId(href)}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`, { origin: YT_ORIGIN }, close, title);
    } else if (kind === 'embed') {
      const e = embedOf(href);
      player(box, e.src, e, close, title);
    } else if (kind === 'image' && picOf(href)) {
      const img = el('img', { class: 'rs-media-img', src: picOf(href), alt: post.getAttribute('post-title') || '' });
      const a = el('a', { href, target: '_blank', rel: 'noopener' }, [img]);
      img.onerror = () => a.replaceWith(el('p', { class: 'rs-media-err' }, ['That picture would not load here. ', el('a', { href, target: '_blank', rel: 'noopener', text: 'Open it' })]));
      box.append(a);
    } else {
      // video, gallery, crosspost, other images: show Reddit's own player or carousel
      const media = post.querySelector(':scope > [slot="post-media-container"]');
      if (media) { media.classList.add('rs-moved-media'); box.append(media); }
      for (const t of [300, 1200, 3000]) setTimeout(watchVideos, t); // Reddit's player builds its video a moment later
    }
    box.dataset.filled = '1';
  };
  const XICON = { youtube: 'video', embed: 'video', rembed: 'video' };
  const xButton = (post, kind, row) => {
    const icon = XICON[kind] || kind;
    const label = { text: 'Show text', video: 'Play video', youtube: 'Play video', embed: 'Play video', rembed: 'Show', image: 'Show picture', gallery: 'Show pictures' }[kind];
    const b = el('button', { type: 'button', class: 'rs-x', 'data-kind': icon, 'aria-expanded': 'false', title: label, html: ICON[icon] });
    let box = null;
    const close = () => { if (b.getAttribute('aria-expanded') === 'true') b.click(); };
    b.onclick = (ev) => {
      ev?.preventDefault?.();
      const open = b.getAttribute('aria-expanded') !== 'true';
      if (!box) { box = el('div', { class: `rs-box rs-box-${kind}` }); row.append(box); }
      if (open && !box.dataset.filled) fillBox(box, post, kind, close);
      box.hidden = !open;
      if (!open) {
        for (const v of deepVideos(box, [])) v.pause();
        for (const f of box.querySelectorAll('iframe.rs-yt')) { vStop(f); f.remove(); }
        if (kind === 'youtube' || kind === 'embed') { box.replaceChildren(); delete box.dataset.filled; }
      }
      b.setAttribute('aria-expanded', String(open));
      b.replaceChildren(svgOf(open ? ICON.close : ICON[icon]));
      b.title = open ? 'Close' : label;
    };
    return b;
  };

  // ---------- dense rows ----------
  // Votes go straight to Reddit with the same request its own button sends. (Reddit's own buttons
  // do nothing while the original post is hidden, so pressing them is not enough.)
  const csrf = () => (document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) || [])[1] || '';
  const voteStateOf = (post) => {
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
    let saved = !!menu()?.hasAttribute('is-post-saved');
    const b = el('button', { type: 'button', class: 'rs-save' });
    const paint = () => { b.textContent = saved ? 'unsave' : 'save'; b.title = saved ? 'Remove from your saved posts' : 'Save this post'; };
    b.onclick = async () => {
      if (needLogin('save posts')) return;
      saved = !saved; paint(); b.disabled = true;
      try { await gql('UpdatePostSaveState', { postId: post.id, saveState: saved ? 'SAVED' : 'NONE' }); menu()?.toggleAttribute('is-post-saved', saved); }
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
      score.dataset.v = String(start); // its place on the page is judged without your own vote (see scorePaint)
      score.rsTip = `${v.toLocaleString()} point${v === 1 ? '' : 's'}${Number.isFinite(ratio) && ratio > 0 && ratio <= 1 ? `, ${Math.round(ratio * 100)}% upvoted` : ''}`;
      scoreTip(score);
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
  // Scores colored by where they stand among the posts on this page (setting "Color the highest scores"): the top tenth
  // stands out, the next fifth is green, the bottom third is faint, below zero is red. A big subreddit and a small one
  // each get their own scale. Counted again as more posts load.
  // Pointing at a colored score says what the color means.
  const SCORE_NOTE = { 3: 'One of the highest scores on this page', 2: 'One of the highest scores on this page', 0: 'One of the lowest scores on this page' };
  const scoreTip = (x) => {
    const note = cfg.scoreColors && SCORE_NOTE[x.dataset.size];
    x.title = note ? `${x.rsTip}\n${note}` : x.rsTip || '';
  };
  const scorePaint = () => {
    if (!cfg.scoreColors) {
      if (scorePaint.n === -1) { scorePaint.n = 0; document.querySelectorAll('.rs-row .rs-score').forEach(scoreTip); } // just switched off
      return;
    }
    const S = [...document.querySelectorAll('.rs-row .rs-score')];
    if (S.length === scorePaint.n && S[0] === scorePaint.first) return;
    scorePaint.n = S.length; scorePaint.first = S[0];
    const vals = S.map((x) => +x.dataset.v || 0).sort((a, b) => b - a);
    const at = (f) => vals[Math.min(vals.length - 1, Math.floor(vals.length * f))];
    const top = at(0.1), good = at(0.3), low = at(0.7);
    for (const x of S) {
      const v = +x.dataset.v || 0;
      x.dataset.size = v < 0 ? 'neg' : v <= low ? '0' : v >= top ? '3' : v >= good ? '2' : '1';
      scoreTip(x);
    }
  };
  const densify = () => {
    if (isCommentsPage()) return;
    for (const post of document.querySelectorAll('shreddit-post')) {
      if (post.rsRow?.isConnected) continue; // already has its row (a post Reddit brings back after Back gets a new one)
      post.setAttribute('data-rs', '1');
      const g = (k) => post.getAttribute(k) || '';
      const link = g('content-href'), perma = g('permalink');
      const isSelf = /^self\./.test(g('domain'));
      const img = post.querySelector('[slot="post-media-container"] img[src*="redd.it"], [slot="thumbnail"] img, [slot="post-media-container"] img');
      const flair = post.querySelector('shreddit-post-flair')?.innerText.trim();
      const kind = kindOf(post);
      const row = el('div', { class: 'rs-row', 'data-rs-id': g('id') });
      row.rsPost = post;
      const thumbKids = img ? [el('img', { src: img.currentSrc || img.src, alt: '', loading: 'lazy' })] : [el('span', { html: isSelf ? ICON.text : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 12l4-4M7 9l-1.5 1.5a2.5 2.5 0 0 0 3.5 3.5L10.5 12.5M13 11l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5L9.5 7.5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>' })];
      const thumb = el('a', { class: 'rs-thumb', href: isSelf ? perma : link, tabindex: '-1', 'aria-hidden': 'true' }, thumbKids);
      const titleLine = el('div', { class: 'rs-tline' }, [
        el('a', { class: 'rs-title', href: isSelf ? perma : link, text: g('post-title') }),
        flag(post, 'nsfw') ? el('span', { class: 'rs-tag rs-tag-nsfw', text: 'nsfw' }) : null,
        flag(post, 'spoiler') ? el('span', { class: 'rs-tag rs-tag-spoiler', text: 'spoiler' }) : null,
        flair ? el('span', { class: 'rs-flair', text: flair }) : null,
        el('span', { class: 'rs-domain', text: `(${g('domain')})` }),
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
      row.append(el('div', { class: 'rs-rank', text: String(rankOf(post)) }), voteBox(post), thumb, main);
      post.rsRow = row;
      (post.closest('article') || post).before(row);
    }
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

  // ---------- remembered collapsed comments (RES) ----------
  // Reddit folds a comment by closing the <details> inside it. Remember which ones you folded and fold them again next time.
  const collapsedMap = () => readJSON('rs-collapsed');
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d?.tagName !== 'DETAILS' || d.parentElement?.tagName !== 'SHREDDIT-COMMENT' || !cfg.enabled) return;
    if (d.parentElement.rsQuiet) { d.parentElement.rsQuiet = false; return; }
    const id = d.parentElement.getAttribute('thingid');
    if (!id) return;
    const m = collapsedMap();
    if (d.open) delete m[id]; else m[id] = Date.now();
    const ids = Object.keys(m);
    if (ids.length > 5000) for (const old of ids.sort((a, b) => m[a] - m[b]).slice(0, ids.length - 4000)) delete m[old];
    try { localStorage.setItem('rs-collapsed', JSON.stringify(m)); } catch { /* storage full */ }
  }, true);

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
  const comments = () => {
    const page = document.querySelector('shreddit-post[view-context="CommentsPage"]');
    if (!page) return;
    const op = page.getAttribute('author');
    const pa = page.querySelector('[slot="authorName"] a.author-name');
    if (pa && validUser(op) && !page.querySelector('[slot="authorName"] .rs-ut')) (pa.closest('faceplate-hovercard') || pa).after(nameTag(op));
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
    const folded = collapsedMap(), me = myName();
    for (const c of document.querySelectorAll('shreddit-comment:not([data-rs])')) {
      const meta = c.querySelector('[slot="commentMeta"]');
      if (!meta) continue;
      c.setAttribute('data-rs', '1');
      if (folded[c.getAttribute('thingid')]) { const d = c.querySelector(':scope > details'); if (d?.open) d.open = false; }
      const author = c.getAttribute('author') || '';
      if (author === op || c.getAttribute('is-op') === 'true') c.setAttribute('rs-op', '');
      if (me && author.toLowerCase() === me) c.setAttribute('rs-me', '');
      if (c.getAttribute('is-mod-distinguished') === 'true') c.setAttribute('rs-mod', '');
      if (friendSet().has(author.toLowerCase())) c.setAttribute('rs-friend', '');
      const nm = meta.querySelector('.author-name-meta');
      if (nm && validUser(author)) (nm.closest('.author-hovercard-trigger') || nm).after(nameTag(author));
      if (ignored(author)) ignoreComment(c, true);
      if (comments.last && Date.parse(c.getAttribute('created')) > comments.last) { c.setAttribute('rs-new', ''); meta.append(el('span', { class: 'rs-badge rs-is-new', text: 'new' })); }
      const links = el('span', { class: 'rs-cacts' }, [el('a', { href: c.getAttribute('permalink') || '#', text: 'permalink' })]);
      if (+c.getAttribute('depth') > 0 && c.getAttribute('parentid')) links.append(parentLink(c));
      (c.querySelector(':scope > details [slot="actionRow"]') || meta).append(links);
    }
    kids(); updateNav(); moreReplies();
  };
  // Hide all replies (RES's "hide child comments"): only the top comments show, each with its own "show N replies".
  // A button next to Reddit's comment sort switches it for this page; a setting starts every post that way.
  const kidsOf = (c) => [...c.querySelectorAll(':scope > details [slot^="children"]')];
  const kidsCount = (c) => {
    let n = c.querySelectorAll('shreddit-comment').length;
    for (const b of c.querySelectorAll('faceplate-partial[loading="action"] button')) n += +(b.textContent.match(/(\d+)\s+more repl/i) || [])[1] || 0;
    return n;
  };
  const kidsPaint = () => {
    const b = document.getElementById('rs-kids');
    if (b) { const on = html.classList.contains('rs-kids-hidden'); b.textContent = on ? 'Show all replies' : 'Hide all replies'; b.setAttribute('aria-pressed', String(on)); }
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
      t.textContent = c.hasAttribute('rs-kids-open') ? 'hide replies' : `show ${n} repl${n === 1 ? 'y' : 'ies'}`;
    }
  };
  // Comment navigator (RES): jump between new comments, the poster's, mods', friends', your own, people you tagged.
  let nav = null, navI = -1;
  const NAV = [['new', 'New comments', '[rs-new]'], ['op', 'By the poster (OP)', '[rs-op]'], ['mod', 'Moderators', '[rs-mod]'], ['friend', 'Friends', '[rs-friend]'], ['me', 'Your comments', '[rs-me]'], ['tagged', 'People you tagged', '']];
  const navList = (k) => {
    const css = (NAV.find((n) => n[0] === k) || NAV[0])[2];
    const L = [...document.querySelectorAll(`shreddit-comment[data-rs]${css}`)].filter((c) => shown(ownParts(c)[0]));
    return k === 'tagged' ? L.filter((c) => tagOf(c.getAttribute('author'))) : L;
  };
  const addNavigator = () => {
    nav = el('div', { id: 'rs-nav', role: 'navigation', 'aria-label': 'Comment navigator' });
    const pick = el('select', { 'aria-label': 'Jump between' });
    for (const [v, t] of NAV) pick.append(el('option', { value: v, text: t }));
    const prev = el('button', { type: 'button', text: 'Prev' }), next = el('button', { type: 'button', text: 'Next' });
    const go = (d) => {
      const L = navList(pick.value);
      if (!L.length) return updateNav();
      navI = (Math.min(navI, L.length - 1) + d + L.length) % L.length;
      const c = L[navI];
      ownParts(c)[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (cfg.keys) select(c, false);
      updateNav();
    };
    prev.onclick = () => go(-1); next.onclick = () => go(1); pick.onchange = () => { navI = -1; updateNav(); };
    nav.append(pick, prev, next, el('span', { class: 'rs-count' }));
    document.body.append(nav);
  };
  const updateNav = () => {
    if (!nav) return;
    const L = navList(nav.querySelector('select').value);
    nav.querySelector('.rs-count').textContent = `${L.length ? Math.max(Math.min(navI, L.length - 1) + 1, 0) : 0} / ${L.length}`;
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
      ['c', 'Open comments (Shift: new tab)'], ['x', 'Expand or close'], ['X', 'Expand all or close all'], ['s', 'Save or unsave'], ['h', 'Hide'],
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
  // Reddit doesn't mark saved comments on the page, so a comment counts as unsaved until you save it here.
  const savedComments = new Set();
  const saveSel = async () => {
    if (!sel || needLogin('save')) return;
    try {
      if (isComment(sel)) {
        const id = sel.getAttribute('thingid'), on = !savedComments.has(id);
        await gql('UpdateCommentSaveState', { commentId: id, saveState: on ? 'SAVED' : 'NONE' });
        if (on) savedComments.add(id); else savedComments.delete(id);
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
  const hcTarget = (a) => {
    if (!a?.closest?.('.rs-row .rs-meta')) return null;
    const h = a.getAttribute('href') || '';
    let m = h.match(/^\/user\/([A-Za-z0-9_-]{3,20})\/?$/);
    if (m) return { kind: 'user', name: m[1] };
    m = h.match(/^\/r\/([A-Za-z0-9_]{2,21})\/?$/);
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
  const yearsOf = (sec) => { const y = Math.floor((Date.now() / 1000 - sec) / 31557600); return y < 1 ? 'under a year' : `${y} yr${y === 1 ? '' : 's'}`; };
  const closeHover = () => { clearTimeout(hcT); hc?.remove(); hc = null; hcLink = null; };
  const placeHover = (card, a) => {
    const r = a.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
    const below = r.bottom + 8 + h < innerHeight || r.top - 8 - h < 0;
    card.style.left = `${Math.max(8, Math.min(Math.round(r.left), innerWidth - w - 16))}px`;
    card.style.top = `${Math.round(below ? r.bottom + 8 : r.top - 8 - h)}px`;
  };
  const userCard = (d, name) => {
    if (d.gone !== undefined) return [el('p', { class: 'rs-hc-note', text: d.gone === 403 && !loggedIn() ? 'Log in to Reddit to see who this is.' : d.gone === 404 ? `u/${name} was deleted or does not exist.` : 'Reddit did not answer. Try again in a moment.' })];
    if (d.is_suspended) return [el('div', { class: 'rs-hc-head' }, [el('b', { text: `u/${d.name || name}` })]), el('p', { class: 'rs-hc-note', text: 'This account is suspended.' })];
    const icon = imgUrl(d.icon_img);
    const about = String(d.subreddit?.public_description || '').trim();
    const flags = [d.is_employee ? 'Reddit admin' : '', d.is_mod ? 'Moderator' : '', d.is_gold ? 'Premium' : ''].filter(Boolean);
    return [
      el('div', { class: 'rs-hc-head' }, [
        icon ? el('img', { class: 'rs-hc-icon rs-hc-round', src: icon, alt: '' }) : el('span', { class: 'rs-hc-icon rs-hc-round rs-ms-noicon', text: 'u/' }),
        el('div', {}, [el('b', { text: `u/${d.name || name}` }), el('span', { class: 'rs-hc-sub', text: `Redditor for ${yearsOf(d.created_utc)}, since ${dateOf(d.created_utc)}` })]),
      ]),
      el('div', { class: 'rs-hc-stats' }, [
        el('span', {}, [el('b', { text: num(d.link_karma || 0) }), ' post karma']),
        el('span', {}, [el('b', { text: num(d.comment_karma || 0) }), ' comment karma']),
      ]),
      flags.length ? el('div', { class: 'rs-hc-flags' }, flags.map((f) => el('span', { class: 'rs-hc-flag', text: f }))) : null,
      about ? el('p', { class: 'rs-hc-about', text: about }) : null,
      el('div', { class: 'rs-hc-links' }, [
        el('a', { href: `/user/${d.name || name}/`, text: 'Profile' }),
        el('a', { href: `/user/${d.name || name}/submitted/`, text: 'Posts' }),
        el('a', { href: `/user/${d.name || name}/comments/`, text: 'Comments' }),
        nameTag(d.name || name),
      ]),
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
  const railCheck = () => { const r = document.getElementById('right-sidebar-container'); html.classList.toggle('rs-no-rail', !!r && getComputedStyle(r).display === 'none'); };
  window.addEventListener('resize', () => { clearTimeout(railCheck.t); railCheck.t = setTimeout(railCheck, 150); }, { passive: true });
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
    densify(); scorePaint(); pager(); sortTabs(); applyFilters(); scButton(); postInfo(); sideCard(); applySubStyle(); comments(); tagRecent(); addGear(); restoreSel(); topButton(); hideMyName();
    if (Date.now() - (tidy.t || 0) > 1500) { tidy.t = Date.now(); tidy(); }
    if (cfg.enabled && cfg.leftNav === 'slide') ensureNav();
  };
  loadCfg().then(() => {
    applyEnabled(); leftSlide(); tick();
    new MutationObserver(() => { clearTimeout(tick.t); tick.t = setTimeout(tick, 120); }).observe(document.body, { childList: true, subtree: true });
    setInterval(() => { if (location.href !== lastUrl) tick(); }, 800);
  });
  window.__respawn = { cfg: () => cfg, saveCfg };
})();
