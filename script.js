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

function nonSpaceCharCount(text) {
  return text.replace(/ /g, '').length;
}

function scramblePlan(original, maxChars = Infinity) {
  const eligible = [];
  original.split('').forEach((c, i) => {
    if (c !== ' ') eligible.push(i);
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

function scrambleLoop(original, setText, stepMs = 25, maxChars = Infinity) {
  const plan = scramblePlan(original, maxChars);
  let rafId, last = 0;
  function frame(ts) {
    if (ts - last >= stepMs) {
      last = ts;
      setText(original.split('').map((c, i) =>
        c === ' ' || !plan.ranks.has(i) ? c : randGlyph(c)
      ).join(''));
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}

function scrambleResolve(original, setText, steps = 16, stepMs = 25, onComplete, maxChars = Infinity) {
  const plan = scramblePlan(original, maxChars);
  let step = 0, last = 0, rafId;
  /* starts at stepMs (full speed), slows quadratically to ~2× at the last step */
  function stepDelay(s) { return stepMs * (1 + Math.pow(s / steps, 2)); }
  function frame(ts) {
    if (ts - last >= stepDelay(step)) {
      last = ts;
      const resolvedCount = Math.floor((step / steps) * plan.count);
      setText(original.split('').map((c, i) => {
        if (c === ' ') return ' ';
        if (!plan.ranks.has(i) || plan.ranks.get(i) < resolvedCount) return c;
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
let h1FadeUpDone = false;

function h1Settle() {
  if (h1FadeUpDone) return;
  h1FadeUpDone = true;
  cancelH1?.(); cancelH1 = null;
  h1El.style.opacity = '1';
  cancelH1 = settleIn(h1Orig, t => { h1El.textContent = t; applyH1Centering(); });
}

setTimeout(() => {
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
const topbarEl = document.querySelector('.topbar');
const mainEl = document.querySelector('main');
const pastShowsSection = document.getElementById('pastShowsSection');
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
  syncCenterScrollSpacer();
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

/* hide scroll arrow once user has scrolled past the hero */
window.addEventListener('scroll', () => {
  scrollArrowEl.style.transition = 'opacity .4s ease';
  scrollArrowEl.style.opacity = window.scrollY > 80 ? '0' : '';
}, { passive: true });

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
window.addEventListener('resize', initLayout, { passive: true });
window.addEventListener('resize', syncCenterScrollSpacer, { passive: true });

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
      const loops    = textEls.map((el, i) => scrambleLoop(textOrig[i], t => { el.textContent = t; }, 30, accordionScrambleLimit(textOrig[i])));
      loops.forEach(c => c());
      textEls.forEach((el, i) => scrambleResolve(textOrig[i], t => { el.textContent = t; }, 16, 20, null, accordionScrambleLimit(textOrig[i])));
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
      hideLabelGroups(group);
      const finalContentH = parentContent.scrollHeight;
      if (parentContent.style.maxHeight && parentContent.style.maxHeight !== '0px')
        parentContent.style.maxHeight = finalContentH + 'px';
      followSectionCenter(infoSection, 400);
      /* scramble-settle song links as they slide in */
      Array.from(songs.querySelectorAll('a')).forEach(a => {
        const text = a.textContent;
        scrambleThenSettleAt(text, t => { a.textContent = t; }, 300, accordionScrambleLimit(text));
      });
    }
  });

  btn.addEventListener('mouseenter', () => document.body.classList.add('link-hover'));
  btn.addEventListener('mouseleave', () => document.body.classList.remove('link-hover'));
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
  /* panel close buttons */
  ...document.querySelectorAll('.bio-close'),
  /* panel titles + labels (excluding info section) */
  ...Array.from(document.querySelectorAll('.bio-panel-title, .bio-panel-label')).filter(el => !infoSectionEls.has(el)),
  /* bio body text (excluding info section) */
  ...Array.from(document.querySelectorAll('.bio-text')).filter(el => !infoSectionEls.has(el)),
  /* all panel links (excluding info section) */
  ...Array.from(document.querySelectorAll('.bio-press-links a')).filter(el => !infoSectionEls.has(el)),
  /* corner close button */
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
      /* scramble-settle the revealed rows */
      Array.from(list.querySelectorAll('.date-date, .date-venue')).forEach(el => {
        const text = el.textContent;
        scrambleThenSettleAt(text, t => { el.textContent = t; }, 300, accordionScrambleLimit(text));
      });
    }
  });

  backBtn.addEventListener('click', () => {
    resetPastShowsAccordion();
  });

  btn.addEventListener('mouseenter', () => document.body.classList.add('link-hover'));
  btn.addEventListener('mouseleave', () => document.body.classList.remove('link-hover'));
  backBtn.addEventListener('mouseenter', () => document.body.classList.add('link-hover'));
  backBtn.addEventListener('mouseleave', () => document.body.classList.remove('link-hover'));
});
/* hover-scramble for past shows elements */
document.querySelectorAll('.past-shows-year-btn').forEach(addScrambleHover);
document.querySelectorAll('.past-shows-back-btn').forEach(addScrambleHover);
document.querySelectorAll('.past-shows-list .date-date, .past-shows-list .date-venue').forEach(addScrambleHover);

document.addEventListener('click', e => {
  const openGroup = pastShowsSection.querySelector('.past-shows-year.open');
  if (!openGroup || pastShowsSection.contains(e.target)) return;
  resetPastShowsAccordion(false);
});

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
    window.drawVisualizer();
  }
  requestAnimationFrame(tick);
})();
