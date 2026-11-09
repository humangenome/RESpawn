// RESpawn's background helper. It does one thing: read old Reddit's post lists (old.reddit.com) for RESpawn's HOME and
// ALL pages, signed in as you, from your browser. The new site no longer serves r/all, and a page on www.reddit.com
// cannot read old.reddit.com by itself. Only the list addresses below are ever read, and only when RESpawn's own page
// code on www.reddit.com asks.
const SORTS = ['best', 'hot', 'new', 'rising', 'controversial', 'top'];
const TIMES = ['hour', 'day', 'week', 'month', 'year', 'all'];
// Reddit refuses its list data for "new" and "rising" (in any form); for those the ordinary old Reddit page is read.
const AS_PAGE = ['new', 'rising'];

const listUrl = (q) => {
  if (!q || (q.list !== 'home' && q.list !== 'all') || !SORTS.includes(q.sort) || (q.list === 'all' && q.sort === 'best')) return null;
  const page = AS_PAGE.includes(q.sort);
  const path = `${q.list === 'all' ? '/r/all' : ''}/${q.sort === 'hot' ? '' : `${q.sort}/`}`;
  const u = new URL(`https://old.reddit.com${path}${page ? '' : '.json'}`);
  if (!page) { u.searchParams.set('limit', '25'); u.searchParams.set('raw_json', '1'); }
  if ((q.sort === 'top' || q.sort === 'controversial') && TIMES.includes(q.t)) u.searchParams.set('t', q.t);
  if (typeof q.after === 'string' && /^t3_[a-z0-9]{1,13}$/.test(q.after)) {
    u.searchParams.set('after', q.after);
    u.searchParams.set('count', String(Math.max(0, Math.min(100000, Number(q.count) | 0))));
  }
  return { href: u.href, page };
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== 'rs-list') return false;
  if (sender.id !== chrome.runtime.id || !/^https:\/\/www\.reddit\.com\//.test(sender.url || sender.tab?.url || '')) return false;
  const u = listUrl(msg);
  if (!u) { reply({ error: 'bad request' }); return false; }
  fetch(u.href, { credentials: 'include', headers: { accept: u.page ? 'text/html' : 'application/json' } })
    .then(async (r) => {
      if (!r.ok) return reply({ error: `Reddit answered ${r.status}` });
      const text = await r.text();
      // Signed out, old Reddit answers every address with its "Log in to use old Reddit" page instead of the list.
      const wall = () => reply({ error: /log in/i.test(text.slice(0, 200_000)) ? 'login' : 'no list' });
      if (u.page) return /id="siteTable"/.test(text) ? reply({ html: text.slice(0, 3_000_000) }) : wall();
      let j; try { j = JSON.parse(text); } catch { return wall(); }
      reply(j?.data ? { data: { after: j.data.after || null, children: j.data.children || [] } } : { error: 'no list' });
    })
    .catch(() => reply({ error: 'Reddit did not answer' }));
  return true; // the answer comes later
});
