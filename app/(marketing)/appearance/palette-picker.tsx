"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand";
import { Button, Tag } from "@/components/ui";
import {
  DEFAULT_PALETTE,
  PALETTES,
  PALETTE_ANATOMY,
  PALETTE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  asPaletteId,
  type PaletteId,
  type ThemeMode,
} from "@/lib/design/palettes";

/**
 * The palette picker (F18).
 *
 * Reads the current appearance off the DOM rather than holding it in React
 * state as the source of truth — the bootstrap in app/layout.tsx resolved it
 * before hydration, and a second opinion here would fight it. Same contract as
 * components/theme-toggle.tsx, which is why the two can coexist on one page.
 *
 * Applying is immediate and unconfirmed. There is nothing to save: the whole
 * change is two attributes on `html`, and a Save button over that would be a
 * button that does nothing you can't already see.
 *
 * Each card previews its own palette by carrying `data-palette` and
 * `data-theme` itself. The derivation in globals.css is element-agnostic for
 * exactly this reason — the card is genuinely painted in the palette it is
 * offering, not with a hand-copied approximation of it.
 */
export function PalettePicker() {
  const [palette, setPalette] = useState<PaletteId | null>(null);
  const [mode, setMode] = useState<ThemeMode | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    setPalette(asPaletteId(root.dataset.palette));
    setMode(root.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function applyPalette(next: PaletteId) {
    document.documentElement.dataset.palette = next;
    remember(PALETTE_STORAGE_KEY, next);
    setPalette(next);
  }

  function applyMode(next: ThemeMode) {
    document.documentElement.dataset.theme = next;
    remember(THEME_STORAGE_KEY, next);
    setMode(next);
  }

  // Before the effect runs we know neither, and guessing would paint six cards
  // in the wrong mode for one frame. The heading and copy above this component
  // are server-rendered, so the page is not blank while we wait a tick.
  const ready = palette !== null && mode !== null;

  return (
    <>
      <div className="mb-7 flex justify-end">
        <div className="seg" role="tablist" aria-label="Light or dark">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "light"}
            onClick={() => applyMode("light")}
          >
            Light
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "dark"}
            onClick={() => applyMode("dark")}
          >
            Dark
          </button>
        </div>
      </div>

      <div className="mb-8 grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
        {PALETTES.map((p, i) => {
          const active = p.id === palette;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPalette(p.id)}
              aria-pressed={active}
              data-palette={ready ? p.id : undefined}
              data-theme={ready ? mode : undefined}
              className="pop-in flex w-full cursor-pointer flex-col gap-3.5 rounded-[30px] border p-5 text-left transition-[box-shadow,transform] duration-300 [transition-timing-function:var(--ease-out-quint)]"
              style={{
                animationDelay: `${i * 45}ms`,
                background: "var(--color-bg)",
                color: "var(--color-text)",
                borderColor: active ? "var(--color-accent-500)" : "var(--color-line)",
                boxShadow: active ? "var(--shadow-lg)" : "var(--shadow-sm)",
                transform: active ? "translateY(-2px)" : undefined,
              }}
            >
              <span className="flex items-center gap-2.5">
                <BrandMark size={27} />
                <span className="font-[family-name:var(--font-heading)] text-xl">{p.name}</span>
                {active ? (
                  <Tag
                    className="ml-auto"
                    style={{
                      background: "var(--color-accent-500)",
                      color: "var(--color-on-accent)",
                      borderColor: "var(--color-accent-500)",
                    }}
                  >
                    In use
                  </Tag>
                ) : null}
              </span>

              <span className="block text-[13px] leading-[1.55] text-[var(--color-text-muted)]">
                {p.mood}
              </span>

              {/* The four bases and two derived steps, in the proportions the
                  product actually uses them: two voices, a tint, a surface and
                  a neutral. */}
              <span className="flex gap-1.5">
                <span className="h-[34px] flex-[2] rounded-xl" style={{ background: "var(--color-accent-500)" }} />
                <span className="h-[34px] flex-[2] rounded-xl" style={{ background: "var(--color-sage-500)" }} />
                <span className="h-[34px] flex-1 rounded-xl" style={{ background: "var(--color-accent-200)" }} />
                <span className="h-[34px] flex-1 rounded-xl" style={{ background: "var(--color-bg-raised)" }} />
                <span className="h-[34px] flex-1 rounded-xl" style={{ background: "var(--color-text-muted)" }} />
              </span>

              {/* Not decoration — this is the row that shows the palette doing
                  its job: a primary action, an affirming bucket, an accent one. */}
              <span className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-3">
                <span
                  className="inline-flex items-center rounded-[var(--radius-pill)] px-[15px] py-[7px] text-[12.5px] font-semibold"
                  style={{ background: "var(--color-accent-500)", color: "var(--color-on-accent)" }}
                >
                  Analyse
                </span>
                <Tag tone="sage">Strong match</Tag>
                <Tag tone="accent">Not evidenced</Tag>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-stretch gap-[18px]">
        <div className="min-w-[280px] flex-[1_1_330px] rounded-[30px] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-[22px]">
          <h2 className="mb-1.5 text-[22px]">How a palette is built</h2>
          <p className="mb-4 text-[13px] leading-[1.6] text-[var(--color-text-muted)]">
            Each one sets four colours. The nine-step neutral, accent and second-accent ramps are
            mixed from those in perceptual space, so contrast holds in light and dark without anyone
            hand-picking 54 hexes.
          </p>
          <ul className="flex list-none flex-col gap-2 p-0">
            {PALETTE_ANATOMY.map((a) => (
              <li key={a.name} className="flex items-center gap-3 text-[13px]">
                <span
                  className="h-[26px] w-[26px] shrink-0 rounded-[var(--radius-pill)] border border-[var(--color-line)]"
                  style={{ background: a.token }}
                />
                <span className="min-w-0 flex-1">
                  <b>{a.name}</b> — {a.role}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-[270px] flex-[1_1_300px] rounded-[30px] border border-dashed border-[var(--color-accent-400)] p-[22px]">
          <h2 className="mb-1.5 text-[22px]">What doesn&rsquo;t change</h2>
          <p className="mb-3.5 text-[13px] leading-[1.6] text-[var(--color-text-muted)]">
            The résumé itself. Every template stays black on white, because it is going into someone
            else&rsquo;s ATS and printer — not your theme (CLAUDE.md §9).
          </p>

          {/* Deliberately hard-coded, and the one place in the app that is
              allowed to be: this swatch is showing what a palette does NOT
              reach, so painting it from tokens would make it a lie. */}
          <div className="flex items-center gap-3 rounded-[22px] border border-[var(--color-line)] bg-white p-3.5">
            <div className="flex h-14 w-11 shrink-0 flex-col gap-[3px] rounded-[5px] border border-[#d8d3ca] bg-white p-1.5">
              <span className="h-1 w-[70%] rounded-sm bg-[#201e1d]" />
              <span className="h-0.5 w-full rounded-sm bg-[#b9b3aa]" />
              <span className="h-0.5 w-[88%] rounded-sm bg-[#b9b3aa]" />
              <span className="h-0.5 w-[94%] rounded-sm bg-[#b9b3aa]" />
              <span className="h-0.5 w-[60%] rounded-sm bg-[#b9b3aa]" />
            </div>
            <p className="m-0 text-[12.5px] leading-[1.55] text-[#4a453d]">
              Six templates, unchanged by the palette. The preview chrome around them follows your
              theme; the page inside it doesn&rsquo;t.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => applyPalette(DEFAULT_PALETTE)}
              disabled={palette === DEFAULT_PALETTE}
            >
              Back to Ember
            </Button>
            <Link href="/analyze" className="no-underline">
              <Button variant="ghost" size="sm">
                Back to your analysis
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Private mode, or storage disabled. The appearance still applies for this
 * page — it just won't survive a reload, which is the right failure.
 */
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // deliberately nothing
  }
}
