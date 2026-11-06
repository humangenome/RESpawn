// RESpawn: Reddit Enhancement Suite features for New Reddit.
// Runs on www.reddit.com pages. Reads only what is already on the page; votes and other
// actions press Reddit's own buttons. Settings live in the browser (chrome.storage or localStorage).
(() => {
  if (window.__respawnLoaded) return;
  window.__respawnLoaded = true;

  const html = document.documentElement;
  const DEFAULTS = { enabled: true, shortcuts: [], showShortcuts: true, leftNav: 'slide', hideRecent: true, hideAds: true, hideBadges: true, hideSuggested: true, filterline: true, filters: {}, filterScore: 0, simulateLastVisitHoursAgo: 0 };
  let cfg = { ...DEFAULTS, ...(window.__RS_CFG || {}) };

  // ---------- small helpers ----------
  const el = (tag, attrs = {}, kids = []) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v; // only our own fixed icon markup
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
  const num = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
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
    document.querySelector('#rs-sorts .rs-funnel')?.setAttribute('aria-pressed', String(!!cfg.filterline));
    const sw = document.getElementById('rs-switch');
    if (sw) { sw.setAttribute('aria-pressed', String(!!cfg.enabled)); sw.querySelector('b').textContent = cfg.enabled ? 'On' : 'Off'; }
  };
  const addSwitch = () => {
    if (document.getElementById('rs-switch')) return;
    const sw = el('button', { id: 'rs-switch', type: 'button', title: 'Turn RESpawn on or off' }, [document.createTextNode('RESpawn '), el('b')]);
    sw.onclick = () => { saveCfg({ enabled: !cfg.enabled }); applyEnabled(); };
    document.body.append(sw);
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
  };
  const SETTINGS = [
    ['Layout', [
      ['leftNav', 'Left sidebar', [['show', 'Show'], ['slide', 'Slide out'], ['hide', 'Hide']]],
      ['showShortcuts', 'Shortcut bar'],
      ['hideRecent', 'Hide "Recent posts"'],
      ['hideSuggested', 'Hide suggestions and games'],
      ['hideAds', 'Hide ads'],
      ['hideBadges', 'Hide "Top 1%" badges'],
    ]],
    ['Filter bar', [
      ['filterline', 'Show filter bar'],
      ['filterScore', 'Score filter: more than', 'number'],
    ]],
  ];
  let panel = null;
  const closePanel = () => { panel?.remove(); panel = null; document.removeEventListener('click', outside, true); document.removeEventListener('keydown', esc, true); };
  const outside = (e) => { if (panel && !panel.contains(e.target) && e.target.id !== 'rs-gear' && !e.target.closest?.('#rs-gear')) closePanel(); };
  const esc = (e) => { if (e.key === 'Escape') closePanel(); };
  const togglePanel = () => {
    if (panel) return closePanel();
    panel = el('div', { id: 'rs-panel', role: 'dialog', 'aria-label': 'RESpawn settings' });
    const x = el('button', { type: 'button', class: 'rs-panel-x', 'aria-label': 'Close', html: ICON.close });
    x.onclick = closePanel;
    const master = el('label', { class: 'rs-set rs-master' }, [el('span', { text: 'RESpawn' }), toggle('enabled')]);
    panel.append(el('div', { class: 'rs-panel-head' }, [el('b', { text: 'Settings' }), x]), master);
    for (const [title, items] of SETTINGS) {
      panel.append(el('div', { class: 'rs-panel-sec', text: title }));
      for (const [key, label, choices] of items) {
        if (choices === 'number') {
          const n = el('input', { type: 'number', class: 'rs-num', step: '1', 'aria-label': label });
          n.value = String(cfg[key] ?? 0);
          n.onchange = () => { saveCfg({ [key]: Math.max(-99999, Math.min(99999, parseInt(n.value, 10) || 0)) }); n.value = String(cfg[key]); refilter(); };
          panel.append(el('label', { class: 'rs-set' }, [el('span', { text: label }), n]));
        } else if (choices) {
          const seg = el('div', { class: 'rs-seg', role: 'radiogroup', 'aria-label': label });
          for (const [v, t] of choices) {
            const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(cfg[key] === v), text: t });
            b.onclick = () => { saveCfg({ [key]: v }); applyEnabled(); seg.querySelectorAll('button').forEach((o) => o.setAttribute('aria-checked', String(o === b))); };
            seg.append(b);
          }
          panel.append(el('div', { class: 'rs-set' }, [el('span', { text: label }), seg]));
        } else panel.append(el('label', { class: 'rs-set' }, [el('span', { text: label }), toggle(key)]));
      }
    }
    panel.append(el('div', { class: 'rs-panel-sec', text: 'Shortcuts' }));
    const ta = el('textarea', { class: 'rs-shortcut-list', rows: '5', 'aria-label': 'Shortcut subreddits, one per line', spellcheck: 'false' });
    ta.value = (cfg.shortcuts || []).join('\n');
    ta.onchange = () => { saveCfg({ shortcuts: ta.value.split(/[\s,]+/).map((v) => v.replace(/^\/?r\//i, '').trim()).filter(Boolean) }); shortcutBar(); };
    panel.append(ta);
    const done = el('button', { type: 'button', class: 'rs-done', text: 'Done' });
    done.onclick = closePanel;
    panel.append(el('div', { class: 'rs-panel-foot' }, [el('a', { href: 'https://github.com/humangenome/RESpawn', target: '_blank', rel: 'noopener', text: 'About RESpawn' }), done]));
    document.body.append(panel);
    setTimeout(() => { document.addEventListener('click', outside, true); document.addEventListener('keydown', esc, true); }, 0);
  };
  const toggle = (key) => {
    const i = el('input', { type: 'checkbox', role: 'switch', class: 'rs-switch-input' });
    i.checked = !!cfg[key];
    i.onchange = () => { saveCfg({ [key]: i.checked }); applyEnabled(); if (key === 'showShortcuts') shortcutBar(); };
    return i;
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

  // ---------- shortcut bar ----------
  const shortcutBar = () => {
    let bar = document.getElementById('rs-shortcuts');
    if (!cfg.shortcuts?.length || !cfg.showShortcuts) { bar?.remove(); return; }
    if (!bar) {
      bar = el('nav', { id: 'rs-shortcuts', 'aria-label': 'My subreddits' });
      const header = document.querySelector('reddit-header-large, header');
      (header?.parentElement || document.body).insertBefore(bar, header ? header.nextSibling : document.body.firstChild);
    }
    bar.replaceChildren(el('a', { class: 'rs-mine', href: '/subreddits/mine/', text: 'My subreddits' }));
    const path = location.pathname;
    for (const [label, href, on] of [['HOME', '/', path === '/' || /^\/(best|hot|new|top|rising)\/?$/.test(path)], ['POPULAR', '/r/popular/', /^\/r\/popular/i.test(path)], ['ALL', '/r/all/', /^\/r\/all/i.test(path)]]) bar.append(el('a', { href, class: on ? 'rs-cur' : null, text: label }));
    bar.append(el('span', { class: 'rs-sep', 'aria-hidden': 'true', text: '|' }));
    const sub = (subOf() || '').toLowerCase();
    for (const s of cfg.shortcuts) bar.append(el('a', { href: `/r/${s}/`, class: sub === s.toLowerCase() ? 'rs-cur' : null, text: s.toUpperCase() }));
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
        row.rsHide = on.some((k) => (fstate(k) === 'only' ? !matches(post, row, k) : matches(post, row, k)));
        row.classList.toggle('rs-filtered', row.rsHide);
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
    bar.append(el('span', { class: 'rs-fl-count', role: 'status' }), clear);
    return bar;
  };
  const trackOpens = (e) => {
    const a = e.target.closest?.('a');
    const row = a?.closest('.rs-row');
    if (row && !a.closest('.rs-by')) markSeen(row.dataset.rsId);
  };
  document.addEventListener('click', trackOpens, true);
  document.addEventListener('auxclick', trackOpens, true);

  // ---------- expando: open the post's content right in the feed ----------
  const ytId = (url) => {
    try {
      const u = new URL(url);
      if (/(^|\.)youtu\.be$/.test(u.hostname)) return u.pathname.slice(1).split('/')[0];
      if (/(^|\.)youtube\.com$/.test(u.hostname)) return u.searchParams.get('v') || (u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/) || [])[2];
    } catch { /* not a url */ }
    return null;
  };
  const kindOf = (post) => {
    const type = post.getAttribute('post-type') || '';
    const href = post.getAttribute('content-href') || '';
    const media = post.querySelector(':scope > [slot="post-media-container"]');
    if ((type === 'text' || type === 'multi_media') && post.querySelector('shreddit-post-text-body')) return 'text';
    if (ytId(href)) return 'youtube';
    if (type === 'video' && media?.querySelector('shreddit-player, video')) return 'video';
    if (type === 'gallery' && media) return 'gallery';
    if (type === 'image' && media) return 'image';
    if (type === 'crosspost' && media) return 'gallery';
    if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(href)) return 'image';
    return null;
  };
  const fillBox = (box, post, kind) => {
    const href = post.getAttribute('content-href') || '';
    if (kind === 'text') {
      const md = post.querySelector('shreddit-post-text-body [id$="-post-rtjson-content"], shreddit-post-text-body .md');
      const copy = md ? md.cloneNode(true) : el('p', { text: 'No text.' });
      copy.removeAttribute('id'); copy.className = 'rs-text md';
      box.append(copy);
    } else if (kind === 'youtube') {
      box.append(el('iframe', { class: 'rs-yt', src: `https://www.youtube-nocookie.com/embed/${ytId(href)}?autoplay=1&rel=0`, title: post.getAttribute('post-title') || 'Video', allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, loading: 'lazy' }));
    } else if (kind === 'image' && /i\.redd\.it|\.(jpe?g|png|gif|webp)(\?|$)/i.test(href)) {
      box.append(el('a', { href, target: '_blank', rel: 'noopener' }, [el('img', { class: 'rs-media-img', src: href, alt: post.getAttribute('post-title') || '' })]));
    } else {
      // video, gallery, crosspost, other images: show Reddit's own player or carousel
      const media = post.querySelector(':scope > [slot="post-media-container"]');
      if (media) { media.classList.add('rs-moved-media'); box.append(media); }
    }
    box.dataset.filled = '1';
  };
  const xButton = (post, kind, row) => {
    const b = el('button', { type: 'button', class: 'rs-x', 'data-kind': kind === 'youtube' ? 'video' : kind, 'aria-expanded': 'false', title: { text: 'Show text', video: 'Play video', youtube: 'Play video', image: 'Show picture', gallery: 'Show pictures' }[kind], html: ICON[kind === 'youtube' ? 'video' : kind] });
    let box = null;
    b.onclick = (ev) => {
      ev.preventDefault();
      const open = b.getAttribute('aria-expanded') !== 'true';
      if (!box) { box = el('div', { class: `rs-box rs-box-${kind}` }); row.append(box); }
      if (open && !box.dataset.filled) fillBox(box, post, kind);
      box.hidden = !open;
      if (!open) { box.querySelectorAll('video').forEach((v) => v.pause()); box.querySelectorAll('iframe.rs-yt').forEach((f) => f.remove()); delete box.dataset.filled; if (kind === 'youtube') box.replaceChildren(); }
      b.setAttribute('aria-expanded', String(open));
      b.innerHTML = open ? ICON.close : ICON[kind === 'youtube' ? 'video' : kind];
      b.title = open ? 'Close' : b.title;
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
  const sendVote = async (postId, voteState) => {
    const r = await fetch('/svc/shreddit/graphql', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'UpdatePostVoteState', variables: { input: { postId, voteState } }, csrf_token: csrf() }),
    });
    if (!r.ok) throw new Error(`vote ${r.status}`);
    const j = await r.json().catch(() => ({}));
    if (j?.errors?.length) throw new Error('vote refused');
  };
  const toast = (msg) => {
    const t = el('div', { class: 'rs-toast', role: 'status', text: msg });
    document.body.append(t); setTimeout(() => t.remove(), 3500);
  };
  const voteBox = (post) => {
    const base = +post.getAttribute('score') || 0;
    let state = voteStateOf(post);
    const start = state === 'UP' ? base - 1 : state === 'DOWN' ? base + 1 : base; // score without my vote
    const up = el('button', { type: 'button', class: 'rs-up', title: 'Upvote', 'aria-label': 'Upvote', html: ICON.up });
    const down = el('button', { type: 'button', class: 'rs-down', title: 'Downvote', 'aria-label': 'Downvote', html: ICON.down });
    const score = el('div', { class: 'rs-score' });
    const box = el('div', { class: 'rs-vote' }, [up, score, down]);
    const paint = () => {
      box.dataset.vote = state;
      up.setAttribute('aria-pressed', String(state === 'UP'));
      down.setAttribute('aria-pressed', String(state === 'DOWN'));
      score.textContent = num(start + (state === 'UP' ? 1 : state === 'DOWN' ? -1 : 0));
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
  const densify = () => {
    if (isCommentsPage()) return;
    let rank = document.querySelectorAll('.rs-row').length; // restarts when Reddit swaps the whole feed
    for (const post of document.querySelectorAll('shreddit-post:not([data-rs])')) {
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
      by.append(`submitted ${ago(g('created-timestamp'))} ago by `, el('a', { href: `/user/${g('author')}/`, text: g('author') }));
      const sub = subOf();
      if (!sub || sub.includes('+') || sub === 'popular' || sub === 'all') by.append(' to ', el('a', { href: `/${g('subreddit-prefixed-name')}/`, text: g('subreddit-prefixed-name') }));
      meta.append(by);
      const n = +g('comment-count') || 0;
      const acts = el('div', { class: 'rs-acts' }, [
        el('a', { href: perma, text: `${num(n)} comment${n === 1 ? '' : 's'}` }),
        el('button', { type: 'button', text: 'share' }), el('button', { type: 'button', text: 'save' }), el('button', { type: 'button', text: 'hide' }),
        isSelf ? null : el('a', { href: link, target: '_blank', rel: 'noopener', title: 'Open link and comments', text: '[l+c]' }),
      ]);
      const main = el('div', { class: 'rs-main' }, [titleLine, meta, acts]);
      row.append(el('div', { class: 'rs-rank', text: String(++rank) }), voteBox(post), thumb, main);
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

  // ---------- comment pages ----------
  const marks = { new: [], op: [], mod: [] };
  const comments = () => {
    const page = document.querySelector('shreddit-post[view-context="CommentsPage"]');
    if (!page) return;
    const op = page.getAttribute('author');
    const key = `rs-visit-${page.getAttribute('id')}`;
    if (comments.started !== key) {
      nav?.remove(); nav = null; navI = -1; marks.new = []; marks.op = []; marks.mod = [];
      comments.started = key;
      if (cfg.simulateLastVisitHoursAgo) localStorage.setItem(key, String(Date.now() - cfg.simulateLastVisitHoursAgo * 3600e3));
      comments.last = +localStorage.getItem(key) || 0;
      localStorage.setItem(key, String(Date.now()));
      addNavigator();
    }
    for (const c of document.querySelectorAll('shreddit-comment:not([data-rs])')) {
      const meta = c.querySelector('[slot="commentMeta"]');
      if (!meta) continue;
      c.setAttribute('data-rs', '1');
      if (c.getAttribute('author') === op) { c.setAttribute('rs-op', ''); marks.op.push(c); }
      if (comments.last && Date.parse(c.getAttribute('created')) > comments.last) { c.setAttribute('rs-new', ''); meta.append(el('span', { class: 'rs-badge rs-is-new', text: 'new' })); marks.new.push(c); }
      if (c.getAttribute('is-mod-distinguished') === 'true') marks.mod.push(c);
      const links = el('span', { class: 'rs-cacts' }, [el('a', { href: c.getAttribute('permalink') || '#', text: 'permalink' })]);
      (c.querySelector(':scope > details [slot="actionRow"]') || meta).append(links);
    }
    updateNav();
  };
  let nav = null, navI = -1;
  const addNavigator = () => {
    nav = el('div', { id: 'rs-nav', role: 'navigation', 'aria-label': 'Comment navigator' });
    const pick = el('select', { 'aria-label': 'Jump between' });
    for (const [v, t] of [['new', 'New comments'], ['op', 'By the poster (OP)'], ['mod', 'Moderators']]) pick.append(el('option', { value: v, text: t }));
    const prev = el('button', { type: 'button', text: 'Prev' }), next = el('button', { type: 'button', text: 'Next' });
    const go = (d) => { const L = marks[pick.value]; if (!L.length) return; navI = (navI + d + L.length) % L.length; L[navI].scrollIntoView({ block: 'center', behavior: 'smooth' }); updateNav(); };
    prev.onclick = () => go(-1); next.onclick = () => go(1); pick.onchange = () => { navI = -1; updateNav(); };
    nav.append(pick, prev, next, el('span', { class: 'rs-count' }));
    document.body.append(nav);
  };
  const updateNav = () => {
    if (!nav) return;
    const L = marks[nav.querySelector('select').value];
    nav.querySelector('.rs-count').textContent = `${L.length ? Math.max(navI + 1, 0) : 0} / ${L.length}`;
  };

  // ---------- run ----------
  let lastUrl = '';
  const onRoute = () => {
    html.classList.toggle('rs-feed', !isCommentsPage());
    shortcutBar(); sortTabs(); tidy(); addGear();
    if (!isCommentsPage()) { nav?.remove(); nav = null; comments.started = null; marks.new = []; marks.op = []; marks.mod = []; }
  };
  const tick = () => {
    if (location.href !== lastUrl) { lastUrl = location.href; onRoute(); }
    densify(); sortTabs(); applyFilters(); comments(); tagRecent(); addGear();
  };
  loadCfg().then(() => {
    addSwitch(); applyEnabled(); leftSlide(); tick();
    new MutationObserver(() => { clearTimeout(tick.t); tick.t = setTimeout(tick, 120); }).observe(document.body, { childList: true, subtree: true });
    setInterval(() => { if (location.href !== lastUrl) tick(); }, 800);
  });
  window.__respawn = { cfg: () => cfg, saveCfg };
})();
