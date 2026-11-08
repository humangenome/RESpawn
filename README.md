# RESpawn

**Reddit Enhancement Suite features for New Reddit.**

RESpawn keeps the new Reddit look and brings back the way old Reddit and Reddit Enhancement Suite (RES)
worked: more posts on a screen, sort tabs in the open, RES's filter bar, one-click comments, save and
hide, a subreddit shortcut bar with groups and FRIENDS / MOD / MODQUEUE links, a switch for subreddit
styles, keyboard shortcuts, hover cards for users and subreddits, images and videos that open in place
(including Streamable, Vimeo, TikTok, Imgur and Giphy), a limit on videos playing at once, endless
scrolling with page dividers and an optional pause, user tags and hiding people, colored names for the
poster, mods and friends, hiding posts by word, subreddit or website, more replies that load by
themselves, a comment navigator, remembered collapsed comments, new-comment counts and a settings
backup file. It follows Reddit's light and dark modes.

RES made Reddit better for over a decade, but it only works on old.reddit.com. RESpawn is a new
extension for today's www.reddit.com, in Chrome and Firefox.

> **Not made by the RES team, and not affiliated with or endorsed by Reddit.** RESpawn is an
> independent project. It reuses ideas, and in places code, from RES under the same license (GPL-3.0).
> See [NOTICE](NOTICE).

## Status

Early work. Nothing to install yet.

- [Feature check](docs/feature-check.tsv): every one of RES's 82 features, sorted into what Reddit
  already does, what RESpawn rebuilds and what no longer applies.

## How it works

- It works on the Reddit page you are already looking at, using your own signed-in browser.
- It has no servers of its own, no tracking and no analytics. Your settings, tags and saved comments
  stay in your browser.
- Votes, saves and hides send the same requests Reddit's own buttons send, from your browser, as you.
- Groups, FRIENDS and MOD are private custom feeds on your Reddit account (Reddit shows old-style
  r/a+b, r/friends and r/mod pages only in the old design). RESpawn makes one only after you say yes.

## License

GPL-3.0. See [LICENSE](LICENSE).
