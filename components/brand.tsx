/**
 * The Roleform mark.
 *
 * Two lenses crossing — a marigold horizontal and a pink vertical — with the
 * ground punched through the middle. One posting read through one profile; the
 * hole is where they agree. Every fill is a token (N9).
 */
export function BrandMark({ size = 34, faded }: { size?: number; faded?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className="shrink-0"
      style={faded ? { opacity: 0.45 } : undefined}
    >
      <path
        d="M2.5 16C9 8.6 23 8.6 29.5 16C23 23.4 9 23.4 2.5 16Z"
        fill="var(--color-accent-500)"
      />
      <path
        d="M16 2.5C23.4 9 23.4 23 16 29.5C8.6 23 8.6 9 16 2.5Z"
        fill="var(--color-sage-500)"
        opacity=".92"
      />
      <circle cx="16" cy="16" r="4.6" fill="var(--color-bg)" />
      {faded ? null : <circle cx="16" cy="16" r="2" fill="var(--color-text)" />}
    </svg>
  );
}

/**
 * Wordmark. The full stop is the only place in the product where the accent
 * carries meaning on its own — it is the sentence ending, not decoration.
 */
export function Wordmark({ size = 27 }: { size?: number }) {
  return (
    <span
      className="display uppercase leading-none tracking-[0.01em] text-[var(--color-text)]"
      style={{ fontSize: size }}
    >
      Roleform<span style={{ color: "var(--color-accent-600)" }}>.</span>
    </span>
  );
}

export function Brand({ size = 34, wordSize = 27 }: { size?: number; wordSize?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark size={size} />
      <Wordmark size={wordSize} />
    </span>
  );
}
