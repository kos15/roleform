/**
 * The closing note under a section: a solid ink "i" beside muted prose. Used
 * wherever the product states a limit of what it can know.
 */
export function InfoNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`note ${className ?? ""}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="mt-px flex-none">
        <circle cx="12" cy="12" r="11" fill="var(--color-text)" />
        <path
          d="M12 11v6M12 7.5v.5"
          stroke="var(--color-bg)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      <p>{children}</p>
    </div>
  );
}
