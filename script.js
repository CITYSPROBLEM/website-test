/* splash screen — only shows once per session */
const splashReady = (function() {
  const splash = document.getElementById('splash');
  if (!splash) return Promise.resolve();
  if (sessionStorage.getItem('splashDismissed')) {
    splash.remove();
    return Promise.resolve();
  }
  document.documentElement.classList.add('splash-active');
  const splashLogo = splash.querySelector('.splash-logo');
  return new Promise(resolve => {
    splashLogo.addEventListener('click', function dismiss() {
      splashLogo.removeEventListener('click', dismiss);
      sessionStorage.setItem('splashDismissed', '1');
      splash.classList.add('dismissed');
      document.documentElement.classList.remove('splash-active');
      /* fade in topbar */
      const topbar = document.querySelector('.topbar');
      if (topbar) {
        topbar.style.transition = 'opacity .9s ease';
        topbar.style.opacity = '1';
      }
      splash.addEventListener('transitionend', () => splash.remove());
      resolve();
    });
  });
})();

/* cursor */
const cur  = document.getElementById('cur');
const ring = document.getElementById('cur-ring');
const isCoarsePointer = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const LINK_HOVER_SELECTOR = 'a, button, .topbar-logo, .player-progress, .player-vol-slider, .player-track-name, .glitch-wrap, .release-card, .featured-link';
const scheduleNonCritical = window.requestIdleCallback
  ? fn => window.requestIdleCallback(fn, { timeout: 1200 })
  : fn => setTimeout(fn, 220);
let mx = 0, my = 0, rx = 0, ry = 0;
if (!isCoarsePointer) {
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    cur.style.transform = `translate(${mx}px,${my}px)`;
  });
  document.addEventListener('mouseover', e => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest(LINK_HOVER_SELECTOR)) document.body.classList.add('link-hover');
  });
  document.addEventListener('mouseout', e => {
    if (!(e.target instanceof Element)) return;
    const from = e.target.closest(LINK_HOVER_SELECTOR);
    if (!from) return;
    const to = e.relatedTarget;
    if (to && to.closest && to.closest(LINK_HOVER_SELECTOR)) return;
    document.body.classList.remove('link-hover');
  });
}

/* topbar logo -> home route */
const topbarLogoEl = document.querySelector('.topbar-logo');
if (topbarLogoEl) {
  const goHome = () => { window.location.href = 'index.html'; };
  topbarLogoEl.setAttribute('role', 'link');
  topbarLogoEl.setAttribute('tabindex', '0');
  topbarLogoEl.addEventListener('click', goHome);
  topbarLogoEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goHome();
    }
  });
}

/* film grain — driven by draw loop, no extra timer */
const turbEl = document.querySelector('#noise feTurbulence');
let noiseSeed = 0, grainFrame = 0;

/* scramble */
const glyphSet      = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@%&<>?';
const glyphSetLower = 'abcdefghijklmnopqrstuvwxyz0123456789#@%&<>?';
/* match case of original char so lowercase text (e.g. bio) stays the same height */
function randGlyph(c) {
  const set = (c >= 'a' && c <= 'z') ? glyphSetLower : glyphSet;
  return set[Math.floor(Math.random() * set.length)];
}

function nonSpaceCharCount(text) {
  return text.replace(/ /g, '').length;
}

function bracketMask(text) {
  const mask = new Array(text.length).fill(false);
  const openToClose = { '(': ')', '[': ']', '{': '}', '<': '>' };
  const stack = [];
  const chars = text.split('');
  chars.forEach((c, i) => {
    if (openToClose[c]) {
      stack.push({ close: openToClose[c], idx: i });
      return;
    }
    if (!stack.length) return;
    const top = stack[stack.length - 1];
    if (c === top.close) {
      const open = stack.pop();
      for (let n = open.idx; n <= i; n++) mask[n] = true;
    }
  });
  return mask;
}

function scramblePlan(original, maxChars = Infinity) {
  const eligible = [];
  const bracketed = bracketMask(original);
  original.split('').forEach((c, i) => {
    if (c !== ' ' && !bracketed[i]) eligible.push(i);
  });

  if (!Number.isFinite(maxChars) || maxChars >= eligible.length) {
    const fullRanks = new Map(eligible.map((idx, rank) => [idx, rank]));
    return { count: eligible.length, ranks: fullRanks };
  }

  const limited = [];
  const step = eligible.length / Math.max(1, maxChars);
  for (let n = 0; n < maxChars; n++) {
    limited.push(eligible[Math.floor(n * step)]);
  }
  const uniqueLimited = [...new Set(limited)];
  return { count: uniqueLimited.length, ranks: new Map(uniqueLimited.map((idx, rank) => [idx, rank])) };
}

function accordionScrambleLimit(text) {
  const total = nonSpaceCharCount(text);
  return Math.min(total, Math.max(8, Math.min(16, Math.floor(total * 0.28))));
}

function fixedLen(text, len) {
  return text.length === len ? text : text.slice(0, len).padEnd(len, ' ');
}

function scrambleSnapshot(original) {
  return fixedLen(
    original.split('').map(c => (c === ' ' ? ' ' : randGlyph(c))).join(''),
    original.length
  );
}

function scrambleLoop(original, setText, stepMs = 50, maxChars = Infinity) {
  const plan = scramblePlan(original, maxChars);
  const originalLen = original.length;
  let rafId, last = 0;
  function frame(ts) {
    if (ts - last >= stepMs) {
      last = ts;
      setText(fixedLen(original.split('').map((c, i) =>
        c === ' ' || !plan.ranks.has(i) ? c : randGlyph(c)
      ).join(''), originalLen));
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}

function scrambleResolve(original, setText, steps = 16, stepMs = 50, onComplete, maxChars = Infinity) {
  const plan = scramblePlan(original, maxChars);
  const originalLen = original.length;
  let step = 0, last = 0, rafId;
  /* starts at stepMs (full speed), slows quadratically to ~2× at the last step */
  function stepDelay(s) { return stepMs * (1 + Math.pow(s / steps, 2)); }
  function frame(ts) {
    if (ts - last >= stepDelay(step)) {
      last = ts;
      const resolvedCount = Math.floor((step / steps) * plan.count);
      setText(fixedLen(original.split('').map((c, i) => {
        if (c === ' ') return ' ';
        if (!plan.ranks.has(i) || plan.ranks.get(i) < resolvedCount) return c;
        return randGlyph(c);
      }).join(''), originalLen));
      if (++step > steps) { setText(original); onComplete?.(); return; }
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}

/* settle timing scales with character count.
   stepMs stays at 25 ms (the original per-step speed, unchanged).
   steps = one per non-space character, so shorter text settles faster and
   longer text settles slower in exact proportion to their length.
   Reference: 16-char text → 16 steps × 25 ms = 400 ms (same as original default).
   Min 6 steps (very short symbols), no meaningful upper cap for typical text.
   To revert to fixed timing: delete this function and replace every
   ...settleParams(x) with  16, 25  in the scrambleResolve calls below. */
function settleParams(text) {
  const len = text.replace(/ /g, '').length;   /* non-space character count */
  return [Math.max(6, len), 25];               /* [steps, stepMs] */
}

/* resolve text that is already actively scrambling — call after stopping a
   scrambleLoop that ran during an entry animation (page load, panel slide-in, etc.).
   Same 25 ms/step speed as settleParams; capped at 20 steps so long paragraphs
   don't drag on appear.  Do NOT call this without a prior scrambleLoop running,
   or the text will start scrambled for one frame before resolving. */
/* scramble immediately, then begin settling early enough that the settle
   finishes at exactly targetMs from now — use for animations with a known duration */
function scrambleThenSettleAt(text, setText, targetMs, maxChars = Infinity) {
  const stepMs   = 25;
  const steps    = Math.max(4, Math.min(Math.floor(targetMs / stepMs), nonSpaceCharCount(text), Math.max(4, maxChars)));
  const startAt  = Math.max(0, targetMs - steps * stepMs);
  let cancelLoop = scrambleLoop(text, setText, 30, maxChars);
  let cancelSettle = null;
  const timer = setTimeout(() => {
    cancelLoop?.(); cancelLoop = null;
    cancelSettle = scrambleResolve(text, setText, steps, stepMs, null, maxChars);
  }, startAt);
  return function cancel() {
    clearTimeout(timer);
    cancelLoop?.(); cancelLoop = null;
    cancelSettle?.(); cancelSettle = null;
  };
}

function settleIn(text, setText, onComplete) {
  const steps = Math.max(6, Math.min(20, text.replace(/ /g, '').length));
  return scrambleResolve(text, setText, steps, 25, onComplete);
}

function hasBracketedText(text) {
  return /[\(\[\{][^)\]}]+[\)\]\}]/.test(text);
}

function lockBracketTextWidth(el, original) {
  if (!hasBracketedText(original)) return () => {};
  const prevDisplay = el.style.display;
  const prevWidth = el.style.width;
  const prevMinWidth = el.style.minWidth;
  const computedDisplay = window.getComputedStyle(el).display;
  if (computedDisplay === 'inline') el.style.display = 'inline-block';
  const widestSample = original.replace(/[^\s()[\]{}]/g, 'W');
  const prevText = el.textContent;
  el.textContent = widestSample;
  const lockedWidth = Math.ceil(el.getBoundingClientRect().width) + 2;
  el.textContent = prevText;
  el.style.width = `${lockedWidth}px`;
  el.style.minWidth = `${lockedWidth}px`;
  return () => {
    el.style.display = prevDisplay;
    el.style.width = prevWidth;
    el.style.minWidth = prevMinWidth;
  };
}

/* generic hover-scramble — applies to any static text element */
function addScrambleHover(el) {
  const orig = el.textContent;          /* capture once — never re-read during hover */
  let cancelScramble = null, cancelResolve = null;
  let unlockWidth = null;
  el.addEventListener('mouseenter', () => {
    document.body.classList.add('link-hover');
    cancelResolve?.(); cancelResolve = null;  /* stop any in-progress settle */
    unlockWidth?.(); unlockWidth = null;
    unlockWidth = lockBracketTextWidth(el, orig);
    cancelScramble?.();
    cancelScramble = scrambleLoop(orig, t => { el.textContent = t; }, 30);
  });
  el.addEventListener('mouseleave', () => {
    document.body.classList.remove('link-hover');
    cancelScramble?.(); cancelScramble = null;
    cancelResolve = scrambleResolve(orig, t => { el.textContent = t; }, ...settleParams(orig), () => {
      unlockWidth?.(); unlockWidth = null;
    });
  });
}

/* h1 scramble + chromatic aberration */
const h1El   = document.querySelector('h1');
const h1Orig = 'CITYSPROBLEM';
let cancelH1;
let h1FadeUpDone = !h1El;
let h1SettleFallbackTimer = null;
let h1SettleWatchdogTimer = null;

function h1ClearTimers() {
  if (h1SettleFallbackTimer) {
    clearTimeout(h1SettleFallbackTimer);
    h1SettleFallbackTimer = null;
  }
  if (h1SettleWatchdogTimer) {
    clearTimeout(h1SettleWatchdogTimer);
    h1SettleWatchdogTimer = null;
  }
}

function applyH1Centering() {
  if (!h1El) return;
  const overflow = h1El.scrollWidth - h1El.clientWidth;
  h1El.style.transform = overflow > 0 ? `translateX(${-(overflow / 2)}px)` : '';
}

function h1FinalizeImmediate() {
  if (h1FadeUpDone) return;
  h1FadeUpDone = true;
  h1ClearTimers();
  cancelH1?.(); cancelH1 = null;
  h1El.style.opacity = '1';
  h1El.textContent = h1Orig;
  applyH1Centering();
}

function h1Settle() {
  if (h1FadeUpDone) return;
  if (isCoarsePointer) {
    h1FinalizeImmediate();
    return;
  }
  h1FadeUpDone = true;
  h1ClearTimers();
  cancelH1?.(); cancelH1 = null;
  h1El.style.opacity = '1';
  cancelH1 = settleIn(h1Orig, t => { h1El.textContent = t; applyH1Centering(); });
}

if (h1El) {
splashReady.then(() => {
if (isCoarsePointer) {
  /* deterministic mobile intro: short timed scramble burst, then hard settle */
  let burstTicks = 0;
  const burst = setInterval(() => {
    if (h1FadeUpDone) { clearInterval(burst); return; }
    h1El.textContent = scrambleSnapshot(h1Orig);
    applyH1Centering();
    if (++burstTicks >= 14) clearInterval(burst);
  }, 45);
  h1SettleFallbackTimer = setTimeout(() => {
    clearInterval(burst);
    h1FinalizeImmediate();
  }, 760);
  h1SettleWatchdogTimer = setTimeout(() => {
    clearInterval(burst);
    h1FinalizeImmediate();
  }, 1600);
  window.addEventListener('pageshow', h1FinalizeImmediate, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) h1FinalizeImmediate();
  }, { once: true });
} else {
  setTimeout(() => {
    if (h1FadeUpDone) return;
    cancelH1 = scrambleLoop(h1Orig, t => { h1El.textContent = t; });
  }, 200);
  h1El.addEventListener('animationend', e => {
    if (e.animationName === 'fadeUp') h1Settle();
    if (e.animationName === 'glowFadeIn') {
      h1El.style.opacity = '1';
      h1El.style.animation = 'glowPulse 4s ease-in-out infinite';
    }
  });

  /* fallback: if page loaded in a background tab, fadeUp is suspended and
     animationend never fires — settle once the tab becomes visible */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) h1Settle();
  }, { once: true });
  window.addEventListener('pageshow', h1Settle, { once: true });
  h1SettleFallbackTimer = setTimeout(h1Settle, 1600);
  h1SettleWatchdogTimer = setTimeout(h1FinalizeImmediate, 2600);
}
});

if (!isCoarsePointer) {
  h1El.addEventListener('mouseenter', () => {
    h1El.style.width = h1El.offsetWidth + 'px';
    h1El.style.height = h1El.offsetHeight + 'px';
    h1El.style.opacity = '1';
    h1El.style.animation = 'glowPulse 4s ease-in-out infinite';
    cancelH1?.();
    h1El.classList.remove('chroma');
    void h1El.offsetWidth;
    h1El.classList.add('chroma');
    setTimeout(() => h1El.classList.remove('chroma'), 500);
    cancelH1 = scrambleLoop(h1Orig, t => { h1El.textContent = t; applyH1Centering(); });
  });
  h1El.addEventListener('mouseleave', () => {
    cancelH1?.();
    cancelH1 = scrambleResolve(h1Orig, t => { h1El.textContent = t; applyH1Centering(); }, ...settleParams(h1Orig), () => {
      h1El.style.transform = '';
      h1El.style.width = '';
      h1El.style.height = '';
    });
  });
}
} /* end if (h1El) */

/* ── mouse-reactive aurora ──────────────────────── */
{
  const auroraEl = document.querySelector('.aurora');
  const heroEl = document.querySelector('.hero');
  if (auroraEl && heroEl && !isCoarsePointer) {
    let ax = 0, ay = 0, targetAx = 0, targetAy = 0;
    let auroraRafId = 0;
    let auroraRunning = false;
    let heroVisible = true;

    document.addEventListener('mousemove', e => {
      if (!auroraRunning) return;
      const rect = heroEl.getBoundingClientRect();
      /* normalise cursor to -1…+1 relative to hero centre */
      targetAx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      targetAy = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
    });

    function auroraFrame() {
      if (!auroraRunning) return;
      ax += (targetAx - ax) * 0.06;
      ay += (targetAy - ay) * 0.06;
      const moveX = ax * 120;          /* max px offset */
      const moveY = ay * 60;
      const scale = 1 + Math.abs(ax) * 0.15;
      const opacity = 0.6 + Math.abs(ax * ay) * 0.4;
      auroraEl.style.transform = `translate(${moveX}px, ${moveY}px) scale(${scale})`;
      auroraEl.style.opacity = opacity;
      auroraRafId = requestAnimationFrame(auroraFrame);
    }

    function startAurora() {
      if (auroraRunning) return;
      auroraRunning = true;
      auroraRafId = requestAnimationFrame(auroraFrame);
    }

    function stopAurora() {
      if (!auroraRunning) return;
      auroraRunning = false;
      cancelAnimationFrame(auroraRafId);
      auroraRafId = 0;
    }

    function syncAuroraState() {
      if (heroVisible && !document.hidden) startAurora();
      else stopAurora();
    }

    const heroObserver = new IntersectionObserver(entries => {
      heroVisible = entries.some(entry => entry.isIntersecting);
      syncAuroraState();
    }, { threshold: 0.05 });
    heroObserver.observe(heroEl);

    document.addEventListener('visibilitychange', syncAuroraState);
    window.addEventListener('pageshow', syncAuroraState, { passive: true });
    window.addEventListener('pagehide', stopAurora, { passive: true });
    syncAuroraState();
  }
}

/* scroll arrow positioning */
const playerEl      = document.getElementById('player');
const scrollArrowEl = document.querySelector('.scroll-arrow');
const topbarEl = document.querySelector('.topbar');
const mainEl = document.querySelector('main');
const pastShowsSection = document.getElementById('pastShowsSection');
let arrowBaseTop = null;
function positionScrollArrow() {
  if (!h1El || !scrollArrowEl) return;
  const h1Bottom  = h1El.getBoundingClientRect().bottom + window.scrollY;
  const playerTop = playerEl.getBoundingClientRect().top + window.scrollY;
  arrowBaseTop = (h1Bottom + playerTop) / 2 - 7;
  scrollArrowEl.style.top = (arrowBaseTop - window.scrollY) + 'px';
}
if (h1El && scrollArrowEl) {
  document.fonts.ready.then(positionScrollArrow);
  window.addEventListener('resize', positionScrollArrow);
  h1El.addEventListener('animationend', positionScrollArrow);
  window.addEventListener('load', positionScrollArrow);
}

/* ── audio player — tracks sourced from SONGS/tracks.js ─────────── */
const audio       = document.getElementById('audio');
const playerTrack       = document.getElementById('playerTrack');
const playerTimeCurrent = document.getElementById('playerTimeCurrent');
const playerTimeTotal   = document.getElementById('playerTimeTotal');
const playerFill  = document.getElementById('playerFill');
const playerProg  = document.getElementById('playerProgress');
const btnPlay     = document.getElementById('btnPlay');
const btnPrev     = document.getElementById('btnPrev');
const btnNext     = document.getElementById('btnNext');
const btnShuffle  = document.getElementById('btnShuffle');
const playerCounter = document.getElementById('playerCounter');

const tracks = (window.TRACKS || []).map(t => ({
  title: t.title.toUpperCase(),
  url: 'SONGS/' + t.file,
}));
let trackIdx = 0;
let shuffleOn = false;

function fmt(t) {
  return `${Math.floor(t/60)}:${Math.floor(t%60).toString().padStart(2,'0')}`;
}

function updateMarquee() {
  const clip = playerTrack.parentElement;
  const overflow = playerTrack.scrollWidth - clip.clientWidth;
  if (overflow > 2) {
    playerTrack.style.setProperty('--scroll-dist', `-${overflow}px`);
    playerTrack.classList.add('scrolling');
  } else {
    playerTrack.classList.remove('scrolling');
  }
}

function loadTrack(idx) {
  if (!tracks.length) return;
  trackIdx = ((idx % tracks.length) + tracks.length) % tracks.length;
  const title = tracks[trackIdx].title;
  playerTrack.classList.remove('scrolling');
  scrambleResolve(title, t => { playerTrack.textContent = t; }, 16, 25, () => {
    updateMarquee();
  });
  playerCounter.textContent = `${trackIdx + 1} / ${tracks.length}`;
  if (!deferAudioLoad) {
    audio.src = tracks[trackIdx].url;
  }
  if (!audio.paused) audio.play();
}

function setPlaying(v) {
  btnPlay.textContent = v ? '' : '▶\uFE0E';
  btnPlay.classList.toggle('playing', v);
}

let deferAudioLoad = true;
if (tracks.length) loadTrack(0);
else playerTrack.textContent = '—';

btnPlay.addEventListener('click', () => {
  if (!tracks.length) return;
  if (deferAudioLoad) {
    audio.src = tracks[trackIdx].url;
    deferAudioLoad = false;
  }
  audio.paused ? audio.play() : audio.pause();
});
btnPrev.addEventListener('click', () => loadTrack(trackIdx - 1));
btnNext.addEventListener('click', () => {
  if (shuffleOn) {
    let r; do { r = Math.floor(Math.random() * tracks.length); } while (r === trackIdx && tracks.length > 1);
    loadTrack(r);
  } else {
    loadTrack(trackIdx + 1);
  }
});
btnShuffle.addEventListener('click', () => {
  shuffleOn = !shuffleOn;
  btnShuffle.classList.toggle('active', shuffleOn);
});
audio.addEventListener('play',  () => setPlaying(true));
audio.addEventListener('pause', () => setPlaying(false));
audio.addEventListener('ended', () => {
  if (shuffleOn) {
    let r; do { r = Math.floor(Math.random() * tracks.length); } while (r === trackIdx && tracks.length > 1);
    loadTrack(r);
    audio.play();
  } else if (trackIdx < tracks.length - 1) {
    loadTrack(trackIdx + 1);
  } else {
    setPlaying(false);
  }
});
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  playerFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
  playerTimeCurrent.textContent = fmt(audio.currentTime);
  playerTimeTotal.textContent   = fmt(audio.duration);
});
function seekTo(clientX) {
  if (!audio.duration) return;
  const r = playerProg.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  audio.currentTime = pct * audio.duration;
  playerFill.style.width = (pct * 100) + '%';
}
let isSeeking = false;
let wasPlaying = false;
playerProg.addEventListener('mousedown', e => {
  isSeeking = true;
  wasPlaying = !audio.paused;
  audio.pause();
  seekTo(e.clientX);
});
playerProg.addEventListener('touchstart', e => {
  isSeeking = true;
  wasPlaying = !audio.paused;
  audio.pause();
  seekTo(e.touches[0].clientX);
}, { passive: true });
window.addEventListener('mousemove', e => { if (isSeeking) seekTo(e.clientX); });
window.addEventListener('touchmove', e => { if (isSeeking) { e.preventDefault(); seekTo(e.touches[0].clientX); } }, { passive: false });
window.addEventListener('mouseup',  () => { if (isSeeking) { isSeeking = false; if (wasPlaying) audio.play(); } });
window.addEventListener('touchend', () => { if (isSeeking) { isSeeking = false; if (wasPlaying) audio.play(); } });

/* volume slider */
const volSlider = document.getElementById('volSlider');
function updateVolTrack() {
  const pct = volSlider.value * 100;
  volSlider.style.background = `linear-gradient(90deg, var(--ice) ${pct}%, rgba(0,212,255,.15) ${pct}%)`;
}
volSlider.addEventListener('input', () => {
  audio.volume = volSlider.value;
  updateVolTrack();
});
updateVolTrack();

/* sync player width to h1 (or h1-equivalent on subpages) */
function syncPlayerWidth() {
  let w;
  if (window.innerWidth <= 768) {
    w = playerEl.offsetWidth;
  } else if (h1El) {
    w = h1El.offsetWidth;
  } else {
    /* subpages: approximate the h1 width using the same font metrics */
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-family:"Michroma",sans-serif;font-weight:900;font-size:clamp(1rem,5vw,4rem);letter-spacing:.04em;line-height:1;';
    probe.textContent = 'CITYSPROBLEM';
    document.body.appendChild(probe);
    w = probe.offsetWidth;
    probe.remove();
  }
  playerEl.style.setProperty('--player-content-w', w + 'px');
  document.documentElement.style.setProperty('--player-h', playerEl.offsetHeight + 'px');
  syncCenterScrollSpacer();
}
document.fonts.ready.then(syncPlayerWidth);
let resizePlayerTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizePlayerTimer);
  resizePlayerTimer = setTimeout(syncPlayerWidth, 100);
});

/* hover-scramble for player track name */
{
  let cancelTrackScramble = null, cancelTrackResolve = null;
  playerTrack.addEventListener('mouseenter', () => {
    const current = playerTrack.textContent;
    cancelTrackResolve?.(); cancelTrackResolve = null;
    cancelTrackScramble?.();
    cancelTrackScramble = scrambleLoop(current, t => { playerTrack.textContent = t; }, 30);
  });
  playerTrack.addEventListener('mouseleave', () => {
    const current = tracks.length ? tracks[trackIdx].title : '—';
    cancelTrackScramble?.(); cancelTrackScramble = null;
    cancelTrackResolve = scrambleResolve(current, t => { playerTrack.textContent = t; }, ...settleParams(current), () => {
      updateMarquee();
    });
  });
}

/* tap-to-play hint on mobile */
{
  const tapHint = document.getElementById('tapHint');
  const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (isTouchDevice && tracks.length) {
    function showTapHint() {
      const r = btnPlay.getBoundingClientRect();
      tapHint.style.left = (r.left + r.width / 2) + 'px';
      tapHint.style.top  = (r.top  + r.height / 2) + 'px';
      tapHint.classList.add('show');
    }
    setTimeout(showTapHint, 1200);
    audio.addEventListener('play', () => { tapHint.classList.remove('show'); }, { once: true });
  }
}

/* audio visualizer */
{
  const vizCanvas = document.getElementById('visualizer');
  const vizCtx = vizCanvas.getContext('2d');
  let analyser = null, dataArray = null, audioCtxStarted = false;

  function initAudioContext() {
    if (audioCtxStarted) return;
    audioCtxStarted = true;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
  }

  audio.addEventListener('play', initAudioContext, { once: true });

  function resizeViz() {
    const dpr = window.devicePixelRatio || 1;
    vizCanvas.width  = vizCanvas.clientWidth  * dpr;
    vizCanvas.height = vizCanvas.clientHeight * dpr;
    vizCtx.scale(dpr, dpr);
  }
  resizeViz();
  window.addEventListener('resize', resizeViz);

  function clearVisualizer() {
    const W = vizCanvas.clientWidth, H = vizCanvas.clientHeight;
    vizCtx.clearRect(0, 0, W, H);
  }

  function shouldDrawVisualizer() {
    return Boolean(analyser && !audio.paused && !document.hidden);
  }

  audio.addEventListener('pause', clearVisualizer);
  audio.addEventListener('ended', clearVisualizer);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearVisualizer();
  });

  window.shouldDrawVisualizer = shouldDrawVisualizer;
  window.drawVisualizer = function() {
    if (!shouldDrawVisualizer()) return;
    const W = vizCanvas.clientWidth, H = vizCanvas.clientHeight;
    vizCtx.clearRect(0, 0, W, H);
    analyser.getByteFrequencyData(dataArray);
    const bars = dataArray.length;
    const barW = W / bars;
    for (let i = 0; i < bars; i++) {
      const v = dataArray[i] / 255;
      const h = v * H;
      vizCtx.fillStyle = `rgba(0,212,255,${0.15 + v * 0.35})`;
      vizCtx.fillRect(i * barW, H - h, barW - 1, h);
    }
  };
}

/* scroll arrow follows h1 off screen as user scrolls */
if (scrollArrowEl) {
  window.addEventListener('scroll', () => {
    if (arrowBaseTop === null) return;
    const y = arrowBaseTop - window.scrollY;
    scrollArrowEl.style.top = y + 'px';
    scrollArrowEl.style.opacity = y < -20 ? '0' : '';
  }, { passive: true });
}

let topbarPushStartScroll = 0;
let topbarPushEndScroll = 1;
let topbarRafPending = false;
let topbarProgress = 0;

function recalcTopbarScrollRange() {
  if (!h1El) return;
  const barH = topbarEl.offsetHeight || 72;
  const h1Rect = h1El.getBoundingClientRect();
  const h1TopDoc = window.scrollY + h1Rect.top;
  const h1H = Math.max(1, h1Rect.height || h1El.offsetHeight || 64);

  /* hardcoded scroll window: starts as title nears topbar, completes shortly after crossing */
  topbarPushStartScroll = Math.max(0, h1TopDoc - (barH + 20));
  topbarPushEndScroll = topbarPushStartScroll + Math.max(92, h1H + barH * 0.65);
}

function topbarTargetFromScroll() {
  if (!h1El) return 0;
  const h1Rect = h1El.getBoundingClientRect();
  /* hard guard for fast flicks: if title is off-screen, bar must be fully hidden */
  if (h1Rect.bottom <= 8) return 1;

  const range = Math.max(1, topbarPushEndScroll - topbarPushStartScroll);
  const raw = (window.scrollY - topbarPushStartScroll) / range;
  const clamped = Math.max(0, Math.min(1, raw));
  /* smoothstep keeps the illusion of physical push/pull while remaining deterministic */
  return clamped * clamped * (3 - 2 * clamped);
}

function applyTopbarProgress(hideProgress) {
  const barH = topbarEl.offsetHeight || 72;
  const hiddenY = -(barH + 2);
  topbarEl.style.transform = `translateY(${hiddenY * hideProgress}px)`;
  topbarEl.style.opacity = `${1 - hideProgress}`;
  topbarEl.style.pointerEvents = hideProgress > 0.98 ? 'none' : '';
}

function scheduleTopbarPositionUpdate() {
  if (topbarRafPending) return;
  topbarRafPending = true;
  requestAnimationFrame(() => {
    topbarRafPending = false;
    const target = topbarTargetFromScroll();
    topbarProgress = target;
    applyTopbarProgress(topbarProgress);
  });
}

/* topbar scroll-hide only on pages with hero h1 */
if (h1El) {
  window.addEventListener('scroll', scheduleTopbarPositionUpdate, { passive: true });
  window.addEventListener('resize', () => {
    recalcTopbarScrollRange();
    scheduleTopbarPositionUpdate();
  }, { passive: true });
  document.fonts.ready.then(() => {
    recalcTopbarScrollRange();
    topbarProgress = topbarTargetFromScroll();
    applyTopbarProgress(topbarProgress);
  });
  recalcTopbarScrollRange();
  topbarProgress = topbarTargetFromScroll();
  applyTopbarProgress(topbarProgress);
}

/* info section scramble — apply hover-scramble after DOM ready */
const infoSection = document.getElementById('infoSection');
const CONNECT_EXTRA_WIDTH = 320;

/* reveal info section once it scrolls into view */
{
  const infoLabelEls = Array.from(infoSection.querySelectorAll('.bio-panel-label'));
  const infoLabelOrig = infoLabelEls.map(el => el.textContent);
  let infoLoops = null;

  function revealInfo() {
    infoLoops = infoLabelEls.map((el, i) => scrambleLoop(infoLabelOrig[i], t => { el.textContent = t; }, 30));
    requestAnimationFrame(() => infoSection.classList.add('visible'));

    let settled = false;
    function onFadeInEnd() {
      if (settled) return;
      settled = true;
      infoLoops.forEach(c => c()); infoLoops = null;
      infoLabelEls.forEach((el, i) => settleIn(infoLabelOrig[i], t => { el.textContent = t; }));
    }

    /* primary: transitionend on the section opacity transition */
    function onTransitionEnd(e) {
      if (e.target !== infoSection || e.propertyName !== 'opacity') return;
      infoSection.removeEventListener('transitionend', onTransitionEnd);
      onFadeInEnd();
    }
    infoSection.addEventListener('transitionend', onTransitionEnd);

    /* fallback: if transitionend never fires, settle after the transition window */
    setTimeout(onFadeInEnd, 1100);
  }

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) { revealInfo(); observer.disconnect(); }
  }, { threshold: 0 });
  observer.observe(infoSection);
}

/* auto-center removed — multiple sections now, free scroll */

let narrowW = 0, expandedW = 0;

function expandedWidthForBlock(block) {
  if (!block) return expandedW;
  const limit = window.innerWidth * 0.95;
  if (!block.classList.contains('connect-block')) return expandedW;
  return Math.min(expandedW + CONNECT_EXTRA_WIDTH, limit);
}

function initLayout() {
  const mobile = window.innerWidth <= 768;
  if (mobile) {
    infoSection.style.width = '';
    infoSection.style.transition = 'none';
    syncCenterScrollSpacer();
    return;
  }

  /* disable transition during measurement */
  infoSection.style.transition = 'none';
  infoSection.style.width = Math.min(window.innerWidth * 0.9, 1400) + 'px';
  infoSection.offsetWidth; /* force reflow */

  /* equalize link widths at full measure width */
  const links = Array.from(infoSection.querySelectorAll('.bio-press-links a'));
  links.forEach(a => { a.style.width = 'auto'; });
  infoSection.offsetWidth;
  const maxLinkW = links.reduce((m, a) => Math.max(m, a.offsetWidth), 0);
  if (maxLinkW > 0) links.forEach(a => { a.style.width = maxLinkW + 'px'; });

  /* measure label widths for narrow (collapsed) state */
  const labels = Array.from(infoSection.querySelectorAll('.bio-panel-label'));
  const maxLabelW = labels.reduce((m, el) => Math.max(m, el.offsetWidth), 0);
  const hPad = parseFloat(getComputedStyle(infoSection).paddingLeft) * 2;

  expandedW = Math.min(maxLinkW + hPad, window.innerWidth * 0.9);
  narrowW = Math.max(280, maxLabelW + hPad + 40); /* +40 for toggle icon */

  /* set correct width for current state — no transition yet */
  const openBlock = infoSection.querySelector('.info-block.open');
  const widthForOpen = openBlock ? expandedWidthForBlock(openBlock) : narrowW;
  infoSection.style.width = widthForOpen + 'px';
  infoSection.offsetWidth;

  /* re-enable transition — future width changes will animate */
  infoSection.style.transition = '';
  syncCenterScrollSpacer();
}

document.fonts.ready.then(initLayout);
document.fonts.ready.then(syncCenterScrollSpacer);
let layoutResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(layoutResizeTimer);
  layoutResizeTimer = setTimeout(() => {
    initLayout();
    syncCenterScrollSpacer();
  }, 90);
}, { passive: true });

/* hide all blocks except the given one with a smooth height+opacity collapse */
function hideOtherBlocks(openBlock) {
  Array.from(infoSection.querySelectorAll('.info-block'))
    .filter(b => b !== openBlock)
    .forEach(b => {
      const h = b.offsetHeight;
      b.style.overflow = 'hidden';
      b.style.transition = 'none';
      b.style.maxHeight = h + 'px';
      b.style.opacity = '1';
      b.offsetHeight; /* force reflow */
      b.style.transition = 'max-height .35s ease, opacity .25s ease';
      b.style.maxHeight = '0';
      b.style.opacity = '0';
      b.style.pointerEvents = 'none';
    });
}

/* reveal all hidden blocks back to their header height */
function showAllBlocks() {
  Array.from(infoSection.querySelectorAll('.info-block')).forEach(b => {
    if (!b.style.maxHeight || b.style.maxHeight === '') return; /* already visible */
    const targetH = b.querySelector('.info-block-header').offsetHeight;
    b.style.transition = 'max-height .35s ease, opacity .25s ease';
    b.style.maxHeight = targetH + 'px';
    b.style.opacity = '1';
    b.style.pointerEvents = '';
    setTimeout(() => {
      b.style.transition = '';
      b.style.maxHeight = '';
      b.style.opacity = '';
      b.style.overflow = '';
    }, 370);
  });
}

function centerBandY() {
  const topEdge = topbarEl ? topbarEl.getBoundingClientRect().bottom : 0;
  const bottomEdge = playerEl ? playerEl.getBoundingClientRect().top : window.innerHeight;
  return topEdge + (bottomEdge - topEdge) / 2;
}

let centerScrollTarget = infoSection;

function syncCenterScrollSpacer(targetEl = centerScrollTarget || infoSection) {
  if (!mainEl || !targetEl) return;
  const lowerViewportSpace = Math.max(0, window.innerHeight - centerBandY());
  const neededSpace = Math.max(0, lowerViewportSpace - targetEl.offsetHeight / 2);
  document.documentElement.style.setProperty('--info-scroll-spacer', `${Math.ceil(neededSpace)}px`);
}

function clampScrollY(targetY) {
  const doc = document.documentElement;
  const maxY = Math.max(0, doc.scrollHeight - window.innerHeight);
  return Math.min(Math.max(0, targetY), maxY);
}

/* return the vertical scroll position that centers the current target in the usable viewport */
function currentSectionScrollCenter(targetEl = centerScrollTarget || infoSection) {
  if (!targetEl) return window.scrollY;
  const rect = targetEl.getBoundingClientRect();
  const rectCenter = rect.top + rect.height / 2;
  return clampScrollY(window.scrollY + rectCenter - centerBandY());
}

let cancelInfoCenterFollow = null;

function followSectionCenter(targetEl = infoSection, duration = 400) {
  centerScrollTarget = targetEl;
  cancelInfoCenterFollow?.();

  const startY = window.scrollY;
  const startedAt = performance.now();
  let rafId = 0;

  function ease(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function frame(now) {
    const t = Math.min((now - startedAt) / duration, 1);
    syncCenterScrollSpacer(targetEl);
    const targetY = currentSectionScrollCenter(targetEl);
    const nextY = startY + (targetY - startY) * ease(t);
    window.scrollTo({ top: nextY, behavior: 'instant' });
    if (t < 1) {
      rafId = requestAnimationFrame(frame);
    } else {
      syncCenterScrollSpacer(targetEl);
      window.scrollTo({ top: currentSectionScrollCenter(targetEl), behavior: 'instant' });
      cancelInfoCenterFollow = null;
    }
  }

  rafId = requestAnimationFrame(frame);
  cancelInfoCenterFollow = () => {
    cancelAnimationFrame(rafId);
    cancelInfoCenterFollow = null;
  };
}

function syncSectionCenterState(targetEl = infoSection) {
  centerScrollTarget = targetEl;
  syncCenterScrollSpacer(targetEl);
}

/* accordion */
infoSection.querySelectorAll('.info-block-header').forEach(header => {
  header.addEventListener('click', () => {
    const block  = header.closest('.info-block');
    const isOpen = block.classList.contains('open');

    /* close any open block */
    infoSection.querySelectorAll('.info-block.open').forEach(b => {
      b.classList.remove('open');
      b.querySelector('.info-block-content').style.maxHeight = '0px';
      resetLabelGroups(b);
    });

    if (isOpen) {
      showAllBlocks();
      if (window.innerWidth > 768) infoSection.style.width = narrowW + 'px';
      infoSection.offsetHeight;
      followSectionCenter(infoSection, 400);
    } else {
      const content = block.querySelector('.info-block-content');

      hideOtherBlocks(block);
      if (window.innerWidth > 768) infoSection.style.width = expandedWidthForBlock(block) + 'px';
      block.classList.add('open');
      content.style.maxHeight = content.scrollHeight + 'px';
      followSectionCenter(infoSection, 400);

      /* scramble-settle the revealed text */
      const textEls  = Array.from(content.querySelectorAll('.bio-text, .bio-press-links a, .label-btn'));
      const textOrig = textEls.map(el => el.textContent);
      const lockWidthEls = window.innerWidth <= 768
        ? textEls.filter(el => el.matches('.bio-press-links a, .label-btn'))
        : [];
      lockWidthEls.forEach(el => {
        const w = Math.ceil(el.getBoundingClientRect().width);
        el.style.minWidth = `${w}px`;
        el.style.whiteSpace = 'nowrap';
      });
      const loops    = textEls.map((el, i) => scrambleLoop(textOrig[i], t => { el.textContent = t; }, 30, accordionScrambleLimit(textOrig[i])));
      loops.forEach(c => c());
      let remainingSettle = textEls.length;
      textEls.forEach((el, i) => scrambleResolve(
        textOrig[i],
        t => { el.textContent = t; },
        16,
        20,
        () => {
          if (--remainingSettle !== 0) return;
          lockWidthEls.forEach(locked => {
            locked.style.minWidth = '';
            locked.style.whiteSpace = '';
          });
        },
        accordionScrambleLimit(textOrig[i])
      ));
    }
  });
});

/* label releases — helpers */
function hideLabelGroups(openGroup) {
  infoSection.querySelectorAll('.label-group').forEach(g => {
    if (g === openGroup) return;
    /* ensure songs are closed before hiding the group */
    g.classList.remove('open');
    g.querySelector('.label-songs').style.maxHeight = '0';
    /* snapshot current height then animate to 0 */
    const h = g.offsetHeight;
    g.style.overflow    = 'hidden';
    g.style.transition  = 'none';
    g.style.maxHeight   = h + 'px';
    g.style.opacity     = '1';
    g.offsetHeight; /* force reflow */
    g.style.transition  = 'max-height .3s ease, opacity .2s ease';
    g.style.maxHeight   = '0';
    g.style.opacity     = '0';
    g.style.pointerEvents = 'none';
  });
}

function showAllLabelGroups() {
  infoSection.querySelectorAll('.label-group').forEach(g => {
    if (!g.style.maxHeight) return; /* already visible */
    g.style.transition    = 'max-height .3s ease, opacity .2s ease';
    g.style.maxHeight     = g.scrollHeight + 'px';
    g.style.opacity       = '1';
    g.style.pointerEvents = '';
    setTimeout(() => {
      g.style.transition = '';
      g.style.maxHeight  = '';
      g.style.opacity    = '';
      g.style.overflow   = '';
    }, 320);
  });
}

function resetLabelGroups(block) {
  block.querySelectorAll('.label-group').forEach(g => {
    g.classList.remove('open');
    g.style.maxHeight    = '';
    g.style.opacity      = '';
    g.style.overflow     = '';
    g.style.transition   = '';
    g.style.pointerEvents = '';
    const s = g.querySelector('.label-songs');
    if (s) s.style.maxHeight = '0';
  });
}

/* label releases — sub-accordion for each label group */
infoSection.querySelectorAll('.label-group').forEach(group => {
  const btn   = group.querySelector('.label-btn');
  const songs = group.querySelector('.label-songs');

  btn.addEventListener('click', () => {
    const isOpen        = group.classList.contains('open');
    const parentContent = group.closest('.info-block-content');

    if (isOpen) {
      /* close: restore all other groups and collapse songs */
      group.classList.remove('open');
      if (songs.style.maxHeight === 'none') {
        songs.style.maxHeight = songs.scrollHeight + 'px';
        songs.offsetHeight;
      }
      songs.style.maxHeight = '0';
      songs.style.opacity   = '0';
      showAllLabelGroups();
      followSectionCenter(infoSection, 400);
      /* parent max-height can only shrink after transitions finish (content is taller mid-transition) */
      setTimeout(() => {
        if (parentContent.style.maxHeight && parentContent.style.maxHeight !== '0px')
          parentContent.style.maxHeight = parentContent.scrollHeight + 'px';
      }, 380);
    } else {
      /* open: expand songs and hide all other groups */
      group.classList.add('open');
      songs.style.maxHeight = songs.scrollHeight + 'px';
      songs.style.opacity   = '1';
      setTimeout(() => {
        if (group.classList.contains('open')) songs.style.maxHeight = 'none';
      }, 380);
      hideLabelGroups(group);
      const finalContentH = parentContent.scrollHeight;
      if (parentContent.style.maxHeight && parentContent.style.maxHeight !== '0px')
        parentContent.style.maxHeight = finalContentH + 'px';
      followSectionCenter(infoSection, 400);
      /* scramble-settle song links as they slide in */
      Array.from(songs.querySelectorAll('a')).forEach(a => {
        const text = a.textContent;
        const unlockWidth = lockBracketTextWidth(a, text);
        scrambleThenSettleAt(text, t => { a.textContent = t; }, 300, accordionScrambleLimit(text));
        setTimeout(unlockWidth, 340);
      });
    }
  });

});

/* click outside info section to collapse open accordion */
document.addEventListener('click', e => {
  const openBlock = infoSection.querySelector('.info-block.open');
  if (!openBlock || infoSection.contains(e.target)) return;

  openBlock.classList.remove('open');
  openBlock.querySelector('.info-block-content').style.maxHeight = '0px';
  resetLabelGroups(openBlock);
  showAllBlocks();
  if (window.innerWidth > 768) infoSection.style.width = narrowW + 'px';
  syncSectionCenterState(infoSection);
});

/* apply hover-scramble to all remaining static text elements
   (info section elements are excluded — no hover scramble there) */
const infoSectionEls = new Set(infoSection.querySelectorAll('.bio-panel-label, .bio-text, .bio-press-links a'));
[
  /* panel titles + labels (excluding info section) */
  ...Array.from(document.querySelectorAll('.bio-panel-title, .bio-panel-label')).filter(el => !infoSectionEls.has(el)),
  /* bio body text (excluding info section) */
  ...Array.from(document.querySelectorAll('.bio-text')).filter(el => !infoSectionEls.has(el)),
].forEach(addScrambleHover);

/* info-block-header scramble removed — clickable elements skip hover-scramble */


/* ── generic section reveal with scramble-settle ───────────────── */
function initSectionReveal(sectionId, textSelector) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const textEls = Array.from(section.querySelectorAll(textSelector));
  const textOrig = textEls.map(el => el.textContent);

  /* prep stagger: children start invisible */
  const staggerChildren = Array.from(section.querySelectorAll(
    '.section-label, .featured-inner, .release-card, .date-row, .portfolio-card, .portfolio-link-card, .quote-card, .booking-signal-card, .portfolio-title, .portfolio-meta, .portfolio-link'
  ));
  staggerChildren.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(12px)';
    el.style.transition = 'none';
  });

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      const loops = textEls.map((el, i) => scrambleLoop(textOrig[i], t => { el.textContent = t; }, 30));
      section.classList.add('visible');

      /* stagger children in */
      staggerChildren.forEach((el, i) => {
        setTimeout(() => {
          el.style.transition = 'opacity .5s ease, transform .5s ease';
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, i * 60);
      });

      let settled = false;
      function doSettle() {
        if (settled) return;
        settled = true;
        loops.forEach(c => c());
        textEls.forEach((el, i) => settleIn(textOrig[i], t => { el.textContent = t; }));
        section.style.animation = 'none';
        section.style.opacity = '1';
      }
      section.addEventListener('animationend', e => {
        if (e.target === section && e.animationName === 'fadeUp') doSettle();
      }, { once: true });
      setTimeout(doSettle, 1000);
      observer.disconnect();
    }
  }, { threshold: 0 });
  observer.observe(section);
}

/* reveal tickers */
document.querySelectorAll('.ticker').forEach(t => {
  let revealed = false;
  const obs = new IntersectionObserver(entries => {
    const inView = entries.some(entry => entry.isIntersecting);
    t.classList.toggle('in-view', inView);
    if (inView && !revealed) {
      t.classList.add('visible');
      revealed = true;
    }
  }, { threshold: 0 });
  obs.observe(t);
});

/* reveal new sections */
initSectionReveal('featuredRelease', '.section-label, .featured-title, .featured-meta');
initSectionReveal('releasesSection', '.section-label, .release-card-title, .release-card-meta');
initSectionReveal('datesSection', '.section-label, .dates-empty, .date-date, .date-venue');
initSectionReveal('pastShowsSection', '.section-label, .past-shows-year-btn, .past-shows-back-btn, .past-shows-list .date-date, .past-shows-list .date-venue');
initSectionReveal('bookingSection', '.section-label, .portfolio-title, .portfolio-meta, .portfolio-link');
initSectionReveal('newsletterSection', '.section-label, .portfolio-title, .portfolio-meta, .portfolio-link');

/* keep upcoming date text from shifting during scramble */
const upcomingDateEls = Array.from(document.querySelectorAll('#datesSection .date-date, #datesSection .date-venue'));
function lockUpcomingDateWidths() {
  upcomingDateEls.forEach(el => {
    el.style.width = '';
    el.style.minWidth = '';
  });
  requestAnimationFrame(() => {
    upcomingDateEls.forEach(el => {
      const original = el.textContent;
      const widestSample = original.replace(/[^\s]/g, 'W');
      el.style.display = 'inline-block';
      el.textContent = widestSample;
      const lockedWidth = Math.ceil(el.getBoundingClientRect().width) + 2;
      el.textContent = original;
      el.style.width = `${lockedWidth}px`;
      el.style.minWidth = `${lockedWidth}px`;
    });
  });
}
lockUpcomingDateWidths();
let upcomingResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(upcomingResizeTimer);
  upcomingResizeTimer = setTimeout(lockUpcomingDateWidths, 90);
}, { passive: true });

/* hover-scramble for new static text elements */
document.querySelectorAll(
  '.featured-title, .featured-meta, .dates-empty, #datesSection .date-date, #datesSection .date-venue, .portfolio-title, .portfolio-meta, .quote-line, .quote-source, #pastShowsSection .section-label'
).forEach(addScrambleHover);
Array.from(document.querySelectorAll('.section-label'))
  .filter(el => !pastShowsSection.contains(el))
  .forEach(addScrambleHover);

/* past shows year accordion */
const pastShowsYears = Array.from(document.querySelectorAll('.past-shows-year'));

function closePastShowsYear(group) {
  const list = group.querySelector('.past-shows-list');
  group.classList.remove('open');
  list.style.maxHeight = '0';
  list.style.opacity   = '0';
}

function hideOtherPastShowsYears(openGroup) {
  pastShowsYears
    .filter(group => group !== openGroup)
    .forEach(group => {
      const h = group.offsetHeight;
      group.style.overflow = 'hidden';
      group.style.transition = 'none';
      group.style.maxHeight = h + 'px';
      group.style.opacity = '1';
      group.offsetHeight;
      group.style.transition = 'max-height .35s ease, opacity .25s ease';
      group.style.maxHeight = '0';
      group.style.opacity = '0';
      group.style.pointerEvents = 'none';
    });
}

function showAllPastShowsYears() {
  pastShowsYears.forEach(group => {
    if (!group.style.maxHeight) return;
    const targetH = group.querySelector('.past-shows-year-btn').offsetHeight;
    group.style.transition = 'max-height .35s ease, opacity .25s ease';
    group.style.maxHeight = targetH + 'px';
    group.style.opacity = '1';
    group.style.pointerEvents = '';
    setTimeout(() => {
      group.style.transition = '';
      group.style.maxHeight = '';
      group.style.opacity = '';
      group.style.overflow = '';
    }, 370);
  });
}

function resetPastShowsAccordion(shouldCenter = true) {
  const openGroup = pastShowsSection.querySelector('.past-shows-year.open');
  if (!openGroup) return;
  closePastShowsYear(openGroup);
  showAllPastShowsYears();
  if (shouldCenter) followSectionCenter(pastShowsSection, 350);
  else syncSectionCenterState(pastShowsSection);
}

pastShowsYears.forEach(group => {
  const btn   = group.querySelector('.past-shows-year-btn');
  const list  = group.querySelector('.past-shows-list');
  const backBtn = group.querySelector('.past-shows-back-btn');

  btn.addEventListener('click', () => {
    const isOpen = group.classList.contains('open');
    if (isOpen) {
      resetPastShowsAccordion();
    } else {
      pastShowsYears.forEach(closePastShowsYear);
      group.classList.add('open');
      list.style.maxHeight = list.scrollHeight + 'px';
      list.style.opacity   = '1';
      hideOtherPastShowsYears(group);
      followSectionCenter(pastShowsSection, 350);
    }
  });

  backBtn.addEventListener('click', () => {
    resetPastShowsAccordion();
  });

});
document.addEventListener('click', e => {
  const openGroup = pastShowsSection.querySelector('.past-shows-year.open');
  if (!openGroup || pastShowsSection.contains(e.target)) return;
  resetPastShowsAccordion(false);
});

/* ── magnetic hover on CTA buttons ─────────────────── */
if (!isCoarsePointer) {
  scheduleNonCritical(() => {
    const magnetEls = document.querySelectorAll('.booking-cta, .featured-link');
    const MAGNET_STRENGTH = 0.35; /* 0-1 — how far the element pulls toward cursor */

    magnetEls.forEach(el => {
      el.style.transition = 'transform .25s ease-out';

      el.addEventListener('mousemove', e => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top  + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        el.style.transform = `translate(${dx * MAGNET_STRENGTH}px, ${dy * MAGNET_STRENGTH}px)`;
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  });
}

/* ── 3D tilt on release cards + featured artwork ──── */
if (!isCoarsePointer) {
  scheduleNonCritical(() => {
    function addTiltHover(el, maxDeg = 8) {
      el.addEventListener('mousemove', e => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width  - 0.5; /* -0.5 … +0.5 */
        const y = (e.clientY - rect.top)  / rect.height - 0.5;
        el.style.transform = `perspective(600px) rotateY(${x * maxDeg}deg) rotateX(${-y * maxDeg}deg)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    }
    document.querySelectorAll('.release-card').forEach(c => addTiltHover(c, 8));
    const featuredWrap = document.querySelector('.featured-artwork-wrap');
    if (featuredWrap) addTiltHover(featuredWrap, 6);
  });
}

/* cursor ring spring + grain sync loop */
{
  let tickRafId = 0;
  let tickRunning = false;

  function tick() {
    if (!tickRunning) return;
    rx += (mx - rx) * .25; ry += (my - ry) * .25;
    ring.style.transform = `translate(${rx}px,${ry}px)`;
    if (++grainFrame % 6 === 0)
      turbEl.setAttribute('seed', (noiseSeed = (noiseSeed + 1) % 200));
    if (window.shouldDrawVisualizer?.()) window.drawVisualizer();
    tickRafId = requestAnimationFrame(tick);
  }

  function startTick() {
    if (tickRunning) return;
    tickRunning = true;
    tickRafId = requestAnimationFrame(tick);
  }

  function stopTick() {
    if (!tickRunning) return;
    tickRunning = false;
    cancelAnimationFrame(tickRafId);
    tickRafId = 0;
  }

  function syncTickState() {
    if (isCoarsePointer || document.hidden) stopTick();
    else startTick();
  }

  document.addEventListener('visibilitychange', syncTickState);
  window.addEventListener('pageshow', syncTickState, { passive: true });
  window.addEventListener('pagehide', stopTick, { passive: true });
  syncTickState();
}
