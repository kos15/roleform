"use client";

import { useEffect } from "react";

/**
 * The first-load intro on the landing page: the mark builds itself (posting,
 * résumé, its lines, the tick), the name rises, and the ground lifts away on
 * two curtains to reveal the hero, which then settles in piece by piece.
 *
 * It plays once per browser and only when a visit *starts* on `/`. The
 * decision is made before first paint by INTRO_SCRIPT in the root layout,
 * which sets `html[data-intro="play"]`; every animation here and on the hero
 * (`.intro-item`, `.intro-fan`) is keyed off that attribute in globals.css, so
 * the markup renders hidden and nothing flashes while React hydrates. Reduced
 * motion never sets the attribute at all.
 *
 * This component only ends it: it moves the attribute on when the curtains
 * have gone, and clears it once the hero has settled, so a later client-side
 * visit to `/` doesn't replay the hero's delayed entrance.
 */

const CURTAINS_DONE_MS = 2750;
/** Last hero item's delay (2250 + 10 × 85) plus the fan's 950ms, with slack. */
const HERO_DONE_MS = 4200;
const SKIP_DONE_MS = 2000;

/** Runs in <head> before the body paints. Kept tiny and dependency-free. */
export const INTRO_SCRIPT = `try{if(location.pathname==="/"&&!localStorage.getItem("rf-intro-seen")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.dataset.intro="play";localStorage.setItem("rf-intro-seen","1")}}catch(e){}`;

function setIntro(value: string | null) {
  const root = document.documentElement;
  if (value === null) delete root.dataset.intro;
  else root.dataset.intro = value;
}

export function LandingIntro({ drafts }: { drafts: number }) {
  useEffect(() => {
    if (document.documentElement.dataset.intro !== "play") return;

    let end = window.setTimeout(() => {
      setIntro("hero");
      end = window.setTimeout(() => setIntro(null), HERO_DONE_MS - CURTAINS_DONE_MS);
    }, CURTAINS_DONE_MS);

    // A click or Escape drops the curtains at once and brings the hero in now,
    // rather than leaving it to wait out delays timed for the intro.
    const skip = () => {
      window.clearTimeout(end);
      setIntro("skip");
      end = window.setTimeout(() => setIntro(null), SKIP_DONE_MS);
      cleanup();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    const overlay = document.getElementById("landing-intro");
    function cleanup() {
      overlay?.removeEventListener("click", skip);
      window.removeEventListener("keydown", onKey);
    }
    overlay?.addEventListener("click", skip);
    window.addEventListener("keydown", onKey);

    return () => {
      cleanup();
      window.clearTimeout(end);
      setIntro(null);
    };
  }, []);

  const letters = "ROLEFORM".split("");

  return (
    <div id="landing-intro" className="intro" aria-hidden title="Click to skip">
      <div className="intro-curtain intro-curtain-back" />
      <div className="intro-curtain intro-curtain-front">
        <div className="intro-content">
          <svg className="intro-mark" viewBox="0 0 32 32" fill="none">
            <g className="intro-sheet">
              <rect
                x="10"
                y="2.5"
                width="18"
                height="22"
                rx="3"
                fill="var(--color-sage-500)"
                transform="rotate(9 19 13.5)"
              />
            </g>
            <g className="intro-doc">
              <path
                d="M7 7H17L22 12V26A3 3 0 0 1 19 29H7A3 3 0 0 1 4 26V10A3 3 0 0 1 7 7Z"
                fill="var(--color-accent-500)"
              />
              <path d="M17 7V10.5A1.5 1.5 0 0 0 18.5 12H22Z" fill="var(--color-accent-600)" />
            </g>
            {(
              [
                ["M8 13.5h5", 0.78],
                ["M8 18h9", 0.9],
                ["M8 22.5h5", 1.02],
              ] as const
            ).map(([d, delay]) => (
              <path
                key={d}
                d={d}
                pathLength={1}
                className="intro-draw intro-line"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
            <g className="intro-badge">
              <circle
                cx="23.5"
                cy="23.5"
                r="6.5"
                fill="var(--color-text)"
                stroke="var(--color-bg)"
                strokeWidth="1.8"
              />
            </g>
            <path
              d="M20.9 23.6l1.8 1.8 3.5-3.7"
              pathLength={1}
              className="intro-draw intro-tick"
            />
          </svg>
          <div className="intro-word display">
            {letters.map((c, i) => (
              <span key={i} className="intro-letter" style={{ animationDelay: `${0.95 + i * 0.045}s` }}>
                {c}
              </span>
            ))}
            <span className="intro-dot">.</span>
          </div>
          <div className="intro-tagline">One résumé in · {drafts} tailored out</div>
        </div>
      </div>
    </div>
  );
}
