/* cursor */
const cur  = document.getElementById('cur');
const ring = document.getElementById('cur-ring');
let mx = 0, my = 0, rx = 0, ry = 0;
document.addEventListener('mousemove', e => {
  mx = e.clientX; my = e.clientY;
  cur.style.transform = `translate(${mx}px,${my}px)`;
});
document.querySelectorAll('a').forEach(a => {
  a.addEventListener('mouseenter', () => document.body.classList.add('link-hover'));
  a.addEventListener('mouseleave', () => document.body.classList.remove('link-hover'));
});

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

function scrambleLoop(original, setText, stepMs = 25) {
  let rafId, last = 0;
  function frame(ts) {
    if (ts - last >= stepMs) {
      last = ts;
      setText(original.split('').map(c =>
        c === ' ' ? ' ' : randGlyph(c)
      ).join(''));
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}

function scrambleResolve(original, setText, steps = 16, stepMs = 25, onComplete) {
  let step = 0, last = 0, rafId;
  /* starts at stepMs (full speed), slows quadratically to ~2× at the last step */
  function stepDelay(s) { return stepMs * (1 + Math.pow(s / steps, 2)); }
  function frame(ts) {
    if (ts - last >= stepDelay(step)) {
      last = ts;
      setText(original.split('').map((c, i) => {
        if (c === ' ') return ' ';
        if (i < (step / steps) * original.length) return c;
        return randGlyph(c);
      }).join(''));
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
function settleIn(text, setText, onComplete) {
  const steps = Math.max(6, Math.min(20, text.replace(/ /g, '').length));
  return scrambleResolve(text, setText, steps, 25, onComplete);
}

/* generic hover-scramble — applies to any static text element */
function addScrambleHover(el) {
  const orig = el.textContent;          /* capture once — never re-read during hover */
  let cancelScramble = null, cancelResolve = null;
  el.addEventListener('mouseenter', () => {
    document.body.classList.add('link-hover');
    cancelResolve?.(); cancelResolve = null;  /* stop any in-progress settle */
    cancelScramble?.();
    cancelScramble = scrambleLoop(orig, t => { el.textContent = t; }, 30);
  });
  el.addEventListener('mouseleave', () => {
    document.body.classList.remove('link-hover');
    cancelScramble?.(); cancelScramble = null;
    cancelResolve = scrambleResolve(orig, t => { el.textContent = t; }, ...settleParams(orig));
  });
}

/* h1 scramble + chromatic aberration */
const h1El   = document.querySelector('h1');
const h1Orig = 'CITYSPROBLEM';
let cancelH1;
let menuExpanded = false;
let h1FadeUpDone = false;

function h1Settle() {
  if (h1FadeUpDone || menuExpanded) return;
  h1FadeUpDone = true;
  cancelH1?.(); cancelH1 = null;
  h1El.style.opacity = '1';
  cancelH1 = settleIn(h1Orig, t => { h1El.textContent = t; applyH1Centering(); });
}

setTimeout(() => {
  if (!menuExpanded) cancelH1 = scrambleLoop(h1Orig, t => { h1El.textContent = t; });
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
function applyH1Centering() {
  const overflow = h1El.scrollWidth - h1El.clientWidth;
  h1El.style.transform = overflow > 0 ? `translateX(${-(overflow / 2)}px)` : '';
}

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

/* button scramble */
document.querySelectorAll('nav a').forEach(a => {
  const textNode = [...a.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
  if (!textNode) return;
  const original = textNode.textContent.trim();
  const span = document.createElement('span');
  span.style.display = 'inline-block';
  span.textContent = original;
  textNode.replaceWith(span);
  requestAnimationFrame(() => { span.style.minWidth = span.offsetWidth + 'px'; });
  let cancelBtn;
  a.addEventListener('mouseenter', () => {
    cancelBtn?.();
    cancelBtn = scrambleLoop(original, t => { span.textContent = t; });
  });
  a.addEventListener('mouseleave', () => {
    cancelBtn?.();
    cancelBtn = scrambleResolve(original, t => { span.textContent = t; }, ...settleParams(original));
  });
});

/* audio player — tracks sourced from SONGS/tracks.js */
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

let shuffleOn = false;
function nextTrackIdx() {
  if (!shuffleOn) return trackIdx + 1;
  let r;
  do { r = Math.floor(Math.random() * tracks.length); } while (tracks.length > 1 && r === trackIdx);
  return r;
}
function updateCounter() {
  playerCounter.textContent = tracks.length ? `${trackIdx + 1} / ${tracks.length}` : '—';
}

const tracks = (window.TRACKS || []).map(t => ({
  title: t.title.toUpperCase(),
  url: 'SONGS/' + t.file,
}));
let trackIdx = 0;

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
  audio.src = tracks[trackIdx].url;
  const title = tracks[trackIdx].title;
  playerTrack.classList.remove('scrolling');
  scrambleResolve(title, t => { playerTrack.textContent = t; }, ...settleParams(title), () => {
    updateMarquee();
  });
  updateCounter();
  if (!audio.paused) audio.play();
}

function setPlaying(v) {
  btnPlay.textContent = v ? '' : '▶\uFE0E';
  btnPlay.classList.toggle('playing', v);
}

let cancelTrackScramble = null;
let cancelTrackResolve  = null;

if (tracks.length) loadTrack(0);
else { playerTrack.textContent = '—'; updateCounter(); }

/* scramble during fadeUp, settle when it ends */
if (tracks.length) {
  setTimeout(() => {
    cancelTrackScramble = scrambleLoop(tracks[trackIdx].title, t => { playerTrack.textContent = t; }, 30);
  }, 0);
}
document.getElementById('player').addEventListener('animationend', e => {
  if (e.animationName !== 'fadeUp') return;
  if (tracks.length) {
    const title = tracks[trackIdx].title;
    cancelTrackScramble?.(); cancelTrackScramble = null;
    cancelTrackResolve = settleIn(title, t => { playerTrack.textContent = t; }, () => {
      cancelTrackResolve = null;
      updateMarquee();
    });
  }
}, { once: true });

btnPlay.addEventListener('click', () => {
  hideTapHint();
  if (!tracks.length) return;
  audio.paused ? audio.play() : audio.pause();
});
btnPrev.addEventListener('click', () => loadTrack(trackIdx - 1));
btnNext.addEventListener('click', () => loadTrack(nextTrackIdx()));
audio.addEventListener('play',  () => setPlaying(true));
audio.addEventListener('pause', () => setPlaying(false));
audio.addEventListener('ended', () => {
  if (shuffleOn || trackIdx < tracks.length - 1) loadTrack(nextTrackIdx());
  else setPlaying(false);
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

/* block horizontal swipe on mobile */
let _txStart = 0, _tyStart = 0;
document.addEventListener('touchstart', e => { _txStart = e.touches[0].clientX; _tyStart = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchmove', e => {
  if (isSeeking) return; // already handled by seek listener
  const dx = Math.abs(e.touches[0].clientX - _txStart);
  const dy = Math.abs(e.touches[0].clientY - _tyStart);
  if (dx > dy) e.preventDefault();
}, { passive: false });

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

/* sync player width to h1 */
const playerEl   = document.getElementById('player');
const scrollArrowEl = document.querySelector('.scroll-arrow');
function syncPlayerWidth() {
  const infoSectionEl = document.getElementById('infoSection');
  const w = window.innerWidth <= 768
    ? playerEl.offsetWidth
    : infoSectionEl.offsetWidth;
  playerEl.style.setProperty('--player-content-w', w + 'px');
  document.documentElement.style.setProperty('--player-h', playerEl.offsetHeight + 'px');
  const h1Bottom     = h1El.getBoundingClientRect().bottom;
  const playerTop    = playerEl.getBoundingClientRect().top;
  scrollArrowEl.style.top = ((h1Bottom + playerTop) / 2 - 7) + 'px';
}
document.fonts.ready.then(syncPlayerWidth);
let resizePlayerTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizePlayerTimer);
  resizePlayerTimer = setTimeout(syncPlayerWidth, 100);
});

/* cursor hover for player controls */
[btnPlay, btnPrev, btnNext, btnShuffle, playerProg, volSlider].forEach(el => {
  el.addEventListener('mouseenter', () => document.body.classList.add('link-hover'));
  el.addEventListener('mouseleave', () => document.body.classList.remove('link-hover'));
});

/* track title scramble on hover */
playerTrack.addEventListener('mouseenter', () => {
  document.body.classList.add('link-hover');
  if (!tracks.length || tracks[trackIdx]?.title === undefined) return;
  cancelTrackResolve?.(); cancelTrackResolve = null;
  cancelTrackScramble?.();
  cancelTrackScramble = scrambleLoop(
    tracks[trackIdx].title,
    t => { playerTrack.textContent = t; },
    30
  );
});
playerTrack.addEventListener('mouseleave', () => {
  document.body.classList.remove('link-hover');
  cancelTrackScramble?.(); cancelTrackScramble = null;
  const title = tracks[trackIdx]?.title ?? '—';
  cancelTrackResolve = scrambleResolve(title, t => { playerTrack.textContent = t; }, ...settleParams(title), () => {
    cancelTrackResolve = null;
    updateMarquee();
  });
});

/* topbar menu */
const menuBtn        = document.getElementById('menuBtn');
const menuDropdown   = document.getElementById('menuDropdown');
const menuCloseBtnEl = document.getElementById('menuCloseBtn');
const topbarTitle    = document.getElementById('topbarTitle');
const topbarFlyer    = document.getElementById('topbarFlyer');
const logoEl         = document.querySelector('.topbar-logo');

/* slide-in panels — defined early so collapseMenu can close them */
const bioBackdrop = document.getElementById('bioBackdrop');
const allPanels   = [
  document.getElementById('socialsPanel'),
  document.getElementById('contactPanel'),
];

let titleFontSzNatural = 0;
let cancelFlyer = null;
let cancelTitleScramble = null;
let cancelTitleResolve  = null;
let cancelDdScrambles = [];
const ddBtnOriginals = ['Socials', 'Contact'];

function startDdScramble() {
  cancelDdScrambles.forEach(fn => fn?.());
  const btns = menuDropdown.querySelectorAll('button');
  cancelDdScrambles = ddBtnOriginals.map((orig, i) =>
    scrambleLoop(orig, t => { btns[i].textContent = t; }, 35)
  );
}
function stopDdScramble() {
  cancelDdScrambles.forEach(fn => fn?.());
  /* settle each button left-to-right; keep cancelDdScrambles populated so hover
     scramble doesn't race until all resolves finish */
  const btns = menuDropdown.querySelectorAll('button');
  let done = 0;
  cancelDdScrambles = ddBtnOriginals.map((orig, i) =>
    scrambleResolve(orig, t => { btns[i].textContent = t; }, ...settleParams(orig), () => {
      if (++done >= ddBtnOriginals.length) cancelDdScrambles = [];
    })
  );
}

function menuCenteredScale() { return window.innerWidth <= 768 ? 1.4 : 2; }

function animateBracketsExpand(fromX, fromY) {
  const btns = [...menuDropdown.querySelectorAll('button')];
  if (!btns.length) return;
  btns.forEach(b => { b.style.backgroundImage = 'none'; });

  const cssScale = btns[0].getBoundingClientRect().width / btns[0].offsetWidth;
  const arm = Math.round(11 * cssScale);
  const bw  = Math.max(1, Math.round(2 * cssScale));

  /* target: button corners at current (centered) position — measure now, before dropdown moves */
  const defs = [];
  btns.forEach(btn => {
    const r = btn.getBoundingClientRect();
    defs.push(
      { tx: r.left,        ty: r.top,          sides: ['Top',    'Left']  },
      { tx: r.right - arm, ty: r.top,          sides: ['Top',    'Right'] },
      { tx: r.left,        ty: r.bottom - arm, sides: ['Bottom', 'Left']  },
      { tx: r.right - arm, ty: r.bottom - arm, sides: ['Bottom', 'Right'] }
    );
  });

  const ox = fromX - arm / 2;
  const oy = fromY - arm / 2;

  const dists   = defs.map(({ tx, ty }) => Math.hypot(tx - ox, ty - oy));
  const maxDist = Math.max(...dists);

  const els = defs.map(({ sides }) => {
    const el = _makeInnerBracketEl(ox, oy, sides, arm, bw);
    el.style.opacity = '0';
    return el;
  });

  void els[0].offsetHeight;
  requestAnimationFrame(() => {
    els.forEach((el, i) => {
      const t   = maxDist > 0 ? dists[i] / maxDist : 0;
      const dur = +(0.053 + 0.297 * t).toFixed(3);
      el.style.transition = `transform ${dur}s ease-out, opacity .08s ease`;
      el.style.transform  = `translate(${defs[i].tx - ox}px, ${defs[i].ty - oy}px)`;
      el.style.opacity    = '1';
    });
  });

  setTimeout(() => {
    els.forEach(el => el.remove());
    btns.forEach(b => { b.style.backgroundImage = ''; });
  }, 500);
}

function expandMenu() {
  if (menuExpanded) return;
  menuExpanded = true;

  /* stop any active scramble and restore text */
  cancelH1?.();
  cancelH1 = null;
  h1El.textContent = h1Orig;

  /* measure positions for flyer animation */
  const h1Rect    = h1El.getBoundingClientRect();
  const h1CenterY = h1Rect.top + h1Rect.height / 2;
  titleFontSzNatural = parseFloat(getComputedStyle(topbarTitle).fontSize);
  const endScale  = titleFontSzNatural / parseFloat(getComputedStyle(topbarFlyer).fontSize);
  const startDY   = h1CenterY - 36; /* offset from topbar centre to h1 centre */

  /* hide h1 instantly and block pointer events so hover can't restore it */
  h1El.style.animation      = 'none';
  h1El.style.opacity        = '0';
  h1El.style.pointerEvents  = 'none';

  /* fade out info section */
  const infoEl = document.getElementById('infoSection');
  if (infoEl) {
    infoEl.style.transition = 'opacity .3s ease';
    infoEl.style.opacity    = '0';
    infoEl.style.pointerEvents = 'none';
  }

  /* topbarFlyer has h1's font-size in CSS — no font-size override needed.
     Snap it to h1's position at scale(1) so it looks exactly like the h1. */
  topbarFlyer.style.transition    = 'none';
  topbarFlyer.style.transform     = `translateX(-50%) translateY(calc(-50% + ${startDY}px))`;
  topbarFlyer.style.letterSpacing = '';
  topbarFlyer.style.opacity       = '1';
  cancelFlyer = scrambleLoop(h1Orig, t => { topbarFlyer.textContent = t; }, 30);

  /* fly up and scale down to topbar size, easing letter-spacing to match topbarTitle */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      topbarFlyer.style.transition    = 'transform .45s cubic-bezier(.4,0,.2,1), letter-spacing .45s cubic-bezier(.4,0,.2,1)';
      topbarFlyer.style.transform     = `translateX(-50%) translateY(-50%) scale(${endScale})`;
      topbarFlyer.style.letterSpacing = '0.14em';
    });
  });

  /* after flight: stop scramble, hand off from flyer to topbarTitle (inside topbar) */
  setTimeout(() => {
    cancelFlyer?.(); cancelFlyer = null;
    /* start topbarTitle showing the last scrambled state, then settle */
    topbarTitle.textContent         = topbarFlyer.textContent;
    topbarTitle.style.opacity       = '1';
    topbarTitle.style.pointerEvents = 'auto';
    topbarFlyer.style.transition    = 'none';
    topbarFlyer.style.opacity       = '0';
    topbarFlyer.style.transform     = 'translateX(-50%) translateY(-50%)';
    topbarFlyer.style.letterSpacing = '';
    cancelTitleResolve = scrambleResolve(h1Orig, t => { topbarTitle.textContent = t; }, ...settleParams(h1Orig));
  }, 460);

  /* fade out logo */
  logoEl.style.transition    = 'opacity .3s ease';
  logoEl.style.opacity       = '0';
  logoEl.style.pointerEvents = 'none';

  /* show ✕ button, hide hamburger */
  menuBtn.style.opacity       = '0';
  menuBtn.style.pointerEvents = 'none';
  menuCloseBtnEl.classList.add('visible');

  /* show dropdown centered so we can measure it */
  menuDropdown.classList.add('open', 'centered');

  /* bracket spread from hamburger — measure while dropdown is centered */
  const hr = menuBtn.getBoundingClientRect();
  animateBracketsExpand((hr.left + hr.right) / 2, (hr.top + hr.bottom) / 2);

  /* fade dropdown in at centered position while brackets spread */
  menuDropdown.style.transition = 'none';
  menuDropdown.style.transform  = `translate(-50%, -50%) scale(${menuCenteredScale()})`;
  menuDropdown.style.opacity    = '0';
  startDdScramble();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      menuDropdown.style.transition = 'opacity .3s ease';
      menuDropdown.style.opacity    = '1';
    });
  });
  setTimeout(stopDdScramble, 360);
}

function collapseMenu() {
  if (!menuExpanded) return;
  menuExpanded = false;

  /* close any open panels */
  allPanels.forEach(p => p.classList.remove('open'));
  bioBackdrop.classList.remove('active');

  /* measure h1's position (still in layout even with opacity:0) */
  const h1Rect    = h1El.getBoundingClientRect();
  const h1CenterY = h1Rect.top + h1Rect.height / 2;
  const endDY     = h1CenterY - 36;
  const flyerStartScale = titleFontSzNatural / parseFloat(getComputedStyle(topbarFlyer).fontSize);

  /* hand off from topbarTitle to topbarFlyer at the same visual position */
  cancelTitleScramble?.(); cancelTitleScramble = null;
  topbarTitle.textContent         = h1Orig;
  topbarTitle.style.pointerEvents = 'none';
  topbarTitle.style.opacity       = '0';
  topbarFlyer.style.transition    = 'none';
  topbarFlyer.style.transform     = `translateX(-50%) translateY(-50%) scale(${flyerStartScale})`;
  topbarFlyer.style.letterSpacing = '0.14em';
  topbarFlyer.style.opacity       = '1';
  cancelFlyer = scrambleLoop(h1Orig, t => { topbarFlyer.textContent = t; }, 30);

  /* fly down to h1's position at h1's natural scale */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      topbarFlyer.style.transition    = 'transform .4s cubic-bezier(.4,0,.2,1), letter-spacing .4s cubic-bezier(.4,0,.2,1)';
      topbarFlyer.style.transform     = `translateX(-50%) translateY(calc(-50% + ${endDY}px))`;
      topbarFlyer.style.letterSpacing = '';
    });
  });

  /* after flight: stop scramble, restore h1, reset flyer */
  setTimeout(() => {
    cancelFlyer?.(); cancelFlyer = null;
    /* h1 starts showing the last scrambled state, then settles while glow fades in */
    h1El.textContent = topbarFlyer.textContent;
    topbarFlyer.style.transition    = 'none';
    topbarFlyer.style.opacity       = '0';
    topbarFlyer.style.transform     = 'translateX(-50%) translateY(-50%)';
    topbarFlyer.style.letterSpacing = '';
    h1El.style.pointerEvents = '';
    h1El.style.opacity       = '1';
    h1El.style.animation     = 'glowFadeIn .9s ease forwards';
    cancelH1 = scrambleResolve(h1Orig, t => { h1El.textContent = t; applyH1Centering(); }, ...settleParams(h1Orig), () => {
      cancelH1 = null;
      applyH1Centering();
    });
  }, 420);

  /* restore info section */
  const infoEl = document.getElementById('infoSection');
  if (infoEl) {
    infoEl.style.transition    = 'opacity .4s ease .2s';
    infoEl.style.opacity       = infoEl.classList.contains('visible') ? '1' : '0';
    infoEl.style.pointerEvents = '';
    setTimeout(() => { infoEl.style.transition = ''; }, 650);
  }

  /* restore logo and hamburger */
  logoEl.style.opacity        = '1';
  logoEl.style.pointerEvents  = '';
  menuBtn.style.opacity       = '';
  menuBtn.style.pointerEvents = '';
  menuCloseBtnEl.classList.remove('visible');

  /* brackets converge to hamburger, dropdown fades out simultaneously */
  const hr = menuBtn.getBoundingClientRect();
  animateBrackets((hr.left + hr.right) / 2, (hr.top + hr.bottom) / 2);

  /* scramble buttons then fade dropdown out */
  startDdScramble();
  const ddRect     = menuDropdown.getBoundingClientRect();
  const endCX      = window.innerWidth  - ddRect.width  / 2;
  const endCY      = 72                 + ddRect.height / 2;
  const curCX      = ddRect.left + ddRect.width  / 2;
  const curCY      = ddRect.top  + ddRect.height / 2;
  const offX       = endCX - curCX;
  const offY       = endCY - curCY;
  menuDropdown.style.transition = 'transform .35s cubic-bezier(.4,0,.2,1), opacity .25s ease';
  menuDropdown.style.transform  = `translate(calc(-50% + ${offX}px), calc(-50% + ${offY}px)) scale(1)`;
  menuDropdown.style.opacity    = '0';
  setTimeout(() => {
    stopDdScramble();
    menuDropdown.classList.remove('open', 'centered');
    menuDropdown.style.cssText = '';
  }, 370);
}

topbarTitle.addEventListener('mouseenter', () => {
  document.body.classList.add('link-hover');
  cancelTitleResolve?.(); cancelTitleResolve = null;
  cancelTitleScramble?.();
  cancelTitleScramble = scrambleLoop(h1Orig, t => { topbarTitle.textContent = t; }, 30);
});
topbarTitle.addEventListener('mouseleave', () => {
  document.body.classList.remove('link-hover');
  cancelTitleScramble?.(); cancelTitleScramble = null;
  cancelTitleResolve = scrambleResolve(h1Orig, t => { topbarTitle.textContent = t; }, ...settleParams(h1Orig));
});

menuBtn.addEventListener('click', () => {
  menuExpanded ? collapseMenu() : expandMenu();
});
menuCloseBtnEl.addEventListener('click', e => { e.stopPropagation(); collapseMenu(); });
document.addEventListener('click', e => {
  if (menuExpanded
    && !menuBtn.contains(e.target)
    && !menuDropdown.contains(e.target)
    && !menuCloseBtnEl.contains(e.target)) {
    collapseMenu();
  }
});
[menuBtn, menuCloseBtnEl, ...menuDropdown.querySelectorAll('button')].forEach(el => {
  el.addEventListener('mouseenter', () => document.body.classList.add('link-hover'));
  el.addEventListener('mouseleave', () => document.body.classList.remove('link-hover'));
});

function _buildBracketWrap(left, top, W, H, corners, arm, bw) {
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${W}px;height:${H}px;z-index:301;pointer-events:none;transform-origin:center center;`;
  corners.forEach(({ x, y, sides }) => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${arm}px;height:${arm}px;border:0 solid rgba(0,212,255,.55);`;
    sides.forEach(s => { el.style['border' + s + 'Width'] = bw + 'px'; });
    wrap.appendChild(el);
  });
  document.body.appendChild(wrap);
  return wrap;
}

function _makeInnerBracketEl(sx, sy, sides, arm, bw) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:${sx}px;top:${sy}px;width:${arm}px;height:${arm}px;border:0 solid rgba(0,212,255,.55);z-index:301;pointer-events:none;`;
  sides.forEach(s => { el.style['border' + s + 'Width'] = bw + 'px'; });
  document.body.appendChild(el);
  return el;
}

function _innerBracketDefs(tr, br, midBtn, arm) {
  const defs = [
    { sx: tr.left,        sy: tr.bottom - arm, sides: ['Bottom', 'Left']  },
    { sx: tr.right - arm, sy: tr.bottom - arm, sides: ['Bottom', 'Right'] },
    { sx: br.left,        sy: br.top,          sides: ['Top',    'Left']  },
    { sx: br.right - arm, sy: br.top,          sides: ['Top',    'Right'] },
  ];
  if (midBtn) {
    const mr = midBtn.getBoundingClientRect();
    defs.push(
      { sx: mr.left,        sy: mr.top,          sides: ['Top',    'Left']  },
      { sx: mr.right - arm, sy: mr.top,          sides: ['Top',    'Right'] },
      { sx: mr.left,        sy: mr.bottom - arm, sides: ['Bottom', 'Left']  },
      { sx: mr.right - arm, sy: mr.bottom - arm, sides: ['Bottom', 'Right'] }
    );
  }
  return defs;
}

function animateBrackets(cursorX, cursorY) {
  const btns = [...menuDropdown.querySelectorAll('button')];
  if (!btns.length) return;
  btns.forEach(b => { b.style.backgroundImage = 'none'; });

  const cssScale = btns[0].getBoundingClientRect().width / btns[0].offsetWidth;
  const arm = Math.round(11 * cssScale);
  const bw  = Math.max(1, Math.round(2 * cssScale));

  /* all 4 corners of every button */
  const defs = [];
  btns.forEach(btn => {
    const r = btn.getBoundingClientRect();
    defs.push(
      { sx: r.left,        sy: r.top,          sides: ['Top',    'Left']  },
      { sx: r.right - arm, sy: r.top,          sides: ['Top',    'Right'] },
      { sx: r.left,        sy: r.bottom - arm, sides: ['Bottom', 'Left']  },
      { sx: r.right - arm, sy: r.bottom - arm, sides: ['Bottom', 'Right'] }
    );
  });

  /* converge toward cursor position at click time; offset so bracket corner lands on cursor */
  const cxAbs = cursorX - arm / 2;
  const cyAbs = cursorY - arm / 2;

  /* duration scales linearly with distance — closest brackets are fastest (0.13s),
     farthest are slowest (0.4s) */
  const dists   = defs.map(({ sx, sy }) => Math.hypot(cxAbs - sx, cyAbs - sy));
  const maxDist = Math.max(...dists);

  const els = defs.map(({ sx, sy, sides }) => _makeInnerBracketEl(sx, sy, sides, arm, bw));

  void els[0].offsetHeight;
  requestAnimationFrame(() => {
    els.forEach((el, i) => {
      const t   = maxDist > 0 ? dists[i] / maxDist : 0;
      const dur = +(0.053 + 0.297 * t).toFixed(3);
      const fd  = +(Math.max(0, dur - 0.04)).toFixed(3);
      el.style.transition = `transform ${dur}s ease-out, opacity .10s ease ${fd}s`;
      el.style.transform  = `translate(${cxAbs - defs[i].sx}px,${cyAbs - defs[i].sy}px)`;
      el.style.opacity    = '0';
    });
  });
  setTimeout(() => els.forEach(el => el.remove()), 500);
}


const PANEL_TEXT_SEL = '.bio-close, .bio-panel-title, .bio-panel-label, .bio-text, .bio-press-links a';
function openPanel(panel, cursorX, cursorY) {
  const ddVisible = menuDropdown.classList.contains('open') || menuDropdown.classList.contains('centered');
  if (ddVisible) {
    animateBrackets(cursorX, cursorY);
    /* fade button text out alongside bracket collapse */
    menuDropdown.style.transition    = 'opacity .13s ease-in';
    menuDropdown.style.opacity       = '0';
    menuDropdown.style.pointerEvents = 'none';
  }
  allPanels.forEach(p => p.classList.remove('open'));
  panel.classList.add('open');
  bioBackdrop.classList.add('active');
  if (ddVisible) {
    /* defer class removal until fade completes so display:none doesn't jump */
    setTimeout(() => { menuDropdown.classList.remove('open', 'centered'); menuDropdown.style.cssText = ''; }, 420);
  } else {
    menuDropdown.classList.remove('open', 'centered');
    menuDropdown.style.cssText = '';
  }
  /* scramble all panel text as the panel slides in; resolve once it lands */
  const els   = [...panel.querySelectorAll(PANEL_TEXT_SEL)];
  const texts = els.map(el => el.textContent);
  const loops = els.map((el, i) => scrambleLoop(texts[i], t => { el.textContent = t; }, 30));
  setTimeout(() => {
    loops.forEach(c => c());
    els.forEach((el, i) => settleIn(texts[i], t => { el.textContent = t; }));
  }, 360);
}
function animateBracketsReverse() {
  const btns = [...menuDropdown.querySelectorAll('button')];
  if (btns.length < 2) return;
  btns.forEach(b => { b.style.backgroundImage = 'none'; });
  const topBtn = btns[0], bottomBtn = btns[btns.length - 1];
  const midBtn = btns.length >= 3 ? btns[Math.floor(btns.length / 2)] : null;
  const tr = topBtn.getBoundingClientRect();
  const br = bottomBtn.getBoundingClientRect();

  const cssScale = tr.width / topBtn.offsetWidth;
  const arm = Math.round(11 * cssScale);
  const bw  = Math.max(1, Math.round(2 * cssScale));
  const OW  = br.right - tr.left, OH = br.bottom - tr.top;

  const outerWrap = _buildBracketWrap(tr.left, tr.top, OW, OH, [
    { x: 0,        y: 0,        sides: ['Top',    'Left']  },
    { x: OW - arm, y: 0,        sides: ['Top',    'Right'] },
    { x: 0,        y: OH - arm, sides: ['Bottom', 'Left']  },
    { x: OW - arm, y: OH - arm, sides: ['Bottom', 'Right'] },
  ], arm, bw);
  outerWrap.style.transform = 'scale(0)';

  /* inner brackets: start at center, translate out to corners preserving shape */
  const defs = _innerBracketDefs(tr, br, midBtn, arm);
  const cxAbs = (tr.left + br.right) / 2 - arm / 2;
  const cyAbs = (tr.top  + br.bottom) / 2 - arm / 2;
  const innerEls = defs.map(({ sx, sy, sides }) => {
    const el = _makeInnerBracketEl(sx, sy, sides, arm, bw);
    const dx = cxAbs - sx, dy = cyAbs - sy;
    el.style.transform = `translate(${dx}px,${dy}px)`;
    return el;
  });

  void outerWrap.offsetHeight;
  requestAnimationFrame(() => {
    outerWrap.style.transition = 'transform .4s ease-out';
    outerWrap.style.transform  = 'scale(1)';
    innerEls.forEach((el, i) => {
      const dur = i < 4 ? 0.265 : 0.13;
      el.style.transition = `transform ${dur}s ease-out`;
      el.style.transform  = 'translate(0,0)';
    });
    menuDropdown.style.transition = 'opacity .13s ease-out';
    menuDropdown.style.opacity    = '1';
  });

  setTimeout(() => {
    outerWrap.remove(); innerEls.forEach(el => el.remove());
    btns.forEach(b => { b.style.backgroundImage = ''; });
    menuDropdown.style.transition = '';
    menuDropdown.style.opacity    = '';
  }, 450);
}

function closeAllPanels() {
  allPanels.forEach(p => p.classList.remove('open'));
  bioBackdrop.classList.remove('active');
  menuDropdown.style.cssText    = '';
  menuDropdown.style.transform  = `translate(-50%, -50%) scale(${menuCenteredScale()})`;
  menuDropdown.style.opacity    = '0';
  menuDropdown.classList.add('open', 'centered');
  animateBracketsReverse();
}

bioBackdrop.addEventListener('click', e => { e.stopPropagation(); closeAllPanels(); });

const panelTriggers = [
  { btnId: 'menuSocialsBtn', panel: allPanels[0] },
  { btnId: 'menuContactBtn', panel: allPanels[1] },
];
panelTriggers.forEach(({ btnId, panel }, i) => {
  const btn = document.getElementById(btnId);
  const orig = ddBtnOriginals[i];
  let cancelBtnScramble = null;
  let cancelBtnResolve  = null;
  btn.addEventListener('click', e => openPanel(panel, e.clientX, e.clientY));
  btn.addEventListener('mouseenter', () => {
    document.body.classList.add('link-hover');
    /* don't fight with the flight scramble */
    if (cancelDdScrambles.length) return;
    cancelBtnResolve?.(); cancelBtnResolve = null;
    cancelBtnScramble?.();
    cancelBtnScramble = scrambleLoop(orig, t => { btn.textContent = t; }, 30);
  });
  btn.addEventListener('mouseleave', () => {
    document.body.classList.remove('link-hover');
    if (!cancelBtnScramble) return;
    cancelBtnScramble(); cancelBtnScramble = null;
    cancelBtnResolve = scrambleResolve(orig, t => { btn.textContent = t; }, ...settleParams(orig));
  });
});

['socialsClose', 'contactClose'].forEach(id => {
  const btn = document.getElementById(id);
  btn.addEventListener('click', e => { e.stopPropagation(); closeAllPanels(); });
  btn.addEventListener('mouseenter', () => document.body.classList.add('link-hover'));
  btn.addEventListener('mouseleave', () => document.body.classList.remove('link-hover'));
});

/* shuffle button */
btnShuffle.addEventListener('click', () => {
  shuffleOn = !shuffleOn;
  btnShuffle.classList.toggle('active', shuffleOn);
});

/* tap-to-play hint */
function showTapHint() {
  if (!('ontouchstart' in window)) return;
  if (localStorage.getItem('cpPlayHintSeen')) return;
  const hint = document.getElementById('tapHint');
  const r = btnPlay.getBoundingClientRect();
  hint.style.left = (r.left + r.width / 2) + 'px';
  hint.style.top  = (r.top  + r.height / 2) + 'px';
  hint.classList.add('show');
}
function hideTapHint() {
  document.getElementById('tapHint').classList.remove('show');
  localStorage.setItem('cpPlayHintSeen', '1');
}
setTimeout(showTapHint, 2200);

/* restore button bracket backgrounds if a tab-switch interrupted an animation
   and left backgroundImage:'none' stuck as an inline style */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    menuDropdown.querySelectorAll('button').forEach(b => {
      if (b.style.backgroundImage === 'none') b.style.backgroundImage = '';
    });
  }
});

/* hide scroll arrow once user has scrolled past the hero */
window.addEventListener('scroll', () => {
  scrollArrowEl.style.transition = 'opacity .4s ease';
  scrollArrowEl.style.opacity = window.scrollY > 80 ? '0' : '';
}, { passive: true });

/* info section scramble — apply hover-scramble after DOM ready */
const infoSection = document.getElementById('infoSection');

/* reveal info section once it scrolls into view */
{
  const infoLabelEls = Array.from(infoSection.querySelectorAll('.bio-panel-label'));
  const infoLabelOrig = infoLabelEls.map(el => el.textContent);
  let infoLoops = null;

  function revealInfo() {
    infoLoops = infoLabelEls.map((el, i) => scrambleLoop(infoLabelOrig[i], t => { el.textContent = t; }, 30));
    infoSection.classList.add('visible');
    infoSection.addEventListener('animationend', e => {
      if (e.animationName !== 'fadeUp') return;
      infoLoops.forEach(c => c()); infoLoops = null;
      infoLabelEls.forEach((el, i) => settleIn(infoLabelOrig[i], t => { el.textContent = t; }));
      infoSection.style.animation = 'none';
      infoSection.style.opacity = '1';
    }, { once: true });
  }

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) { revealInfo(); observer.disconnect(); }
  }, { threshold: 0.1 });
  observer.observe(infoSection);
}

/* auto-center to whichever section has majority viewport presence when scrolling stops */
{
  const heroEl = document.querySelector('.hero');
  let scrollTimer = null;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const vh = window.innerHeight;
      const heroRect = heroEl.getBoundingClientRect();
      const infoRect = infoSection.getBoundingClientRect();
      const mid = vh / 2;
      const heroCenterDist = Math.abs((heroRect.top + heroEl.offsetHeight / 2) - mid);
      const infoCenterDist = Math.abs((infoRect.top + infoSection.offsetHeight / 2) - mid);
      if (heroCenterDist <= infoCenterDist) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const top = window.scrollY + infoRect.top - (vh - infoSection.offsetHeight) / 2;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    }, 150);
  }, { passive: true });
}

let narrowW = 0, expandedW = 0;

function initLayout() {
  const mobile = window.innerWidth <= 768;
  if (mobile) {
    infoSection.style.width = '';
    infoSection.style.transition = 'none';
    return;
  }

  /* disable transition during measurement */
  infoSection.style.transition = 'none';
  infoSection.style.width = Math.min(window.innerWidth * 0.8, 1200) + 'px';
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

  expandedW = Math.min(maxLinkW + hPad, window.innerWidth * 0.8);
  narrowW = Math.max(280, maxLabelW + hPad + 40); /* +40 for toggle icon */

  /* set correct width for current state — no transition yet */
  const isExpanded = !!infoSection.querySelector('.info-block.open');
  infoSection.style.width = (isExpanded ? expandedW : narrowW) + 'px';
  infoSection.offsetWidth;

  /* re-enable transition — future width changes will animate */
  infoSection.style.transition = '';
}

document.fonts.ready.then(initLayout);
window.addEventListener('resize', initLayout, { passive: true });

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

/* accordion */
infoSection.querySelectorAll('.info-block-header').forEach(header => {
  header.addEventListener('click', () => {
    const block = header.closest('.info-block');
    const isOpen = block.classList.contains('open');

    /* close any open block */
    infoSection.querySelectorAll('.info-block.open').forEach(b => {
      b.classList.remove('open');
      b.querySelector('.info-block-content').style.maxHeight = '0px';
    });

    if (isOpen) {
      /* closing — reveal other blocks and narrow the box */
      showAllBlocks();
      if (window.innerWidth > 768) infoSection.style.width = narrowW + 'px';
      /* scroll to keep box centered throughout the collapse animation */
      const startTimeClose = performance.now();
      const closeFrame = () => {
        const top = window.scrollY + infoSection.getBoundingClientRect().top
                    - (window.innerHeight - infoSection.offsetHeight) / 2;
        window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
        if (performance.now() - startTimeClose < 420) requestAnimationFrame(closeFrame);
      };
      requestAnimationFrame(closeFrame);
    } else {
      /* opening — hide other blocks, expand box, open content */
      hideOtherBlocks(block);
      if (window.innerWidth > 768) infoSection.style.width = expandedW + 'px';
      const content = block.querySelector('.info-block-content');
      const textEls = Array.from(content.querySelectorAll('.bio-text, .bio-press-links a'));
      const textOrig = textEls.map(el => el.textContent);
      const loops = textEls.map((el, i) => scrambleLoop(textOrig[i], t => { el.textContent = t; }, 30));
      block.classList.add('open');
      content.style.maxHeight = content.scrollHeight + 'px';
      /* settle starts immediately, 16 steps × 20ms ≈ 417ms — matches the 400ms expand animation */
      loops.forEach(c => c());
      textEls.forEach((el, i) => scrambleResolve(textOrig[i], t => { el.textContent = t; }, 16, 20));
      /* scroll to keep box centered throughout the expand animation */
      const startTime = performance.now();
      const animFrame = () => {
        const top = window.scrollY + infoSection.getBoundingClientRect().top
                    - (window.innerHeight - infoSection.offsetHeight) / 2;
        window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
        if (performance.now() - startTime < 420) requestAnimationFrame(animFrame);
      };
      requestAnimationFrame(animFrame);
    }
  });
});

/* click outside info section to collapse open accordion */
document.addEventListener('click', e => {
  if (menuExpanded) return;
  const openBlock = infoSection.querySelector('.info-block.open');
  if (!openBlock || infoSection.contains(e.target)) return;
  openBlock.classList.remove('open');
  openBlock.querySelector('.info-block-content').style.maxHeight = '0px';
  showAllBlocks();
  if (window.innerWidth > 768) infoSection.style.width = narrowW + 'px';
});

/* apply hover-scramble to all remaining static text elements
   (info section elements are excluded — no hover scramble there) */
const infoSectionEls = new Set(infoSection.querySelectorAll('.bio-panel-label, .bio-text, .bio-press-links a'));
[
  /* panel close buttons */
  ...document.querySelectorAll('.bio-close'),
  /* panel titles + labels (excluding info section) */
  ...Array.from(document.querySelectorAll('.bio-panel-title, .bio-panel-label')).filter(el => !infoSectionEls.has(el)),
  /* bio body text (excluding info section) */
  ...Array.from(document.querySelectorAll('.bio-text')).filter(el => !infoSectionEls.has(el)),
  /* all panel links (excluding info section) */
  ...Array.from(document.querySelectorAll('.bio-press-links a')).filter(el => !infoSectionEls.has(el)),
  /* corner close button */
  document.getElementById('menuCloseBtn'),
].forEach(addScrambleHover);

/* star field + shooting stars */
const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

const sc  = document.getElementById('stars');
const ctx = sc.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 2);

const stars = Array.from({ length: isMobile ? 80 : 180 }, () => {
  const purple = Math.random() > 0.85;
  return {
    x: Math.random(), y: Math.random(),
    r: Math.random() * 1.4 + 0.2,
    speed: Math.random() * 0.00015 + 0.00003,
    base: Math.random() * 0.6 + 0.2,
    twinkle: Math.random() * Math.PI * 2,
    ts: Math.random() * 0.015 + 0.004,
    fill: purple ? 'rgb(180,140,255)' : 'rgb(200,230,255)',
  };
});

const shoots = [];

function resizeSC() {
  sc.width  = innerWidth  * dpr;
  sc.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
}
resizeSC();
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resizeSC, 150); });

(function drawStars() {
  /* cursor ring spring — skip on mobile (ring is hidden) */
  if (!isMobile) {
    rx += (mx - rx) * .25; ry += (my - ry) * .25;
    ring.style.transform = `translate(${rx}px,${ry}px)`;
  }

  const W = innerWidth, H = innerHeight;
  ctx.clearRect(0, 0, W, H);

  /* stars — alpha bucket batching (180 draws → ~20-30) */
  const buckets = new Map();
  stars.forEach(s => {
    s.twinkle += s.ts;
    s.y -= s.speed;
    if (s.y < 0) { s.y = 1; s.x = Math.random(); }
    const alpha = Math.round(s.base * (0.5 + 0.5 * Math.sin(s.twinkle)) * 20) / 20;
    const key = s.fill + alpha;
    let b = buckets.get(key);
    if (!b) { b = { alpha, fill: s.fill, list: [] }; buckets.set(key, b); }
    b.list.push(s);
  });
  for (const { alpha, fill, list } of buckets.values()) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    list.forEach(s => {
      ctx.moveTo(s.x * W + s.r, s.y * H);
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
    });
    ctx.fill();
  }

  /* sync grain to draw loop — skip on mobile (grain hidden, SVG re-render is expensive) */
  if (!isMobile && ++grainFrame % 6 === 0)
    turbEl.setAttribute('seed', (noiseSeed = (noiseSeed + 1) % 200));

  /* shooting stars — skip on mobile */
  if (!isMobile && Math.random() < 0.004) {
    shoots.push({
      x: Math.random() * W * 0.8,
      y: Math.random() * H * 0.3,
      len: Math.random() * 90 + 60,
      spd: Math.random() * 9 + 7,
      ang: Math.PI / 4 + (Math.random() - 0.5) * 0.25,
      life: 1,
    });
  }
  for (let i = shoots.length - 1; i >= 0; i--) {
    const s = shoots[i];
    s.x   += Math.cos(s.ang) * s.spd;
    s.y   += Math.sin(s.ang) * s.spd;
    s.life -= 0.025;
    if (s.life <= 0 || s.x > W || s.y > H) { shoots.splice(i, 1); continue; }
    ctx.globalAlpha = s.life;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - Math.cos(s.ang) * s.len, s.y - Math.sin(s.ang) * s.len);
    ctx.strokeStyle = 'rgb(220,240,255)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  requestAnimationFrame(drawStars);
})();
