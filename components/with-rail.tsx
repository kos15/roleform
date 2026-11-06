/**
 * A main column with a side rail.
 *
 * The main column comes first in the DOM on purpose: on phones the rail stacks
 * below it, so the thing the member came for is the first thing they see. From
 * `lg` the rail sits to the right.
 *
 * `empty:hidden` is there because a rail's content may render nothing at all
 * (`UpcomingRounds` returns null). An empty `<aside>` then takes no room, and —
 * being flex rather than grid — takes its gap with it.
 */
export function WithRail({
  children,
  rail,
  railLabel,
}: {
  children: React.ReactNode;
  rail: React.ReactNode;
  railLabel: string;
}) {
  return (
    <div className="flex flex-col gap-[clamp(1.75rem,3vw,2.5rem)] lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">{children}</div>
      <aside
        aria-label={railLabel}
        className="flex min-w-0 flex-col gap-[18px] empty:hidden lg:w-[340px] lg:flex-none"
      >
        {rail}
      </aside>
    </div>
  );
}
