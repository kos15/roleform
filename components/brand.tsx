/**
 * The Roleform mark.
 *
 * What the product does, drawn: the pink job posting tilted behind, the
 * marigold résumé in front — folded corner, three lines of your own words —
 * and the maroon tick of a draft checked against the role. The badge's cream
 * rim keeps it legible where it overlaps the sheet. Every fill is a token (N9).
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
      <rect
        x="10"
        y="2.5"
        width="18"
        height="22"
        rx="3"
        fill="var(--color-sage-500)"
        transform="rotate(9 19 13.5)"
      />
      <path
        d="M7 7H17L22 12V26A3 3 0 0 1 19 29H7A3 3 0 0 1 4 26V10A3 3 0 0 1 7 7Z"
        fill="var(--color-accent-500)"
      />
      <path d="M17 7V10.5A1.5 1.5 0 0 0 18.5 12H22Z" fill="var(--color-accent-600)" />
      <path
        d="M8 13.5h5M8 18h9M8 22.5h5"
        stroke="var(--color-text)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {faded ? null : (
        <>
          <circle
            cx="23.5"
            cy="23.5"
            r="6.5"
            fill="var(--color-text)"
            stroke="var(--color-bg)"
            strokeWidth="1.8"
          />
          <path
            d="M20.9 23.6l1.8 1.8 3.5-3.7"
            stroke="var(--color-accent-500)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
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
