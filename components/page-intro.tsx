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
    <div className="mb-[clamp(2rem,4vw,3rem)] max-w-[62ch]">
      <p className="eyebrow mb-3.5">{kicker}</p>
      <h1 className="mb-[18px]">{title}</h1>
      {children ? (
        <p className="text-[17px] leading-relaxed text-[var(--color-text-muted)]">{children}</p>
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
        className="mt-[9px] h-2 w-2 flex-none rounded-[var(--radius-pill)] bg-[var(--color-sage-600)]"
      />
      <span className="text-[15px] leading-[1.65]">{children}</span>
    </div>
  );
}
