"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { TOUR_HOME, TOUR_STEPS, type TourStep } from "@/lib/content/tour";

/**
 * The walkthrough (design v2 — the `tourOn` overlay and its header button).
 *
 * Two rules carry the whole thing:
 *
 * 1. A step is only shown if its `[data-tour]` anchor is actually in the DOM.
 *    The design is one page where every screen is a state flip; here they are
 *    real routes, so the six steps are spread across /analyze and an analysis.
 *    Spotlighting a rectangle that isn't there would point at nothing.
 * 2. Nothing is measured until it has been scrolled into view, and everything
 *    is re-measured on scroll and resize — the spotlight is a viewport-space
 *    rectangle over a document that moves.
 *
 * It runs once for a new member and is replayable from the header for everyone,
 * which is why "seen" is local to the browser rather than a column: it is a
 * preference about this device, not a fact about the account.
 */
const SEEN_KEY = "roleform-tour-seen";
const PENDING_KEY = "roleform-tour-pending";
const START_EVENT = "roleform:tour";
/** measureSpot(step, 9) in the design — the halo sits 9px off the control. */
const PAD = 9;
const GAP = 14;
const TIP_WIDTH = 348;

interface Spot {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: string;
}

function anchorFor(step: TourStep): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${step.key}"]`);
}

/** The steps this page can actually show, in the design's order. */
function stepsOnPage(): TourStep[] {
  return TOUR_STEPS.filter((step) => anchorFor(step) !== null);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The header button. Separate from the overlay so the layout can place it in
 * the nav cluster without the overlay having to live there too; they talk over
 * a window event rather than a context, because the two are never siblings.
 */
export function TourLauncher() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(START_EVENT))}
      title="Replay the walkthrough"
      aria-label="Replay the walkthrough"
      className="hdr-btn flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[var(--radius-pill)] border-[1.5px] border-[var(--color-line-strong)] text-[var(--color-text)] transition-colors hover:bg-[var(--color-hover)]"
    >
      <HelpCircle className="lucide h-4 w-4" />
    </button>
  );
}

export function ProductTour() {
  const pathname = usePathname();
  const router = useRouter();

  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);

  const open = steps.length > 0;
  const step = open ? steps[Math.min(index, steps.length - 1)] : null;

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Storage disabled. The tour still ran; it just offers itself again on
      // the next visit, which is the harmless direction to fail in.
    }
  }, []);

  const close = useCallback(() => {
    markSeen();
    setSteps([]);
    setIndex(0);
    setSpot(null);
    setTip(null);
  }, [markSeen]);

  /**
   * Start here if this page has anything to point at; otherwise send the member
   * to the upload screen, where step one lives, and pick it up on arrival.
   */
  const start = useCallback(() => {
    const present = stepsOnPage();
    if (present.length > 0) {
      setSteps(present);
      setIndex(0);
      return;
    }
    try {
      sessionStorage.setItem(PENDING_KEY, "1");
    } catch {
      // Without storage the hop can't survive the navigation. Go anyway — the
      // member lands on the screen the walkthrough is about.
    }
    router.push(TOUR_HOME);
  }, [router]);

  // The header button, and the resumed hop from a page with no anchors.
  useEffect(() => {
    const onStart = () => start();
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, [start]);

  // Auto-start, once per browser, and only where step one is on screen. A
  // walkthrough that opens over a surface it can't explain is worse than none.
  useEffect(() => {
    let pending = false;
    try {
      pending = sessionStorage.getItem(PENDING_KEY) === "1";
      if (pending) sessionStorage.removeItem(PENDING_KEY);
    } catch {
      // No storage — treat it as a cold visit.
    }

    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = false;
    }

    if (!pending && (seen || pathname !== TOUR_HOME)) return;

    // One frame, so the surface this points at has been laid out.
    const id = requestAnimationFrame(() => {
      const present = stepsOnPage();
      if (present.length > 0) {
        setSteps(present);
        setIndex(0);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  // A route change mid-tour invalidates every anchor it was measuring.
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (firstPath.current === pathname) return;
    firstPath.current = pathname;
    setSteps([]);
    setIndex(0);
    setSpot(null);
    setTip(null);
  }, [pathname]);

  const measure = useCallback(() => {
    if (!step) return;
    const el = anchorFor(step);
    if (!el) {
      close();
      return;
    }
    const rect = el.getBoundingClientRect();
    const radius = getComputedStyle(el).borderRadius;
    setSpot({
      top: rect.top - PAD,
      left: rect.left - PAD,
      width: rect.width + PAD * 2,
      height: rect.height + PAD * 2,
      // A halo hugging a pill should read as a pill; anything square-ish gets
      // the container radius rather than a second opinion.
      radius: radius && radius !== "0px" ? `calc(${radius} + ${PAD}px)` : "var(--radius-md)",
    });
  }, [step, close]);

  // Bring the anchor into view first, then measure — in that order, or the
  // first frame of every step is a rectangle in the wrong place.
  useEffect(() => {
    if (!step) return;
    const el = anchorFor(step);
    if (!el) {
      close();
      return;
    }
    el.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    measure();

    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [step, measure, close]);

  // Place the card once its own height is known: below the spotlight if it
  // fits, above if it doesn't, clamped so it never leaves the viewport.
  useLayoutEffect(() => {
    if (!spot || !tipRef.current) return;
    const card = tipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const below = spot.top + spot.height + GAP;
    const above = spot.top - card.height - GAP;
    const top = below + card.height <= vh - GAP ? below : above >= GAP ? above : Math.max(GAP, vh - card.height - GAP);

    const wanted = spot.left + spot.width / 2 - card.width / 2;
    const left = Math.min(Math.max(GAP, wanted), Math.max(GAP, vw - card.width - GAP));

    setTip((prev) =>
      prev && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.left - left) < 0.5
        ? prev
        : { top, left },
    );
  }, [spot, index]);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= steps.length) {
        close();
        return 0;
      }
      return i + 1;
    });
  }, [steps.length, close]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, next, back]);

  // The card takes focus so the arrow keys and Escape land somewhere sensible
  // for a keyboard or screen-reader user, not just for a mouse.
  useEffect(() => {
    if (open) tipRef.current?.focus();
  }, [open, index]);

  if (!open || !step || !spot) return null;

  const position = Math.min(index, steps.length - 1);
  const last = position === steps.length - 1;

  return (
    <div className="tour-layer" role="dialog" aria-modal="false" aria-label="Product walkthrough">
      <div
        className="tour-spot"
        aria-hidden
        style={{
          top: spot.top,
          left: spot.left,
          width: spot.width,
          height: spot.height,
          borderRadius: spot.radius,
        }}
      />
      <div
        ref={tipRef}
        tabIndex={-1}
        className="tour-tip"
        style={{
          top: tip?.top ?? spot.top + spot.height + GAP,
          left: tip?.left ?? GAP,
          width: `min(${TIP_WIDTH}px, calc(100vw - 28px))`,
          // Until the card has been measured it would otherwise flash at the
          // fallback position for a frame.
          visibility: tip ? "visible" : "hidden",
        }}
      >
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="tag tag-accent flex-none">
            {position + 1} of {steps.length}
          </span>
          <span className="ml-auto flex gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s.key}
                className="tour-dot"
                data-active={i === position ? "true" : undefined}
              />
            ))}
          </span>
        </div>
        <h3 className="mb-1.5">{step.title}</h3>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">{step.body}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={close} className="btn btn-ghost btn-sm mr-auto pl-0">
            Skip tour
          </button>
          {position > 0 ? (
            <button type="button" onClick={back} className="btn btn-secondary btn-sm">
              Back
            </button>
          ) : null}
          <button type="button" onClick={next} className="btn btn-primary btn-sm">
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
