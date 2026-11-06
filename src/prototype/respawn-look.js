// RESpawn look prototype: run on a www.reddit.com page after respawn-look.css is added.
// Reads only what is already on the page. Votes press Reddit's own buttons.
(() => {
  const cfg = window.__RS_CFG || {};
  const html = document.documentElement;
  html.classList.add('rs-on');
  if (!document.querySelector('shreddit-post[view-context="CommentsPage"]')) html.classList.add('rs-feed');

  const ago = (iso) => {
    const s = Math.max(1, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 3600) return `${Math.round(s / 60)}m`;
    if (s < 86400) return `${Math.round(s / 3600)}h`;
    return `${Math.round(s / 86400)}d`;
  };
  const num = (n) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
  const el = (tag, attrs = {}, kids = []) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) k === 'text' ? (e.textContent = v) : e.setAttribute(k, v);
    for (const c of [].concat(kids)) if (c) e.append(c);
    return e;
  };
  const sub = (location.pathname.match(/^\/r\/([^/]+)/) || [])[1];

  // 1. Shortcut bar
  if (cfg.shortcuts?.length && !document.getElementById('rs-shortcuts')) {
    const bar = el('nav', { id: 'rs-shortcuts', 'aria-label': 'My subreddits' }, [el('span', { class: 'rs-mine', text: 'My subreddits' })]);
    for (const s of cfg.shortcuts) {
      const a = el('a', { href: `/r/${s}/`, text: s.toUpperCase() });
      if (sub && sub.toLowerCase() === s.toLowerCase()) a.classList.add('rs-on');
      bar.append(a);
    }
    const header = document.querySelector('reddit-header-large, header');
    (header?.parentElement || document.body).insertBefore(bar, header ? header.nextSibling : document.body.firstChild);
  }

  // 2. Sort tabs on feeds
  const sortDd = document.querySelector('shreddit-sort-dropdown[header-text="Sort by"]');
  if (sortDd && !document.getElementById('rs-sorts')) {
    const base = sub ? `/r/${sub}` : '';
    const cur = (location.pathname.match(/\/(best|hot|new|top|rising|controversial)\/?$/) || [, 'best'])[1];
    const tabs = el('div', { id: 'rs-sorts', role: 'tablist' });
    for (const s of ['best', 'hot', 'new', 'top', 'rising']) {
      const a = el('a', { href: `${base}/${s}/`, role: 'tab', text: s[0].toUpperCase() + s.slice(1) });
      if (s === cur) a.classList.add('rs-on');
      tabs.append(a);
    }
    const holder = sortDd.closest('div') || sortDd.parentElement;
    holder.parentElement.insertBefore(tabs, holder);
  }

  // 3. Dense rows
  let rank = 0, expanded = 0;
  const pressVote = (post, dir) => {
    const btn = [...(post.shadowRoot?.querySelectorAll('button') || [])].find((b) => b.hasAttribute(dir) || (b.getAttribute('aria-label') || '').toLowerCase().includes(dir));
    btn?.click();
  };
  const densify = () => {
    for (const post of document.querySelectorAll('shreddit-post:not(.rs-done)')) {
      if (post.getAttribute('view-context') === 'CommentsPage') continue;
      const g = (k) => post.getAttribute(k) || '';
      const link = g('content-href'), perma = g('permalink'), type = g('post-type');
      const img = post.querySelector('[slot="post-media-container"] img[src*="redd.it"], [slot="thumbnail"] img, img.preview-img, [slot="post-media-container"] img');
      const flair = post.querySelector('shreddit-post-flair')?.innerText.trim();
      const isSelf = /^self\./.test(g('domain'));
      const row = el('div', { class: 'rs-row', 'data-rs-id': g('id') });
      const thumb = el('a', { class: 'rs-thumb', href: isSelf ? perma : link, 'aria-hidden': 'true' }, img ? [el('img', { src: img.currentSrc || img.src, alt: '' })] : [document.createTextNode(isSelf ? '¶' : '↗')]);
      const up = el('button', { title: 'Upvote', text: '▲' }), down = el('button', { title: 'Downvote', text: '▼' });
      up.onclick = () => pressVote(post, 'upvote'); down.onclick = () => pressVote(post, 'downvote');
      const main = el('div', { class: 'rs-main' }, [
        el('a', { class: 'rs-title', href: isSelf ? perma : link, text: g('post-title') }),
        flair ? el('span', { class: 'rs-flair', text: flair }) : null,
        isSelf ? null : el('span', { class: 'rs-domain', text: `(${g('domain')})` }),
      ]);
      const meta = el('div', { class: 'rs-meta' });
      meta.append(`${ago(g('created-timestamp'))} ago by `, el('a', { href: `/user/${g('author')}/`, text: g('author') }));
      if (!sub || sub.includes('+')) meta.append(' to ', el('a', { href: `/${g('subreddit-prefixed-name')}/`, text: g('subreddit-prefixed-name') }));
      const n = +g('comment-count') || 0;
      const acts = el('div', { class: 'rs-acts' }, [
        el('a', { href: perma, text: `${num(n)} comment${n === 1 ? '' : 's'}` }),
        el('button', { text: 'share' }), el('button', { text: 'save' }), el('button', { text: 'hide' }),
        isSelf ? null : el('a', { href: link, target: '_blank', title: 'Open link and comments', text: '[l+c]' }),
      ]);
      main.append(meta, acts);
      row.append(el('div', { class: 'rs-rank', text: String(++rank) }), el('div', { class: 'rs-vote' }, [up, el('div', { class: 'rs-score', text: num(+g('score') || 0) }), down]), thumb, main);
      if (img && (type === 'image' || type === 'gallery')) {
        const show = el('button', { text: 'show image' });
        const box = el('div', { class: 'rs-expando', hidden: '' }, [el('img', { src: img.currentSrc || img.src, alt: g('post-title') })]);
        show.onclick = () => { box.hidden = !box.hidden; show.textContent = box.hidden ? 'show image' : 'hide image'; };
        acts.insertBefore(show, acts.children[1]);
        row.append(box);
        if (cfg.expandFirstImage && !expanded++) show.click();
      }
      (post.closest('article') || post).before(row);
      post.classList.add('rs-done');
    }
  };
  densify();
  new MutationObserver(densify).observe(document.body, { childList: true, subtree: true });

  // 3b. Subreddit header: drop the big floating icon (the small one beside the name stays)
  const h1 = document.querySelector('.masthead h1');
  if (h1) {
    const top = h1.getBoundingClientRect().top;
    for (const im of document.querySelectorAll('.masthead img')) {
      if (h1.contains(im) || im.closest('button')) continue;
      if (im.getBoundingClientRect().bottom > top + 4) continue; // only the icon floating above the name
      let box = im;
      while (box.parentElement && box.parentElement.children.length === 1 && !box.parentElement.matches('section, .masthead')) box = box.parentElement;
      box.classList.add('rs-hide-icon');
    }
  }

  // 4. Left side: drop the games block
  for (const h of document.querySelectorAll('summary, h2, span')) {
    if (/^\s*games on reddit\s*$/i.test(h.textContent)) { (h.closest('faceplate-expandable-section-helper, details, section') || h.parentElement).style.display = 'none'; break; }
  }

  // 5. Comment page
  const page = document.querySelector('shreddit-post[view-context="CommentsPage"]');
  if (page) {
    const op = page.getAttribute('author');
    const key = `rs-visit-${page.getAttribute('id')}`;
    if (cfg.simulateLastVisitHoursAgo) localStorage.setItem(key, String(Date.now() - cfg.simulateLastVisitHoursAgo * 3600e3));
    const last = +localStorage.getItem(key) || 0;
    const marks = { op: [], new: [], mod: [] };
    for (const c of document.querySelectorAll('shreddit-comment')) {
      const meta = c.querySelector('[slot="commentMeta"]');
      if (!meta || c.hasAttribute('rs-done')) continue;
      c.setAttribute('rs-done', '');
      const author = c.getAttribute('author');
      if (author && author === op) { c.setAttribute('rs-op', ''); marks.op.push(c); }
      if (last && Date.parse(c.getAttribute('created')) > last) { c.setAttribute('rs-new', ''); meta.append(el('span', { class: 'rs-badge rs-is-new', text: 'new' })); marks.new.push(c); }
      if (c.getAttribute('is-mod-distinguished') === 'true') marks.mod.push(c);
      const links = el('span', { class: 'rs-cacts rs-in-row' }, [
        el('a', { href: c.getAttribute('permalink') || '#', text: 'permalink' }),
        +c.getAttribute('depth') > 0 ? el('a', { href: '#', class: 'rs-parent', text: 'parent' }) : null,
        el('a', { href: '#', text: 'save' }),
      ]);
      const row = c.querySelector(':scope > details [slot="actionRow"]');
      (row || meta).append(links);
    }
    // Comment navigator
    const nav = el('div', { id: 'rs-nav', role: 'navigation', 'aria-label': 'Comment navigator' });
    const pick = el('select', { 'aria-label': 'Jump between' });
    for (const [v, t] of [['new', 'New comments'], ['op', 'By the poster (OP)'], ['mod', 'Moderators']]) pick.append(el('option', { value: v, text: t }));
    const count = el('span', { class: 'rs-count' });
    let i = -1;
    const list = () => marks[pick.value];
    const show = () => { count.textContent = `${list().length ? Math.max(i + 1, 0) : 0} / ${list().length}`; };
    const go = (d) => { const L = list(); if (!L.length) return; i = (i + d + L.length) % L.length; L[i].scrollIntoView({ block: 'center', behavior: 'smooth' }); show(); };
    const prev = el('button', { title: 'Previous', text: 'Prev' }), next = el('button', { title: 'Next', text: 'Next' });
    prev.onclick = () => go(-1); next.onclick = () => go(1); pick.onchange = () => { i = -1; show(); };
    nav.append(pick, prev, next, count); document.body.append(nav); show();
    localStorage.setItem(key, String(Date.now()));
  }
})();
