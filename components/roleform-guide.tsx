"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, MessageSquare, X } from "lucide-react";
import { Mascot, MASCOT_DIRECTIONS, type MascotHandle } from "@/components/mascot";
import { HELP, HELP_PLACES, helpKeyFor, type HelpScreen } from "@/lib/content/helper";

/**
 * The red-panda helper (design: `RoleformGuide.dc.html`).
 *
 * It sits docked bottom-right and stays quiet unless one of four things
 * happens:
 *
 * 1. **First visit** — it walks in and says hello once per browser.
 * 2. **A new screen** with an `intro` — one line, once per screen per visit,
 *    and it dismisses itself.
 * 3. **Signs of being stuck** — 20s idle on a screen, three clicks on dead
 *    space, or bouncing between the same two pages.
 * 4. **A page asks** — any surface can dispatch `roleform:guide` with
 *    `{ label?, text, point? }` to have the helper say something in place of a
 *    toast. That's the only API; nothing imports this component.
 *
 * Clicking the panda or pressing `?` opens the tips for the page you're on.
 * "Show me" scrolls to the control and rings it. "Hide helper" is remembered
 * per browser and leaves a small Help tab behind. All of it is a preference
 * about this device, not a fact about the account, so it lives in
 * localStorage — the same call the walkthrough makes.
 *
 * It never says anything the rest of the product doesn't: no scores, no
 * predictions, no counts the caps decide (see lib/content/helper.ts).
 */
const HIDDEN_KEY = "roleform-helper-hidden";
const GREETED_KEY = "roleform-helper-greeted";
export const GUIDE_EVENT = "roleform:guide";
const IDLE_MS = 20_000;
const RING_PAD = 6;

type Mode = "dock" | "say" | "point" | "panel";
interface Act {
  label: string;
  run: () => void;
  primary?: boolean;
}
interface Say {
  label: string;
  text: string;
  acts: Act[];
  point?: string;
  react?: boolean;
  auto?: number;
}
interface Pt {
  x: number;
  y: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function anchor(key: string | undefined): HTMLElement | null {
  if (!key) return null;
  return document.querySelector<HTMLElement>(`[data-help="${key}"], [data-tour="${key}"]`);
}

/** Space the bottom tab bar takes on a phone, so the panda stands above it. */
function dockOffset() {
  const bar = document.querySelector<HTMLElement>(".tabbar");
  if (!bar || getComputedStyle(bar).display === "none") return 0;
  return bar.getBoundingClientRect().height;
}

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* private mode: the helper just forgets */
  }
}

export function RoleformGuide() {
  const pathname = usePathname();
  const router = useRouter();
  const key = helpKeyFor(pathname);
  const screen: HelpScreen = (key && HELP[key]) || { title: "Roleform", tips: [] };

  const [mode, setMode] = useState<Mode>("dock");
  const [say, setSay] = useState<Say | null>(null);
  const [hidden, setHidden] = useState(false);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState(80);
  /** Bumped to re-run layout after anything that moves the page under us. */
  const [, setFrame] = useState(0);

  const pandaRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const mascotRef = useRef<MascotHandle>(null);
  const target = useRef<HTMLElement | null>(null);
  const pos = useRef<Pt | null>(null);

  // Mutable bookkeeping the nudges read. None of it renders.
  const live = useRef({
    mode: "dock" as Mode,
    hidden: false,
    ready: false,
    say: null as Say | null,
    key,
    lastInput: 0,
    screenAt: 0,
    idleArmed: true,
    visited: {} as Record<string, true>,
    trail: [] as { k: string; t: number }[],
    clicks: [] as { t: number; x: number; y: number }[],
    rageAt: 0,
    pingAt: 0,
    autoT: 0,
    introT: 0,
  });
  live.current.mode = mode;
  live.current.hidden = hidden;
  live.current.ready = ready;
  live.current.say = say;
  live.current.key = key;

  /* ---------------------------------------------------------------- layout */

  const frame = () => ({ l: 0, t: 0, r: window.innerWidth, b: window.innerHeight });

  const dockPos = useCallback((): Pt => {
    const f = frame();
    return { x: f.r - size / 2 - 14, y: f.b - 12 - dockOffset() };
  }, [size]);

  const pointPos = useCallback((): Pt | null => {
    const el = target.current;
    if (!el || !document.contains(el)) return null;
    const f = frame();
    const s = size;
    const r = el.getBoundingClientRect();
    const midTop = Math.min(r.right - s / 2 - 10, r.left + s / 2 + 24);
    const cands: Pt[] = [
      { x: r.right + s / 2 + 12, y: r.top + Math.min(r.height, s) + 2 },
      { x: r.left - s / 2 - 12, y: r.top + Math.min(r.height, s) + 2 },
      { x: midTop, y: r.top + 4 },
      { x: midTop, y: r.bottom + s + 12 },
    ];
    const fits = (p: Pt) =>
      p.x - s / 2 >= f.l + 6 && p.x + s / 2 <= f.r - 6 && p.y - s >= f.t + 6 && p.y <= f.b - 6 - dockOffset();
    return (
      cands.find(fits) ?? {
        x: clamp(midTop, f.l + s / 2 + 6, f.r - s / 2 - 6),
        y: clamp(r.top + 4, f.t + s + 6, f.b - 6 - dockOffset()),
      }
    );
  }, [size]);

  const targetPos = useCallback((): Pt => {
    if (hidden) {
      const d = dockPos();
      return { x: d.x, y: window.innerHeight + size + 60 };
    }
    if (mode === "point") return pointPos() ?? dockPos();
    return dockPos();
  }, [hidden, mode, dockPos, pointPos, size]);

  /** Place everything for the current state. Cheap; runs on every tick. */
  const layout = useCallback(
    (animate: boolean) => {
      const f = frame();
      const panda = pandaRef.current;
      if (panda && ready) {
        const p = targetPos();
        const from = pos.current;
        const dist = from ? Math.hypot(p.x - from.x, p.y - from.y) : 0;
        const moving = animate && dist > 6 && !reducedMotion();
        panda.style.transition = moving
          ? `transform ${clamp(dist * 1.4, 380, 1100)}ms cubic-bezier(.45,0,.25,1)`
          : "none";
        panda.style.transform = `translate(${Math.round(p.x - size / 2)}px, ${Math.round(p.y - size)}px)`;
        pos.current = p;
      }

      const bubble = bubbleRef.current;
      const p = pos.current;
      if (bubble && p && (mode === "say" || mode === "point" || mode === "panel")) {
        bubble.style.width = `${Math.min(mode === "panel" ? 330 : 290, f.r - f.l - 24)}px`;
        bubble.style.maxHeight = `${Math.max(180, f.b - f.t - size - 40 - dockOffset())}px`;
        const bw = bubble.offsetWidth;
        const bh = bubble.offsetHeight;
        const tr = mode === "point" && target.current ? target.current.getBoundingClientRect() : null;
        const pr = { l: p.x - size / 2, t: p.y - size, r: p.x + size / 2, b: p.y };
        const cands = [
          { L: pr.r - bw, T: pr.t - 8 - bh },
          { L: pr.l - 10 - bw, T: pr.b - bh },
          { L: pr.r + 10, T: pr.b - bh },
          { L: pr.l - 10 - bw, T: pr.t },
          { L: pr.r + 10, T: pr.t },
          { L: pr.l, T: pr.b + 8 },
          { L: pr.r - bw, T: pr.b + 8 },
        ];
        const inF = (c: { L: number; T: number }) =>
          c.L >= f.l + 8 && c.L + bw <= f.r - 8 && c.T >= f.t + 8 && c.T + bh <= f.b - 8;
        const hit = (c: { L: number; T: number }) =>
          !!tr &&
          !(c.L + bw < tr.left - 8 || c.L > tr.right + 8 || c.T + bh < tr.top - 8 || c.T > tr.bottom + 8);
        const c = cands.find((c) => inF(c) && !hit(c)) ?? cands.find(inF) ?? cands[0];
        bubble.style.transform = `translate(${Math.round(clamp(c.L, f.l + 8, f.r - bw - 8))}px, ${Math.round(
          clamp(c.T, f.t + 8, f.b - bh - 8),
        )}px)`;
      }

      const ring = ringRef.current;
      if (ring) {
        const el = target.current;
        if (mode !== "point" || !el || !document.contains(el)) {
          ring.style.opacity = "0";
        } else {
          const r = el.getBoundingClientRect();
          ring.style.transform = `translate(${Math.round(r.left - RING_PAD)}px, ${Math.round(r.top - RING_PAD)}px)`;
          ring.style.width = `${Math.round(r.width + RING_PAD * 2)}px`;
          ring.style.height = `${Math.round(r.height + RING_PAD * 2)}px`;
          ring.style.opacity = "1";
        }
      }

      const tab = tabRef.current;
      if (tab) {
        tab.style.transform = `translate(${Math.round(f.r - tab.offsetWidth - 14)}px, ${Math.round(
          f.b - 12 - dockOffset() - tab.offsetHeight,
        )}px)`;
      }
    },
    [mode, ready, size, targetPos],
  );

  // Every state change re-places, walking if the spot moved.
  useEffect(() => {
    layout(true);
    if ((mode === "point" || mode === "say") && say?.react) {
      const t = window.setTimeout(() => mascotRef.current?.react(), 350);
      return () => window.clearTimeout(t);
    }
  }, [layout, mode, say]);

  // Scroll and resize keep everything glued to the viewport, without walking.
  useEffect(() => {
    let raf = 0;
    const req = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          setSize(window.innerWidth < 600 ? 60 : 80);
          layout(false);
        });
    };
    const onScroll = () => {
      live.current.lastInput = Date.now();
      req();
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", req);
    const slow = window.setInterval(req, 700);
    req();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", req);
      window.clearInterval(slow);
    };
  }, [layout]);

  /* ---------------------------------------------------------------- speech */

  const close = useCallback(() => {
    window.clearTimeout(live.current.autoT);
    target.current = null;
    setSay(null);
    setMode("dock");
  }, []);

  const sayIt = useCallback(
    (m: Say) => {
      if (live.current.hidden || !live.current.ready) return;
      window.clearTimeout(live.current.autoT);
      const el = anchor(m.point);
      const show = () => {
        target.current = el;
        setSay(m);
        setMode(el ? "point" : "say");
        if (el) {
          const r = el.getBoundingClientRect();
          window.setTimeout(() => mascotRef.current?.lookAt(r.left + r.width / 2, r.top + r.height / 2), 500);
        }
      };
      if (el) {
        // Bring the control into the upper part of the screen before pointing.
        const r = el.getBoundingClientRect();
        const want = Math.min(250, window.innerHeight * 0.45);
        const bottom = window.innerHeight - 40 - dockOffset();
        if (r.top >= want - 10 && (r.bottom <= bottom || r.top < window.innerHeight * 0.6)) show();
        else {
          window.scrollBy({ top: r.top - want, behavior: reducedMotion() ? "auto" : "smooth" });
          window.setTimeout(show, 480);
        }
      } else show();
      if (m.auto) {
        live.current.autoT = window.setTimeout(() => {
          if (live.current.say === m) close();
        }, m.auto + 1200);
      }
    },
    [close],
  );

  const openPanel = useCallback(() => {
    window.clearTimeout(live.current.autoT);
    target.current = null;
    setSay(null);
    setMode("panel");
  }, []);

  const showTip = useCallback(
    (i: number) => {
      const k = live.current.key;
      const H = k ? HELP[k] : null;
      const tip = H?.tips[i];
      if (!H || !tip) return;
      const next = H.tips.findIndex((t, j) => j > i && anchor(t.target));
      const acts: Act[] = [{ label: "Got it", run: close, primary: true }];
      if (next > 0) acts.push({ label: "Next tip", run: () => showTip(next) });
      sayIt({ label: `${H.title} · tip ${i + 1}`, text: tip.text, point: tip.target, acts });
    },
    [close, sayIt],
  );

  const hide = useCallback(() => {
    writeFlag(HIDDEN_KEY, true);
    target.current = null;
    setSay(null);
    setMode("dock");
    setHidden(true);
  }, []);

  const unhide = useCallback(() => {
    writeFlag(HIDDEN_KEY, false);
    setHidden(false);
    window.setTimeout(openPanel, 450);
  }, [openPanel]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  /* ---------------------------------------------------------------- arrive */

  useEffect(() => {
    setHidden(readFlag(HIDDEN_KEY));
    setSize(window.innerWidth < 600 ? 60 : 80);
    const now = Date.now();
    live.current.lastInput = now;
    live.current.screenAt = now;
    // Off-screen below the dock, so the first placement is a walk in. The
    // landing intro runs for ~2.7s; arriving under it would be arriving unseen.
    const d = { x: window.innerWidth - 54, y: window.innerHeight + 140 };
    pos.current = d;
    if (pandaRef.current) pandaRef.current.style.transform = `translate(${d.x - 40}px, ${d.y - 80}px)`;
    const introPlaying = document.documentElement.dataset.intro === "play";
    const t = window.setTimeout(() => setReady(true), introPlaying ? 3000 : 1200);
    return () => window.clearTimeout(t);
  }, []);

  // First arrival: hello once per browser, else the screen's own line.
  const greeted = useRef(false);
  useEffect(() => {
    if (!ready || hidden || greeted.current) return;
    greeted.current = true;
    const k = live.current.key;
    const t = window.setTimeout(() => {
      if (!readFlag(GREETED_KEY)) {
        writeFlag(GREETED_KEY, true);
        if (k) live.current.visited[k] = true;
        sayIt({
          label: "Hi there",
          text: "I’m your Roleform helper. Stuck anywhere? Click me — or press ? — for tips on the page you’re on.",
          acts: [
            { label: "Tips for this page", run: openPanel, primary: true },
            { label: "Got it", run: close },
          ],
          react: true,
        });
      } else introFor(k);
    }, 1000);
    return () => window.clearTimeout(t);
    // introFor is stable enough for a once-only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hidden]);

  function introFor(k: typeof key) {
    const L = live.current;
    if (!k) return;
    const H = HELP[k];
    if (!H.intro || L.visited[k]) {
      L.visited[k] = true;
      return;
    }
    L.visited[k] = true;
    window.clearTimeout(L.introT);
    L.introT = window.setTimeout(() => {
      if (L.key === k && L.mode === "dock" && !L.hidden) {
        sayIt({ label: H.title, text: H.intro!, acts: [{ label: "More tips", run: openPanel }], auto: 6500 });
      }
    }, 900);
  }

  // A new route: re-dock, hop, and either introduce the screen or notice the
  // visitor is bouncing between two pages.
  const firstPath = useRef(true);
  useEffect(() => {
    const L = live.current;
    const now = Date.now();
    if (firstPath.current) {
      firstPath.current = false;
      if (key) L.trail = [{ k: key, t: now }];
      return;
    }
    L.screenAt = now;
    L.lastInput = now;
    L.idleArmed = true;
    window.clearTimeout(L.autoT);
    window.clearTimeout(L.introT);
    if (L.mode !== "dock") close();
    if (!L.ready || L.hidden || !key) return;

    const h = pandaRef.current?.firstElementChild as HTMLElement | null;
    if (h?.animate && !reducedMotion()) {
      h.animate(
        [
          { transform: "translateY(0) scale(1,1)" },
          { transform: "translateY(-16px) scale(.96,1.05)", offset: 0.4 },
          { transform: "translateY(0) scale(1.08,.9)", offset: 0.8 },
          { transform: "translateY(0) scale(1,1)" },
        ],
        { duration: 480, easing: "ease-out" },
      );
    }

    L.trail.push({ k: key, t: now });
    if (L.trail.length > 6) L.trail.shift();
    const tr = L.trail;
    const n = tr.length;
    if (
      n >= 4 &&
      tr[n - 1].k === tr[n - 3].k &&
      tr[n - 2].k === tr[n - 4].k &&
      tr[n - 1].k !== tr[n - 2].k &&
      now - tr[n - 4].t < 45_000 &&
      now - L.pingAt > 60_000
    ) {
      L.pingAt = now;
      window.setTimeout(
        () =>
          sayIt({
            label: "Looking for something?",
            text: "You’ve been going back and forth between two pages. Tell me where you’re headed and I’ll take you there.",
            acts: [
              { label: "Show me places", run: openPanel, primary: true },
              { label: "I’m fine", run: close },
            ],
            react: true,
          }),
        500,
      );
      return;
    }
    introFor(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /* ---------------------------------------------------------------- nudges */

  useEffect(() => {
    const L = live.current;

    const onMove = (e: PointerEvent) => {
      if (e.isTrusted) L.lastInput = Date.now();
    };

    const onKey = (e: KeyboardEvent) => {
      if (!e.isTrusted) return;
      L.lastInput = Date.now();
      const el = e.target as HTMLElement | null;
      const field = el?.closest?.('input,textarea,select,[contenteditable="true"]');
      if (e.key === "Escape" && L.mode !== "dock") close();
      else if (e.key === "?" && !field) {
        e.preventDefault();
        if (L.hidden) unhide();
        else if (L.mode === "panel") close();
        else openPanel();
      }
    };

    const onClick = (e: MouseEvent) => {
      if (!e.isTrusted) return;
      L.lastInput = Date.now();
      const tg = e.target as HTMLElement | null;
      if (!tg || tg.closest?.("[data-guide]")) return;
      const interactive =
        tg.closest?.(
          'button,a,input,textarea,select,label,summary,[role="button"],[role="tab"],[role="checkbox"]',
        ) || getComputedStyle(tg).cursor === "pointer";
      if (interactive) {
        L.clicks = [];
        return;
      }
      const now = Date.now();
      L.clicks = L.clicks.filter((c) => now - c.t < 1200);
      L.clicks.push({ t: now, x: e.clientX, y: e.clientY });
      if (
        L.clicks.length >= 3 &&
        L.clicks.every((c) => Math.hypot(c.x - e.clientX, c.y - e.clientY) < 44) &&
        now - L.rageAt > 15_000
      ) {
        L.rageAt = now;
        L.clicks = [];
        const H = L.key ? HELP[L.key] : null;
        const first = H ? H.tips.findIndex((t) => anchor(t.target)) : -1;
        sayIt({
          label: "Stuck?",
          text: `That spot isn’t clickable. ${H?.stuck ?? "Want me to show you what you can do here?"}`,
          acts: [
            ...(first >= 0 ? [{ label: "Show me", run: () => showTip(first), primary: true }] : []),
            { label: "More help", run: openPanel, primary: first < 0 },
          ],
          react: true,
        });
      }
    };

    const onCustom = (e: Event) => {
      const d = (e as CustomEvent<{ label?: string; text?: string; point?: string }>).detail;
      if (!d?.text) return;
      sayIt({
        label: d.label ?? "Heads up",
        text: d.text,
        point: d.point,
        acts: [{ label: "Got it", run: close, primary: true }],
        react: true,
      });
    };

    const idle = window.setInterval(() => {
      if (!L.ready || L.hidden || L.mode !== "dock" || !L.idleArmed || !L.key) return;
      const now = Date.now();
      const H = HELP[L.key];
      if (H.noIdle || now - L.lastInput < IDLE_MS || now - L.screenAt < IDLE_MS) return;
      L.idleArmed = false;
      const tip = H.tips[0];
      const canShow = !!anchor(tip.target);
      sayIt({
        label: "Need a hand?",
        text: tip.text,
        acts: [
          ...(canShow ? [{ label: "Show me", run: () => showTip(0), primary: true }] : []),
          { label: "More help", run: openPanel, primary: !canShow },
        ],
        react: true,
      });
    }, 1000);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick, true);
    window.addEventListener(GUIDE_EVENT, onCustom);
    return () => {
      window.clearInterval(idle);
      window.clearTimeout(L.autoT);
      window.clearTimeout(L.introT);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(GUIDE_EVENT, onCustom);
    };
  }, [close, openPanel, sayIt, showTip, unhide]);

  /* ---------------------------------------------------------------- render */

  const bubbleOpen = mode === "say" || mode === "point" || mode === "panel";
  const acts = say?.acts ?? [];

  return (
    <div data-guide className="guide-root" aria-live="polite">
      <div ref={ringRef} className="guide-ring" aria-hidden />

      <div
        ref={pandaRef}
        className="guide-panda"
        style={{ visibility: ready ? "visible" : "hidden" }}
        aria-hidden={hidden || undefined}
      >
        <div style={{ transformOrigin: "50% 100%" }}>
          <Mascot
            ref={mascotRef}
            size={size}
            label="Roleform helper"
            onClick={() => {
              live.current.lastInput = Date.now();
              if (live.current.mode === "panel") close();
              else openPanel();
            }}
          />
        </div>
      </div>

      <div
        ref={bubbleRef}
        role="dialog"
        aria-label="Roleform helper"
        className="guide-bubble"
        data-open={bubbleOpen && !hidden ? "true" : "false"}
      >
        <div className="mb-[7px] flex items-center justify-between gap-2.5">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            {mode === "panel" ? "Help · on this page" : (say?.label ?? "Help")}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            title="Close"
            className="-mr-[7px] -mt-1 grid h-[26px] w-[26px] flex-none place-items-center rounded-full border-0 bg-transparent p-0 hover:bg-[var(--color-bg-tint)]"
          >
            <X className="lucide h-3 w-3" />
          </button>
        </div>

        {mode === "say" || mode === "point" ? (
          <>
            <p className="m-0 text-[14.5px] font-bold leading-[1.45] [text-wrap:pretty]">{say?.text}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {acts
                .filter((a) => a.primary)
                .map((a) => (
                  <button key={a.label} type="button" onClick={a.run} className="btn btn-primary btn-sm">
                    {a.label}
                  </button>
                ))}
              {acts
                .filter((a) => !a.primary)
                .map((a) => (
                  <button key={a.label} type="button" onClick={a.run} className="btn btn-secondary btn-sm">
                    {a.label}
                  </button>
                ))}
            </div>
          </>
        ) : null}

        {mode === "panel" ? (
          <>
            <p className="display m-0 mb-3 text-[26px] leading-none">{screen.title}</p>
            <div className="flex flex-col gap-2.5">
              {screen.tips.map((tp, i) => (
                <div key={tp.text} className="flex items-start gap-2.5 rounded-[var(--radius-sm)] bg-[var(--color-bg)] px-3 py-[11px]">
                  <span className="mt-px grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-[var(--color-accent-500)] text-[11.5px] font-extrabold">
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                    <span className="text-sm font-semibold leading-[1.45] [text-wrap:pretty]">{tp.text}</span>
                    {anchor(tp.target) ? (
                      <button type="button" onClick={() => showTip(i)} className="btn btn-primary btn-sm">
                        Show me <ArrowRight className="lucide h-[13px] w-[13px]" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <p className="mb-2 mt-4 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Take me to
            </p>
            <div className="flex flex-wrap gap-1.5">
              {HELP_PLACES.filter((p) => p.href !== pathname).map((p) => (
                <button key={p.href} type="button" onClick={() => go(p.href)} className="btn btn-secondary btn-sm">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line)] pt-3">
              <button
                type="button"
                onClick={() => go("/contact")}
                className="btn btn-sm border-0 bg-[var(--color-sage-500)] text-[var(--color-text)] hover:bg-[var(--color-sage-400)]"
              >
                <MessageSquare className="lucide h-3.5 w-3.5" />
                Talk to a person
              </button>
              <button
                type="button"
                onClick={hide}
                className="border-0 bg-transparent px-1.5 text-[12.5px] font-bold text-[var(--color-text-muted)] underline underline-offset-[3px]"
              >
                Hide helper
              </button>
            </div>
            <p className="mb-0 mt-2.5 text-xs text-[var(--color-text-muted)]">
              Tip: press <strong className="text-[var(--color-text)]">?</strong> any time to open this.
            </p>
          </>
        ) : null}
      </div>

      {hidden ? (
        <button ref={tabRef} type="button" onClick={unhide} className="guide-tab">
          <span
            aria-hidden
            className="h-[34px] w-[34px] bg-no-repeat"
            style={{
              backgroundImage: `url(${MASCOT_DIRECTIONS})`,
              backgroundSize: "300% 300%",
              backgroundPosition: "50% 50%",
            }}
          />
          Help
        </button>
      ) : null}
    </div>
  );
}
