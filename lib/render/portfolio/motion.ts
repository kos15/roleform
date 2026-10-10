/* eslint-disable */
// @ts-nocheck
/**
 * F28 — the portfolio motion engine, verbatim from the design handoff
 * (portfolio-motion.js). One dependency-free function, used by the live
 * preview and embedded in the exported page as source (`MOTION_SOURCE`), so
 * it must not reference anything outside itself.
 *
 * Markup stays plain; it only reads data attributes:
 *   data-rv="up|fade|blur|scale|left|rise|clip"   reveal on scroll (siblings revealed together are staggered; data-rv-d adds delay)
 *   data-count   count the number up when seen        data-type   type the text out when seen
 *   data-fx="marquee|float|ping|blink|spot|progress"   ambient loops, pointer glow, reading bar
 *   data-par="px"  parallax against its parent         data-zoom   grow to full size as it reaches the middle
 *   data-flat   tilt back, flatten on scroll           data-lift="px"   rise on hover; any [data-hz] inside zooms
 * Honours prefers-reduced-motion (everything stays still and visible).
 */
export function RF_MOTION(root) {
  if (!root) return null;
  if (root.__rfm) { root.__rfm.scan(); return root.__rfm; }
  var doc = root.ownerDocument, win = doc.defaultView || window, E = 'cubic-bezier(.22,1,.36,1)';
  var reduce = !win.IntersectionObserver || !root.animate || !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FROM = { up: { opacity: 0, transform: 'translateY(36px)' }, fade: { opacity: 0 }, blur: { opacity: 0, filter: 'blur(14px)', transform: 'translateY(16px)' },
    scale: { opacity: 0, transform: 'scale(.92)' }, left: { opacity: 0, transform: 'translateX(-28px)' }, rise: { transform: 'translateY(108%)' }, clip: { clipPath: 'inset(0 0 100% 0)' } };
  var seen = new WeakSet(), loops = [], holds = [], scroll = [], offs = [], raf = 0, shown = true, alive = true, frame = null;
  function up(n) { return n.parentElement || (n.getRootNode && n.getRootNode().host) || null; }
  for (var n = up(root); n && n !== doc.body && n !== doc.documentElement; n = up(n)) { if (win.getComputedStyle(n).overflowY !== 'visible') { frame = n; break; } }
  function box() { return frame ? frame.getBoundingClientRect() : { top: 0, bottom: win.innerHeight, height: win.innerHeight }; }
  function on(t, ev, f) { t.addEventListener(ev, f, { passive: true }); offs.push(function () { t.removeEventListener(ev, f); }); }
  function from(el) { return FROM[el.getAttribute('data-rv')] || FROM.up; }
  function count(el) {
    var t = el.firstChild; if (!alive || !t || t.nodeType !== 3) return;
    var full = t.nodeValue, m = full.match(/^(\D*)(\d[\d,]*(?:\.\d+)?)(.*)$/); if (!m) return;
    var to = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length, t0 = 0, last;
    t.nodeValue = last = m[1] + (0).toFixed(dec) + m[3];
    win.requestAnimationFrame(function f(now) {
      if (!alive || t.nodeValue !== last) return; if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / 1600), e = 1 - Math.pow(1 - p, 4);
      t.nodeValue = last = p < 1 ? m[1] + (to * e).toFixed(dec) + m[3] : full; if (p < 1) win.requestAnimationFrame(f);
    });
  }
  function type(el) {
    var t = el.firstChild; if (!alive || !t || t.nodeType !== 3) return;
    var full = t.nodeValue, i = 0, last = '​'; t.nodeValue = last;
    (function step() { if (!alive || t.nodeValue !== last) return; i++; t.nodeValue = last = full.slice(0, i) || '​'; if (i < full.length) setTimeout(step, 45 + Math.random() * 55); })();
  }
  function play(el, i) {
    var d = Math.min(i, 6) * 90 + (+el.getAttribute('data-rv-d') || 0);
    if (el.__rfh) {
      el.__rfh.cancel(); el.__rfh = null;
      var r = el.getAttribute('data-rv');
      el.animate([Object.assign({ offset: 0 }, from(el))], { duration: r === 'rise' || r === 'clip' ? 1200 : 950, delay: d, easing: E, fill: 'backwards' });
    }
    if (el.hasAttribute('data-count')) setTimeout(function () { count(el); }, d + 150);
    if (el.hasAttribute('data-type')) setTimeout(function () { type(el); }, d + 300);
  }
  var io = reduce ? null : new win.IntersectionObserver(function (es) {
    var hit = es.filter(function (e) { return e.isIntersecting || (e.rootBounds && e.boundingClientRect.bottom < e.rootBounds.top); });
    hit.sort(function (a, b) { return a.target.compareDocumentPosition(b.target) & 4 ? -1 : 1; });
    hit.forEach(function (e, i) { io.unobserve(e.target); play(e.target.__rfc || e.target, i); });
  }, { root: frame && frame.contains(root) ? frame : null, rootMargin: '0px 0px -6% 0px' });
  var vio = reduce ? null : new win.IntersectionObserver(function (es) { shown = es[es.length - 1].isIntersecting; if (shown && !raf) tick(); });
  if (vio) vio.observe(root);
  function lift(el) {
    var a = el.getAttribute('data-lift'), y = a === '' || a == null ? 6 : +a;
    el.style.transition = (el.style.transition ? el.style.transition + ',' : '') + 'translate .6s ' + E;
    on(el, 'pointerenter', function () {
      if (y) el.style.translate = '0 ' + -y + 'px';
      el.querySelectorAll('[data-hz]').forEach(function (h) { if (!h.__rfz) { h.__rfz = 1; h.style.transition = (h.style.transition ? h.style.transition + ',' : '') + 'scale 1.1s ' + E; } h.style.scale = '1.06'; });
    });
    on(el, 'pointerleave', function () { el.style.translate = ''; el.querySelectorAll('[data-hz]').forEach(function (h) { h.style.scale = ''; }); });
  }
  function tick() {
    raf = 0; if (!alive || !scroll.length) return;
    var b = box();
    for (var i = 0; i < scroll.length; i++) {
      var el = scroll[i], t = el.__rft;
      if (t === 'progress') { var s = frame || doc.scrollingElement || doc.documentElement, mx = s.scrollHeight - s.clientHeight; el.style.scale = (mx > 0 ? Math.min(1, Math.max(0, s.scrollTop / mx)) : 0).toFixed(4) + ' 1'; continue; }
      var r = el.parentElement.getBoundingClientRect();
      if (r.bottom < b.top - 80 || r.top > b.bottom + 80) continue;
      var c = (r.top + r.height / 2 - b.top) / (b.height || 1);
      if (t === 'par') el.style.translate = '0 ' + ((c - .5) * (+el.getAttribute('data-par') || 60)).toFixed(1) + 'px';
      else if (t === 'zoom') el.style.scale = (.86 + .14 * Math.max(0, Math.min(1, (1.1 - c) / .6))).toFixed(4);
      else if (t === 'flat') el.style.rotate = 'x ' + (20 * (1 - Math.max(0, Math.min(1, (1.05 - c) / .55)))).toFixed(2) + 'deg';
    }
    if (shown) raf = win.requestAnimationFrame(tick);
  }
  function scan() {
    if (!alive || reduce) return;
    root.querySelectorAll('[data-rv],[data-count],[data-type],[data-fx],[data-par],[data-zoom],[data-flat],[data-lift]').forEach(function (el) {
      if (seen.has(el)) return; seen.add(el);
      if (el.hasAttribute('data-rv')) { el.__rfh = el.animate([from(el), from(el)], { duration: 1, fill: 'forwards' }); holds.push(el.__rfh); }
      // A risen line sits below its clipping parent while held, so watch the parent instead.
      if (el.getAttribute('data-rv') === 'rise' && el.parentElement) { el.parentElement.__rfc = el; io.observe(el.parentElement); }
      else if (el.hasAttribute('data-rv') || el.hasAttribute('data-count') || el.hasAttribute('data-type')) io.observe(el);
      var fx = el.getAttribute('data-fx');
      if (fx === 'marquee') loops.push(el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }], { duration: +el.getAttribute('data-speed') || 40000, iterations: Infinity }));
      else if (fx === 'float') loops.push(el.animate([{ translate: '0 -14px' }, { translate: '0 14px' }], { duration: 6000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
      else if (fx === 'ping') loops.push(el.animate([{ scale: '1', opacity: .75 }, { scale: '2.8', opacity: 0 }], { duration: 1800, iterations: Infinity, easing: 'cubic-bezier(0,0,.2,1)' }));
      else if (fx === 'blink') loops.push(el.animate([{ opacity: 1 }, { opacity: 1, offset: .5 }, { opacity: 0, offset: .5 }, { opacity: 0 }], { duration: 1100, iterations: Infinity }));
      else if (fx === 'spot') { var p = el.parentElement; on(p, 'pointermove', function (e) { var r = p.getBoundingClientRect(), k = r.width / (p.offsetWidth || r.width || 1); el.style.setProperty('--x', ((e.clientX - r.left) / k).toFixed(0) + 'px'); el.style.setProperty('--y', ((e.clientY - r.top) / k).toFixed(0) + 'px'); }); }
      else if (fx === 'progress') { el.__rft = 'progress'; scroll.push(el); }
      if (el.hasAttribute('data-par')) { el.__rft = 'par'; scroll.push(el); }
      else if (el.hasAttribute('data-zoom')) { el.__rft = 'zoom'; scroll.push(el); }
      else if (el.hasAttribute('data-flat')) { el.__rft = 'flat'; scroll.push(el); }
      if (el.hasAttribute('data-lift')) lift(el);
    });
    scroll = scroll.filter(function (el) { return el.isConnected; });
    if (!raf) tick();
  }
  var api = { root: root, scan: scan, destroy: function () {
    alive = false; if (raf) win.cancelAnimationFrame(raf); if (io) io.disconnect(); if (vio) vio.disconnect();
    loops.concat(holds).forEach(function (a) { a.cancel(); }); offs.forEach(function (f) { f(); }); root.__rfm = null;
  } };
  root.__rfm = api; scan(); return api;
}

/** The engine as source, for the exported page. */
export const MOTION_SOURCE = `(${RF_MOTION.toString()})(document.querySelector('[data-pf-root]'));`;
