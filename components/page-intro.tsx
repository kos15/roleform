/**
 * The title size of a signed-in surface: the work, not the headline, owns the
 * first screen. Marketing pages keep the default `h1` size.
 */
export const APP_TITLE = "text-[clamp(2rem,4.2vw,3.5rem)]";

/**
 * Kicker, title, standfirst — the opening of every written page.
 *
 * Flush left with the whitespace on the right (CLAUDE.md §9), and the measure
 * is capped in ch rather than px because the thing being constrained is reading
 * comfort, not layout.
 *
 * `actions` sits on the right of the title row and wraps beneath it on phones.
 * `compact` is the signed-in density: a smaller title and tighter margins.
 */
export function PageIntro({
  kicker,
  title,
  children,
  actions,
  compact = false,
}: {
  kicker: string;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  const margin = compact ? "mb-[clamp(1.25rem,2.5vw,2rem)]" : "mb-[clamp(2rem,4vw,3rem)]";
  const intro = (
    <>
      <p className={`eyebrow ${compact ? "mb-2" : "mb-3.5"}`}>{kicker}</p>
      <h1 className={compact ? `mb-3 ${APP_TITLE}` : "mb-[18px]"}>{title}</h1>
      {children ? (
        <p className="text-[15px] leading-relaxed text-[var(--color-text-muted)] sm:text-[17px]">{children}</p>
      ) : null}
    </>
  );
  if (!actions) return <div className={`${margin} max-w-[62ch]`}>{intro}</div>;
  return (
    <div className={`${margin} flex flex-wrap items-end justify-between gap-x-8 gap-y-4`}>
      <div className="min-w-0 max-w-[62ch]">{intro}</div>
      <div data-slot="page-actions" className="flex flex-wrap items-center gap-2.5">
        {actions}
      </div>
    </div>
  );
}

/** The dotted list item used wherever a page enumerates refusals or changes. */
export function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span
        aria-hidden
        className="mt-[9px] h-2 w-2 flex-none rounded-[var(--radius-pill)] bg-[var(--color-sage-600)]"
      />
      <span className="text-[15px] leading-[1.65]">{children}</span>
    </div>
  );
}
