"use client";

import { useEffect } from "react";

/**
 * The landing page's opening (design: the prototype's `introEl` — "first
 * visit" mode).
 *
 * The mark assembles, ROLEFORM rises letter by letter, then two curtains — the
 * ground, then marigold — lift away and the hero settles in behind them.
 *
 * Whether it plays is decided by an inline script, not by React: by the time
 * this component hydrates the hero has already painted, and a curtain that
 * drops over a page you are reading is worse than no curtain. The script sets
 * `html[data-intro="play"]` before the hero is parsed; CSS does the rest
 * (globals.css, "intro"). It plays once per browser and never under
 * prefers-reduced-motion. Clicking anywhere skips it.
 *
 * Every colour is a token (N9); the motion is the design's.
 */
const SEEN_KEY = "roleform-intro-seen";
/** Curtains are gone by ~2.7s; the last hero element lands by ~4s. */
const DONE_MS = 4200;

const DECIDE = `try{if(!localStorage.getItem('${SEEN_KEY}')&&!matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.dataset.intro='play';localStorage.setItem('${SEEN_KEY}','1')}}catch(e){}`;

function finish() {
  delete document.documentElement.dataset.intro;
}

export function IntroCurtain({ tagline }: { tagline: string }) {
  useEffect(() => {
    if (document.documentElement.dataset.intro !== "play") return;
    const t = window.setTimeout(finish, DONE_MS);
    return () => {
      window.clearTimeout(t);
      // Leaving the page mid-intro must not leave the next page hidden.
      finish();
    };
  }, []);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: DECIDE }} />
      <div className="intro-curtain" onClick={finish} title="Click to skip" aria-hidden>
        <div className="intro-layer intro-layer-accent" />
        <div className="intro-layer intro-layer-ground">
          <div className="intro-content">
            <svg viewBox="0 0 32 32" fill="none" className="intro-mark">
              <path
                className="intro-lens-a"
                d="M2.5 16C9 8.6 23 8.6 29.5 16C23 23.4 9 23.4 2.5 16Z"
                fill="var(--color-accent-500)"
              />
              <path
                className="intro-lens-b"
                d="M16 2.5C23.4 9 23.4 23 16 29.5C8.6 23 8.6 9 16 2.5Z"
                fill="var(--color-sage-500)"
                opacity=".92"
              />
              <circle className="intro-pop" cx="16" cy="16" r="4.6" fill="var(--color-bg)" />
              <circle className="intro-pop intro-pop-late" cx="16" cy="16" r="2" fill="var(--color-text)" />
            </svg>
            <div className="intro-word">
              {"ROLEFORM".split("").map((c, i) => (
                <span key={i} style={{ animationDelay: `${0.95 + i * 0.045}s` }}>
                  {c}
                </span>
              ))}
              <span className="intro-dot">.</span>
            </div>
            <div className="intro-tagline">{tagline}</div>
          </div>
        </div>
      </div>
    </>
  );
}
