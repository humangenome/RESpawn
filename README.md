# RESpawn

**Reddit Enhancement Suite features for New Reddit.**

RESpawn keeps the new Reddit look and brings back the way old Reddit and Reddit Enhancement Suite (RES)
worked: HOME and ALL showing old Reddit's lists when you are logged in (the new site has dropped r/all, and old Reddit now needs an account), more posts on a screen, sort tabs in the open, RES's filter bar, one-click comments, save and
hide, a subreddit shortcut bar with groups and DASHBOARD / FRIENDS / MOD / MODQUEUE links, a switch for
subreddit styles, keyboard shortcuts, hover cards for users and subreddits, images and videos that open
in place (including Streamable, Vimeo, Twitch clips, TikTok, Imgur and Giphy), a limit on videos playing at once,
endless scrolling with page dividers and an optional pause, user tags and hiding people, colored names
for the poster, mods and friends, hiding posts by word, subreddit or website, more replies that load by
themselves, hiding all replies at once, a comment navigator, remembered collapsed comments, new-comment
counts, a dashboard with your saved comments, tags and hide lists, scores colored so the top posts
stand out, crosspost links, a back-to-top button, hiding chat and your own username, and a settings
backup file. A button beside the gear flips light and dark in one click (Auto, which follows your
computer, is in the settings).

RES made Reddit better for over a decade, but it only works on old.reddit.com. RESpawn is a new
extension for today's www.reddit.com, in Chrome and Firefox.

> **Not made by the RES team, and not affiliated with or endorsed by Reddit.** RESpawn is an
> independent project. It reuses ideas, and in places code, from RES under the same license (GPL-3.0).
> See [NOTICE](NOTICE).

## Status

Ready for the Chrome Web Store and Firefox Add-ons, not submitted yet.

- To try it now: run `scripts/build.sh`, then load `dist/chrome` in Chrome (chrome://extensions,
  Developer mode, Load unpacked) or `dist/firefox` in Firefox (about:debugging, This Firefox, Load
  Temporary Add-on).
- [Feature check](docs/feature-check.tsv): every one of RES's 82 features, sorted into what Reddit
  already does, what RESpawn rebuilds and what no longer applies.
- [Privacy policy](PRIVACY.md): no servers, no tracking, nothing collected.

## How it works

- It works on the Reddit page you are already looking at, using your own signed-in browser.
- It has no servers of its own, no tracking and no analytics. Your settings, tags and saved comments
  stay in your browser.
- Votes, saves and hides send the same requests Reddit's own buttons send, from your browser, as you.
- Groups, FRIENDS and MOD are private custom feeds on your Reddit account (Reddit shows old-style
  r/a+b, r/friends and r/mod pages only in the old design). RESpawn makes one only after you say yes.

## License

GPL-3.0. See [LICENSE](LICENSE).
