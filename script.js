/* page load fade-in — swap loading→ready so content transitions in smoothly */
function ensureCursorLockStyle() {
  let styleEl = document.getElementById('cursor-lock-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'cursor-lock-style';
    styleEl.textContent = [
      '*, *::before, *::after { cursor: none !important; }',
      'html, body, a, button, input, textarea, select, [contenteditable] {',
      '  cursor: none !important;',
      '  caret-color: transparent !important;',
      '}'
    ].join('\n');
    document.head.appendChild(styleEl);
  }
}

function forceHideCursorNow() {
  ensureCursorLockStyle();
  document.documentElement.style.setProperty('cursor', 'none', 'important');
  if (document.body) document.body.style.setProperty('cursor', 'none', 'important');
}
forceHideCursorNow();
window.addEventListener('pageshow', forceHideCursorNow);
window.addEventListener('focus', forceHideCursorNow);
window.addEventListener('mousemove', forceHideCursorNow, { passive: true });
document.addEventListener('visibilitychange', forceHideCursorNow);
document.addEventListener('pointerdown', forceHideCursorNow, true);
document.addEventListener('mousedown', forceHideCursorNow, true);
document.addEventListener('touchstart', forceHideCursorNow, { passive: true, capture: true });

const animDebugEnabled = new URLSearchParams(window.location.search).get('animdebug') === '1';
let animDebugOverlay = null;
let animDebugLines = [];

function initAnimDebugOverlay() {
  if (!animDebugEnabled || animDebugOverlay) return;
  const overlay = document.createElement('div');
  overlay.id = 'animDebugOverlay';
  overlay.style.cssText = [
    'position:fixed',
    'right:12px',
    'bottom:12px',
    'z-index:99999',
    'max-width:min(92vw,540px)',
    'max-height:42vh',
    'overflow:auto',
    'padding:10px 12px',
    'border:1px solid rgba(0,212,255,.45)',
    'background:rgba(3,10,20,.86)',
    'color:#bfefff',
    'font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    'letter-spacing:.01em',
    'backdrop-filter:blur(4px)',
    'pointer-events:none'
  ].join(';');
  document.body.appendChild(overlay);
  animDebugOverlay = overlay;
  animDebugLog('animdebug enabled');
}

function animDebugLog(message) {
  if (!animDebugEnabled) return;
  if (!animDebugOverlay) initAnimDebugOverlay();
  const t = new Date().toLocaleTimeString();
  animDebugLines.push(`${t}  ${message}`);
  if (animDebugLines.length > 16) animDebugLines = animDebugLines.slice(-16);
  if (animDebugOverlay) animDebugOverlay.textContent = animDebugLines.join('\n');
}

document.addEventListener('DOMContentLoaded', initAnimDebugOverlay, { once: true });

let softNavInFlight = false;

function samePath(urlA, urlB) {
  try {
    const a = new URL(urlA, window.location.href);
    const b = new URL(urlB, window.location.href);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

function setActiveTopbarLink(url) {
  const target = new URL(url, window.location.href);
  document.querySelectorAll('.topbar-nav-link').forEach(link => {
    const isActive = samePath(link.href, target.href);
    link.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function syncNavPlacement() {
  const navEl = document.querySelector('.topbar .topbar-nav') || document.querySelector('.topbar-nav:not(.hero-nav-clone)');
  if (!navEl) return;
  const topbarEl = document.querySelector('.topbar');
  const heroEl = document.querySelector('.hero');
  const isHomePage = !document.documentElement.classList.contains('page-subpage');
  const existingClone = document.querySelector('.topbar-nav.hero-nav-clone');

  if (existingClone) existingClone.remove();
  if (topbarEl && !topbarEl.contains(navEl)) topbarEl.appendChild(navEl);
  navEl.classList.remove('hero-nav-unit');
  navEl.style.animation = '';
  navEl.style.opacity = '';
  delete navEl.dataset.homeNavAnimated;

  /* home page: nav lives under CITYSPROBLEM hero title, not in topbar */
  if (isHomePage && heroEl) {
    if (!heroEl.contains(navEl)) heroEl.appendChild(navEl);
    navEl.classList.add('hero-nav-unit');
    navEl.classList.remove('topbar-nav-hidden');
    if (!navEl.dataset.homeNavAnimated) {
      navEl.dataset.homeNavAnimated = '1';
      navEl.style.opacity = '0';
      navEl.style.animation = isCoarsePointer
        ? 'fadeUp .9s .2s ease forwards'
        : 'fadeUpHeroNav .9s .2s ease forwards';
      animDebugLog('hero-nav under hero');
    }
    return;
  }

  /* subpages: nav visible in topbar */
  navEl.classList.remove('topbar-nav-hidden');
}

function forceRevealMain(mainEl) {
  if (!mainEl) return;
  mainEl.hidden = false;
  mainEl.style.opacity = '1';
  mainEl.style.visibility = 'visible';
  mainEl.style.display = '';
}

async function softNavigate(url, replace = false, force = false) {
  const target = new URL(url, window.location.href);
  if (!force && samePath(window.location.href, target.href)) return;
  if (softNavInFlight) return;
  softNavInFlight = true;
  forceHideCursorNow();
  try {
    const res = await fetch(target.href, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const newMain = parsed.querySelector('main');
    const curMain = document.querySelector('main');
    if (!newMain || !curMain) throw new Error('Missing main element');

    const keepClasses = new Set(
      Array.from(document.documentElement.classList).filter(c =>
        c.startsWith('is-') ||
        c.startsWith('skip-') ||
        c.startsWith('mobile-') ||
        c.startsWith('browser-js-') ||
        c === 'low-memory-mobile'
      )
    );
    const incoming = parsed.documentElement.className.split(/\s+/).filter(Boolean);
    incoming.forEach(c => keepClasses.add(c));
    /* soft-nav should never leave the app in initial-load hidden state */
    keepClasses.delete('page-loading');
    keepClasses.add('page-ready');
    document.documentElement.className = Array.from(keepClasses).join(' ');
    const incomingPageKey = parsed.documentElement.dataset.pageKey || '';
    if (incomingPageKey) document.documentElement.dataset.pageKey = incomingPageKey;
    else delete document.documentElement.dataset.pageKey;
    /* rescue persistent elements that may have been moved inside <main> */
    const navEl = curMain.querySelector('.topbar-nav');
    if (navEl) {
      navEl.classList.remove('hero-nav-unit');
      document.querySelector('.topbar')?.appendChild(navEl);
    }
    curMain.replaceWith(newMain);
    window.applyPageSections?.(document);
    window.applyPageInfo?.();
    syncNavPlacement();
    /* fade in new content — force reflow so Safari sees the opacity:0 frame */
    newMain.style.opacity = '0';
    newMain.style.transition = 'none';
    newMain.style.visibility = 'visible';
    newMain.style.display = '';
    newMain.hidden = false;
    void newMain.offsetHeight;          /* flush layout */
    newMain.style.transition = 'opacity .5s ease';
    newMain.style.opacity = '1';
    if (replace) history.replaceState({}, '', target.href);
    else history.pushState({}, '', target.href);
    setActiveTopbarLink(target.href);
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('softnav:complete', { detail: { url: target.href } }));
  } catch {
    if (replace) window.location.replace(target.href);
    else window.location.href = target.href;
  } finally {
    softNavInFlight = false;
  }
}

document.addEventListener('click', e => {
  if (e.defaultPrevented) return;
  if (e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (!(e.target instanceof Element)) return;
  const link = e.target.closest('.topbar-nav-link[href]');
  if (!link) return;
  e.preventDefault();
  softNavigate(link.href);
}, true);

window.addEventListener('popstate', () => {
  softNavigate(window.location.href, true, true);
});

const pageReady = new Promise(resolve => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('page-loading');
      document.documentElement.classList.add('page-ready');
      resolve();
    });
  });
});

/* splash screen — only shows once per session */
const splashReady = (function() {
  const splash = document.getElementById('splash');
  if (!splash) return pageReady;
  if (sessionStorage.getItem('splashDismissed')) {
    splash.remove();
    return pageReady;
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
const browser = document.documentElement.dataset.browser || 'other';
const isSafari = browser === 'safari';
const isChrome = browser === 'chrome';
const isFirefox = browser === 'firefox';
const isMobileViewport = isCoarsePointer || window.innerWidth <= 768;
const enableHeavyPointerFx = !isCoarsePointer && (isChrome || isSafari);
const enableAnimatedGrain = isChrome || isSafari;
const visualizerFrameStride = isMobileViewport ? (isFirefox ? 8 : 7) : (isFirefox ? 4 : 3);
const grainFrameStride = isMobileViewport ? 18 : 10;
const LINK_HOVER_SELECTOR = 'a, button, .topbar-logo, .player-progress, .player-vol-slider, .player-track-name, .glitch-wrap, .release-card, .featured-link';
const scheduleNonCritical = window.requestIdleCallback
  ? fn => window.requestIdleCallback(fn, { timeout: 1200 })
  : fn => setTimeout(fn, 220);
let mx = 0, my = 0, rx = 0, ry = 0;
let cursorDirty = false;

if (isMobileViewport) {
  cur?.remove();
  ring?.remove();
}

/* fallback for mobile browsers that report non-coarse pointers */
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  cur?.remove();
  ring?.remove();
}

if (!isCoarsePointer) {
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    cursorDirty = true;
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
  const goHome = () => { softNavigate('index.html'); };
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
const SCRAMBLE_SETTLE_MS = 500;
const SCRAMBLE_TICK_MS = 30;
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
  return scrambleResolveForMs(original, setText, Math.max(1, steps * stepMs), onComplete, maxChars);
}

function scrambleResolveForMs(original, setText, durationMs = SCRAMBLE_SETTLE_MS, onComplete, maxChars = Infinity) {
  const plan = scramblePlan(original, maxChars);
  const originalLen = original.length;
  const safeDuration = Math.max(1, durationMs);
  const start = performance.now();
  let lastTick = 0;
  let rafId = 0;
  function frame(ts) {
    if (ts - lastTick < SCRAMBLE_TICK_MS) {
      rafId = requestAnimationFrame(frame);
      return;
    }
    lastTick = ts;
    const progress = Math.min(1, (ts - start) / safeDuration);
    const resolvedCount = Math.floor(progress * plan.count);
    setText(fixedLen(original.split('').map((c, i) => {
      if (c === ' ') return ' ';
      if (!plan.ranks.has(i) || plan.ranks.get(i) < resolvedCount) return c;
      return randGlyph(c);
    }).join(''), originalLen));
    if (progress >= 1) { setText(original); onComplete?.(); return; }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}

/* fixed global settle timing for all scramble resolutions */
function settleParams(text) {
  return [Math.max(1, Math.round(SCRAMBLE_SETTLE_MS / 25)), 25];
}

/* resolve text that is already actively scrambling — call after stopping a
   scrambleLoop that ran during an entry animation (page load, panel slide-in, etc.).
   Same 25 ms/step speed as settleParams; capped at 20 steps so long paragraphs
   don't drag on appear.  Do NOT call this without a prior scrambleLoop running,
   or the text will start scrambled for one frame before resolving. */
/* scramble immediately, then begin settling early enough that the settle
   finishes at exactly targetMs from now — use for animations with a known duration */
function scrambleThenSettleAt(text, setText, targetMs, maxChars = Infinity) {
  const settleMs = Math.max(1, Math.min(SCRAMBLE_SETTLE_MS, targetMs));
  const startAt  = Math.max(0, targetMs - settleMs);
  let cancelLoop = scrambleLoop(text, setText, 30, maxChars);
  let cancelSettle = null;
  const timer = setTimeout(() => {
    cancelLoop?.(); cancelLoop = null;
    cancelSettle = scrambleResolveForMs(text, setText, settleMs, null, maxChars);
  }, startAt);
  return function cancel() {
    clearTimeout(timer);
    cancelLoop?.(); cancelLoop = null;
    cancelSettle?.(); cancelSettle = null;
  };
}

function settleIn(text, setText, onComplete) {
  return scrambleResolveForMs(text, setText, SCRAMBLE_SETTLE_MS, onComplete);
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
    cancelResolve = scrambleResolveForMs(orig, t => { el.textContent = t; }, SCRAMBLE_SETTLE_MS, () => {
      unlockWidth?.(); unlockWidth = null;
    });
  });
}

/* ── AbortController for page-content listeners (cleaned up on soft-nav) ── */
let _pageContentAbort = new AbortController();

/* h1 scramble + chromatic aberration */
let h1El   = document.querySelector('h1');
let homeHeroEl = document.querySelector('.hero');
const topbarNavEl = document.querySelector('.topbar-nav');
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

function initH1Hero() {
if (!h1El) return;
const h1GlowFadeName = document.documentElement.classList.contains('is-safari') ? 'glowFadeIn-safari' : 'glowFadeIn';
const h1GlowPulseName = document.documentElement.classList.contains('is-safari') ? 'glowPulse-safari' : 'glowPulse';
splashReady.then(() => {
if (
  homeHeroEl &&
  topbarNavEl &&
  !document.documentElement.classList.contains('page-subpage')
) {
  syncNavPlacement();
}
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
    cancelH1 = scrambleLoop(h1Orig, t => { if (h1El?.isConnected) h1El.textContent = t; });
  }, 200);
  h1El.addEventListener('animationend', e => {
    if (e.animationName === 'fadeUp') h1Settle();
    if (e.animationName === h1GlowFadeName) {
      h1El.style.opacity = '1';
      h1El.style.animation = `${h1GlowPulseName} 4s ease-in-out infinite`;
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
    h1El.style.animation = `${h1GlowPulseName} 4s ease-in-out infinite`;
    cancelH1?.();
    h1El.classList.remove('chroma');
    void h1El.offsetWidth;
    h1El.classList.add('chroma');
    setTimeout(() => h1El.classList.remove('chroma'), 500);
    cancelH1 = scrambleLoop(h1Orig, t => { if (h1El?.isConnected) { h1El.textContent = t; applyH1Centering(); } });
  });
  h1El.addEventListener('mouseleave', () => {
    cancelH1?.();
    cancelH1 = scrambleResolveForMs(h1Orig, t => { if (h1El?.isConnected) { h1El.textContent = t; applyH1Centering(); } }, SCRAMBLE_SETTLE_MS, () => {
      if (!h1El?.isConnected) return;
      h1El.style.transform = '';
      h1El.style.width = '';
      h1El.style.height = '';
    });
  });
}
} /* end initH1Hero */
initH1Hero();

/* ── mouse-reactive aurora ──────────────────────── */
function initAurora() {
  const auroraEl = document.querySelector('.aurora');
  const heroEl = document.querySelector('.hero');
  if (auroraEl && heroEl && enableHeavyPointerFx) {
    let ax = 0, ay = 0, targetAx = 0, targetAy = 0;
    let auroraRafId = 0;
    let auroraRunning = false;
    let heroVisible = true;
    let heroRect = heroEl.getBoundingClientRect();

    function updateHeroRect() {
      heroRect = heroEl.getBoundingClientRect();
    }

    document.addEventListener('mousemove', e => {
      if (!auroraRunning) return;
      /* normalise cursor to -1…+1 relative to hero centre */
      targetAx = ((e.clientX - heroRect.left) / heroRect.width - 0.5) * 2;
      targetAy = ((e.clientY - heroRect.top)  / heroRect.height - 0.5) * 2;
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

    const sig = _pageContentAbort?.signal;
    document.addEventListener('visibilitychange', syncAuroraState, { signal: sig });
    window.addEventListener('resize', updateHeroRect, { passive: true, signal: sig });
    window.addEventListener('scroll', updateHeroRect, { passive: true, signal: sig });
    window.addEventListener('pageshow', syncAuroraState, { passive: true, signal: sig });
    window.addEventListener('pagehide', stopAurora, { passive: true, signal: sig });
    updateHeroRect();
    syncAuroraState();
  }
}
initAurora();

/* scroll arrow positioning */
const playerEl      = document.getElementById('player');
let scrollArrowEl = document.querySelector('.scroll-arrow');
const topbarEl = document.querySelector('.topbar');
let mainEl = document.querySelector('main');
let pastShowsSection = document.getElementById('pastShowsSection');
let arrowBaseTop = null;
function positionScrollArrow() {
  if (!h1El || !scrollArrowEl || !playerEl) return;
  const h1Bottom  = h1El.getBoundingClientRect().bottom + window.scrollY;
  const playerTop = playerEl.getBoundingClientRect().top + window.scrollY;
  const arrowHalf = (scrollArrowEl.offsetHeight || 14) / 2;
  arrowBaseTop = (h1Bottom + playerTop) / 2 - arrowHalf;
  scrollArrowEl.style.top = (arrowBaseTop - window.scrollY) + 'px';
}
function initScrollArrow() {
  if (!h1El || !scrollArrowEl) return;
  const sig = _pageContentAbort?.signal;
  document.fonts.ready.then(positionScrollArrow);
  window.addEventListener('resize', positionScrollArrow, { signal: sig });
  h1El.addEventListener('animationend', positionScrollArrow);
  window.addEventListener('load', positionScrollArrow, { signal: sig });
}
initScrollArrow();

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

const fallbackTracks = [
  { title: 'CITYSPROBLEM - Tomorrow', file: 'CITYSPROBLEM_-_Tomorrow.mp3' },
  { title: 'CITYSPROBLEM - SATELLITE', file: 'CITYSPROBLEM_-_SATELLITE.mp3' },
  { title: 'CITYSPROBLEM - Stay', file: 'CITYSPROBLEM_-_Stay.mp3' },
  { title: 'ortisei - In Blue (CITYSPROBLEM Remix)', file: 'ortisei_-_In_Blue_(CITYSPROBLEM_Remix).mp3' },
];
const sourceTracks = Array.isArray(window.TRACKS) && window.TRACKS.length ? window.TRACKS : fallbackTracks;
const tracks = sourceTracks.map(t => ({
  title: t.title.toUpperCase(),
  file: t.file,
}));

function trackSrc(idx) {
  const file = tracks[idx]?.file || '';
  return encodeURI('SONGS/' + file);
}
const PLAYER_STATE_KEY = 'playerState:v2';
const LEGACY_PLAYER_STATE_KEYS = ['playerState:v1'];
const DISABLE_PLAYER_STATE_IN_CHROME = isChrome;

function readSavedPlayerState() {
  try {
    LEGACY_PLAYER_STATE_KEYS.forEach(k => sessionStorage.removeItem(k));
    const raw = sessionStorage.getItem(PLAYER_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

const savedPlayerState = DISABLE_PLAYER_STATE_IN_CHROME ? null : readSavedPlayerState();
let trackIdx = Number.isInteger(savedPlayerState?.idx) ? savedPlayerState.idx : 0;
let shuffleOn = Boolean(savedPlayerState?.shuffleOn);
let pendingRestoreTime = Number.isFinite(savedPlayerState?.currentTime)
  ? Math.max(0, savedPlayerState.currentTime)
  : 0;

function savePlayerState() {
  if (DISABLE_PLAYER_STATE_IN_CHROME) return;
  try {
    sessionStorage.setItem(PLAYER_STATE_KEY, JSON.stringify({
      idx: trackIdx,
      shuffleOn,
      deferAudioLoad,
      isPlaying: !audio.paused && !audio.ended,
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      volume: Number.isFinite(audio.volume) ? audio.volume : 1,
    }));
  } catch {
    /* no-op: storage may be unavailable in some environments */
  }
}

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

/* ── player state machine ──────────────────────────────────────────
   All play/pause transitions go through playerDo() which serializes
   operations so a pending play() promise is always awaited before the
   next action.  This eliminates Chrome's AbortError race condition
   that caused the "click pause twice" bug.
   ─────────────────────────────────────────────────────────────────── */
let deferAudioLoad = true;
let _playerBusy = null;          /* current play()/pause() promise chain */
let _playerIntent = 'paused';    /* 'playing' | 'paused' — what the user wants */

function setPlaying(v) {
  btnPlay.textContent = v ? '' : '▶\uFE0E';
  btnPlay.classList.toggle('playing', v);
}

/* Serialize every play/pause through this gate.
   action: 'play' | 'pause'
   Returns a promise that resolves when the action completes. */
function playerDo(action) {
  const run = async () => {
    if (action === 'play') {
      _playerIntent = 'playing';
      if (deferAudioLoad) {
        audio.src = trackSrc(trackIdx);
        deferAudioLoad = false;
      }
      /* if track ended, restart */
      if (Number.isFinite(audio.duration) && audio.duration > 0
          && audio.currentTime >= audio.duration - 0.05) {
        audio.currentTime = 0;
      }
      try {
        await audio.play();
      } catch (err) {
        /* AbortError = pause clicked while play was resolving — expected, ignore.
           Anything else (NotAllowedError, NotSupportedError) = real failure. */
        if (err?.name !== 'AbortError') {
          _playerIntent = 'paused';
        }
      }
    } else {
      _playerIntent = 'paused';
      audio.pause();                /* synchronous — always succeeds */
    }
    /* sync UI to ground truth after every action */
    syncUI();
  };
  /* chain onto previous operation so they never overlap */
  _playerBusy = (_playerBusy || Promise.resolve()).then(run, run);
  return _playerBusy;
}

function syncUI() {
  const playing = !audio.paused && !audio.ended;
  setPlaying(playing);
  savePlayerState();
}

function loadTrack(idx, opts = {}) {
  const shouldPlay = Boolean(opts.preservePlayback);
  if (!tracks.length) return;
  trackIdx = ((idx % tracks.length) + tracks.length) % tracks.length;
  const title = tracks[trackIdx].title;
  playerTrack.classList.remove('scrolling');
  scrambleResolveForMs(title, t => { playerTrack.textContent = t; }, SCRAMBLE_SETTLE_MS, () => {
    updateMarquee();
  });
  playerCounter.textContent = `${trackIdx + 1} / ${tracks.length}`;
  if (!deferAudioLoad) {
    audio.src = trackSrc(trackIdx);
  }
  if (shouldPlay) {
    playerDo('play');   /* playerDo handles deferAudioLoad internally */
  }
  savePlayerState();
}

if (savedPlayerState && typeof savedPlayerState.deferAudioLoad === 'boolean') {
  deferAudioLoad = savedPlayerState.deferAudioLoad;
}
if (tracks.length) loadTrack(trackIdx);
else playerTrack.textContent = '—';
btnShuffle.classList.toggle('active', shuffleOn);

if (tracks.length && savedPlayerState) {
  const savedTime = pendingRestoreTime;

  if (Boolean(savedPlayerState.isPlaying) && deferAudioLoad) {
    audio.src = trackSrc(trackIdx);
    deferAudioLoad = false;
  }

  if (!deferAudioLoad && savedTime > 0) {
    const restoreTime = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = Math.min(savedTime, Math.max(0, audio.duration - 0.25));
      } else {
        audio.currentTime = savedTime;
      }
    };
    if (audio.readyState >= 1) restoreTime();
    else audio.addEventListener('loadedmetadata', restoreTime, { once: true });
  }
}

btnPlay.addEventListener('click', () => {
  if (!tracks.length) return;
  if (audio.paused || audio.ended) {
    playerDo('play');
  } else {
    playerDo('pause');
  }
});
btnPrev.addEventListener('click', () => {
  const shouldPlay = _playerIntent === 'playing';
  loadTrack(trackIdx - 1, { preservePlayback: shouldPlay });
});
btnNext.addEventListener('click', () => {
  const shouldPlay = _playerIntent === 'playing';
  if (shuffleOn) {
    let r; do { r = Math.floor(Math.random() * tracks.length); } while (r === trackIdx && tracks.length > 1);
    loadTrack(r, { preservePlayback: shouldPlay });
  } else {
    loadTrack(trackIdx + 1, { preservePlayback: shouldPlay });
  }
});
btnShuffle.addEventListener('click', () => {
  shuffleOn = !shuffleOn;
  btnShuffle.classList.toggle('active', shuffleOn);
  savePlayerState();
});
audio.addEventListener('play',  () => syncUI());
audio.addEventListener('pause', () => syncUI());
audio.addEventListener('ended', () => {
  if (shuffleOn) {
    let r; do { r = Math.floor(Math.random() * tracks.length); } while (r === trackIdx && tracks.length > 1);
    loadTrack(r, { preservePlayback: true });
  } else if (trackIdx < tracks.length - 1) {
    loadTrack(trackIdx + 1, { preservePlayback: true });
  } else {
    _playerIntent = 'paused';
    syncUI();
  }
});
audio.addEventListener('error', () => {
  deferAudioLoad = true;
  pendingRestoreTime = 0;
  _playerIntent = 'paused';
  setPlaying(false);
  try { sessionStorage.removeItem(PLAYER_STATE_KEY); } catch {}
});
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  playerFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
  playerTimeCurrent.textContent = fmt(audio.currentTime);
  playerTimeTotal.textContent   = fmt(audio.duration);
  savePlayerState();
});
function seekTo(clientX) {
  if (!audio.duration) return;
  const r = playerProg.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  audio.currentTime = pct * audio.duration;
  playerFill.style.width = (pct * 100) + '%';
}
let isSeeking = false;
let seekWasPlaying = false;
playerProg.addEventListener('mousedown', e => {
  isSeeking = true;
  seekWasPlaying = !audio.paused;
  audio.pause();
  seekTo(e.clientX);
});
playerProg.addEventListener('touchstart', e => {
  isSeeking = true;
  seekWasPlaying = !audio.paused;
  audio.pause();
  seekTo(e.touches[0].clientX);
}, { passive: true });
window.addEventListener('mousemove', e => { if (isSeeking) seekTo(e.clientX); });
window.addEventListener('touchmove', e => { if (isSeeking) { e.preventDefault(); seekTo(e.touches[0].clientX); } }, { passive: false });
window.addEventListener('mouseup',  () => { if (isSeeking) { isSeeking = false; if (seekWasPlaying) playerDo('play'); } });
window.addEventListener('touchend', () => { if (isSeeking) { isSeeking = false; if (seekWasPlaying) playerDo('play'); } });

/* volume slider */
const volSlider = document.getElementById('volSlider');
if (savedPlayerState && Number.isFinite(savedPlayerState.volume)) {
  const clampedVol = Math.min(1, Math.max(0, savedPlayerState.volume));
  audio.volume = clampedVol;
  volSlider.value = String(clampedVol);
}
function updateVolTrack() {
  const pct = volSlider.value * 100;
  volSlider.style.background = `linear-gradient(90deg, var(--ice) ${pct}%, rgba(0,212,255,.15) ${pct}%)`;
}
volSlider.addEventListener('input', () => {
  audio.volume = volSlider.value;
  updateVolTrack();
  savePlayerState();
});
updateVolTrack();

window.addEventListener('pagehide', savePlayerState, { passive: true });
window.addEventListener('beforeunload', savePlayerState, { passive: true });

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
  /* measure bottom ticker for music page layout */
  const bottomTicker = document.querySelector('main > .ticker');
  if (bottomTicker) {
    document.documentElement.style.setProperty('--ticker-h', bottomTicker.offsetHeight + 'px');
  }
  syncCenterScrollSpacer();
  positionScrollArrow();
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
    cancelTrackResolve = scrambleResolveForMs(current, t => { playerTrack.textContent = t; }, SCRAMBLE_SETTLE_MS, () => {
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
  const VIZ_TARGET_BINS = 500;
  const VIZ_HEIGHT_GAMMA = 0.62;
  const VIZ_HEIGHT_BOOST = 0.82;
  const VIZ_TRANSIENT_BOOST = 1.05;
  const VIZ_MAX_HEIGHT_FRAC = 0.72;
  const VIZ_NOISE_GATE = 0.05;
  const VIZ_MIN_VISIBLE_HEIGHT_FRAC = 0.003;
  let analyser = null, dataArray = null, prevData = null, audioCtxStarted = false;
  let vizMinBin = 0, vizMaxBin = 0;
  let vizFrameCount = 0;

  function initAudioContext() {
    if (audioCtxStarted) return;
    audioCtxStarted = true;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.05;
    analyser.minDecibels = -96;
    analyser.maxDecibels = -16;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    prevData = new Float32Array(analyser.frequencyBinCount);
    const hzPerBin = audioCtx.sampleRate / analyser.fftSize;
    vizMinBin = 0;
    vizMaxBin = analyser.frequencyBinCount - 1;
  }

  audio.addEventListener('play', initAudioContext, { once: true });

  function resizeViz() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    vizCanvas.width  = Math.max(1, Math.floor(vizCanvas.clientWidth  * dpr));
    vizCanvas.height = Math.max(1, Math.floor(vizCanvas.clientHeight * dpr));
    vizCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeViz();
  window.addEventListener('resize', resizeViz);

  function clearVisualizer() {
    const W = vizCanvas.clientWidth, H = vizCanvas.clientHeight;
    vizCtx.clearRect(0, 0, W, H);
    if (prevData) prevData.fill(0);
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
    vizFrameCount += 1;
    if (vizFrameCount % visualizerFrameStride !== 0) return;
    if (!shouldDrawVisualizer()) return;
    const W = vizCanvas.clientWidth, H = vizCanvas.clientHeight;
    vizCtx.clearRect(0, 0, W, H);
    analyser.getByteFrequencyData(dataArray);
    const minBin = Math.max(0, Math.min(vizMinBin, dataArray.length - 1));
    const maxBin = Math.max(minBin, Math.min(vizMaxBin, dataArray.length - 1));
    const availableBins = Math.max(1, (maxBin - minBin + 1));
    const bars = VIZ_TARGET_BINS;
    const barW = W / bars;
    const minVisibleH = H * VIZ_MIN_VISIBLE_HEIGHT_FRAC;
    for (let i = 0; i < bars; i++) {
      const t = bars <= 1 ? 0 : i / (bars - 1);
      const pos = t * (availableBins - 1);
      const leftBin = minBin + Math.floor(pos);
      const rightBin = Math.min(maxBin, leftBin + 1);
      const frac = pos - Math.floor(pos);
      const raw = ((dataArray[leftBin] * (1 - frac)) + (dataArray[rightBin] * frac)) / 255;
      const v = raw <= VIZ_NOISE_GATE ? 0 : (raw - VIZ_NOISE_GATE) / (1 - VIZ_NOISE_GATE);
      const prev = prevData ? ((prevData[leftBin] * (1 - frac)) + (prevData[rightBin] * frac)) : 0;
      const transient = Math.max(0, v - prev) * VIZ_TRANSIENT_BOOST;
      if (prevData) prevData[leftBin] = v;
      const shaped = Math.pow(v, VIZ_HEIGHT_GAMMA);
      const reactive = Math.min(1, shaped * VIZ_HEIGHT_BOOST + transient);
      const h = v > 0 ? Math.max(minVisibleH, reactive * H * VIZ_MAX_HEIGHT_FRAC) : 0;
      vizCtx.fillStyle = `rgba(0,212,255,${0.12 + reactive * 0.44})`;
      vizCtx.fillRect(i * barW, H - h, Math.max(0.7, barW), h);
    }
  };
}

/* scroll arrow follows h1 off screen as user scrolls */
function initArrowFollow() {
  if (!scrollArrowEl) return;
  const sig = _pageContentAbort?.signal;
  let arrowRafPending = false;
  function updateArrowPosition() {
    arrowRafPending = false;
    if (arrowBaseTop === null) return;
    const y = arrowBaseTop - window.scrollY;
    scrollArrowEl.style.top = y + 'px';
    scrollArrowEl.style.opacity = y < -20 ? '0' : '';
  }
  window.addEventListener('scroll', () => {
    if (arrowRafPending) return;
    arrowRafPending = true;
    requestAnimationFrame(updateArrowPosition);
  }, { passive: true, signal: sig });
  window.addEventListener('resize', updateArrowPosition, { passive: true, signal: sig });
}
initArrowFollow();

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
  /* if h1 hasn't been laid out yet (height ~0), keep topbar visible */
  if (h1Rect.height < 1) return 0;
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
function initTopbarScrollHide() {
  /* reset topbar to visible when navigating away from home */
  applyTopbarProgress(0);
  topbarProgress = 0;
  if (!h1El) return;
  const sig = _pageContentAbort?.signal;
  window.addEventListener('scroll', scheduleTopbarPositionUpdate, { passive: true, signal: sig });
  window.addEventListener('resize', () => {
    recalcTopbarScrollRange();
    scheduleTopbarPositionUpdate();
  }, { passive: true, signal: sig });
  document.fonts.ready.then(() => {
    recalcTopbarScrollRange();
    topbarProgress = topbarTargetFromScroll();
    applyTopbarProgress(topbarProgress);
  });
  recalcTopbarScrollRange();
  topbarProgress = topbarTargetFromScroll();
  applyTopbarProgress(topbarProgress);
}
initTopbarScrollHide();

/* info section scramble — apply hover-scramble after DOM ready */
let infoSection = document.getElementById('infoSection');
let hasInfoSection = Boolean(infoSection && !infoSection.hidden);
const CONNECT_EXTRA_WIDTH = 320;

function centerBandY() {
  const topEdge = topbarEl ? topbarEl.getBoundingClientRect().bottom : 0;
  const bottomEdge = playerEl ? playerEl.getBoundingClientRect().top : window.innerHeight;
  return topEdge + (bottomEdge - topEdge) / 2;
}

let defaultCenterTarget = infoSection || pastShowsSection || null;
let centerScrollTarget = defaultCenterTarget;

function syncCenterScrollSpacer(targetEl = centerScrollTarget || defaultCenterTarget) {
  if (!mainEl || !targetEl || !targetEl.isConnected || targetEl.hidden) {
    document.documentElement.style.setProperty('--info-scroll-spacer', '0px');
    return;
  }
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
function currentSectionScrollCenter(targetEl = centerScrollTarget || defaultCenterTarget) {
  if (!targetEl || !targetEl.isConnected) return window.scrollY;
  const rect = targetEl.getBoundingClientRect();
  const rectCenter = rect.top + rect.height / 2;
  return clampScrollY(window.scrollY + rectCenter - centerBandY());
}

let cancelInfoCenterFollow = null;

function followSectionCenter(targetEl = defaultCenterTarget, duration = 400) {
  if (!targetEl || !targetEl.isConnected) return;
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
    window.scrollTo(0, nextY);
    if (t < 1) {
      rafId = requestAnimationFrame(frame);
    } else {
      syncCenterScrollSpacer(targetEl);
      window.scrollTo(0, currentSectionScrollCenter(targetEl));
      cancelInfoCenterFollow = null;
    }
  }

  rafId = requestAnimationFrame(frame);
  cancelInfoCenterFollow = () => {
    cancelAnimationFrame(rafId);
    cancelInfoCenterFollow = null;
  };
}

function syncSectionCenterState(targetEl = defaultCenterTarget) {
  if (!targetEl || !targetEl.isConnected) return;
  centerScrollTarget = targetEl;
  syncCenterScrollSpacer(targetEl);
}

function initInfoSection() {
  if (!hasInfoSection) return;
  const sig = _pageContentAbort?.signal;
  /* reveal info section once it scrolls into view */
  {
    const infoLabelEls = Array.from(infoSection.querySelectorAll('.bio-panel-label'));
    const infoLabelOrig = infoLabelEls.map(el => el.textContent);
    /* prep: entire section starts invisible */
    infoSection.style.opacity = '0';
    infoSection.style.transform = 'translateY(12px)';
    infoSection.style.transition = 'none';
    void infoSection.offsetHeight; /* ensure initial hidden state is committed */

    function revealInfo() {
      const fadeMs = 500;
      infoLabelEls.forEach((el, i) => {
        scrambleThenSettleAt(infoLabelOrig[i], t => { el.textContent = t; }, fadeMs, accordionScrambleLimit(infoLabelOrig[i]));
      });
      /* fade everything in together; stage then promote on next frame */
      infoSection.style.transition = 'opacity .5s ease, transform .5s ease';
      requestAnimationFrame(() => {
        infoSection.style.opacity = '1';
        infoSection.style.transform = 'translateY(0)';
        infoSection.classList.add('visible');
      });
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
  }, { passive: true, signal: sig });

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
        const loops = textEls.map((el, i) => scrambleLoop(textOrig[i], t => { el.textContent = t; }, 30, accordionScrambleLimit(textOrig[i])));
        loops.forEach(c => c());
        let remainingSettle = textEls.length;
        textEls.forEach((el, i) => scrambleResolveForMs(
          textOrig[i],
          t => { el.textContent = t; },
          SCRAMBLE_SETTLE_MS,
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
      g.style.overflow = 'hidden';
      g.style.transition = 'none';
      g.style.maxHeight = h + 'px';
      g.style.opacity = '1';
      g.offsetHeight; /* force reflow */
      g.style.transition = 'max-height .3s ease, opacity .2s ease';
      g.style.maxHeight = '0';
      g.style.opacity = '0';
      g.style.pointerEvents = 'none';
    });
  }

  function showAllLabelGroups() {
    infoSection.querySelectorAll('.label-group').forEach(g => {
      if (!g.style.maxHeight) return; /* already visible */
      g.style.transition = 'max-height .3s ease, opacity .2s ease';
      g.style.maxHeight = g.scrollHeight + 'px';
      g.style.opacity = '1';
      g.style.pointerEvents = '';
      setTimeout(() => {
        g.style.transition = '';
        g.style.maxHeight = '';
        g.style.opacity = '';
        g.style.overflow = '';
      }, 320);
    });
  }

  function resetLabelGroups(block) {
    block.querySelectorAll('.label-group').forEach(g => {
      g.classList.remove('open');
      g.style.maxHeight = '';
      g.style.opacity = '';
      g.style.overflow = '';
      g.style.transition = '';
      g.style.pointerEvents = '';
      const s = g.querySelector('.label-songs');
      if (s) s.style.maxHeight = '0';
    });
  }

  /* label releases — sub-accordion for each label group */
  infoSection.querySelectorAll('.label-group').forEach(group => {
    const btn = group.querySelector('.label-btn');
    const songs = group.querySelector('.label-songs');

    btn.addEventListener('click', () => {
      const isOpen = group.classList.contains('open');
      const parentContent = group.closest('.info-block-content');

      if (isOpen) {
        /* close: restore all other groups and collapse songs */
        group.classList.remove('open');
        if (songs.style.maxHeight === 'none') {
          songs.style.maxHeight = songs.scrollHeight + 'px';
          songs.offsetHeight;
        }
        songs.style.maxHeight = '0';
        songs.style.opacity = '0';
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
        songs.style.opacity = '1';
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
          scrambleThenSettleAt(text, t => { a.textContent = t; }, SCRAMBLE_SETTLE_MS, accordionScrambleLimit(text));
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
  }, { signal: sig });

  /* apply hover-scramble to all remaining static text elements
     (info section elements are excluded — no hover scramble there) */
  const infoSectionEls = new Set(infoSection.querySelectorAll('.bio-panel-label, .bio-text, .bio-press-links a'));
  [
    /* panel titles + labels (excluding info section) */
    ...Array.from(document.querySelectorAll('.bio-panel-title, .bio-panel-label')).filter(el => !infoSectionEls.has(el)),
    /* bio body text (excluding info section) */
    ...Array.from(document.querySelectorAll('.bio-text')).filter(el => !infoSectionEls.has(el)),
  ].forEach(addScrambleHover);
}
initInfoSection();

/* info-block-header scramble removed — clickable elements skip hover-scramble */


/* ── generic section reveal with scramble-settle ───────────────── */
function initSectionReveal(sectionId, textSelector) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  animDebugLog(`section prep: ${sectionId}`);
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
      animDebugLog(`section reveal start: ${sectionId}`);
      section.classList.add('visible');

      /* stagger children in */
      staggerChildren.forEach((el, i) => {
        setTimeout(() => {
          el.style.transition = 'opacity .5s ease, transform .5s ease';
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, i * 60);
      });

      function fadeTargetMsForText(el) {
        const container = staggerChildren.find(node => node === el || node.contains(el));
        const idx = container ? Math.max(0, staggerChildren.indexOf(container)) : 0;
        return idx * 60 + 500;
      }
      textEls.forEach((el, i) => {
        scrambleThenSettleAt(textOrig[i], t => { el.textContent = t; }, fadeTargetMsForText(el), accordionScrambleLimit(textOrig[i]));
      });
      const settleDoneMs = Math.max(500, staggerChildren.length * 60 + 500);
      setTimeout(() => {
        animDebugLog(`section settle: ${sectionId}`);
        section.style.animation = 'none';
        section.style.opacity = '1';
      }, settleDoneMs + 20);
      observer.disconnect();
    }
  }, { threshold: 0 });
  observer.observe(section);
}

/* reveal tickers */
function initTickers() {
  document.querySelectorAll('.ticker-track').forEach(track => {
    if (track.dataset.loopReady === '1') return;
    const items = Array.from(track.children);
    if (!items.length) return;
    const clones = document.createDocumentFragment();
    items.forEach(item => {
      const clone = item.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clones.appendChild(clone);
    });
    track.appendChild(clones);
    track.dataset.loopReady = '1';
  });

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
}

/* reveal new sections */
function initSectionReveals() {
  initSectionReveal('featuredRelease', '.section-label, .featured-title, .featured-meta');
  initSectionReveal('releasesSection', '.section-label, .release-card-title, .release-card-meta');
  initSectionReveal('datesSection', '.section-label, .dates-empty, .date-date, .date-venue');
  initSectionReveal('pastShowsSection', '.section-label, .past-shows-year-btn, .past-shows-back-btn, .past-shows-list .date-date, .past-shows-list .date-venue');
  initSectionReveal('bookingSection', '.section-label, .portfolio-title, .portfolio-meta, .portfolio-link');
  initSectionReveal('newsletterSection', '.section-label, .portfolio-title, .portfolio-meta, .portfolio-link');
}

/* keep upcoming date text from shifting during scramble */
let upcomingDateEls = Array.from(document.querySelectorAll('#datesSection .date-date, #datesSection .date-venue'));
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

function initDateWidthsAndHoverScramble() {
  const sig = _pageContentAbort?.signal;
  upcomingDateEls = Array.from(document.querySelectorAll('#datesSection .date-date, #datesSection .date-venue'));
  lockUpcomingDateWidths();
  window.addEventListener('resize', () => {
    lockUpcomingDateWidths();
  }, { passive: true, signal: sig });

  /* hover-scramble for new static text elements */
  document.querySelectorAll(
    '.featured-title, .featured-meta, .dates-empty, #datesSection .date-date, #datesSection .date-venue, .portfolio-title, .portfolio-meta, .quote-line, .quote-source, #pastShowsSection .section-label'
  ).forEach(addScrambleHover);
  Array.from(document.querySelectorAll('.section-label'))
    .filter(el => !pastShowsSection || !pastShowsSection.contains(el))
    .forEach(addScrambleHover);
}

initTickers();
initSectionReveals();
initDateWidthsAndHoverScramble();

/* past shows year accordion */
let pastShowsYears = pastShowsSection ? Array.from(document.querySelectorAll('.past-shows-year')) : [];

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

function initPastShows() {
  pastShowsYears = pastShowsSection ? Array.from(document.querySelectorAll('.past-shows-year')) : [];
  if (!pastShowsSection) return;
  const sig = _pageContentAbort?.signal;

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
  }, { signal: sig });
}
initPastShows();

/* ── magnetic hover on CTA buttons ─────────────────── */
function initMagneticAndTilt() {
  if (!enableHeavyPointerFx) return;
  scheduleNonCritical(() => {
    const magnetEls = document.querySelectorAll('.booking-cta, .featured-link');
    const MAGNET_STRENGTH = 0.35;
    magnetEls.forEach(el => {
      el.style.transition = 'transform .25s ease-out';
      el.addEventListener('mousemove', e => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top  + rect.height / 2;
        el.style.transform = `translate(${(e.clientX - cx) * MAGNET_STRENGTH}px, ${(e.clientY - cy) * MAGNET_STRENGTH}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });

    function addTiltHover(el, maxDeg = 8) {
      el.addEventListener('mousemove', e => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width  - 0.5;
        const y = (e.clientY - rect.top)  / rect.height - 0.5;
        el.style.transform = `perspective(600px) rotateY(${x * maxDeg}deg) rotateX(${-y * maxDeg}deg)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    }
    document.querySelectorAll('.release-card').forEach(c => addTiltHover(c, 8));
    const featuredWrap = document.querySelector('.featured-artwork-wrap');
    if (featuredWrap) addTiltHover(featuredWrap, 6);
  });
}
initMagneticAndTilt();

/* ── soft-nav page re-init ──────────────────────────────────────── */
function initPageContent() {
  /* abort previous page-content listeners (window/document) */
  _pageContentAbort?.abort();
  _pageContentAbort = new AbortController();

  window.applyPageSections?.(document);
  window.applyPageInfo?.();

  /* re-query in-main DOM references */
  h1El = document.querySelector('h1');
  homeHeroEl = document.querySelector('.hero');
  scrollArrowEl = document.querySelector('.scroll-arrow');
  mainEl = document.querySelector('main');
  pastShowsSection = document.getElementById('pastShowsSection');
  infoSection = document.getElementById('infoSection');
  hasInfoSection = Boolean(infoSection && !infoSection.hidden);
  defaultCenterTarget = infoSection || pastShowsSection || null;
  centerScrollTarget = defaultCenterTarget;

  /* reset h1 state */
  cancelH1?.(); cancelH1 = null;
  h1FadeUpDone = !h1El;
  h1ClearTimers();
  arrowBaseTop = null;
  cancelInfoCenterFollow?.(); cancelInfoCenterFollow = null;

  /* re-init all in-main sections */
  initH1Hero();
  initAurora();
  initScrollArrow();
  initArrowFollow();
  initTopbarScrollHide();
  initInfoSection();
  initTickers();
  initSectionReveals();
  initDateWidthsAndHoverScramble();
  initPastShows();
  initMagneticAndTilt();
  syncPlayerWidth();
}

document.addEventListener('softnav:complete', initPageContent);

/* cursor ring spring + grain sync loop */
{
  let tickRafId = 0;
  let tickRunning = false;

  function tick() {
    if (!tickRunning) return;
    if (!isCoarsePointer) {
      if (cursorDirty) {
        cur.style.transform = `translate(${mx}px,${my}px)`;
        rx += (mx - rx) * .25; ry += (my - ry) * .25;
        ring.style.transform = `translate(${rx}px,${ry}px)`;
        if (Math.abs(mx - rx) < 0.1 && Math.abs(my - ry) < 0.1) cursorDirty = false;
      }
    }
    if (enableAnimatedGrain && ++grainFrame % grainFrameStride === 0)
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
