(function () {
  var root = document.documentElement;
  if (root.dataset.browser !== 'safari') return;
  var isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches || window.innerWidth <= 768;
  if (!isMobile) return;

  root.classList.add('mobile-optimized', 'browser-js-safari-mobile');

  var isLowMemory = (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4) ||
    (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4);
  if (isLowMemory) root.classList.add('low-memory-mobile');

  var interacted = false;
  try { interacted = sessionStorage.getItem('mobileEffectsReady') === '1'; } catch (_) {}
  if (!interacted) root.classList.add('mobile-effects-deferred');
  else root.classList.add('mobile-effects-ready');

  function markInteracted() {
    if (root.classList.contains('mobile-effects-ready')) return;
    root.classList.remove('mobile-effects-deferred');
    root.classList.add('mobile-effects-ready');
    try { sessionStorage.setItem('mobileEffectsReady', '1'); } catch (_) {}
    window.removeEventListener('touchstart', markInteracted, true);
    window.removeEventListener('pointerdown', markInteracted, true);
    window.removeEventListener('keydown', markInteracted, true);
  }

  window.addEventListener('touchstart', markInteracted, { capture: true, passive: true, once: true });
  window.addEventListener('pointerdown', markInteracted, { capture: true, passive: true, once: true });
  window.addEventListener('keydown', markInteracted, { capture: true, once: true });

  var tickerObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var track = entry.target.querySelector('.ticker-track');
      if (!track) return;
      track.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
    });
  }, { threshold: 0 });

  document.querySelectorAll('.ticker').forEach(function (ticker) {
    tickerObserver.observe(ticker);
  });

  var pausableSelector = '.scroll-arrow, .topbar-flyer, .booking-signal-card, .player-track-name, h1';
  var animationObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      entry.target.classList.toggle('offscreen-anim', !entry.isIntersecting);
    });
  }, { threshold: 0 });

  document.querySelectorAll(pausableSelector).forEach(function (el) {
    animationObserver.observe(el);
  });

  var featuredWrap = document.querySelector('.featured-wrap');
  if (featuredWrap) {
    featuredWrap.style.contentVisibility = 'visible';
    featuredWrap.style.containIntrinsicSize = 'auto';
  }

  var heavySections = '.info-section, .releases-section, .dates-wrap, .portfolio-section';
  document.querySelectorAll(heavySections).forEach(function (el) {
    el.style.contentVisibility = 'auto';
    el.style.containIntrinsicSize = '1px 800px';
  });
})();
