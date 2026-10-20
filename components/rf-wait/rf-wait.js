/* Roleform waits — one dependency-free element for every wait longer than ~5s.
   Ported from the Claude Design handoff (`Roleform Loaders v2.dc.html`, `rf-wait.js`).

   Overlay:  <rf-wait open="yes|no" kind="galaxy|papers|blobs" eyebrow="" lines="a|b|c" stage="-1|0..n"
                      state="working|done|error" sub="" still="" long="" done="" error="" run=""></rf-wait>
   Button:   <rf-wait kind="dots" tone="dark"></rf-wait>

   galaxy = analysis · papers = résumé import + files · blobs = quick AI work (deck, quiz, code).

   Differences from the design file, both on purpose:
   - Colours are read from the marigold tokens on :root (N9), with the design's
     hexes only as a fallback for the instant before the stylesheet applies.
   - No `total`/`eta` counter. It advanced on a timer ("07 / 12" after N
     seconds), and a progress number we did not measure is the fake timer the
     parsing screen refuses. `stage` is the only progress this shows, and the
     caller sets it from real state.

   Canvas/SVG/transform only, one rAF per open overlay, stops when closed.
   Honours prefers-reduced-motion. Plain JS (not type-checked) to stay a
   faithful port; the typed surface is components/wait-overlay.tsx. */
(() => {
  if (typeof window === 'undefined' || customElements.get('rf-wait')) return;
  const FALLBACK = { ink: '#4A0D0D', mari: '#F9B130', mariD: '#E8971A', wash: '#FCEFCB', pink: '#FF9DC0', pinkXL: '#FFD6E4', cream: '#F8F0E3', raised: '#FFFBF4', muted: '#7A5647' };
  const TOKENS = { ink: '--color-text', mari: '--color-accent-500', mariD: '--color-accent-600', wash: '--color-accent-100', pink: '--color-sage-500', pinkXL: '--color-sage-200', cream: '--color-bg', raised: '--color-bg-raised', muted: '--color-text-muted' };
  const HEX = /^#[0-9a-f]{6}$/i;
  let C = FALLBACK;
  /** Canvas needs concrete colours, so the tokens are resolved once per open. */
  function readTokens() {
    const s = getComputedStyle(document.documentElement), o = {};
    for (const k in TOKENS) { const v = s.getPropertyValue(TOKENS[k]).trim(); o[k] = HEX.test(v) ? v : FALLBACK[k]; }
    C = o;
  }
  const SPR = { dir: '/mascots/redpanda-directions.webp', react: '/mascots/redpanda-reactions.webp' };
  const DIRS = ['up-left', 'up', 'up-right', 'left', 'center', 'right', 'down-left', 'down', 'down-right'];
  const REACT = ['blink', 'heart', 'sparkle', 'surprised', 'wink', 'bashful', 'sleepy', 'dizzy', 'delighted'];
  const LOOK = ['left', 'up-left', 'left', 'down-left', 'left', 'center'];
  const GLYPHS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789#&%?';
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const lin = p => p;
  const eOut = p => 1 - Math.pow(1 - p, 3);
  const eIn = p => p * p * p;
  const eInOut = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const back = p => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  const backIn = p => { const c1 = 1.9, c3 = c1 + 1; return c3 * p * p * p - c1 * p * p; };
  const elastic = p => p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - .75) * (2 * Math.PI) / 3) + 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const cell = i => `${(i % 3) * 50}% ${Math.floor(i / 3) * 50}%`;
  const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  function samp(k, t) {
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) {
      const [t0, a] = k[i - 1], [t1, b, e] = k[i], p = (e || eInOut)((t - t0) / (t1 - t0) || 0), o = {};
      for (const key in b) o[key] = lerp(a[key], b[key], p);
      return o;
    }
    return k[k.length - 1][1];
  }
  const markG = () => `<g class="m-post"><rect x="10" y="2.5" width="18" height="22" rx="3" fill="${C.pink}" transform="rotate(9 19 13.5)"/></g><g class="m-sheet"><path d="M7 7H17L22 12V26A3 3 0 0 1 19 29H7A3 3 0 0 1 4 26V10A3 3 0 0 1 7 7Z" fill="${C.mari}"/><path d="M17 7V10.5A1.5 1.5 0 0 0 18.5 12H22Z" fill="${C.mariD}"/></g><path class="m-l m-l1" pathLength="1" d="M8 13.5h5"/><path class="m-l m-l2" pathLength="1" d="M8 18h9"/><path class="m-l m-l3" pathLength="1" d="M8 22.5h5"/><g class="m-badge"><circle cx="23.5" cy="23.5" r="6.5" fill="${C.ink}" stroke="${C.cream}" stroke-width="1.8"/><path class="m-tick" pathLength="1" d="M20.9 23.6l1.8 1.8 3.5-3.7"/></g>`;

  /* ---------- galaxy: the mark at the centre of a tilted orbit system, glowing trails, sparks ---------- */
  function galaxy() {
    const el = mk('div', 'vis'), cv = mk('canvas'); el.appendChild(cv);
    const ctx = cv.getContext('2d'), cols = [C.mari, C.pink, C.cream];
    const glows = cols.map(c => { const g = mk('canvas'); g.width = g.height = 64; const x = g.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, rgba(c, .85)); gr.addColorStop(.28, rgba(c, .32)); gr.addColorStop(1, rgba(c, 0)); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return g; });
    const O = [{ rx: .34, ry: .25, tl: -.34, sp: 1.45 }, { rx: .27, ry: .33, tl: .32, sp: -1.15 }, { rx: .43, ry: .15, tl: -.07, sp: 1.85 }];
    const stars = Array.from({ length: 58 }, () => ({ x: Math.random(), y: Math.random(), r: .4 + Math.random() * 1.2, ph: Math.random() * 6.3, sp: .8 + Math.random() * 2.2, v: .004 + Math.random() * .014 }));
    const PM = { sheet: new Path2D('M7 7H17L22 12V26A3 3 0 0 1 19 29H7A3 3 0 0 1 4 26V10A3 3 0 0 1 7 7Z'), fold: new Path2D('M17 7V10.5A1.5 1.5 0 0 0 18.5 12H22Z'), l: [new Path2D('M8 13.5h5'), new Path2D('M8 18h9'), new Path2D('M8 22.5h5')], tick: new Path2D('M20.9 23.6l1.8 1.8 3.5-3.7') };
    const LL = [5, 9, 5];
    let W = 0, H = 0, dpr = 1, ang, hist, parts, rings, em, mode, mAt, kick, burst;
    const size = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return false; const d = Math.min(2, window.devicePixelRatio || 1); if (w !== W || h !== H || d !== dpr) { W = w; H = h; dpr = d; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); } return true; };
    const piece = (p, x, y, fn) => { if (p <= 0) return; ctx.save(); ctx.globalAlpha = Math.min(1, p * 1.6); ctx.translate(x, y); ctx.scale(p, p); ctx.translate(-x, -y); fn(); ctx.restore(); };
    function drawMark(x, y, M, a, s) {
      ctx.save(); ctx.translate(x, y); ctx.scale(M / 32 * s, M / 32 * s); ctx.translate(-16, -16);
      piece(back(cl(a / .45)), 19, 13.5, () => { ctx.translate(19, 13.5); ctx.rotate(.157); ctx.translate(-19, -13.5); ctx.fillStyle = C.pink; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(10, 2.5, 18, 22, 3); else ctx.rect(10, 2.5, 18, 22); ctx.fill(); });
      piece(back(cl((a - .12) / .45)), 13, 18, () => { ctx.fillStyle = C.mari; ctx.fill(PM.sheet); ctx.fillStyle = C.mariD; ctx.fill(PM.fold); });
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineCap = 'round';
      PM.l.forEach((p, i) => { const q = eOut(cl((a - .38 - i * .08) / .3)); if (q <= 0) return; ctx.setLineDash([LL[i] * q, 40]); ctx.stroke(p); });
      ctx.setLineDash([]);
      piece(back(cl((a - .6) / .4)), 23.5, 23.5, () => {
        ctx.beginPath(); ctx.arc(23.5, 23.5, 6.5, 0, 7); ctx.fillStyle = C.ink; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = C.cream; ctx.stroke();
        const q = eOut(cl((a - .82) / .3)); if (q > 0) { ctx.setLineDash([7.7 * q, 40]); ctx.strokeStyle = C.mari; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(PM.tick); ctx.setLineDash([]); }
      });
      ctx.restore();
    }
    return {
      el,
      reset() { ang = [0, 2.1, 4.2]; hist = [[], [], []]; parts = []; rings = []; em = [0, 0, 0]; mode = 'work'; mAt = 0; kick = 0; burst = false; },
      pulse(t) { kick = .16; rings.push(t); },
      done(t) { mode = 'done'; mAt = t; burst = false; },
      error(t) { mode = 'error'; mAt = t; },
      frame(t, dt, red) {
        if (!size()) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
        const cx = W * .46, cy = H * .5, M = Math.min(H * .44, 112), base = H / 34;
        const vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .62); vg.addColorStop(0, rgba(C.mari, .17)); vg.addColorStop(1, rgba(C.mari, 0)); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = C.cream;
        for (const s of stars) { if (!red) s.x = (s.x - s.v * dt + 1) % 1; ctx.globalAlpha = .1 + .38 * (.5 + .5 * Math.sin(t * s.sp + s.ph)); ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
        const mp = cl((t - mAt) / .75);
        let rm = 1, sm = red ? 0 : 1;
        if (mode === 'done') {
          rm = 1 - eIn(mp); sm = red ? 0 : 1 + mp * 2.4;
          if (mp >= 1 && !burst) { burst = true; kick = .26; rings.push(t); if (!red) for (let k = 0; k < 60; k++) { const a = Math.random() * 6.283, v = 120 + Math.random() * 250; parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 70, life: 1 + Math.random() * .7, age: 0, r: 1.6 + Math.random() * 2.4, c: k % 3, g: 260, f: true }); } }
        }
        if (mode === 'error') sm = red ? 0 : 1 - eOut(mp) * .94;
        const dots = [];
        for (let i = 0; i < 3; i++) {
          const o = O[i]; ang[i] += o.sp * sm * dt; const a = ang[i];
          const rx = Math.min(o.rx * W, 240) * rm, ry = o.ry * H * rm, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry, z = Math.sin(a);
          const x = cx + ex * Math.cos(o.tl) - ey * Math.sin(o.tl), y = cy + ex * Math.sin(o.tl) + ey * Math.cos(o.tl), r = base * (.62 + .25 * (z + 1)) * (mode === 'done' ? 1 - mp * .5 : 1);
          dots.push({ x, y, r, z });
          const h = hist[i]; h.push({ x, y, r, z, t }); while (h.length && t - h[0].t > .42) h.shift();
          if (mode === 'work' && !red) { em[i] += dt * 24; while (em[i] >= 1) { em[i]--; parts.push({ x, y, vx: (Math.random() - .5) * 34, vy: (Math.random() - .5) * 34 - 8, life: .45 + Math.random() * .7, age: 0, r: .7 + Math.random() * 1.5, c: i, g: 0, f: z > 0 }); } }
        }
        if (parts.length > 280) parts.splice(0, parts.length - 280);
        for (const p of parts) { p.age += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        parts = parts.filter(p => p.age < p.life);
        kick *= Math.pow(.004, dt);
        const show = rm > .04, dim = mode === 'error' ? .45 : 1;
        const layer = front => {
          ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
          if (show && !red) for (let i = 0; i < 3; i++) { const h = hist[i]; ctx.strokeStyle = cols[i]; for (let k = 1; k < h.length; k++) { const p1 = h[k], p0 = h[k - 1]; if ((p1.z > 0) !== front) continue; const f = k / h.length; ctx.globalAlpha = f * f * .6 * dim; ctx.lineWidth = Math.max(.5, p1.r * 1.8 * f); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); } }
          for (const p of parts) { if (p.f !== front) continue; ctx.globalAlpha = (1 - p.age / p.life) * .9; ctx.fillStyle = cols[p.c]; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
          if (show) for (let i = 0; i < 3; i++) { const d = dots[i]; if ((d.z > 0) !== front) continue; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = dim * (red ? .6 + .4 * Math.sin(t * 2.4 + i * 2) : 1); ctx.drawImage(glows[i], d.x - d.r * 4.5, d.y - d.r * 4.5, d.r * 9, d.r * 9); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = mode === 'error' ? C.pinkXL : cols[i]; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill(); }
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        };
        layer(false);
        for (const r0 of rings) { const p = (t - r0) / .85; if (p < 0 || p > 1) continue; ctx.globalAlpha = (1 - p) * .8; ctx.strokeStyle = C.mari; ctx.lineWidth = 3 * (1 - p) + .6; ctx.beginPath(); ctx.arc(cx, cy, M * .5 + eOut(p) * M * 1.5, 0, 7); ctx.stroke(); }
        rings = rings.filter(r0 => t - r0 < .9); ctx.globalAlpha = 1;
        const shake = mode === 'error' && !red ? Math.sin((t - mAt) * 42) * 7 * (1 - mp) : 0;
        drawMark(cx + shake, cy + (mode === 'error' ? eOut(mp) * 6 : 0), M, red ? 9 : t, (red ? 1 : 1 + .03 * Math.sin(t * 2.6)) * (1 + kick));
        layer(true);
      }
    };
  }

  /* ---------- papers: résumé sheets fly in, fan, flip, stack and become the mark ---------- */
  function papers(kit) {
    const el = mk('div', 'vis');
    el.innerHTML = `<div class="pc">${[0, 1, 2, 3].map(i => `<div class="sht"><b></b><u></u><u style="width:${[78, 64, 86, 70][i]}%"></u><u class="a"></u><u style="width:${[58, 74, 62, 80][i]}%"></u><u style="width:${[70, 52, 76, 60][i]}%"></u></div>`).join('')}<div class="pm"><svg viewBox="0 0 32 32" aria-hidden="true">${markG()}</svg></div></div>`;
    const pc = el.querySelector('.pc'), sh = [...el.querySelectorAll('.sht')], pm = el.querySelector('.pm'), svg = pm.querySelector('svg'), T = 3.6;
    const OFF = [[-320, -150, -55], [-160, -240, 35], [180, -250, -30], [330, -130, 50]];
    const K = sh.map((_, i) => {
      const fx = (i - 1.5) * 58, fy = Math.abs(i - 1.5) * 12 - 6, fr = (i - 1.5) * 13, d = i * .07, [ox, oy, or] = OFF[i], st = { x: 0, y: -i * 4, r: (i - 1.5) * 4, s: 1, o: 1, f: 1 };
      return [[0, { x: ox, y: oy, r: or, s: .85, o: 0, f: 1 }], [.06 + d, { x: ox, y: oy, r: or, s: .85, o: 1, f: 1 }, lin], [.62 + d, { x: fx, y: fy, r: fr, s: 1, o: 1, f: 1 }, back],
        [1.0 + d, { x: fx, y: fy - 6, r: fr, s: 1, o: 1, f: 1 }, eInOut], [1.2 + d, { x: fx, y: fy - 12, r: fr * .4, s: 1.06, o: 1, f: -1 }, eInOut], [1.42 + d, { x: fx, y: fy - 4, r: fr, s: 1, o: 1, f: 1 }, eOut],
        [1.95 + (3 - i) * .05, st, back], [2.15, st, lin], [2.4, { x: 0, y: -i * 2, r: 0, s: .5, o: 0, f: 1 }, eIn], [T, { x: 0, y: 0, r: 0, s: .5, o: 0, f: 1 }, lin]];
    });
    const KM = [[0, { s: 0, o: 0 }], [2.2, { s: 0, o: 0 }, lin], [2.55, { s: 1, o: 1 }, back], [3.05, { s: 1, o: 1 }, lin], [3.3, { s: 1.35, o: 0 }, eIn], [T, { s: 0, o: 0 }, lin]];
    let vt, mode, mAt, hold, prev;
    const go = () => { svg.classList.remove('go'); void svg.getBoundingClientRect(); svg.classList.add('go'); };
    return {
      el,
      reset() { vt = 0; mode = 'work'; mAt = 0; hold = false; prev = 0; svg.classList.remove('go'); },
      pulse() { if (!kit.reduce()) pc.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' }); },
      done(t) { mode = 'done'; mAt = t; },
      error(t) { mode = 'error'; mAt = t; },
      frame(t, dt, red) {
        const k = el.clientWidth < 420 ? .74 : 1;
        if (red) vt = mode === 'done' ? 2.9 : 1.0;
        else if (!hold) vt += dt * (mode === 'done' ? 2.6 : mode === 'error' ? 0 : 1);
        let ct = vt % T;
        if (mode === 'done' && !hold && ct >= 2.85 && ct < 3.2) { hold = true; vt += 2.9 - ct; ct = 2.9; if (!red) kit.confetti(pm); }
        if (prev < 2.2 && ct >= 2.2) go();
        prev = ct;
        const ep = mode === 'error' ? cl((t - mAt) / .9) : 0;
        sh.forEach((s, i) => { const v = samp(K[i], ct); s.style.transform = `translate(${(v.x * k).toFixed(1)}px,${((v.y + ep * ep * 420) * k).toFixed(1)}px) rotate(${(v.r + ep * (i - 1.5) * 50).toFixed(1)}deg) scale(${(v.s * v.f).toFixed(3)},${v.s.toFixed(3)})`; s.style.opacity = (v.o * (1 - ep)).toFixed(3); });
        const m = samp(KM, ct); pm.style.transform = `scale(${m.s.toFixed(3)})`; pm.style.opacity = (m.o * (1 - ep)).toFixed(3);
      }
    };
  }

  /* ---------- blobs: the three palette dots as gooey metaballs that merge and split ---------- */
  function blobs(kit) {
    const el = mk('div', 'vis'), id = kit.uid + 'goo', order = [C.ink, C.pink, C.mari];
    el.innerHTML = `<svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="240" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="g"/><feComposite in="SourceGraphic" in2="g" operator="atop"/></filter></defs><g class="gg" filter="url(#${id})">${order.map(c => `<circle r="9" cx="185" cy="118" fill="${c}"/>`).join('')}${order.map(c => `<ellipse rx="30" ry="30" cx="185" cy="118" fill="${c}"/>`).join('')}</g><g class="bm" opacity="0"><g class="bmi">${markG()}</g></g></svg>`;
    const svg = el.querySelector('svg'), gg = el.querySelector('.gg'), drops = [...gg.querySelectorAll('circle')], mains = [...gg.querySelectorAll('ellipse')], bm = el.querySelector('.bm'), bmi = el.querySelector('.bmi');
    const CX = 185, CY = 118, T = 3.0, off = [4.189, 2.094, 0];
    let rot, mode, mAt, kick, lastR, lastMerge, fired;
    return {
      el,
      reset() { rot = 0; mode = 'work'; mAt = 0; kick = 0; lastR = 70; lastMerge = 0; fired = false; bm.setAttribute('opacity', '0'); bmi.classList.remove('go'); gg.style.opacity = 1; },
      pulse() { kick = 1; },
      done(t) { mode = 'done'; mAt = t; },
      error(t) { mode = 'error'; mAt = t; },
      frame(t, dt, red) {
        let R = 64, merge = 0, cy = CY, rs = 1, op = 1;
        const ct = (t % T) / T;
        if (mode === 'work' && !red) {
          rot += dt * 1.7;
          if (ct < .4) R = 70 + 6 * Math.sin(t * 7);
          else if (ct < .58) { const q = (ct - .4) / .18; R = 70 * (1 - backIn(q)); merge = eIn(q); }
          else if (ct < .7) { R = 0; merge = 1; }
          else { const q = (ct - .7) / .3; R = 70 * elastic(q); merge = 1 - eOut(cl(q * 2.5)); }
          lastR = R; lastMerge = merge;
        } else if (mode === 'done') {
          const p = t - mAt; rot += dt * (red ? 0 : 3.2);
          R = red ? 0 : lastR * (1 - eIn(cl(p / .4))); merge = red ? 1 : Math.max(lastMerge, cl(p / .4)); rs = red ? 0 : 1 - eIn(cl((p - .4) / .25));
          const ms = red ? 1 : back(cl((p - .38) / .45));
          if ((p >= .38 || red) && !fired) { fired = true; bmi.classList.remove('go'); void svg.getBoundingClientRect(); bmi.classList.add('go'); if (!red) kit.confetti(bm); }
          bm.setAttribute('opacity', fired ? '1' : '0');
          bm.setAttribute('transform', `translate(${CX} ${CY}) scale(${(3.4 * ms).toFixed(3)}) translate(-16 -16)`);
        } else if (mode === 'error') {
          const p = cl((t - mAt) / .9); rot += dt * 1.7 * (1 - p); R = lastR * (1 - .25 * eOut(p)); cy = CY + 36 * eOut(p); op = 1 - .5 * p; merge = lastMerge * (1 - p);
        }
        kick *= Math.pow(.01, dt);
        const wob = Math.sin(t * 15) * .13 * merge + kick * .12, r = (30 + 10 * merge) * (1 + kick * .25) * rs;
        for (let i = 0; i < 3; i++) {
          const a = rot + off[i], e = mains[i], d = drops[i];
          e.setAttribute('cx', (CX + Math.cos(a) * R).toFixed(1)); e.setAttribute('cy', (cy + Math.sin(a) * R * .62).toFixed(1));
          e.setAttribute('rx', Math.max(0, r * (1 + wob)).toFixed(1)); e.setAttribute('ry', Math.max(0, r * (1 - wob)).toFixed(1));
          const a2 = a - .75, R2 = R * 1.55 + 18 * (1 - merge) + kick * 46;
          d.setAttribute('cx', (CX + Math.cos(a2) * R2).toFixed(1)); d.setAttribute('cy', (cy + Math.sin(a2) * R2 * .62).toFixed(1)); d.setAttribute('r', Math.max(0, 10 * (1 - merge * .5) * rs).toFixed(1));
        }
        gg.style.opacity = op;
      }
    };
  }

  const KINDS = { galaxy, papers, blobs };

  // Custom properties inherit into the shadow root, so fonts, radii and
  // shadows use the tokens directly; only canvas fills need `C`.
  const css = () => `
    :host{display:block}
    *{box-sizing:border-box}
    .ov{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;padding:16px;container-type:inline-size;pointer-events:auto;font-family:var(--font-body),system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased}
    .ov.on{display:flex}
    .scrim{position:absolute;inset:0;background:${rgba(C.cream, .58)};-webkit-backdrop-filter:blur(14px) saturate(1.1);backdrop-filter:blur(14px) saturate(1.1)}
    .card{position:relative;width:100%;max-width:540px;background:${C.raised};border-radius:var(--radius-xl);overflow:hidden;box-shadow:var(--shadow-lg)}
    .stage{position:relative;height:250px;overflow:hidden;background:${C.wash}}
    .stage[data-k="galaxy"]{background:${C.ink}}
    .stage[data-k="papers"]{background:${C.pinkXL}}
    .vslot,.vis,.fx{position:absolute;inset:0}
    .vis canvas,.vis svg{display:block;width:100%;height:100%}
    .fx{pointer-events:none;z-index:4;overflow:hidden}
    .cf{position:absolute;width:8px;height:8px}
    .pd{position:absolute;right:14px;bottom:8px;width:96px;height:96px;z-index:3;pointer-events:none;transform-origin:50% 100%}
    .psh{position:absolute;left:22%;right:22%;bottom:-3px;height:10px;border-radius:50%;background:${rgba(C.ink, .18)}}
    .stage[data-k="galaxy"] .psh{background:rgba(0,0,0,.45)}
    .bob{position:absolute;inset:0;animation:bob 1.2s ease-in-out infinite alternate}
    .spr{position:absolute;inset:0;background-size:300% 300%;background-repeat:no-repeat}
    .sd{background-image:url('${SPR.dir}')}
    .sr{background-image:url('${SPR.react}');opacity:0}
    .body{display:flex;flex-direction:column;gap:10px;padding:22px 28px 28px}
    .top{display:flex;align-items:center;gap:12px;min-height:22px;font-size:12.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${C.muted}}
    .eb{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .clk{display:inline-flex;align-items:center;gap:6px;flex:none;color:${C.ink};font-variant-numeric:tabular-nums;letter-spacing:.06em}
    .live{width:7px;height:7px;border-radius:50%;background:${C.mari};animation:blip 1.4s ease-in-out infinite}
    .pips{margin-left:auto;display:flex;align-items:center;gap:5px;flex:none}
    .pip{width:18px;height:6px;border-radius:999px;background:${rgba(C.ink, .14)};transition:width .35s cubic-bezier(.34,1.56,.64,1),background .3s}
    .pip.d{background:${C.ink}}.pip.c{width:32px;background:${C.mari}}
    .kt{margin:0;font-family:var(--font-heading),Impact,sans-serif;font-weight:400;font-size:46px;line-height:1;text-transform:uppercase;min-height:1em;text-wrap:balance}
    .w{display:inline-block;white-space:nowrap}
    .ch{display:inline-block}
    .ch.scr{color:${C.mariD}}.ch.scr.p{color:${C.pink}}
    .ch.set{animation:cpop .46s cubic-bezier(.34,1.8,.64,1) both}
    .sub{margin:0;min-height:3em;font-size:15.5px;line-height:1.5;color:${C.muted};text-wrap:pretty}
    .sub span{display:block;animation:rise .42s cubic-bezier(.22,1,.36,1) both}
    .srt{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
    .pc{position:absolute;left:calc(50% - 26px);top:52%;width:0;height:0}
    .sht{position:absolute;left:-34px;top:-44px;width:68px;height:88px;border-radius:8px;background:${C.raised};box-shadow:var(--shadow-md);padding:9px 8px;display:flex;flex-direction:column;gap:5px;opacity:0;will-change:transform}
    .sht b{display:block;height:6px;width:58%;border-radius:3px;background:${C.ink}}
    .sht u{display:block;height:3.5px;border-radius:2px;background:${rgba(C.ink, .1)};width:90%}
    .sht u.a{background:${C.mari};width:44%}
    .pm{position:absolute;left:-56px;top:-56px;width:112px;height:112px;opacity:0;will-change:transform}
    .pm svg{display:block;width:100%;height:100%;overflow:visible}
    .m-post,.m-sheet,.m-badge{transform-box:fill-box;transform-origin:center}
    .m-l{fill:none;stroke:${C.ink};stroke-width:2;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1}
    .m-tick{fill:none;stroke:${C.mari};stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1}
    .go .m-post{animation:mpost .5s cubic-bezier(.22,1,.36,1) both}
    .go .m-sheet{animation:msheet .46s cubic-bezier(.34,1.56,.64,1) .06s both}
    .go .m-l{animation:draw .28s ease-out forwards}
    .go .m-l1{animation-delay:.26s}.go .m-l2{animation-delay:.34s}.go .m-l3{animation-delay:.42s}
    .go .m-badge{animation:mpop .42s cubic-bezier(.34,1.8,.64,1) .44s both}
    .go .m-tick{animation:draw .3s ease-out .68s forwards}
    @container (max-width:520px){
      .stage{height:210px}.kt{font-size:36px}.body{padding:18px 20px 24px}.card{border-radius:var(--radius-lg)}
      .pd{width:78px;height:78px;right:10px}
      .sht{left:-28px;top:-36px;width:56px;height:72px;padding:7px 6px;gap:4px}
      .pm{left:-46px;top:-46px;width:92px;height:92px}
      .pc{left:calc(50% - 30px)}
    }
    @keyframes bob{to{transform:translateY(-3px)}}
    @keyframes blip{50%{opacity:.25}}
    @keyframes cpop{0%{transform:translateY(.32em) scale(.7);opacity:.2}100%{transform:none;opacity:1}}
    @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
    @keyframes draw{to{stroke-dashoffset:0}}
    @keyframes mpost{from{opacity:0;transform:translate(3px,-4px) rotate(6deg)}to{opacity:1;transform:none}}
    @keyframes msheet{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:none}}
    @keyframes mpop{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:none}}
    @media (prefers-reduced-motion:reduce){
      .bob,.live,.ch.set,.sub span{animation:none}
      .m-l,.m-tick,.go .m-l,.go .m-tick{stroke-dashoffset:0;animation:none!important}
      .go .m-post,.go .m-sheet,.go .m-badge{animation:none!important}
    }`;
  const SHELL = `<div class="ov"><div class="scrim"></div><div class="card" role="status" aria-live="polite"><span class="srt"></span>
    <div class="stage"><div class="vslot"></div><div class="fx"></div><div class="pd" aria-hidden="true"><span class="psh"></span><span class="bob"><span class="spr sd"></span><span class="spr sr"></span></span></div></div>
    <div class="body"><div class="top" aria-hidden="true"><span class="eb"></span><span class="clk"><span class="live"></span><span class="el">00:00</span></span><span class="pips"></span></div><h2 class="kt" aria-hidden="true"></h2><p class="sub"></p></div></div></div>`;
  const dots = () => `<style>:host{display:inline-block;vertical-align:middle;line-height:0}
    .ring{position:relative;display:block;width:16px;height:16px;animation:chase 1.1s linear infinite}
    .ring i{position:absolute;width:5px;height:5px;margin:-2.5px;border-radius:50%;animation:pulse 1.1s ease-in-out infinite}
    .c1{left:50%;top:calc(50% - 5px);background:var(--color-accent-500)}
    .c2{left:calc(50% + 4.33px);top:calc(50% + 2.5px);background:var(--color-sage-500);animation-delay:-.37s!important}
    .c3{left:calc(50% - 4.33px);top:calc(50% + 2.5px);background:var(--color-text);animation-delay:-.73s!important}
    :host([tone="dark"]) .c3{background:var(--color-bg)}
    @keyframes chase{to{transform:rotate(360deg)}}
    @keyframes pulse{0%,100%{transform:scale(.7)}50%{transform:scale(1.15)}}
    @media (prefers-reduced-motion:reduce){.ring{animation:none}}</style><span class="ring" aria-hidden="true"><i class="c1"></i><i class="c2"></i><i class="c3"></i></span>`;

  class RfWait extends HTMLElement {
    static get observedAttributes() { return ['open', 'kind', 'eyebrow', 'lines', 'stage', 'state', 'sub', 'still', 'long', 'done', 'error', 'run']; }
    constructor() { super(); this._r = this.attachShadow({ mode: 'open' }); this._uid = 'w' + Math.random().toString(36).slice(2, 9); this._loop = this._loop.bind(this); this._st = 'working'; }
    _g(n, d = '') { const v = this.getAttribute(n); return v == null || v === 'undefined' || v === 'null' ? d : v; }
    connectedCallback() { if (!this._built) this._build(); if (!this._dots) this._sync(); }
    disconnectedCallback() { cancelAnimationFrame(this._raf); this._raf = 0; clearTimeout(this._acT); }
    attributeChangedCallback(n, a, b) { if (!this._built || this._dots || a === b) return; if (n === 'kind') this._mountVis(); this._sync(n); }
    _build() {
      this._built = true;
      if (this._g('kind') === 'dots') { this._dots = true; this._r.innerHTML = dots(); return; }
      readTokens();
      this._r.innerHTML = `<style>${css()}</style>${SHELL}`;
      const q = s => this._r.querySelector(s);
      Object.assign(this, { _ov: q('.ov'), _scrim: q('.scrim'), _card: q('.card'), _stage: q('.stage'), _slot: q('.vslot'), _fx: q('.fx'), _pd: q('.pd'), _pD: q('.sd'), _pR: q('.sr'), _eb: q('.eb'), _el: q('.el'), _pips: q('.pips'), _kt: q('.kt'), _sub: q('.sub'), _srt: q('.srt') });
      this._mountVis();
    }
    _kit() {
      return {
        uid: this._uid, reduce: () => this._reduce,
        confetti: target => {
          if (this._reduce) return;
          const sr = this._stage.getBoundingClientRect(), r = target.getBoundingClientRect(), x = r.left + r.width / 2 - sr.left, y = r.top + r.height / 2 - sr.top;
          for (let k = 0; k < 18; k++) {
            const s = mk('i', 'cf'), a = Math.random() * 6.283, d = 70 + Math.random() * 90;
            s.style.cssText = `left:${x}px;top:${y}px;background:${[C.mari, C.pink, C.ink, C.mariD][k % 4]};border-radius:${k % 2 ? '50%' : '2px'}`;
            this._fx.appendChild(s);
            s.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${(Math.cos(a) * d).toFixed(0)}px),calc(-50% + ${(Math.sin(a) * d * .8 - 20).toFixed(0)}px)) rotate(${(Math.random() * 540).toFixed(0)}deg) scale(.4)`, opacity: 0 }], { duration: 800 + Math.random() * 400, easing: 'cubic-bezier(.22,1,.36,1)' }).onfinish = () => s.remove();
          }
        }
      };
    }
    _mountVis() {
      const k = KINDS[this._g('kind', 'galaxy')] ? this._g('kind', 'galaxy') : 'galaxy';
      if (k === this._vk) return;
      this._vk = k; this._vis = KINDS[k](this._kit()); this._slot.innerHTML = ''; this._slot.appendChild(this._vis.el); this._stage.dataset.k = k; this._vis.reset();
    }
    _sync(n) {
      const want = !/^(no|false|0)$/.test(this._g('open', 'yes')), st = this._g('state', 'working');
      if (n === 'run' || (st === 'working' && this._st !== 'working')) this._selfClosed = false;
      if (!want) { this._selfClosed = false; this._st = st; if (this._on) this._close(); return; }
      if (!this._on) { this._st = st; if (!this._selfClosed && st !== 'done') this._open(); return; }
      if (n === 'run') { this._st = st; this._restart(); return; }
      if (st !== this._st) { this._st = st; this._onState(st); }
      if (n === 'stage' && st === 'working') this._onStage();
      if (n === 'lines' || n === 'stage' || n === 'eyebrow') this._lineNow();
    }
    _time() { return (performance.now() - this._t0) / 1000; }
    _stageNum() { const v = parseInt(this._g('stage', '-1'), 10); return isNaN(v) ? -1 : v; }
    _lines() { return this._g('lines').split('|').map(s => s.trim()).filter(Boolean); }
    _open() {
      this._on = true; this._reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      (this._exit || []).forEach(a => a.cancel()); this._exit = null;
      this._ov.classList.add('on'); this._restart();
      if (!this._reduce) {
        this._scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
        this._card.animate([{ opacity: 0, transform: 'translateY(40px) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 640, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      }
      if (!this._raf) this._raf = requestAnimationFrame(this._loop);
    }
    _close() {
      this._on = false; clearTimeout(this._acT);
      const fin = () => { if (this._on) return; this._ov.classList.remove('on'); cancelAnimationFrame(this._raf); this._raf = 0; (this._exit || []).forEach(a => a.cancel()); this._exit = null; };
      if (this._reduce) return fin();
      const a1 = this._scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
      const a2 = this._card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(18px) scale(.95)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
      this._exit = [a1, a2]; a1.onfinish = fin;
    }
    _restart() {
      this._t0 = performance.now(); this._last = 0; clearTimeout(this._acT);
      this._ktText = null; this._subText = null; this._pipKey = null; this._ebText = null; this._fx.innerHTML = '';
      this._vis.reset(); this._stageSeen = this._stageNum();
      this._pNext = .9; this._lk = 0; this._react('surprised', .75);
      if (this._st !== 'working') this._onState(this._st); else this._lineNow();
    }
    _onState(st) {
      const t = this._time(); clearTimeout(this._acT);
      if (st === 'done') { this._vis.done(t); this._react('delighted', 99); this._hop(2); this._acT = setTimeout(() => { this._selfClosed = true; this._close(); }, 1800); }
      else if (st === 'error') { this._vis.error(t); this._react('dizzy', 99); }
      else { this._restart(); return; }
      this._lineNow();
    }
    _onStage() { const n = this._stageNum(); if (n > this._stageSeen) { this._vis.pulse(this._time()); this._react('wink', .8); this._hop(1); } this._stageSeen = n; }
    _lineNow() {
      const L = this._lines(), sn = this._stageNum();
      let txt = '';
      if (this._st === 'done') txt = this._g('done', 'Ready');
      else if (this._st === 'error') txt = 'Hit a snag';
      else if (L.length) txt = sn >= 0 ? L[Math.min(sn, L.length - 1)] : L[Math.floor(this._time() / 2.6) % L.length];
      this._type(txt);
    }
    _type(text) {
      if (text === this._ktText) return;
      this._ktText = text; this._srt.textContent = text; let i = 0;
      this._kt.innerHTML = String(text).toUpperCase().split(' ').map(w => `<span class="w">${[...w].map(ch => `<span class="ch" data-c="${esc(ch)}" data-i="${i++}">${this._reduce ? esc(ch) : GLYPHS[Math.random() * GLYPHS.length | 0]}</span>`).join('')}</span>`).join(' ');
      this._chs = [...this._kt.querySelectorAll('.ch')]; this._ktAt = performance.now();
      this._chs.forEach(c => { c._set = this._reduce; if (this._reduce) c.className = 'ch set'; });
    }
    _scramble(now) {
      if (!this._chs) return;
      const el = now - this._ktAt, tick = now - (this._scrAt || 0) > 55;
      if (tick) this._scrAt = now;
      for (const c of this._chs) {
        if (c._set) continue;
        const i = +c.dataset.i;
        if (el > 140 + i * 34) { c._set = true; c.textContent = c.dataset.c; c.className = 'ch set'; }
        else if (tick) { c.textContent = GLYPHS[Math.random() * GLYPHS.length | 0]; c.className = 'ch scr' + (i % 3 === 1 ? ' p' : ''); }
      }
    }
    _face(kind, name) {
      if (kind === 'r') { this._pR.style.backgroundPosition = cell(REACT.indexOf(name)); this._pR.style.opacity = 1; this._pD.style.opacity = 0; }
      else { this._pD.style.backgroundPosition = cell(DIRS.indexOf(name)); this._pD.style.opacity = 1; this._pR.style.opacity = 0; }
    }
    _react(name, dur) { this._face('r', name); this._pBack = (this._t0 ? this._time() : 0) + dur; }
    _hop(n) {
      if (this._reduce) return;
      this._pd.animate([{ transform: 'translateY(0) scale(1,1)' }, { transform: 'translateY(0) scale(1.1,.9)', offset: .15 }, { transform: 'translateY(-20px) scale(.94,1.08)', offset: .45 }, { transform: 'translateY(0) scale(1.08,.92)', offset: .8 }, { transform: 'translateY(0) scale(1,1)' }], { duration: 560, iterations: n, easing: 'ease-out' });
    }
    _tickPanda(t) {
      if (this._st !== 'working') return;
      if (this._pBack && t >= this._pBack) { this._pBack = 0; this._face('d', LOOK[this._lk]); this._pNext = t + 1.2; }
      if (!this._pBack && t >= this._pNext) { this._pNext = t + 1 + Math.random() * .8; if (Math.random() < .22) this._react('blink', .16); else { this._lk = (this._lk + 1) % LOOK.length; this._face('d', LOOK[this._lk]); } }
    }
    _loop(now) {
      if (!this._ov.classList.contains('on')) { this._raf = 0; return; }
      const t = (now - this._t0) / 1000, dt = this._last ? Math.min(.05, (now - this._last) / 1000) : .016;
      this._last = now;
      try { this._vis.frame(Math.max(0, t), dt, this._reduce); } catch (e) { /* keep the overlay alive */ }
      const st = this._st, sn = this._stageNum(), L = this._lines();
      if (st === 'working' && sn < 0) this._lineNow();
      this._scramble(now);
      if (st === 'working') { const c = `${pad(Math.floor(t / 60))}:${pad(Math.floor(t % 60))}`; if (this._el.textContent !== c) this._el.textContent = c; }
      const eb = this._g('eyebrow'); if (eb !== this._ebText) { this._ebText = eb; this._eb.textContent = eb; }
      let key = '', html = '';
      if (sn >= 0 && L.length > 1) { key = 'p' + sn + st; html = L.map((_, i) => `<span class="pip ${st === 'done' || i < sn ? 'd' : i === sn ? 'c' : ''}"></span>`).join(''); }
      if (key !== this._pipKey) { this._pipKey = key; this._pips.innerHTML = html; }
      let sub = this._g('sub');
      if (st === 'error') sub = this._g('error', 'That didn’t go through. Nothing was lost — try again in a moment.');
      else if (st === 'working') { if (t >= 20 && this._g('long')) sub = this._g('long'); else if (t >= 6 && this._g('still')) sub = this._g('still'); }
      if (sub !== this._subText) { this._subText = sub; this._sub.innerHTML = sub ? `<span>${esc(sub)}</span>` : ''; }
      this._tickPanda(t);
      this._raf = requestAnimationFrame(this._loop);
    }
  }
  customElements.define('rf-wait', RfWait);
})();

export {};
