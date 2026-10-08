"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * The red panda (design: `page-mascot.jsx`).
 *
 * A port of `Mascot` from github.com/nilbuild/page-mascot — MIT © Kamran Ahmed.
 * Two 3×3 sprite sheets: nine gaze directions, nine reactions. The eyes follow
 * the pointer on devices that have one; a click ("boop") plays a reaction and a
 * squash, and four quick boops make it dizzy.
 *
 * The sprites live in `public/mascots/`. They are artwork, not brand tokens, so
 * N9 has nothing to say about them.
 */
const DIRECTIONS = ["up-left", "up", "up-right", "left", "center", "right", "down-left", "down", "down-right"] as const;
const REACTIONS = ["blink", "heart", "sparkle", "surprised", "wink", "bashful", "sleepy", "dizzy", "delighted"] as const;
const CLOCKWISE = ["right", "down-right", "down", "down-left", "left", "up-left", "up", "up-right"] as const;
type Direction = (typeof DIRECTIONS)[number];
type Reaction = (typeof REACTIONS)[number];

const SECTOR = (Math.PI * 2) / CLOCKWISE.length;
const HYSTERESIS = 0.12;
const DEAD_ZONE = 70;
const PAYOFFS: Reaction[] = ["heart", "sparkle", "delighted"];
const BOOP_PAYOFF = 120;
const BOOP_END = 560;
const SQUASH_MS = 420;
const DIZZY_AFTER = 4;
const DIZZY_WINDOW = 1600;
const DIZZY_END = 1100;
const SQUASH: Keyframe[] = [
  { transform: "scale(1, 1)", easing: "ease-in" },
  { transform: "scale(1.10, 0.86)", offset: 0.18, easing: "ease-out" },
  { transform: "scale(0.95, 1.08)", offset: 0.45, easing: "ease-in-out" },
  { transform: "scale(1.03, 0.97)", offset: 0.72, easing: "ease-in-out" },
  { transform: "scale(1, 1)" },
];

const cell = (index: number) => ({
  backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 50}%`,
});
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const layer: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundSize: "300% 300%",
  backgroundRepeat: "no-repeat",
};

export const MASCOT_DIRECTIONS = "/mascots/redpanda-directions.webp";
export const MASCOT_REACTIONS = "/mascots/redpanda-reactions.webp";

export interface MascotHandle {
  /** Play a reaction without counting as the visitor's click. */
  react: () => void;
  /** Turn the eyes toward a viewport point, as if the pointer were there. */
  lookAt: (x: number, y: number) => void;
}

export const Mascot = forwardRef<
  MascotHandle,
  { size?: number; label?: string; onClick?: () => void }
>(function Mascot({ size = 80, label = "red panda", onClick }, ref) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const squashRef = useRef<HTMLSpanElement>(null);
  const timers = useRef<number[]>([]);
  const boops = useRef({ count: 0, at: 0 });
  const aimAt = useRef<((x: number, y: number) => void) | null>(null);
  const [direction, setDirection] = useState<Direction>("center");
  const [reaction, setReaction] = useState<Reaction | null>(null);

  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let sector = -1;
    let pointer: { x: number; y: number } | null = null;
    const aim = () => {
      const button = buttonRef.current;
      if (!button || !pointer) return;
      const box = button.getBoundingClientRect();
      const dx = pointer.x - (box.left + box.width / 2);
      const dy = pointer.y - (box.top + box.height / 2);
      if (Math.hypot(dx, dy) < DEAD_ZONE) {
        sector = -1;
        setDirection("center");
        return;
      }
      const angle = Math.atan2(dy, dx);
      if (sector !== -1 && Math.abs(wrap(angle - sector * SECTOR)) < SECTOR / 2 + HYSTERESIS) return;
      sector = (Math.round(angle / SECTOR) + CLOCKWISE.length) % CLOCKWISE.length;
      setDirection(CLOCKWISE[sector]);
    };
    aimAt.current = (x, y) => {
      pointer = { x, y };
      aim();
    };
    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      aim();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", aim, { passive: true });
    return () => {
      aimAt.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", aim);
    };
  }, []);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const boop = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    const later = (ms: number, next: Reaction | null) => {
      timers.current.push(window.setTimeout(() => setReaction(next), ms));
    };
    const now = Date.now();
    const b = boops.current;
    b.count = now - b.at < DIZZY_WINDOW ? b.count + 1 : 1;
    b.at = now;
    if (b.count >= DIZZY_AFTER) {
      b.count = 0;
      setReaction("dizzy");
      later(DIZZY_END, null);
    } else {
      setReaction("blink");
      later(BOOP_PAYOFF, PAYOFFS[(b.count - 1) % PAYOFFS.length]);
      later(BOOP_END, null);
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    squashRef.current?.animate(SQUASH, { duration: SQUASH_MS, easing: "linear" });
  };

  useImperativeHandle(ref, () => ({
    react: boop,
    lookAt: (x, y) => aimAt.current?.(x, y),
  }));

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        boop();
        onClick?.();
      }}
      aria-label={`Open the ${label}`}
      title="Need a hand? Click me, or press ?"
      className="relative block shrink-0 cursor-pointer select-none appearance-none border-0 bg-transparent p-0"
      style={{ width: size, height: size }}
    >
      <span
        ref={squashRef}
        className="relative block h-full w-full"
        style={{ transformOrigin: "50% 78%" }}
      >
        <span
          style={{
            ...layer,
            backgroundImage: `url(${MASCOT_DIRECTIONS})`,
            ...cell(DIRECTIONS.indexOf(direction)),
            opacity: reaction ? 0 : 1,
          }}
        />
        <span
          style={{
            ...layer,
            backgroundImage: `url(${MASCOT_REACTIONS})`,
            ...cell(REACTIONS.indexOf(reaction ?? "blink")),
            opacity: reaction ? 1 : 0,
          }}
        />
      </span>
    </button>
  );
});
