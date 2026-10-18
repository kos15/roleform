import Link from "next/link";
import { Tag } from "@/components/ui";
import type { HistoryRow } from "@/lib/admin/history";

/**
 * Every member's History, newest first (F15). Rows, not documents: role,
 * company, score, status and what the run produced — never the posting or a
 * bullet. A list of cards rather than a wide table so it reads on a phone.
 */
export function HistoryPanel({
  rows,
  members,
  memberId,
}: {
  rows: HistoryRow[];
  /** id → display name, for the filter and each row's owner. */
  members: { id: string; name: string }[];
  memberId: string | null;
}) {
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const current = memberId ? (nameOf.get(memberId) ?? "This member") : null;

  return (
    <section>
      {/* A plain GET form: works without JS, and the result is a shareable URL. */}
      <form method="get" action="/admin" className="mb-4 flex flex-wrap items-end gap-2.5">
        <input type="hidden" name="panel" value="history" />
        <label className="flex min-w-0 flex-1 basis-60 flex-col gap-1.5 text-xs font-semibold">
          Member
          <select name="member" defaultValue={memberId ?? ""} className="input">
            <option value="">Everyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-sm btn-primary">
          Show
        </button>
      </form>

      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        {rows.length === 0
          ? current
            ? `${current} has no analyses yet.`
            : "No analyses yet."
          : `${rows.length} ${rows.length === 1 ? "analysis" : "analyses"}${current ? ` · ${current}` : ""}`}
      </p>

      <ul className="grid grid-cols-1 gap-2.5">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] px-4 py-3.5"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
              <div className="min-w-0 flex-1 basis-48">
                <div className="truncate font-extrabold">{row.title ?? "Untitled posting"}</div>
                <div className="truncate text-xs text-[var(--color-text-muted)]">
                  {row.company ?? "—"} · {row.createdAt}
                </div>
              </div>
              <div className="flex flex-none items-center gap-2">
                {row.score !== null ? (
                  <span className="display text-xl leading-none">{row.score}</span>
                ) : null}
                <Tag
                  tone={
                    row.parked
                      ? "default"
                      : row.status === "ready"
                        ? "ink"
                        : row.status === "failed"
                          ? "pink"
                          : "warn"
                  }
                >
                  {row.parked
                    ? "Parked"
                    : row.status === "ready"
                      ? "Ready"
                      : row.status === "failed"
                        ? "Failed"
                        : "Analysing"}
                </Tag>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
              {memberId ? null : (
                <Link href={`/admin?panel=history&member=${encodeURIComponent(row.clerkUserId)}`}>
                  {nameOf.get(row.clerkUserId) ?? `Member …${row.clerkUserId.slice(-6)}`}
                </Link>
              )}
              <span>{row.drafts} drafts</span>
              <span>{row.questions} questions</span>
              <span>{row.gaps} gaps</span>
              <span>{row.exports} downloads</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
