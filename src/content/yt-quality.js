// RESpawn: a YouTube video that RESpawn opens on Reddit plays in the best quality the video has. YouTube's own choice
// goes by the player's size on screen, which picked 720p for a 2160p video. This runs inside YouTube's privacy-mode
// player (youtube-nocookie.com, the one RESpawn uses) and only when that player sits on www.reddit.com. It reads and
// sends nothing: it picks the top entry of the player's own quality list, as you would in its gear menu.
(() => {
  if (!/^https:\/\/www\.reddit\.com\//.test(document.referrer)) return;
  const ORDER = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  const apply = () => {
    const p = document.getElementById('movie_player');
    if (!p || typeof p.getAvailableQualityLevels !== 'function') return false;
    const have = p.getAvailableQualityLevels() || [];
    const best = ORDER.find((q) => have.includes(q));
    if (!best) return false; // the list fills in once the video has loaded
    if (p.getPlaybackQuality?.() !== best) {
      if (typeof p.setPlaybackQualityRange === 'function') p.setPlaybackQualityRange(best, best);
      if (typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality(best);
    }
    return true;
  };
  let n = 0;
  const iv = setInterval(() => { if (apply() || ++n > 240) clearInterval(iv); }, 500);
  // and again whenever the video starts (a player opened paused by "Show images" has no list until then)
  for (const ev of ['play', 'playing']) document.addEventListener(ev, () => setTimeout(apply, 250), true);
})();
