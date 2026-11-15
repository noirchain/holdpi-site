(() => { let started=false; const start=async()=>{if(started)return;started=true;await document.fonts.ready; const intro=document.querySelector('.tv-on'); if(intro) intro.replaceWith(intro.cloneNode(true));
// π — copy + clock + cursor + crosshair + lock-on

// ---------- liquid bg with binary reveal — cursor cuts the liquid, digits show ----------
(() => {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const main = document.createElement('canvas');
  main.className = 'liquid-bg-canvas';
  main.setAttribute('aria-hidden', 'true');
  document.body.appendChild(main);
  const mctx = main.getContext('2d');

  // offscreen layers — composed each frame
  const digits = document.createElement('canvas');   // pre-rendered binary grid
  const dctx = digits.getContext('2d');
  const mask = document.createElement('canvas');     // liquid layer (cursor erases)
  const xctx = mask.getContext('2d');

  let W = 0, H = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  // page bg color — used for the liquid mask so it visually disappears
  // when intact (matches the page bg behind it)
  let bgColor = 'rgb(222,225,229)';
  let bgRGBA  = 'rgba(222,225,229,0.10)';
  function readBg() {
    bgColor = getComputedStyle(document.documentElement).backgroundColor || 'rgb(222,225,229)';
    const m = bgColor.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) bgRGBA = `rgba(${m[1]},${m[2]},${m[3]},0.10)`;
    if (W) resetMask();
  }

  function rebuildDigits() {
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.clearRect(0, 0, W, H);
    dctx.font = "700 11px 'JetBrains Mono', ui-monospace, monospace";
    dctx.textAlign = 'center';
    dctx.textBaseline = 'middle';
    // semi-transparent dark digits — readable against the page bg when revealed
    dctx.fillStyle = 'rgba(20, 24, 30, 0.55)';
    const CELL = 18;
    for (let y = CELL/2; y < H; y += CELL) {
      for (let x = CELL/2; x < W; x += CELL) {
        dctx.fillText(Math.random() > 0.5 ? '1' : '0', x, y);
      }
    }
  }

  function resetMask() {
    // fully opaque page-bg color — visually identical to the bg behind the canvas
    xctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    xctx.globalCompositeOperation = 'source-over';
    xctx.fillStyle = bgColor;
    xctx.fillRect(0, 0, W, H);
  }

  function getDocHeight() {
    // canvas is position:absolute so it doesn't contribute to scrollHeight
    return Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      window.innerHeight
    );
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // clientWidth excludes the vertical scrollbar; innerWidth includes it
    // (using innerWidth was causing horizontal overflow on Windows)
    W = document.documentElement.clientWidth;
    H = getDocHeight();
    for (const c of [main, digits, mask]) {
      c.width  = Math.floor(W * dpr);
      c.height = Math.floor(H * dpr);
      c.style.width  = W + 'px';
      c.style.height = H + 'px';
    }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readBg();
    rebuildDigits();
    resetMask();
  }
  resize();
  window.addEventListener('resize', resize);
  // re-measure once everything (fonts, images) has loaded
  window.addEventListener('load', resize);
  // also catch later content height changes (lazy images, etc.)
  if ('ResizeObserver' in window) {
    let lastH = H;
    new ResizeObserver(() => {
      const newH = getDocHeight();
      if (Math.abs(newH - lastH) > 80) { lastH = newH; resize(); }
    }).observe(document.body);
  }

  // track cursor — pageX/pageY because canvas is absolute-positioned at the
  // top of the page (scrolls away with the document)
  let mx = -1000, my = -1000, lx = mx, ly = my, hasLast = false;
  document.addEventListener('mousemove', (e) => {
    mx = e.pageX; my = e.pageY;
  }, { passive: true });

  // invisible smoke puffs — each one is a drifting "brush" that cuts the liquid
  // at its current position every frame it's alive. drifts + expands + fades.
  const puffs = [];
  const MAX_PUFFS = 220;

  function frame() {
    // 1) MASK heals slightly each frame — the liquid flowing back
    xctx.globalCompositeOperation = 'source-over';
    xctx.fillStyle = bgRGBA;
    xctx.fillRect(0, 0, W, H);

    // 2) emit new puffs along the cursor movement segment
    if (hasLast) {
      const dx = mx - lx, dy = my - ly;
      const dist = Math.hypot(dx, dy);
      if (dist > 1 && puffs.length < MAX_PUFFS) {
        const count = Math.min(6, Math.ceil(dist / 8));
        for (let i = 0; i < count; i++) {
          const t = (i + 1) / count;
          puffs.push({
            x: lx + dx * t + (Math.random() - 0.5) * 8,
            y: ly + dy * t + (Math.random() - 0.5) * 8,
            vx: dx * 0.04 + (Math.random() - 0.5) * 0.5,
            vy: dy * 0.04 + (Math.random() - 0.5) * 0.5 - 0.15,  // slight upward drift
            age: 0,
            maxAge: 90 + Math.random() * 70,
            size: 26 + Math.random() * 18,
          });
        }
      }
    }
    lx = mx; ly = my; hasLast = true;

    // 3) update each puff + cut the mask at its current position
    xctx.globalCompositeOperation = 'destination-out';
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.age++;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.size += 0.45;        // expands as it disperses
      if (p.age > p.maxAge) { puffs.splice(i, 1); continue; }

      const lifeT = p.age / p.maxAge;
      const a = (1 - lifeT) * 0.16;     // cut intensity fades with age
      const r = p.size;
      const g = xctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0,    `rgba(0,0,0,${a})`);
      g.addColorStop(0.55, `rgba(0,0,0,${a * 0.45})`);
      g.addColorStop(1,    'rgba(0,0,0,0)');
      xctx.fillStyle = g;
      xctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }

    // 4) COMPOSE — digits beneath, liquid mask on top
    mctx.clearRect(0, 0, W, H);
    mctx.drawImage(digits, 0, 0, W, H);
    mctx.drawImage(mask,   0, 0, W, H);

    requestAnimationFrame(frame);
  }
  frame();
})();


// ---------- sticky cd-bar offset — measure topbar's actual rendered bottom ----------
(() => {
  const topbar = document.querySelector('.top');
  if (!topbar) return;
  function setCdTop() {
    // topbar is sticky at top:24, its bottom (when stuck) = 24 + its rendered height
    const h = topbar.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--cd-top', (24 + h) + 'px');
  }
  setCdTop();
  window.addEventListener('resize', setCdTop);
  // re-measure once webfonts have loaded — they can shift the topbar height
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(setCdTop);
})();


// Pre-launch statistics remain pending until a verified on-chain feed is configured.

// ---------- scroll progress bar (top of viewport) ----------
(() => {
  const bar = document.getElementById('scroll-progress');
  if (!bar) return;
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
    bar.style.width = pct + '%';
  };
  const onScroll = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
})();


// ---------- scroll-to-top button (appears after hero) ----------
(() => {
  const btn = document.getElementById('scroll-top');
  if (!btn) return;
  const trigger = window.innerHeight * 0.6;
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const shown = window.scrollY > trigger;
    btn.classList.toggle('is-visible', shown);
  };
  window.addEventListener('scroll', () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }, { passive: true });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  update();
})();


// ---------- stats strip count-up on entrance ----------
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  const strip = document.querySelector('.stats-strip');
  if (!strip) return;

  // Target cells: HOLDERS, VOL_24H, TAX_POOL, MAX_SUPPLY, BUY_TAX, SELL_TAX
  // Strategy: parse the current text, count up from 0 (or low value) to current
  const targets = strip.querySelectorAll('.cell-value');

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const animateNumber = (el, finalText) => {
    // detect prefix/suffix and number content
    const m = finalText.match(/^([^\d\-]*)([\-\d.,]+)(.*)$/);
    if (!m) return;
    const prefix = m[1];
    const numStr = m[2].replace(/,/g, '');
    const suffix = m[3];
    const finalNum = parseFloat(numStr);
    if (!isFinite(finalNum)) return;
    const hasDecimal = numStr.includes('.');
    const decimals = hasDecimal ? (numStr.split('.')[1] || '').length : 0;

    const duration = 1300;
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOut(t);
      const current = finalNum * eased;
      const fmt = decimals > 0
        ? current.toFixed(decimals)
        : Math.round(current).toLocaleString('en-US');
      el.textContent = prefix + fmt + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = finalText;
    };
    el.textContent = prefix + (decimals > 0 ? '0.' + '0'.repeat(decimals) : '0') + suffix;
    requestAnimationFrame(tick);
  };

  // Skip cells whose value is just "—" (no number to animate to) or a range like "5-20%"
  const shouldSkip = (text) => {
    if (text.includes('—')) return true;
    if (/^\d+-\d+%$/.test(text)) return true; // SELL_TAX is "5–20%"
    return false;
  };

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      targets.forEach((el) => {
        const finalText = el.textContent.trim();
        if (shouldSkip(finalText)) return;
        animateNumber(el, finalText);
      });
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.4 });
  io.observe(strip);
})();


// ---------- hover glitch on section titles ----------
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const randCh = () => SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];

  const scramble = (el) => {
    if (el.dataset.scrambling === '1') return;
    el.dataset.scrambling = '1';

    // capture original text per text node so we don't lose .hl spans
    const nodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.textContent.length === 0) continue;
      nodes.push({ node: n, original: n.textContent });
    }
    if (!nodes.length) { el.dataset.scrambling = '0'; return; }

    const totalLen = nodes.reduce((s, t) => s + t.original.length, 0);
    const FRAMES = 66;        // ~1.1s total
    const REVEAL_FRAMES = 56; // ~0.93s reveal, ~0.17s hold
    let frame = 0;

    const tick = () => {
      const charsRevealed = Math.floor((frame / REVEAL_FRAMES) * totalLen);
      let cursor = 0;
      nodes.forEach((t) => {
        let out = '';
        for (let i = 0; i < t.original.length; i++) {
          const ch = t.original[i];
          const idx = cursor + i;
          if (ch === ' ' || ch === '\n' || ch === '\t') { out += ch; continue; }
          if (idx < charsRevealed) out += ch;
          else out += randCh();
        }
        t.node.textContent = out;
        cursor += t.original.length;
      });
      frame++;
      if (frame <= FRAMES) requestAnimationFrame(tick);
      else {
        nodes.forEach((t) => (t.node.textContent = t.original));
        el.dataset.scrambling = '0';
      }
    };
    requestAnimationFrame(tick);
  };

  document.querySelectorAll('.section-title').forEach((el) => {
    el.addEventListener('mouseenter', () => scramble(el));
  });
})();


// ---------- scroll-spy: active nav follows the section in view ----------
(() => {
  const links = document.querySelectorAll('.nav-item');
  if (!links.length) return;
  if (!('IntersectionObserver' in window)) return;

  const map = new Map();
  links.forEach((l) => {
    const href = l.getAttribute('href');
    if (href && href.length > 1 && href.startsWith('#')) {
      const target = document.getElementById(href.slice(1));
      if (target) map.set(target, l);
    }
  });
  if (!map.size) return;

  const setActive = (link) => {
    links.forEach((l) => l.classList.remove('is-active'));
    if (link) link.classList.add('is-active');
  };

  const io = new IntersectionObserver((entries) => {
    // pick the entry currently intersecting the active band
    const visible = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) {
      setActive(map.get(visible[0].target));
    }
  }, {
    // active band: 35-55% from top of viewport
    rootMargin: '-35% 0px -45% 0px',
    threshold: 0
  });

  map.forEach((_link, target) => io.observe(target));
})();

// ---------- next-drop countdown (sysbar + rewards banner) ----------
(() => {
  const banner = document.getElementById('cd-timer');
  const stripTimer = document.getElementById('strip-next-drop');

  const fmt = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  const tick = () => {
    const now = new Date();
    const utcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
    const dropInterval = 15 * 60;             // every 1h
    const remaining = dropInterval - (utcSec % dropInterval);
    const txt = fmt(remaining);
    if (banner)     banner.textContent = txt;
    if (stripTimer) stripTimer.textContent = txt;
  };
  tick();
  setInterval(tick, 1000);
})();

// Pure economic engine is shared with the documentation and arithmetic checks.
(() => {
  const byId = id => document.getElementById(id);
  const holdings = byId('calc-holdings'), pills = byId('calc-hold');
  if (!holdings || !pills) return;
  let cycle = '24h';
  const fmt = n => n.toLocaleString('en-US',{maximumFractionDigits:6}) + ' BNB';
  const set = (id, value) => { const e=byId(id); if(e) e.textContent=value; };
  const recalc = () => {
    const p = PIEconomics.calculate({
      holdings:holdings.value,
      days:pills.querySelector('.is-on')?.dataset.days || 0,
      volume:byId('calc-vol').value,
      buyFraction:byId('calc-buys').value/100,
      averageSellBps:byId('calc-average-sell').value*100,
      otherWeight:byId('calc-other-weight').value,
      conversionLoss:byId('calc-conversion').value/100
    });
    const divisor = cycle === '15m' ? 96 : 1;
    set('out-time',p.days+'d'); set('out-mult','×'+p.weight.toFixed(1));
    set('out-selltax',(p.sellBps/100).toFixed(2)+'%');
    set('out-share',(p.share*100).toFixed(4)+'%');
    set('out-pool-label',cycle==='15m'?'HOLDER_POOL / ROUND':'HOLDER_POOL / DAY');
    set('out-pay-label',cycle==='15m'?'YOUR_SHARE / ROUND':'YOUR_SHARE / DAY');
    set('out-pool',fmt(p.holderPool/divisor)); set('out-pay',fmt(p.payout/divisor));
    set('out-weekly',fmt(p.buyback)); set('out-monthly',fmt(p.liquidity));
    set('out-year',fmt(p.operations));
  };
  for (const group of [pills,byId('calc-cycle')]) group.addEventListener('click',e=>{
    const button=e.target.closest('button'); if(!button) return;
    group.querySelectorAll('button').forEach(b=>{b.classList.remove('is-on');b.setAttribute('aria-pressed','false');});
    button.classList.add('is-on');button.setAttribute('aria-pressed','true');
    if(group.id==='calc-cycle') cycle=button.dataset.cycle;
    recalc();
  });
  for (const id of ['calc-holdings','calc-vol','calc-buys','calc-average-sell','calc-other-weight','calc-conversion'])
    byId(id).addEventListener('input',recalc);
  recalc();
})();


// ---------- scroll-in entrance for all chrome cards ----------
//   adds .is-in when the element scrolls into view, triggering the
//   fade-up CSS transition AND any inner SVG animations on .mech-card
(() => {
  const cards = document.querySelectorAll(
    '.mech-card, .how-step, .calc-card, .step-card, .disc-card, .rm-item, .faq-item'
  );
  if (!cards.length) return;
  if (!('IntersectionObserver' in window)) {
    cards.forEach((c) => c.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
  cards.forEach((c) => io.observe(c));
})();



// ---------- console easter egg ----------
(() => {
  const art = `
%c
  ╔══════════════════════════════════════════╗
       ▄▄▄▄    ▀█▀
       █  █     █     PASSIVE_INCOME · π
       █▄▄█     █     time-weighted redistribution
       █  █     █
                      ░ 5% buy · 10→1% sell · 70/15/10/5 allocation
                      ░ holding weight = 0 / 1 / 1.5 / 2
                      ░ sell tax follows each acquisition; floor 1%
                      ░ patience > timing
  ╚══════════════════════════════════════════╝

  // SYS · BNB · REVIEW · v0.1.0
  // looking at the source? hi.

`;
  const style = 'color:#c8ff3a;font-family:monospace;font-size:12px;line-height:1.4;text-shadow:0 0 4px rgba(200,255,58,0.5);';
  try { console.log(art, style); } catch (e) {}
})();


// ---------- copy buttons ----------
document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const value = btn.getAttribute('data-copy');
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(value);
      btn.textContent = 'COPIED';
      setTimeout(() => (btn.textContent = original), 1400);
    } catch {
      btn.textContent = 'ERR';
      setTimeout(() => (btn.textContent = original), 1200);
    }
  });
});

// ---------- live status-bar clock ----------
(() => {
  const el = document.getElementById('sb-clock');
  if (!el) return;
  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const tick = () => {
    const d = new Date();
    const day   = days[d.getDay()];
    const date  = String(d.getDate()).padStart(2, '0');
    const month = months[d.getMonth()];
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    el.textContent = `${day} ${date} ${month} · ${h}:${m}:${s}`;
  };
  tick();
  setInterval(tick, 1000);
})();

// ---------- intro glitch on hero title (during TV intro) ----------
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const title = document.querySelector('.hero-title');
  if (!title) return;

  // uppercase letters only — uniform width, no layout jitter
  const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const randCh = () => SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];

  // lock title dimensions — height fixed, no wrap, clip overflow.
  // worst-case scrambled letters can be wider than original; without this the
  // title can wrap to a second line for a frame and push the page below.
  const originalHeight = title.offsetHeight;
  title.style.height = originalHeight + 'px';
  title.style.whiteSpace = 'nowrap';
  title.style.overflow = 'hidden';

  // lock hl block widths so surrounding text can't shift around them
  const hls = Array.from(title.querySelectorAll('.hl')).map((b) => {
    const w = b.offsetWidth;
    b.style.minWidth = w + 'px';
    b.style.textAlign = 'center';
    return b;
  });

  // collect every text node inside the title
  const nodes = [];
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (n.textContent.length === 0) continue;
    nodes.push({ node: n, original: n.textContent });
  }
  if (!nodes.length) {
    hls.forEach((b) => { b.style.minWidth = ''; b.style.textAlign = ''; });
    title.style.height = ''; title.style.whiteSpace = ''; title.style.overflow = '';
    return;
  }

  // pre-scramble immediately so first paint shows scrambled text
  nodes.forEach((t) => {
    let out = '';
    for (let i = 0; i < t.original.length; i++) {
      const ch = t.original[i];
      out += (ch === ' ' || ch === '\n' || ch === '\t') ? ch : randCh();
    }
    t.node.textContent = out;
  });

  const totalLen = nodes.reduce((s, t) => s + t.original.length, 0);
  const PRE_REVEAL_FRAMES = 65;  // ~1.08s of cycling, no chars reveal yet
  const REVEAL_FRAMES     = 90;  // ~1.5s reveal phase
  const HOLD_FRAMES       = 12;  // ~0.2s settled hold
  const FRAMES = PRE_REVEAL_FRAMES + REVEAL_FRAMES + HOLD_FRAMES;

  let frame = 0;
  const tick = () => {
    let charsRevealed;
    if (frame < PRE_REVEAL_FRAMES) {
      charsRevealed = 0;                                    // all glitch
    } else if (frame < PRE_REVEAL_FRAMES + REVEAL_FRAMES) {
      const rf = frame - PRE_REVEAL_FRAMES;
      charsRevealed = Math.floor((rf / REVEAL_FRAMES) * totalLen);
    } else {
      charsRevealed = totalLen;                             // all settled
    }

    let cursor = 0;
    nodes.forEach((t) => {
      let out = '';
      for (let i = 0; i < t.original.length; i++) {
        const ch = t.original[i];
        const idx = cursor + i;
        if (ch === ' ' || ch === '\n' || ch === '\t') {
          out += ch;
        } else if (idx < charsRevealed) {
          out += ch;
        } else {
          out += randCh();
        }
      }
      t.node.textContent = out;
      cursor += t.original.length;
    });
    frame++;
    if (frame <= FRAMES) {
      requestAnimationFrame(tick);
    } else {
      // settle text — keep dimension locks in place to avoid sub-pixel jump
      nodes.forEach((t) => (t.node.textContent = t.original));
    }
  };

  // start immediately so chars are already cycling at first paint —
  // the pre-reveal phase keeps everything fully scrambled until ~1.08s,
  // which is past TV intro completion (~0.95s)
  requestAnimationFrame(tick);
})();


// ---------- custom cursor + lock-on ----------
(() => {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const c = document.querySelector('.cursor');
  if (!c) return;
  c.classList.add('is-out');

  const lockon = document.getElementById('lockon');

  // collect interactive targets, refresh on resize
  let targets = [];
  const refreshTargets = () => {
    targets = Array.from(document.querySelectorAll('a, button')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  };
  refreshTargets();
  window.addEventListener('resize', refreshTargets);

  const RANGE = 22; // px — much closer than before

  // keep brackets in sync if the locked element resizes (e.g. COPY → COPIED)
  let lockedTarget = null;
  const updateLockOn = (el) => {
    if (!el || !lockon) return;
    const r = el.getBoundingClientRect();
    lockon.style.transform = `translate(${r.left}px, ${r.top}px)`;
    lockon.style.width  = r.width  + 'px';
    lockon.style.height = r.height + 'px';
  };
  const ro = ('ResizeObserver' in window) ? new ResizeObserver(() => {
    updateLockOn(lockedTarget);
  }) : null;

  let pendingEvent = null;
  let rafScheduled = false;

  const handle = (e) => {
    // cursor follow
    c.classList.remove('is-out');
    c.style.transform = `translate(${e.clientX - 13}px, ${e.clientY - 13}px)`;

    // lock-on detection
    if (!lockon) return;
    let nearest = null;
    let nearestDist = RANGE;
    for (const t of targets) {
      const r = t.getBoundingClientRect();
      const dx = Math.max(0, Math.max(r.left - e.clientX, e.clientX - r.right));
      const dy = Math.max(0, Math.max(r.top  - e.clientY, e.clientY - r.bottom));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearest = t;
        nearestDist = dist;
      }
    }
    if (nearest) {
      if (nearest !== lockedTarget) {
        if (ro && lockedTarget) ro.unobserve(lockedTarget);
        lockedTarget = nearest;
        if (ro) ro.observe(lockedTarget);
      }
      updateLockOn(nearest);
      lockon.classList.add('is-on');
    } else {
      if (ro && lockedTarget) ro.unobserve(lockedTarget);
      lockedTarget = null;
      lockon.classList.remove('is-on');
    }
  };

  document.addEventListener('mousemove', (e) => {
    pendingEvent = e;
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      if (pendingEvent) handle(pendingEvent);
    });
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    c.classList.add('is-out');
    if (lockon) lockon.classList.remove('is-on');
  });
  document.addEventListener('mouseenter', () => c.classList.remove('is-out'));
})();


// ---------- chrome cards: shared WebGL generative sweep ----------
// Single offscreen WebGL context renders the sweep shader; per-card 2D canvas
// overlays receive it via drawImage. Each card has a random phase offset and
// regenerates sweep params every cycle, so no two cards ever sync.
(function chromeSweep(){
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SELECTOR = '.mech-card, .calc-card, .stats, .step-card, .disc-card, .how-step, .contract';
  const els = Array.from(document.querySelectorAll(SELECTOR));
  if (!els.length) return;

  // shared WebGL canvas — renders one card at a time, copied out before the next render
  const shared = document.createElement('canvas');
  shared.width = 768; shared.height = 512;
  const gl = shared.getContext('webgl', { antialias: true, premultipliedAlpha: false })
          || shared.getContext('experimental-webgl');
  if (!gl) return;

  const VS = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  const FS = `
    precision mediump float;
    varying vec2 v_uv;
    uniform float u_aspect;
    uniform float u_sweep;
    uniform float u_active;
    uniform float u_angle;
    uniform float u_widthCore;
    uniform float u_widthHalo;
    uniform float u_intensity;
    uniform float u_seed;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p + 19.19);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i),               hash(i + vec2(1.0,0.0)), u.x),
                 mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
    }

    void main() {
      vec2 uv = v_uv;
      vec2 p  = vec2(uv.x * u_aspect, uv.y);

      vec2 dir = vec2(cos(u_angle), sin(u_angle));
      float proj = dot(p, dir);
      float maxProj = abs(u_aspect * cos(u_angle)) + abs(sin(u_angle));
      float t = proj / maxProj;
      float d = t - u_sweep;

      // RAZOR-NARROW pure-white core — only a few pixels wide where it plateaus
      float coreW = 0.006;
      float core  = exp(-(d * d) / (coreW * coreW)) * 1.3;

      // STACKED bloom layers — three super-wide gaussians at different scales
      // form a long, self-similar falloff with no visible edge. Each is wider
      // than the canvas so we only ever see the central rising slope.
      float bw1 = 0.30;
      float bw2 = 0.65;
      float bw3 = 1.20;
      float bloom = exp(-(d * d) / (bw1 * bw1)) * 0.30
                  + exp(-(d * d) / (bw2 * bw2)) * 0.22
                  + exp(-(d * d) / (bw3 * bw3)) * 0.14;

      // soft per-cycle randomized flanking glints (character without sharpness)
      float off1 = (hash(vec2(u_seed, 1.7)) - 0.5) * 0.18;
      float off2 = (hash(vec2(u_seed, 3.1)) - 0.5) * 0.22;
      float amp1 = 0.14 + hash(vec2(u_seed, 5.3)) * 0.20;
      float amp2 = 0.10 + hash(vec2(u_seed, 7.9)) * 0.16;
      float dA = d - off1;
      float dB = d - off2;
      float wA = max(0.18, u_widthHalo * 2.0);
      float wB = max(0.24, u_widthHalo * 2.5);
      float secA = exp(-(dA * dA) / (wA * wA)) * amp1;
      float secB = exp(-(dB * dB) / (wB * wB)) * amp2;

      float sheen = (core + bloom + secA + secB) * u_active * u_intensity;

      // gentle anisotropic grain modulation — hint of metal texture
      float sg = vnoise(vec2(p.x * 320.0 + u_seed * 100.0, p.y * 5.0));
      sheen *= mix(0.94, 1.06, sg);

      // output luminance only — alpha=1, screen-blended on the page CSS-side
      gl_FragColor = vec4(vec3(sheen), 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('chrome shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, VS);
  const fs = compile(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('chrome link:', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uAspect = gl.getUniformLocation(prog, 'u_aspect');
  const uSweep  = gl.getUniformLocation(prog, 'u_sweep');
  const uActive = gl.getUniformLocation(prog, 'u_active');
  const uAngle  = gl.getUniformLocation(prog, 'u_angle');
  const uWC     = gl.getUniformLocation(prog, 'u_widthCore');
  const uWH     = gl.getUniformLocation(prog, 'u_widthHalo');
  const uInt    = gl.getUniformLocation(prog, 'u_intensity');
  const uSeed   = gl.getUniformLocation(prog, 'u_seed');

  gl.viewport(0, 0, shared.width, shared.height);

  const SWEEP_DUR     = 3.2;
  const REST_DUR      = 1.8;
  const CASCADE_RANGE = 2.4;   // seconds for the wave to traverse leftmost→rightmost
  const PERIOD        = SWEEP_DUR + REST_DUR + CASCADE_RANGE;

  function easeInOutSine(x) { return -(Math.cos(Math.PI * x) - 1) / 2; }

  // Global per-cycle params — all cards share the same angle/intensity/seed
  // in a given cycle so the cascade reads as ONE coherent light source moving
  // across the page. Random per cycle so no two waves are identical.
  const params = { angle: 0, widthCore: 0.004, widthHalo: 0.07, intensity: 1.0, seed: 0 };
  let globalCycleIdx = -2;

  function regen(p) {
    // angle restricted to mostly-horizontal so the within-card sweep direction
    // matches the L→R cascade (cos > 0 across the whole range)
    p.angle     = (-25 + Math.random() * 50) * Math.PI / 180;
    p.widthCore = 0.0025 + Math.random() * 0.0055;
    p.widthHalo = 0.045  + Math.random() * 0.075;
    p.intensity = 1.10   + Math.random() * 0.60;
    p.seed      = Math.random() * 1000;
  }

  const cards = els.map((el) => {
    el.classList.add('has-chrome');
    const c = document.createElement('canvas');
    c.className = 'chrome-canvas';
    c.setAttribute('aria-hidden', 'true');
    el.insertBefore(c, el.firstChild);
    return {
      el, canvas: c, ctx: c.getContext('2d'),
      visible: false,
      cascadeOffset: 0,   // recomputed from card X-position
    };
  });

  // Map each card's horizontal page position to a phase offset in seconds.
  // Leftmost = 0 (fires first), rightmost = CASCADE_RANGE (fires last).
  function computeCascadeOffsets() {
    if (!cards.length) return;
    const rects = cards.map(c => c.el.getBoundingClientRect());
    let minX =  Infinity;
    let maxX = -Infinity;
    for (const r of rects) {
      if (r.left  < minX) minX = r.left;
      if (r.right > maxX) maxX = r.right;
    }
    const span = Math.max(1, maxX - minX);
    for (let i = 0; i < cards.length; i++) {
      const r = rects[i];
      const cx = (r.left + r.right) * 0.5;
      cards[i].cascadeOffset = ((cx - minX) / span) * CASCADE_RANGE;
    }
  }

  // run after layout has settled, then on every resize
  requestAnimationFrame(computeCascadeOffsets);
  window.addEventListener('resize', computeCascadeOffsets);

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const card = cards.find(c => c.el === e.target);
      if (card) card.visible = e.isIntersecting;
    });
  }, { rootMargin: '120px' });
  cards.forEach(c => io.observe(c.el));

  const start = performance.now();
  function frame() {
    if (document.visibilityState !== 'hidden') {
      const time = (performance.now() - start) / 1000;

      // global cycle — one regen per cycle, shared by all cards in the wave
      const cycleIdxNow = Math.floor(time / PERIOD);
      if (cycleIdxNow !== globalCycleIdx) {
        globalCycleIdx = cycleIdxNow;
        regen(params);
      }
      const cycleStart = globalCycleIdx * PERIOD;

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (!card.visible) continue;

        // each card's phase is offset by its cascade delay = wave passes L→R
        const cardT = time - cycleStart - card.cascadeOffset;

        let sweepPos, active;
        const FADE = 0.35;
        if (cardT >= 0 && cardT < SWEEP_DUR) {
          sweepPos = -0.6 + easeInOutSine(cardT / SWEEP_DUR) * 2.2;
          if (cardT < FADE)                    active = cardT / FADE;
          else if (cardT > SWEEP_DUR - FADE)   active = (SWEEP_DUR - cardT) / FADE;
          else                                  active = 1.0;
        } else {
          sweepPos = 1.8;
          active = 0.0;
        }

        // size overlay to the card (DPR-aware)
        const rect = card.el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = Math.max(1, Math.floor(rect.width  * dpr));
        const h = Math.max(1, Math.floor(rect.height * dpr));
        if (card.canvas.width !== w || card.canvas.height !== h) {
          card.canvas.width  = w;
          card.canvas.height = h;
        }

        // render shared with the global cycle's params
        gl.uniform1f(uAspect, w / h);
        gl.uniform1f(uSweep,  sweepPos);
        gl.uniform1f(uActive, active);
        gl.uniform1f(uAngle,  params.angle);
        gl.uniform1f(uWC,     params.widthCore);
        gl.uniform1f(uWH,     params.widthHalo);
        gl.uniform1f(uInt,    params.intensity);
        gl.uniform1f(uSeed,   params.seed);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // copy shared output to this card's overlay (browser stretches to fit)
        card.ctx.drawImage(shared, 0, 0, w, h);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();


// ---------- π badge: animated white-noise overlay ----------
(function piNoise(){
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const piEl = document.querySelector('.pi-display');
  if (!piEl) return;

  const c = document.createElement('canvas');
  c.className = 'pi-noise-canvas';
  c.setAttribute('aria-hidden', 'true');
  c.width  = 320;
  c.height = 320;
  piEl.appendChild(c);

  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  const buf = img.data;

  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0 })
      .observe(c);
  }

  let last = 0;
  function loop(now) {
    if (visible && document.visibilityState !== 'hidden' && now - last > 33) {
      // fill with random luminance — true white noise
      for (let i = 0; i < buf.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        buf[i] = v; buf[i+1] = v; buf[i+2] = v; buf[i+3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      last = now;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

}; if(document.documentElement.classList.contains('is-unlocked')) start(); else window.addEventListener('pi:unlocked',start,{once:true}); })();
