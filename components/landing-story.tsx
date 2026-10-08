"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { SECTIONS_HTML, STAGE_HTML } from "@/components/landing-story-markup";
import { GUIDE_EVENT } from "@/components/roleform-guide";

/**
 * The landing page's scroll story (design: `Roleform Landing.dc.html`).
 *
 * A 560vh track with a sticky stage. As you scroll, one posting is read
 * (highlighter, extracted chips), matched against a résumé (ticks, the 61, a
 * gap), rewritten into every template (the fan), and turned into questions and
 * a gap plan. The left column swaps copy per stage; a rail jumps between them.
 *
 * All of the motion is CSS: this component only turns scroll position into
 * custom properties on the stage (`seg()` over the design's RANGES), lays the
 * art out for the viewport, plays the first-load entrance, and reveals the
 * sections below as they arrive. Under reduced motion the story still scrolls,
 * the entrance and reveals don't play.
 *
 * The panda narrates: each stage hands the site-wide helper one line through
 * the `roleform:guide` event, once per visit, so there is still only one panda.
 */
const RANGES: Record<string, [number, number, 1?]> = {
  a: [0.03, 0.12],
  r: [0.12, 0.26, 1],
  x: [0.15, 0.27, 1],
  b: [0.3, 0.38],
  c: [0.37, 0.47, 1],
  n: [0.41, 0.49],
  d: [0.52, 0.58],
  f: [0.57, 0.7, 1],
  g: [0.74, 0.8],
  q: [0.78, 0.9, 1],
};
const TEXT: [[number, number] | null, [number, number] | null][] = [
  [null, [0.02, 0.09]],
  [[0.07, 0.13], [0.27, 0.32]],
  [[0.31, 0.36], [0.49, 0.54]],
  [[0.53, 0.58], [0.71, 0.76]],
  [[0.75, 0.8], null],
];
const STOPS = [0, 0.27, 0.5, 0.72, 0.93];

const cl = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const sm = (t: number) => t * t * (3 - 2 * t);
const seg = (P: number, r: [number, number, 1?]) => {
  const t = cl((P - r[0]) / (r[1] - r[0]), 0, 1);
  return r[2] ? t : sm(t);
};

function reduced() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const BADGE: Record<string, string> = {
  High: "background:var(--color-text);color:var(--color-accent-500)",
  Medium: "background:var(--color-accent-500)",
  Low: "background:var(--color-sage-500)",
};

export interface StoryProps {
  /** TEMPLATES.length — the catalog size, read from the catalog. */
  templateCount: number;
  /** Template name → its computed ATS rating (ratingFor). */
  ratings: Record<string, "High" | "Medium" | "Low">;
  /** Where Get started goes for this visitor (sign-in, onboarding or analyze). */
  startHref: string;
  /** Narration per stage, from lib/content/helper (STORY_LINES). */
  lines: { label: string; text: string }[];
}

export function LandingStory({ templateCount, ratings, startHref, lines }: StoryProps) {
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);

  const stage = useMemo(
    () =>
      STAGE_HTML.replaceAll("__N__", String(templateCount))
        .replace(/__ATS_STYLE:([^_]+)__/g, (_, name: string) => BADGE[ratings[name] ?? "Low"])
        .replace(/__ATS:([^_]+)__/g, (_, name: string) => ratings[name] ?? "Low")
        .replaceAll('href="/onboarding"', `href="${startHref}"`),
    [templateCount, ratings, startHref],
  );
  const sections = useMemo(
    () => SECTIONS_HTML.replaceAll("__N__", String(templateCount)).replaceAll('href="/onboarding"', `href="${startHref}"`),
    [templateCount, startHref],
  );

  useEffect(() => {
    const track = trackRef.current;
    const st = track?.querySelector<HTMLElement>("[data-stage]");
    if (!track || !st) return;
    const html = document.documentElement;
    const nav = document.querySelector<HTMLElement>(".nav");

    const tbs = Array.from(st.querySelectorAll<HTMLElement>("[data-tb]"));
    const rail = st.querySelector<HTMLElement>("[data-rail]");
    const count = st.querySelector<HTMLElement>("[data-count]");
    const set = (k: string, v: string) => st.style.setProperty(k, v);

    let lay = "";
    const layout = (W: number, H: number) => {
      if (W >= 900) {
        const tx = Math.round(cl(W * 0.06, 24, 96));
        const tw = Math.round(Math.min(W * 0.34, 540));
        const gut = Math.round(cl(W * 0.15, 180, 220));
        const th = Math.round(H - 80);
        const left = tx + tw + 24;
        const right = W - gut;
        const sc = cl(Math.min((right - left) / 730, (H - 50) / 580), 0.4, 1.12);
        set("--tx", `${tx}px`);
        set("--tw", `${tw}px`);
        set("--th", `${th}px`);
        set("--ty", "30px");
        set("--tj", "center");
        set("--cx", `${Math.round((left + right) / 2)}px`);
        set("--cy", `${Math.round(H / 2 + 4)}px`);
        set("--sc", sc.toFixed(3));
        set("--rx", `${tx}px`);
        set("--rb", "28px");
        set("--mchips", "flex");
      } else {
        const th = Math.round(Math.min(H * 0.45, 410));
        const top = 14 + th;
        const bottom = H - 84;
        const sc = cl(Math.min((W - 12) / 640, (bottom - top) / 580), 0.3, 0.9);
        set("--tx", "20px");
        set("--tw", `${W - 40}px`);
        set("--th", `${th}px`);
        set("--ty", "14px");
        set("--tj", "flex-start");
        set("--cx", `${Math.round(W / 2)}px`);
        set("--cy", `${Math.round((top + bottom) / 2)}px`);
        set("--sc", sc.toFixed(3));
        set("--rx", "16px");
        set("--rb", "16px");
        set("--mchips", "none");
      }
    };

    let act = -1;
    const said = new Set<number>();
    let sayT = 0;
    const frame = () => {
      const navH = nav ? Math.round(nav.getBoundingClientRect().height) : 76;
      html.style.setProperty("--nav-h", `${navH}px`);
      const W = st.clientWidth;
      const H = st.clientHeight;
      const key = `${W}x${H}`;
      if (lay !== key) {
        lay = key;
        layout(W, H);
      }
      const r = track.getBoundingClientRect();
      const P = cl((navH - r.top) / Math.max(1, r.height - H), 0, 1);
      const v: Record<string, number> = {};
      for (const k in RANGES) {
        v[k] = seg(P, RANGES[k]);
        set(`--${k}`, v[k].toFixed(4));
      }
      TEXT.forEach((t, j) => {
        const i = t[0] ? seg(P, t[0]) : 1;
        const o = t[1] ? seg(P, t[1]) : 0;
        set(`--i${j}`, i.toFixed(4));
        set(`--o${j}`, o.toFixed(4));
        if (tbs[j]) tbs[j].style.pointerEvents = i - o > 0.5 ? "auto" : "none";
      });
      const a = P < 0.1 ? 0 : P < 0.3 ? 1 : P < 0.52 ? 2 : P < 0.74 ? 3 : 4;
      for (let j = 1; j <= 4; j++) set(`--k${j}`, j === a ? "1" : "0");
      if (rail) rail.style.pointerEvents = v.a > 0.5 ? "auto" : "none";
      if (count) {
        const n = String(Math.round(61 * v.n));
        if (count.textContent !== n) count.textContent = n;
      }
      // One line from the panda per stage, once, after the stage settles.
      const inTrack = r.bottom > H * 0.5;
      if (inTrack && a !== act) {
        act = a;
        window.clearTimeout(sayT);
        // Wide screens only: on a phone the bubble would sit on the art (the
        // design's narrow layout has no gutter for it).
        if (a > 0 && !said.has(a) && lines[a] && window.innerWidth >= 900) {
          sayT = window.setTimeout(() => {
            said.add(a);
            window.dispatchEvent(new CustomEvent(GUIDE_EVENT, { detail: { ...lines[a], auto: 7000 } }));
          }, 900);
        }
      }
    };

    let raf = 0;
    const onScroll = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          frame();
        });
    };
    const onResize = () => {
      lay = "";
      onScroll();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    frame();

    // Rail, "How it works" and every jump button scroll to a stage.
    const jump = (i: number) => {
      const dist = track.offsetHeight - st.clientHeight;
      const navH = nav ? nav.getBoundingClientRect().height : 76;
      const top = i === 0 ? 0 : track.getBoundingClientRect().top + window.scrollY - navH + STOPS[i] * dist;
      window.scrollTo({ top, behavior: reduced() ? "auto" : "smooth" });
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-jump]");
      if (el) {
        e.preventDefault();
        jump(Number(el.dataset.jump));
        return;
      }
      // Client-side navigation for the story's own links.
      const a = (e.target as HTMLElement | null)?.closest?.<HTMLAnchorElement>("a[href^='/']");
      if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
        e.preventDefault();
        router.push(a.getAttribute("href")!);
      }
    };
    track.addEventListener("click", onClick);
    sectionsRef.current?.addEventListener("click", onClick);

    // Entrance: the posting drops, the résumé rises, the tick pops — after the
    // intro curtain when that is playing, otherwise straight away.
    const anims: Animation[] = [];
    if (!reduced() && window.scrollY < 40) {
      const offset = html.dataset.intro === "play" ? 2250 : 0;
      const ease = "cubic-bezier(.2,.8,.2,1)";
      const FROM: Record<string, string> = {
        drop: "translateY(-70px) rotate(-12deg)",
        rise: "translateY(90px) rotate(8deg)",
        pop: "scale(0)",
      };
      const DELAY: Record<string, number> = { drop: 80, rise: 220, pop: 560 };
      let t = 0;
      st.querySelectorAll<HTMLElement>("[data-in]").forEach((el) => {
        const k = el.dataset.in ?? "";
        const delay = offset + (k ? DELAY[k] : 60 + 70 * t++);
        anims.push(
          el.animate([{ opacity: 0, transform: FROM[k] ?? "translateY(26px)" }, { opacity: 1, transform: "none" }], {
            duration: k === "pop" ? 520 : 760,
            delay,
            easing: k === "pop" ? "cubic-bezier(.3,1.5,.5,1)" : ease,
            fill: "backwards",
          }),
        );
      });
      const tick = st.querySelector<SVGPathElement>("[data-draw]");
      if (tick) {
        tick.style.strokeDasharray = "1";
        anims.push(
          tick.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
            duration: 420,
            delay: offset + 820,
            easing: ease,
            fill: "backwards",
          }),
        );
      }
    }
    const bob = st.querySelector<HTMLElement>("[data-bob]");
    if (bob && !reduced()) {
      anims.push(
        bob.animate([{ transform: "translateY(0)" }, { transform: "translateY(5px)" }], {
          duration: 900,
          iterations: Infinity,
          direction: "alternate",
          easing: "ease-in-out",
        }),
      );
    }

    // Reveal: sections below the fold rise in as they arrive.
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window && !reduced()) {
      io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (!e.isIntersecting) return;
            const el = e.target as HTMLElement;
            io?.unobserve(el);
            el.style.opacity = "";
            el.animate([{ opacity: 0, transform: "translateY(36px)" }, { opacity: 1, transform: "none" }], {
              duration: 700,
              delay: Number(el.dataset.rv || 0) * 90,
              easing: "cubic-bezier(.2,.8,.2,1)",
              fill: "backwards",
            });
          }),
        { rootMargin: "0px 0px -8% 0px" },
      );
      sectionsRef.current?.querySelectorAll<HTMLElement>("[data-rv]").forEach((el) => {
        if (el.getBoundingClientRect().top > window.innerHeight) {
          el.style.opacity = "0";
          io?.observe(el);
        }
      });
    }

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(sayT);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      track.removeEventListener("click", onClick);
      sectionsRef.current?.removeEventListener("click", onClick);
      anims.forEach((a) => a.cancel());
      io?.disconnect();
    };
  }, [lines, router]);

  return (
    <div data-story className="story">
      <div ref={trackRef} className="story-track" dangerouslySetInnerHTML={{ __html: stage }} />
      <div ref={sectionsRef} dangerouslySetInnerHTML={{ __html: sections }} />
    </div>
  );
}
