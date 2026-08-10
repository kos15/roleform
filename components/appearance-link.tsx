import Link from "next/link";
import { Palette } from "lucide-react";

/**
 * The way into the palette picker, in both headers (F18).
 *
 * Sits next to the theme toggle rather than inside a settings menu: the two
 * controls do the same kind of thing, and burying one of them makes the app
 * look like it has one theme and a preference page nobody finds.
 */
export function AppearanceLink() {
  return (
    <Link
      href="/appearance"
      title="Appearance"
      aria-label="Appearance"
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--color-line)] text-[var(--color-text)] no-underline transition-colors hover:bg-[var(--color-accent-100)]"
    >
      <Palette className="lucide h-4 w-4" />
    </Link>
  );
}
