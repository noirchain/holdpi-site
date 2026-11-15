// π — BRAND_BOOK · interactive motion triggers
//
// the rest of the page (clock, theme, cursor, scroll-spy, scroll-top) is
// inherited from script.js. these extras are brandbook-only demos.

// glitch demo on the GLITCH_REVEAL card — re-run on demand
(() => {
  const target = document.getElementById('bb-glitch-target');
  const trigger = document.getElementById('bb-glitch-trigger');
  if (!target || !trigger) return;

  const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const randCh = () => SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
  const original = target.textContent;
  let running = false;

  const run = () => {
    if (running) return;
    running = true;
    const len = original.length;
    const FRAMES = 70;
    const REVEAL_FRAMES = 60;
    let frame = 0;

    const tick = () => {
      const charsRevealed = Math.floor((frame / REVEAL_FRAMES) * len);
      let out = '';
      for (let i = 0; i < len; i++) {
        const ch = original[i];
        if (ch === ' ') { out += ' '; continue; }
        out += i < charsRevealed ? ch : randCh();
      }
      target.textContent = out;
      frame++;
      if (frame <= FRAMES) requestAnimationFrame(tick);
      else { target.textContent = original; running = false; }
    };
    requestAnimationFrame(tick);
  };
  trigger.addEventListener('click', run);
})();


// live countdown inside the (07.3) GIF tweet — same 15-minute target as the main page
(() => {
  const el = document.getElementById('bb-tweet-timer');
  if (!el) return;
  const fmt = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };
  const tick = () => {
    const now = new Date();
    const utcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
    const dropInterval = 15 * 60;
    const remaining = dropInterval - (utcSec % dropInterval);
    el.textContent = fmt(remaining);
  };
  tick();
  setInterval(tick, 1000);
})();


// re-trigger the TV power-on intro on demand
(() => {
  const trigger = document.getElementById('bb-tv-trigger');
  if (!trigger) return;

  trigger.addEventListener('click', () => {
    // build a fresh tv overlay (the original was removed after the first run)
    let tv = document.getElementById('tv-on');
    if (tv) tv.remove();

    tv = document.createElement('div');
    tv.id = 'tv-on';
    tv.className = 'tv-on';
    tv.setAttribute('aria-hidden', 'true');
    tv.innerHTML = '<div class="tv-bg"></div><div class="tv-line"></div>';
    document.body.appendChild(tv);

    // remove after the animation completes
    setTimeout(() => tv.remove(), 1100);
  });
})();
