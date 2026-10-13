"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll reveals for the landing page (design: `data-rv` in the prototype's
 * landing). Anything marked `data-rv` below the fold rises in as it arrives,
 * after `data-rv-d` milliseconds; a `data-rv-bar` inside it grows from the
 * left once it is up. Content already on screen, and everything under reduced
 * motion, is left exactly as rendered — the page never depends on this.
 */
export function LandingReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ease = "cubic-bezier(.2,.8,.2,1)";
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          el.style.opacity = "";
          const delay = Number(el.dataset.rvD || 0);
          el.animate([{ opacity: 0, transform: "translateY(36px)" }, { opacity: 1, transform: "none" }], {
            duration: 750,
            delay,
            easing: ease,
            fill: "backwards",
          });
          el.querySelectorAll<HTMLElement>("[data-rv-bar]").forEach((bar) =>
            bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
              duration: 900,
              delay: delay + 300,
              easing: ease,
              fill: "backwards",
            }),
          );
        }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    root.querySelectorAll<HTMLElement>("[data-rv]").forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.style.opacity = "0";
        io.observe(el);
      }
    });
    return () => io.disconnect();
  }, []);

  return <div ref={ref}>{children}</div>;
}
