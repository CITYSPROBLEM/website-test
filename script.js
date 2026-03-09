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
/* scramble immediately, then begin settling early enough that the settle
   finishes at exactly targetMs from now — use for animations with a known duration */
function scrambleThenSettleAt(text, setText, targetMs) {
  const stepMs   = 25;
  const steps    = Math.max(4, Math.min(Math.floor(targetMs / stepMs), text.replace(/ /g, '').length));
  const startAt  = Math.max(0, targetMs - steps * stepMs);
  let cancelLoop = scrambleLoop(text, setText, 30);
  let cancelSettle = null;
  const timer = setTimeout(() => {
    cancelLoop?.(); cancelLoop = null;
    cancelSettle = scrambleResolve(text, setText, steps, stepMs);
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
let menuOpenScrollY = 0;
let menuReturnScrollY = 0;
let menuJustClosed = false;
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

/* scroll arrow positioning */
const playerEl      = document.getElementById('player');
const scrollArrowEl = document.querySelector('.scroll-arrow');
function positionScrollArrow() {
  const h1Bottom  = h1El.getBoundingClientRect().bottom;
  const playerTop = playerEl.getBoundingClientRect().top;
  scrollArrowEl.style.top = ((h1Bottom + playerTop) / 2 - 7) + 'px';
}
document.fonts.ready.then(positionScrollArrow);
window.addEventListener('resize', positionScrollArrow);

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
  audio.src = tracks[trackIdx].url;
  const title = tracks[trackIdx].title;
  playerTrack.classList.remove('scrolling');
  scrambleResolve(title, t => { playerTrack.textContent = t; }, 16, 25, () => {
    updateMarquee();
  });
  playerCounter.textContent = `${trackIdx + 1} / ${tracks.length}`;
  if (!audio.paused) audio.play();
}

function setPlaying(v) {
  btnPlay.textContent = v ? '' : '▶\uFE0E';
  btnPlay.classList.toggle('playing', v);
}

if (tracks.length) loadTrack(0);
else playerTrack.textContent = '—';

btnPlay.addEventListener('click', () => {
  if (!tracks.length) return;
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

/* sync player width to h1 */
function syncPlayerWidth() {
  const w = window.innerWidth <= 768
    ? playerEl.offsetWidth
    : h1El.offsetWidth;
  playerEl.style.setProperty('--player-content-w', w + 'px');
  document.documentElement.style.setProperty('--player-h', playerEl.offsetHeight + 'px');
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

  window.drawVisualizer = function() {
    const W = vizCanvas.clientWidth, H = vizCanvas.clientHeight;
    vizCtx.clearRect(0, 0, W, H);
    if (!analyser || audio.paused) return;
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
  menuOpenScrollY = window.scrollY;

  /* capture scroll return target now, before any browser viewport adjustment */
  {
    const _hero = document.querySelector('.hero');
    const _vh   = window.innerHeight, _mid = _vh / 2;
    const _hr   = _hero.getBoundingClientRect();
    const _ir   = infoSection.getBoundingClientRect();
    const _hd   = Math.abs((_hr.top + _hero.offsetHeight / 2) - _mid);
    const _id   = Math.abs((_ir.top + infoSection.offsetHeight / 2) - _mid);
    menuReturnScrollY = (_id < _hd)
      ? Math.max(0, window.scrollY + _ir.top - (_vh - infoSection.offsetHeight) / 2)
      : 0;
  }

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
  cancelFlyer = scrambleThenSettleAt(h1Orig, t => { topbarFlyer.textContent = t; }, 450);

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
    /* flyer already settled — hand off directly, no further resolve needed */
    topbarTitle.textContent         = h1Orig;
    topbarTitle.style.opacity       = '1';
    topbarTitle.style.pointerEvents = 'auto';
    topbarFlyer.style.transition    = 'none';
    topbarFlyer.style.opacity       = '0';
    topbarFlyer.style.transform     = 'translateX(-50%) translateY(-50%)';
    topbarFlyer.style.letterSpacing = '';
    cancelTitleResolve = null;
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
  const _btns = menuDropdown.querySelectorAll('button');
  cancelDdScrambles = ddBtnOriginals.map((orig, i) =>
    scrambleThenSettleAt(orig, t => { _btns[i].textContent = t; }, 300)
  );
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      menuDropdown.style.transition = 'opacity .3s ease';
      menuDropdown.style.opacity    = '1';
    });
  });
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
  cancelFlyer = scrambleThenSettleAt(h1Orig, t => { topbarFlyer.textContent = t; }, 400);

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
    /* flyer already settled — hand off directly, no further resolve needed */
    h1El.textContent = h1Orig;
    topbarFlyer.style.transition    = 'none';
    topbarFlyer.style.opacity       = '0';
    topbarFlyer.style.transform     = 'translateX(-50%) translateY(-50%)';
    topbarFlyer.style.letterSpacing = '';
    h1El.style.pointerEvents = '';
    h1El.style.opacity       = '1';
    h1El.style.animation     = 'glowFadeIn .9s ease forwards';
    cancelH1 = null;
    applyH1Centering();
  }, 420);

  /* restore info section */
  const infoEl = document.getElementById('infoSection');
  if (infoEl) {
    infoEl.style.transition    = 'opacity .4s ease .2s';
    infoEl.style.opacity       = infoEl.classList.contains('visible') ? '1' : '0';
    infoEl.style.pointerEvents = '';
    setTimeout(() => { infoEl.style.transition = ''; }, 650);
  }

  /* return to the scroll position captured at menu-open time */
  menuJustClosed = true;
  window.scrollTo({ top: menuReturnScrollY, behavior: 'smooth' });
  setTimeout(() => { menuJustClosed = false; }, 900);

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
  els.forEach((el, i) => scrambleThenSettleAt(texts[i], t => { el.textContent = t; }, 350));
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
const MAIN_BLOCK_SELECTOR   = '.info-block:not(.connect-block)';
const MAIN_HEADER_SELECTOR  = `${MAIN_BLOCK_SELECTOR} .info-block-header`;
const MAIN_OPEN_SELECTOR    = `${MAIN_BLOCK_SELECTOR}.open`;
const MAIN_LINK_SELECTOR    = `${MAIN_BLOCK_SELECTOR} .bio-press-links a`;
const MAIN_LABEL_SELECTOR   = `${MAIN_BLOCK_SELECTOR} .bio-panel-label`;
function getMainHeaders() { return Array.from(infoSection.querySelectorAll(MAIN_HEADER_SELECTOR)); }
function getMainOpenBlocks() { return Array.from(infoSection.querySelectorAll(MAIN_OPEN_SELECTOR)); }
function getMainOpenBlock() { return infoSection.querySelector(MAIN_OPEN_SELECTOR); }
function getMainLinks() { return Array.from(infoSection.querySelectorAll(MAIN_LINK_SELECTOR)); }
function getMainLabels() { return Array.from(infoSection.querySelectorAll(MAIN_LABEL_SELECTOR)); }

/* reveal info section once it scrolls into view */
{
  const infoLabelEls = Array.from(infoSection.querySelectorAll('.bio-panel-label'));
  const infoLabelOrig = infoLabelEls.map(el => el.textContent);
  let infoLoops = null;

  function revealInfo() {
    infoLoops = infoLabelEls.map((el, i) => scrambleLoop(infoLabelOrig[i], t => { el.textContent = t; }, 30));
    infoSection.classList.add('visible');

    let settled = false;
    function onFadeUpEnd() {
      if (settled) return;
      settled = true;
      infoLoops.forEach(c => c()); infoLoops = null;
      infoLabelEls.forEach((el, i) => settleIn(infoLabelOrig[i], t => { el.textContent = t; }));
      infoSection.style.animation = 'none';
      infoSection.style.opacity = '1';
    }

    /* primary: animationend — but don't use { once: true } so a bubbling child
       animation doesn't consume the listener before fadeUp fires */
    function onAnimEnd(e) {
      if (e.target !== infoSection || e.animationName !== 'fadeUp') return;
      infoSection.removeEventListener('animationend', onAnimEnd);
      onFadeUpEnd();
    }
    infoSection.addEventListener('animationend', onAnimEnd);

    /* fallback: if animationend never fires (animation blocked on some browsers),
       guarantee the section becomes visible after the animation duration */
    setTimeout(onFadeUpEnd, 1000);
  }

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) { revealInfo(); observer.disconnect(); }
  }, { threshold: 0 });
  observer.observe(infoSection);
}

/* auto-center removed — multiple sections now, free scroll */

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
  infoSection.style.width = Math.min(window.innerWidth * 0.9, 1400) + 'px';
  infoSection.offsetWidth; /* force reflow */

  /* equalize link widths at full measure width */
  const links = getMainLinks();
  links.forEach(a => { a.style.width = 'auto'; });
  infoSection.offsetWidth;
  const maxLinkW = links.reduce((m, a) => Math.max(m, a.offsetWidth), 0);
  if (maxLinkW > 0) links.forEach(a => { a.style.width = maxLinkW + 'px'; });

  /* measure label widths for narrow (collapsed) state */
  const labels = getMainLabels();
  const maxLabelW = labels.reduce((m, el) => Math.max(m, el.offsetWidth), 0);
  const hPad = parseFloat(getComputedStyle(infoSection).paddingLeft) * 2;

  expandedW = Math.min(maxLinkW + hPad, window.innerWidth * 0.9);
  narrowW = Math.max(280, maxLabelW + hPad + 40); /* +40 for toggle icon */

  /* set correct width for current state — no transition yet */
  const isExpanded = !!getMainOpenBlock();
  infoSection.style.width = (isExpanded ? expandedW : narrowW) + 'px';
  infoSection.offsetWidth;

  /* re-enable transition — future width changes will animate */
  infoSection.style.transition = '';
}

document.fonts.ready.then(initLayout);
window.addEventListener('resize', initLayout, { passive: true });

/* hide all blocks except the given one with a smooth height+opacity collapse */
function hideOtherBlocks(openBlock) {
  Array.from(infoSection.querySelectorAll(MAIN_BLOCK_SELECTOR))
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
  Array.from(infoSection.querySelectorAll(MAIN_BLOCK_SELECTOR)).forEach(b => {
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

/* animate scroll to targetY over duration ms using the same easing as the CSS transitions */
function animateScrollTo(targetY, duration) {
  const startY = window.scrollY;
  const dist   = Math.max(0, targetY) - startY;
  if (Math.abs(dist) < 1) return;
  const t0 = performance.now();
  /* ease-in-out — matches cubic-bezier(0.4, 0, 0.2, 1) closely */
  function ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
  (function frame(now) {
    const t = Math.min((now - t0) / duration, 1);
    window.scrollTo({ top: startY + dist * ease(t), behavior: 'instant' });
    if (t < 1) requestAnimationFrame(frame);
  })(t0);
}

/* return the vertical scroll position that centers the info section at a given height */
function infoScrollCenter(finalH) {
  const cs  = getComputedStyle(infoSection);
  const pad = parseFloat(cs.paddingTop)    + parseFloat(cs.paddingBottom)
            + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  const totalH = finalH + pad;
  return Math.max(0, window.scrollY + infoSection.getBoundingClientRect().top
                 - (window.innerHeight - totalH) / 2);
}

/* accordion */
infoSection.querySelectorAll(MAIN_HEADER_SELECTOR).forEach(header => {
  header.addEventListener('click', () => {
    const block  = header.closest('.info-block');
    const isOpen = block.classList.contains('open');

    /* close any open block */
    getMainOpenBlocks().forEach(b => {
      b.classList.remove('open');
      b.querySelector('.info-block-content').style.maxHeight = '0px';
      resetLabelGroups(b);
    });

    if (isOpen) {
      /* closing — compute final height, apply changes, then read fresh scrollY for centering */
      const allHeaders = getMainHeaders();
      const finalH = allHeaders.reduce((s, h) => s + h.offsetHeight, 0);

      showAllBlocks();
      if (window.innerWidth > 768) infoSection.style.width = narrowW + 'px';
      /* force reflow so scroll anchoring settles before we read scrollY */
      infoSection.offsetHeight;
      animateScrollTo(infoScrollCenter(finalH), 400);
    } else {
      /* opening — apply all changes first, then measure finalH at the expanded width */
      const content = block.querySelector('.info-block-content');

      hideOtherBlocks(block);
      if (window.innerWidth > 768) infoSection.style.width = expandedW + 'px';
      block.classList.add('open');
      /* reading scrollHeight here forces reflow at the new width — used for both maxHeight and finalH */
      content.style.maxHeight = content.scrollHeight + 'px';
      const finalH = block.querySelector('.info-block-header').offsetHeight + parseFloat(content.style.maxHeight);
      animateScrollTo(infoScrollCenter(finalH), 400);

      /* scramble-settle the revealed text */
      const textEls  = Array.from(content.querySelectorAll('.bio-text, .bio-press-links a, .label-btn'));
      const textOrig = textEls.map(el => el.textContent);
      const loops    = textEls.map((el, i) => scrambleLoop(textOrig[i], t => { el.textContent = t; }, 30));
      loops.forEach(c => c());
      textEls.forEach((el, i) => scrambleResolve(textOrig[i], t => { el.textContent = t; }, 16, 20));
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
    const block         = group.closest('.info-block');
    const parentContent = group.closest('.info-block-content');
    const headerH       = block.querySelector('.info-block-header').offsetHeight;

    if (isOpen) {
      /* close: restore all other groups and collapse songs */
      group.classList.remove('open');
      songs.style.maxHeight = '0';
      songs.style.opacity   = '0';
      showAllLabelGroups();
      /* read final content height now (reflow reflects all changes) then center immediately */
      const finalContentH = parentContent.scrollHeight;
      animateScrollTo(infoScrollCenter(headerH + finalContentH), 400);
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
      hideLabelGroups(group);
      /* read final content height now (reflow reflects all changes) then center immediately */
      const finalContentH = parentContent.scrollHeight;
      /* safe to set parent max-height to exact final value — content never exceeds it mid-transition */
      if (parentContent.style.maxHeight && parentContent.style.maxHeight !== '0px')
        parentContent.style.maxHeight = finalContentH + 'px';
      animateScrollTo(infoScrollCenter(headerH + finalContentH), 400);
      /* scramble-settle song links as they slide in */
      Array.from(songs.querySelectorAll('a')).forEach(a => {
        const text = a.textContent;
        scrambleThenSettleAt(text, t => { a.textContent = t; }, 300);
      });
    }
  });

  btn.addEventListener('mouseenter', () => document.body.classList.add('link-hover'));
  btn.addEventListener('mouseleave', () => document.body.classList.remove('link-hover'));
});

/* click outside info section to collapse open accordion */
document.addEventListener('click', e => {
  if (menuExpanded) return;
  const openBlock = getMainOpenBlock();
  if (!openBlock || infoSection.contains(e.target)) return;

  const allHeaders = getMainHeaders();
  const finalH  = allHeaders.reduce((s, h) => s + h.offsetHeight, 0);
  const targetY = infoScrollCenter(finalH);

  openBlock.classList.remove('open');
  openBlock.querySelector('.info-block-content').style.maxHeight = '0px';
  resetLabelGroups(openBlock);
  showAllBlocks();
  if (window.innerWidth > 768) infoSection.style.width = narrowW + 'px';
  animateScrollTo(targetY, 400);
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

/* ── generic section reveal with scramble-settle ───────────────── */
function initSectionReveal(sectionId, textSelector) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const textEls = Array.from(section.querySelectorAll(textSelector));
  const textOrig = textEls.map(el => el.textContent);

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      const loops = textEls.map((el, i) => scrambleLoop(textOrig[i], t => { el.textContent = t; }, 30));
      section.classList.add('visible');

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
  const obs = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) { t.classList.add('visible'); obs.disconnect(); }
  }, { threshold: 0 });
  obs.observe(t);
});

/* reveal new sections */
initSectionReveal('featuredRelease', '.section-label, .featured-title, .featured-meta');
initSectionReveal('releasesSection', '.section-label, .release-card-title, .release-card-meta');
initSectionReveal('datesSection', '.section-label, .dates-empty, .date-date, .date-venue');
initSectionReveal('pastShowsSection', '.section-label');

/* hover-scramble for new static text elements */
document.querySelectorAll(
  '.featured-title, .featured-meta, .featured-link, .release-card-title, .release-card-meta, .dates-empty, .date-date, .date-venue'
).forEach(addScrambleHover);
document.querySelectorAll('.section-label').forEach(addScrambleHover);

/* past shows year accordion */
document.querySelectorAll('.past-shows-year').forEach(group => {
  const btn   = group.querySelector('.past-shows-year-btn');
  const list  = group.querySelector('.past-shows-list');

  btn.addEventListener('click', () => {
    const isOpen = group.classList.contains('open');
    if (isOpen) {
      group.classList.remove('open');
      list.style.maxHeight = '0';
      list.style.opacity   = '0';
    } else {
      group.classList.add('open');
      list.style.maxHeight = list.scrollHeight + 'px';
      list.style.opacity   = '1';
      /* scramble-settle the revealed rows */
      Array.from(list.querySelectorAll('.date-date, .date-venue')).forEach(el => {
        const text = el.textContent;
        scrambleThenSettleAt(text, t => { el.textContent = t; }, 300);
      });
    }
  });

  btn.addEventListener('mouseenter', () => document.body.classList.add('link-hover'));
  btn.addEventListener('mouseleave', () => document.body.classList.remove('link-hover'));
});
/* hover-scramble for past shows elements */
document.querySelectorAll('.past-shows-year-btn').forEach(addScrambleHover);
document.querySelectorAll('.past-shows-list .date-date, .past-shows-list .date-venue').forEach(addScrambleHover);

/* cursor hover for new interactive elements */
document.querySelectorAll('.release-card, .glitch-wrap, .featured-link').forEach(el => {
  el.addEventListener('mouseenter', () => document.body.classList.add('link-hover'));
  el.addEventListener('mouseleave', () => document.body.classList.remove('link-hover'));
});

/* cursor ring spring + grain sync loop */
const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

(function tick() {
  if (!isMobile) {
    rx += (mx - rx) * .25; ry += (my - ry) * .25;
    ring.style.transform = `translate(${rx}px,${ry}px)`;
    if (++grainFrame % 6 === 0)
      turbEl.setAttribute('seed', (noiseSeed = (noiseSeed + 1) % 200));
    drawVisualizer();
  }
  requestAnimationFrame(tick);
})();
