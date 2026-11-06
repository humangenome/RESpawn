// RESpawn: Reddit Enhancement Suite features for New Reddit.
// Runs on www.reddit.com pages. Reads only what is already on the page; votes and other
// actions press Reddit's own buttons. Settings live in the browser (chrome.storage or localStorage).
(() => {
  if (window.__respawnLoaded) return;
  window.__respawnLoaded = true;

  const html = document.documentElement;
  const DEFAULTS = { enabled: true, shortcuts: [], hideAds: true, hideBadges: true, simulateLastVisitHoursAgo: 0 };
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
    const sw = document.getElementById('rs-switch');
    if (sw) { sw.setAttribute('aria-pressed', String(!!cfg.enabled)); sw.querySelector('b').textContent = cfg.enabled ? 'On' : 'Off'; }
  };
  const addSwitch = () => {
    if (document.getElementById('rs-switch')) return;
    const sw = el('button', { id: 'rs-switch', type: 'button', title: 'Turn RESpawn on or off' }, [document.createTextNode('RESpawn '), el('b')]);
    sw.onclick = () => { saveCfg({ enabled: !cfg.enabled }); applyEnabled(); };
    document.body.append(sw);
  };

  // ---------- shortcut bar ----------
  const shortcutBar = () => {
    let bar = document.getElementById('rs-shortcuts');
    if (!cfg.shortcuts?.length) { bar?.remove(); return; }
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
  const sortTabs = () => {
    document.getElementById('rs-sorts')?.remove();
    const dd = document.querySelector('shreddit-sort-dropdown[header-text="Sort by"]');
    if (!dd || isCommentsPage()) return;
    const sub = subOf();
    const base = sub ? `/r/${sub}` : '';
    const cur = (location.pathname.match(/\/(best|hot|new|top|rising|controversial)\/?$/) || [, sub ? 'hot' : 'best'])[1];
    const tabs = el('div', { id: 'rs-sorts', role: 'tablist', 'aria-label': 'Sort' });
    for (const s of ['best', 'hot', 'new', 'top', 'rising']) tabs.append(el('a', { href: `${base}/${s}/`, role: 'tab', 'aria-selected': String(s === cur), class: s === cur ? 'rs-cur' : null, text: s[0].toUpperCase() + s.slice(1) }));
    const all = el('button', { type: 'button', class: 'rs-expand-all', text: 'Expand all' });
    all.onclick = () => {
      const open = all.textContent === 'Expand all';
      for (const b of document.querySelectorAll('.rs-x[data-kind="image"], .rs-x[data-kind="gallery"], .rs-x[data-kind="text"]')) if ((b.getAttribute('aria-expanded') === 'true') !== open) b.click();
      all.textContent = open ? 'Collapse all' : 'Expand all';
    };
    tabs.append(all);
    const holder = dd.closest('div') || dd.parentElement;
    holder.parentElement.insertBefore(tabs, holder);
  };

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
  let rank = 0;
  const pressVote = (post, dir) => {
    const btn = [...(post.shadowRoot?.querySelectorAll('button') || [])].find((x) => x.hasAttribute(dir) || (x.getAttribute('aria-label') || '').toLowerCase().includes(dir));
    btn?.click();
  };
  const densify = () => {
    if (isCommentsPage()) return;
    for (const post of document.querySelectorAll('shreddit-post:not([data-rs])')) {
      post.setAttribute('data-rs', '1');
      const g = (k) => post.getAttribute(k) || '';
      const link = g('content-href'), perma = g('permalink');
      const isSelf = /^self\./.test(g('domain'));
      const img = post.querySelector('[slot="post-media-container"] img[src*="redd.it"], [slot="thumbnail"] img, [slot="post-media-container"] img');
      const flair = post.querySelector('shreddit-post-flair')?.innerText.trim();
      const kind = kindOf(post);
      const row = el('div', { class: 'rs-row', 'data-rs-id': g('id') });
      const thumbKids = img ? [el('img', { src: img.currentSrc || img.src, alt: '', loading: 'lazy' })] : [el('span', { html: isSelf ? ICON.text : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 12l4-4M7 9l-1.5 1.5a2.5 2.5 0 0 0 3.5 3.5L10.5 12.5M13 11l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5L9.5 7.5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>' })];
      const thumb = el('a', { class: 'rs-thumb', href: isSelf ? perma : link, tabindex: '-1', 'aria-hidden': 'true' }, thumbKids);
      const up = el('button', { type: 'button', title: 'Upvote', text: '▲' });
      const down = el('button', { type: 'button', title: 'Downvote', text: '▼' });
      up.onclick = () => pressVote(post, 'upvote');
      down.onclick = () => pressVote(post, 'downvote');
      const titleLine = el('div', { class: 'rs-tline' }, [
        el('a', { class: 'rs-title', href: isSelf ? perma : link, text: g('post-title') }),
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
      row.append(el('div', { class: 'rs-rank', text: String(++rank) }), el('div', { class: 'rs-vote' }, [up, el('div', { class: 'rs-score', text: num(+g('score') || 0) }), down]), thumb, main);
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
    shortcutBar(); sortTabs(); tidy();
    if (!isCommentsPage()) { rank = 0; nav?.remove(); nav = null; comments.started = null; marks.new = []; marks.op = []; marks.mod = []; }
  };
  const tick = () => {
    if (location.href !== lastUrl) { lastUrl = location.href; onRoute(); }
    densify(); comments();
  };
  loadCfg().then(() => {
    addSwitch(); applyEnabled(); tick();
    new MutationObserver(() => { clearTimeout(tick.t); tick.t = setTimeout(tick, 120); }).observe(document.body, { childList: true, subtree: true });
    setInterval(() => { if (location.href !== lastUrl) tick(); }, 800);
  });
  window.__respawn = { cfg: () => cfg, saveCfg };
})();
