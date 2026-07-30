/**
 * Kicker, title, standfirst — the opening of every written page.
 *
 * Flush left with the whitespace on the right (CLAUDE.md §9), and the measure
 * is capped in ch rather than px because the thing being constrained is reading
 * comfort, not layout.
 */
export function PageIntro({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 max-w-[62ch]">
      <div className="card-kicker mb-2.5">{kicker}</div>
      <h1 className="mb-3.5 text-[clamp(1.75rem,4.5vw,2.5rem)]">{title}</h1>
      {children ? (
        <p className="text-base leading-relaxed text-[var(--color-text-muted)]">{children}</p>
      ) : null}
    </div>
  );
}

/** The dotted list item used wherever a page enumerates refusals or changes. */
export function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span
        aria-hidden
        className="mt-[9px] h-1.5 w-1.5 flex-none rounded-[var(--radius-pill)] bg-[var(--color-accent-300)]"
      />
      <span className="text-[0.95rem] leading-[1.7]">{children}</span>
    </div>
  );
}
