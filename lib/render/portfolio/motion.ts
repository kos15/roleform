/* eslint-disable */
// @ts-nocheck
/**
 * F28 — the portfolio motion engine, verbatim from the design handoff
 * (portfolio-motion.js). GENERATED — regenerate from the design, don't edit.
 * Used by the live preview and embedded in the exported page as source
 * (`MOTION_SOURCE`), so it must not reference anything outside itself.
 */
/* Roleform portfolio motion — one dependency-free function, used by the live preview and embedded verbatim in the exported page.
   Markup stays plain; it only reads data attributes:
   data-rv="up|fade|blur|scale|left|rise|clip|wipe|drop|pop|flip|win|draw"   reveal on scroll (siblings revealed together are staggered; data-rv-d adds delay)
   data-count   count the number up when seen        data-type   type the text out when seen
   data-fx="marquee|float|ping|blink|wobble|spot|progress"   ambient loops, pointer glow, reading bar
   data-par="px"  parallax against its parent         data-zoom   grow to full size as it reaches the middle
   data-flat   tilt back, flatten on scroll           data-lift="px"   rise on hover; any [data-hz] inside zooms
   data-drag (+ [data-drag-h] handle)   draggable window, raised on click
   data-dock (+ [data-dock-i] items)   dock magnification       data-clock   live clock text
   Honours prefers-reduced-motion (everything stays still and visible; dragging still works). */
export function RF_MOTION(root) {
  if (!root) return null;
  if (root.__rfm) { root.__rfm.scan(); return root.__rfm; }
  var doc = root.ownerDocument, win = doc.defaultView || window, E = 'cubic-bezier(.22,1,.36,1)', SPRING = 'cubic-bezier(.34,1.56,.64,1)';
  var reduce = !win.IntersectionObserver || !root.animate || !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FROM = { up: { opacity: 0, transform: 'translateY(36px)' }, fade: { opacity: 0 }, blur: { opacity: 0, filter: 'blur(14px)', transform: 'translateY(16px)' },
    scale: { opacity: 0, transform: 'scale(.92)' }, left: { opacity: 0, transform: 'translateX(-28px)' }, rise: { transform: 'translateY(108%)' },
    clip: { clipPath: 'inset(0 0 100% 0)' }, wipe: { clipPath: 'inset(0 100% 0 0)' }, drop: { opacity: 0, transform: 'translateY(-56px) rotate(-7deg)' },
    pop: { opacity: 0, transform: 'scale(.5) rotate(-8deg)' }, flip: { opacity: 0, transform: 'perspective(1400px) rotateX(-58deg)' },
    win: { opacity: 0, transform: 'translateY(48px) scale(.86)' } };
  var EASE = { drop: SPRING, pop: SPRING, win: SPRING, draw: 'cubic-bezier(.65,0,.35,1)' };
  var DUR = { rise: 1200, clip: 1200, wipe: 1000, flip: 1100, draw: 1500, pop: 850, drop: 1000, win: 900 };
  var seen = new WeakSet(), loops = [], holds = [], scroll = [], offs = [], raf = 0, shown = true, alive = true, frame = null, zTop = 20;
  function up(n) { return n.parentElement || (n.getRootNode && n.getRootNode().host) || null; }
  for (var n = up(root); n && n !== doc.body && n !== doc.documentElement; n = up(n)) { if (win.getComputedStyle(n).overflowY !== 'visible') { frame = n; break; } }
  function box() { return frame ? frame.getBoundingClientRect() : { top: 0, bottom: win.innerHeight, height: win.innerHeight }; }
  function on(t, ev, f, active) { t.addEventListener(ev, f, active ? false : { passive: true }); offs.push(function () { t.removeEventListener(ev, f); }); }
  function from(el) { var r = el.getAttribute('data-rv'); return r === 'draw' ? { strokeDashoffset: el.__rfL || 0 } : FROM[r] || FROM.up; }
  function addTr(el, t) { el.style.transition = (el.style.transition ? el.style.transition + ',' : '') + t; }
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
    var full = t.nodeValue, i = 0, last = '\u200b'; t.nodeValue = last;
    (function step() { if (!alive || t.nodeValue !== last) return; i++; t.nodeValue = last = full.slice(0, i) || '\u200b'; if (i < full.length) setTimeout(step, 45 + Math.random() * 55); })();
  }
  function play(el, i) {
    var d = Math.min(i, 6) * 90 + (+el.getAttribute('data-rv-d') || 0);
    if (el.__rfh) {
      el.__rfh.cancel(); el.__rfh = null;
      var r = el.getAttribute('data-rv');
      el.animate([Object.assign({ offset: 0 }, from(el))], { duration: DUR[r] || 950, delay: d, easing: EASE[r] || E, fill: 'backwards' });
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
    addTr(el, 'translate .6s ' + E);
    on(el, 'pointerenter', function () {
      if (y) el.style.translate = '0 ' + -y + 'px';
      el.querySelectorAll('[data-hz]').forEach(function (h) { if (!h.__rfz) { h.__rfz = 1; addTr(h, 'scale 1.1s ' + E); } h.style.scale = '1.06'; });
    });
    on(el, 'pointerleave', function () { el.style.translate = ''; el.querySelectorAll('[data-hz]').forEach(function (h) { h.style.scale = ''; }); });
  }
  function drag(el) {
    var h = el.querySelector('[data-drag-h]') || el, sx = 0, sy = 0, bx = 0, by = 0, k = 1, id = null;
    el.__dx = 0; el.__dy = 0;
    on(el, 'pointerdown', function () { el.style.zIndex = String(++zTop); });
    on(h, 'pointerdown', function (e) {
      if (e.button) return; id = e.pointerId; var r = el.getBoundingClientRect(); k = r.width / (el.offsetWidth || r.width || 1);
      sx = e.clientX; sy = e.clientY; bx = el.__dx; by = el.__dy; try { h.setPointerCapture(id); } catch (x) { /* ignore */ } h.style.cursor = 'grabbing'; e.preventDefault();
    }, true);
    on(h, 'pointermove', function (e) { if (id !== e.pointerId) return; el.__dx = bx + (e.clientX - sx) / k; el.__dy = by + (e.clientY - sy) / k; el.style.translate = el.__dx.toFixed(1) + 'px ' + el.__dy.toFixed(1) + 'px'; });
    var end = function () { id = null; h.style.cursor = 'grab'; };
    on(h, 'pointerup', end); on(h, 'pointercancel', end);
  }
  function dock(el) {
    var items = function () { return el.querySelectorAll('[data-dock-i]'); };
    items().forEach(function (i) { addTr(i, 'scale .18s ease-out,translate .18s ease-out'); });
    on(el, 'pointermove', function (e) {
      var r0 = el.getBoundingClientRect(), k = r0.width / (el.offsetWidth || r0.width || 1);
      items().forEach(function (i) { var r = i.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2)) / k, s = 1 + .6 * Math.max(0, 1 - d / 130); i.style.scale = s.toFixed(3); i.style.translate = '0 ' + (-(s - 1) * 24).toFixed(1) + 'px'; });
    });
    on(el, 'pointerleave', function () { items().forEach(function (i) { i.style.scale = ''; i.style.translate = ''; }); });
  }
  function clock(el) {
    var set = function () { var t = el.firstChild; if (!alive || !t || t.nodeType !== 3) return; var d = new Date(); t.nodeValue = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + '  ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
    set(); var iv = setInterval(set, 15000); offs.push(function () { clearInterval(iv); });
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
    if (!alive) return;
    root.querySelectorAll('[data-rv],[data-count],[data-type],[data-fx],[data-par],[data-zoom],[data-flat],[data-lift],[data-drag],[data-dock],[data-clock]').forEach(function (el) {
      if (seen.has(el)) return; seen.add(el);
      if (el.hasAttribute('data-drag')) drag(el);
      if (el.hasAttribute('data-clock')) clock(el);
      if (reduce) return;
      var rv = el.getAttribute('data-rv');
      if (rv === 'draw' && el.getTotalLength) { var L = el.getTotalLength(); if (L > 0) { el.__rfL = L; el.style.strokeDasharray = L + ' ' + L; } else rv = null; }
      if (rv) { el.__rfh = el.animate([from(el), from(el)], { duration: 1, fill: 'forwards' }); holds.push(el.__rfh); }
      // A risen line sits below its clipping parent while held, so watch the parent instead.
      if (rv === 'rise' && el.parentElement) { el.parentElement.__rfc = el; io.observe(el.parentElement); }
      else if (rv || el.hasAttribute('data-count') || el.hasAttribute('data-type')) io.observe(el);
      var fx = el.getAttribute('data-fx');
      if (fx === 'marquee') loops.push(el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }], { duration: +el.getAttribute('data-speed') || 40000, iterations: Infinity }));
      else if (fx === 'float') loops.push(el.animate([{ translate: '0 -14px' }, { translate: '0 14px' }], { duration: 6000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
      else if (fx === 'ping') loops.push(el.animate([{ scale: '1', opacity: .75 }, { scale: '2.8', opacity: 0 }], { duration: 1800, iterations: Infinity, easing: 'cubic-bezier(0,0,.2,1)' }));
      else if (fx === 'blink') loops.push(el.animate([{ opacity: 1 }, { opacity: 1, offset: .5 }, { opacity: 0, offset: .5 }, { opacity: 0 }], { duration: 1100, iterations: Infinity }));
      else if (fx === 'wobble') loops.push(el.animate([{ transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' }], { duration: 2400, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
      else if (fx === 'spot') { var p = el.parentElement; on(p, 'pointermove', function (e) { var r = p.getBoundingClientRect(), k = r.width / (p.offsetWidth || r.width || 1); el.style.setProperty('--x', ((e.clientX - r.left) / k).toFixed(0) + 'px'); el.style.setProperty('--y', ((e.clientY - r.top) / k).toFixed(0) + 'px'); }); }
      else if (fx === 'progress') { el.__rft = 'progress'; scroll.push(el); }
      if (el.hasAttribute('data-par')) { el.__rft = 'par'; scroll.push(el); }
      else if (el.hasAttribute('data-zoom')) { el.__rft = 'zoom'; scroll.push(el); }
      else if (el.hasAttribute('data-flat')) { el.__rft = 'flat'; scroll.push(el); }
      if (el.hasAttribute('data-lift')) lift(el);
      if (el.hasAttribute('data-dock')) dock(el);
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
