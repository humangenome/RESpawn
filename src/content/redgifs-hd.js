// RESpawn: a RedGifs player that RESpawn opens on Reddit plays in HD. RedGifs' embedded player starts in its small
// quality (854x480 for a 1920x1080 clip) and has its own HD button; this presses that button once, as you would, and
// keeps the sound as it was (off when "Show images" opened it). Should the press ever make the picture smaller (RedGifs
// changed its button), it presses again to put it back. It runs only inside RedGifs' player when that player sits on
// www.reddit.com, and reads and sends nothing.
(() => {
  if (!/^https:\/\/www\.reddit\.com\//.test(document.referrer)) return;
  const btn = () => document.querySelector('button[class*="gifQualityButton"]');
  const area = (v) => (v?.videoWidth || 0) * (v?.videoHeight || 0);
  // the small quality: its file is "...-mobile.mp4", or (when it streams) the button shows its 24 px "go HD" icon
  const small = (v, b) => /-mobile\.mp4(\?|$)/.test(v.currentSrc || v.src || '') || b.querySelector('svg')?.getAttribute('viewBox') === '0 0 24 24';
  let n = 0;
  const iv = setInterval(() => {
    const v = document.querySelector('video'), b = btn();
    if (++n > 60) { clearInterval(iv); return; }
    if (!v || !b || !area(v)) return; // not loaded yet
    clearInterval(iv);
    if (!small(v, b)) return;
    const a0 = area(v), muted = v.muted;
    b.click();
    let k = 0;
    const check = setInterval(() => {
      const w = document.querySelector('video');
      if (w && muted && !w.muted) w.muted = true;
      if (++k > 20) { clearInterval(check); return; }
      if (!w || !area(w) || area(w) === a0) return; // still switching
      clearInterval(check);
      if (area(w) < a0) btn()?.click(); // it went the wrong way: back as it was
    }, 300);
  }, 500);
})();
