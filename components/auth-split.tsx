/**
 * The sign-in and sign-up screens: the promise on the left, the form on the
 * right. Stacks to one column when there isn't room for both.
 */
export function AuthSplit({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid w-full items-center gap-[clamp(2rem,5vw,4.5rem)] [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))]">
      <div>
        <p className="eyebrow mb-3.5">{kicker}</p>
        <h1 className="mb-[18px]">{title}</h1>
        <p className="max-w-[44ch] text-[17px] leading-relaxed text-[var(--color-text-muted)]">
          We reorder and reword what you wrote — we don&rsquo;t invent experience you don&rsquo;t
          have.
        </p>
      </div>
      <div className="flex justify-center">{children}</div>
    </div>
  );
}
