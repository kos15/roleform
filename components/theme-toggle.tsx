"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * The theme switch.
 *
 * Reads the theme off the DOM rather than holding it in React state as the
 * source of truth — the bootstrap script in app/layout.tsx has already resolved
 * it before hydration, and a second opinion here would fight it.
 *
 * Renders neither icon until mounted. A guess would be wrong half the time and a
 * sun flipping to a moon after hydration is worse than a beat of nothing.
 */
const STORAGE_KEY = "roleform-theme";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode, or storage disabled. The theme still applies for this
      // page — it just won't survive a reload, which is the right failure.
    }
    setTheme(next);
  }

  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--color-line)] text-[var(--color-text)] transition-colors hover:bg-[var(--color-accent-100)]"
    >
      {theme === null ? null : theme === "dark" ? (
        <Sun className="lucide h-4 w-4" />
      ) : (
        <Moon className="lucide h-4 w-4" />
      )}
    </button>
  );
}
