"use client";

import { useState, useTransition } from "react";
import { grantTokens, updateMemberCaps } from "@/app/actions/admin";
import { Button, ErrorRegion, Tag } from "@/components/ui";
import { clampCap, displayCap, QUOTAS, type QuotaKey } from "@/lib/domain/quotas";
import { formatCount, formatTokens } from "@/lib/domain/tokens";
import type { Member } from "@/lib/admin/members";

/**
 * The cap editor (F15).
 *
 * Selecting a member is local state; saving is a Server Action. Nothing is
 * written on a click of + or −, because a cap that saves as you scrub it means
 * a member gets refused mid-drag by a number the admin was passing through.
 */
/** The three amounts an admin actually reaches for. Bigger than these is a cap
 *  change, which is the control directly above this one. */
const GRANTS = [50_000, 100_000, 300_000];

type Filter = "all" | "admins" | "paid" | "suspended" | "at-cap";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "admins", label: "Admins" },
  { id: "paid", label: "Paid" },
  { id: "at-cap", label: "At a cap" },
  { id: "suspended", label: "Suspended" },
];

function atAnyCap(member: Member): boolean {
  return QUOTAS.some(
    (q) => q.period === "cycle" && member.caps[q.key] > 0 && member.used[q.key] >= member.caps[q.key],
  );
}

function matchesFilter(member: Member, filter: Filter): boolean {
  switch (filter) {
    case "admins":
      return member.role === "admin";
    case "paid":
      return member.planId !== "free";
    case "suspended":
      return member.suspended || member.clerkBlocked !== null;
    case "at-cap":
      return atAnyCap(member);
    default:
      return true;
  }
}

export function AdminPanel({
  members,
  directoryReachable,
}: {
  members: Member[];
  directoryReachable: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const needle = query.trim().toLowerCase();
  const visible = members.filter(
    (m) =>
      matchesFilter(m, filter) &&
      (needle === "" ||
        m.name.toLowerCase().includes(needle) ||
        m.email.toLowerCase().includes(needle) ||
        m.plan.toLowerCase().includes(needle) ||
        m.clerkUserId.toLowerCase().includes(needle)),
  );

  const [selectedId, setSelectedId] = useState(members[0]?.clerkUserId ?? "");
  const selected = members.find((m) => m.clerkUserId === selectedId) ?? members[0];
  const [copied, setCopied] = useState(false);

  // Local overrides, keyed by member, so switching away and back keeps an
  // unsaved edit visible rather than silently discarding it.
  const [drafts, setDrafts] = useState<Record<string, { caps: Record<QuotaKey, number>; suspended: boolean }>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Grants are their own transaction, not part of the caps draft: a top-up is
  // applied the moment it is clicked and cannot be un-clicked by navigating
  // away, so batching it behind Save would misrepresent when it takes effect.
  const [granting, setGranting] = useState(false);
  const [granted, setGranted] = useState<number | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);

  if (!selected) {
    return (
      <p className="text-[var(--color-text-muted)]">
        No accounts yet. The first person to sign in appears here.
      </p>
    );
  }

  const draft = drafts[selected.clerkUserId] ?? {
    caps: selected.caps,
    suspended: selected.suspended,
  };

  const dirty =
    draft.suspended !== selected.suspended ||
    QUOTAS.some((q) => draft.caps[q.key] !== selected.caps[q.key]);

  function setDraft(next: { caps: Record<QuotaKey, number>; suspended: boolean }) {
    setSaved(false);
    setError(null);
    setDrafts((d) => ({ ...d, [selected.clerkUserId]: next }));
  }

  function nudge(key: QuotaKey, delta: number) {
    setDraft({
      ...draft,
      caps: { ...draft.caps, [key]: clampCap(key, draft.caps[key] + delta) },
    });
  }

  function grant(tokens: number) {
    setGrantError(null);
    setGranted(null);
    setGranting(true);
    startTransition(async () => {
      const result = await grantTokens({ clerkUserId: selected.clerkUserId, tokens });
      setGranting(false);
      if (!result.ok) setGrantError(result.error.message);
      else setGranted(result.value.tokens);
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberCaps({
        clerkUserId: selected.clerkUserId,
        caps: draft.caps,
        suspended: draft.suspended,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDrafts((d) => {
        const next = { ...d };
        delete next[selected.clerkUserId];
        return next;
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    });
  }

  function copyId() {
    navigator.clipboard
      ?.writeText(selected.clerkUserId)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="min-w-[min(300px,100%)] flex-1 basis-[520px]">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3>Members</h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            {visible.length === members.length
              ? `${members.length} ${members.length === 1 ? "account" : "accounts"}`
              : `${visible.length} of ${members.length} accounts`}
          </span>
        </div>

        {!directoryReachable ? (
          <p className="note mb-3 text-xs leading-relaxed">
            The identity provider didn&rsquo;t answer, so names and addresses can&rsquo;t be shown
            right now — rows are labelled by the end of their account ID. Usage and caps below are
            ours and are current. Check <code>CLERK_SECRET_KEY</code> on this deployment if this
            persists.
          </p>
        ) : null}

        <div className="mb-3 flex flex-col gap-2.5">
          <input
            type="search"
            className="input"
            placeholder="Search by name, email, plan or account ID"
            aria-label="Search members"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter members">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`tag ${filter === f.id ? "tag-ink" : "tag-outline"} cursor-pointer`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)]">
          {visible.length === 0 ? (
            <p className="px-4 py-5 text-[0.85rem] text-[var(--color-text-muted)]">
              No member matches that search.
            </p>
          ) : null}
          {visible.map((member) => {
            const active = member.clerkUserId === selected.clerkUserId;
            const cap = member.caps.analyses;
            const pct = cap === 0 ? 100 : Math.min(100, Math.round((member.used.analyses / cap) * 100));
            const atCap = cap > 0 && member.used.analyses >= cap;
            return (
              <button
                key={member.clerkUserId}
                type="button"
                onClick={() => setSelectedId(member.clerkUserId)}
                aria-pressed={active}
                className="flex w-full flex-wrap items-center gap-3.5 border-b border-l-[3px] border-[var(--color-line)] px-4 py-3.5 text-left transition-colors last:border-b-0"
                style={{
                  borderLeftColor: active ? "var(--color-accent-300)" : "transparent",
                  background: active ? "var(--color-accent-100)" : "transparent",
                }}
              >
                <Avatar member={member} size={34} />

                <span className="min-w-0 flex-1 basis-40">
                  <span className="flex flex-wrap items-center gap-[7px]">
                    <span
                      className={`text-[0.9rem] font-semibold ${member.nameSource === "subject" ? "text-[var(--color-text-muted)]" : ""}`}
                    >
                      {member.name}
                    </span>
                    {member.role === "admin" ? <Tag tone="accent">Admin</Tag> : null}
                    {member.missingFromDirectory ? <Tag tone="warn">Deleted in Clerk</Tag> : null}
                    {drafts[member.clerkUserId] ? <Tag tone="muted">Edited</Tag> : null}
                  </span>
                  <span className="block truncate text-xs text-[var(--color-text-muted)]">
                    {member.email}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--color-text-muted)]">
                    Joined {member.joined}
                    {member.lastActive ? ` · active ${member.lastActive}` : ""}
                  </span>
                </span>

                <span className="basis-20 flex-none">
                  <Tag tone="muted">{member.plan}</Tag>
                </span>

                <span className="min-w-[110px] flex-none basis-32">
                  <span className="mb-1.5 block text-xs text-[var(--color-text-muted)]">
                    {member.used.analyses} / {cap} analyses
                  </span>
                  <span className="block h-[5px] overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-bg-sunken)]">
                    <span
                      className="block h-full rounded-[var(--radius-pill)] transition-[width] duration-500"
                      style={{
                        width: `${pct}%`,
                        background:
                          atCap || member.suspended
                            ? "var(--color-accent)"
                            : "var(--color-sage-500)",
                      }}
                    />
                  </span>
                </span>

                <span className="basis-[84px] flex-none">
                  <Tag tone={member.suspended || member.clerkBlocked ? "accent" : "sage"}>
                    {member.suspended
                      ? "Suspended"
                      : member.clerkBlocked === "banned"
                        ? "Banned"
                        : member.clerkBlocked === "locked"
                          ? "Locked"
                          : "Active"}
                  </Tag>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="flex min-w-[min(290px,100%)] max-w-[440px] flex-1 basis-[330px] flex-col gap-3.5">
        <div className="rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] p-[1.125rem]">
          <div className="mb-4 flex items-center gap-3">
            <Avatar member={selected} size={42} />
            <div className="min-w-0">
              <div className="display text-lg">{selected.name}</div>
              <div className="truncate text-xs text-[var(--color-text-muted)]">
                {selected.email !== "—" ? (
                  <a href={`mailto:${selected.email}`}>{selected.email}</a>
                ) : (
                  "No email on file"
                )}
              </div>
            </div>
          </div>

          {/* Who this is, before what they may do: an admin about to change a
              cap should be certain which account they are holding. */}
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg)] px-3.5 py-3 text-xs">
            <Detail label="Plan">
              {selected.plan}
              {selected.planExpiresAt ? ` · until ${selected.planExpiresAt}` : ""}
            </Detail>
            <Detail label="Role">{selected.role === "admin" ? "Admin" : "Member"}</Detail>
            <Detail label="Email">
              {selected.email === "—"
                ? "—"
                : selected.emailVerified
                  ? "Verified"
                  : "Not verified"}
            </Detail>
            <Detail label="Signs in with">
              {selected.signInMethods.length > 0 ? selected.signInMethods.join(", ") : "—"}
            </Detail>
            <Detail label="Joined">{selected.joined}</Detail>
            <Detail label="Last sign-in">{selected.lastSignIn ?? "—"}</Detail>
            <Detail label="Last active">{selected.lastActive ?? "—"}</Detail>
            <Detail label="Analyses">
              {selected.activity.analysesTotal} all time
              {selected.activity.lastAnalysisAt
                ? ` · last ${selected.activity.lastAnalysisAt}`
                : ""}
            </Detail>
            <Detail label="Roadmaps">{selected.activity.roadmapsTotal} all time</Detail>
            <Detail label="Job searches">{selected.activity.jobSearchesTotal} all time</Detail>
            <Detail label="Top-ups">
              {selected.topupTokens > 0 ? formatCount(selected.topupTokens) : "None"}
            </Detail>
            <Detail label="Cycle from">{selected.cycleStartedAt}</Detail>
            {selected.clerkBlocked ? (
              <Detail label="In Clerk">
                {selected.clerkBlocked === "banned" ? "Banned" : "Locked out"}
              </Detail>
            ) : null}
            <dt className="text-[var(--color-text-muted)]">Account ID</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <code className="truncate">{selected.clerkUserId}</code>
              <button
                type="button"
                onClick={copyId}
                className="flex-none text-[11px] font-semibold underline"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </dd>
          </dl>

          {selected.missingFromDirectory ? (
            <p className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-accent-100)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--color-accent-800)]">
              Clerk has no record of this account — it was most likely deleted there. Its rows here
              remain until they are removed.
            </p>
          ) : null}

          {/* The caps below stay editable for an admin — the role can be
              removed in Clerk, and the stored numbers are what they fall back
              to when it is. But while the role is held, none of them bind, and
              a panel that showed a ceiling nothing enforces would be the same
              lie as a progress bar with no limit behind it. */}
          {selected.role === "admin" ? (
            <p className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-accent-100)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--color-accent-800)]">
              This member holds the admin role, so none of these caps are enforced — every run is
              still measured and still counted in the workspace totals. The values below are what
              they return to if the role is removed in Clerk.
            </p>
          ) : null}

          <div className="flex flex-col gap-4">
            {QUOTAS.map((quota) => {
              const value = draft.caps[quota.key];
              const used = selected.used[quota.key];
              const cyclic = quota.period === "cycle";
              const pct = value === 0 ? 0 : cyclic ? Math.min(100, (used / value) * 100) : 100;
              const over = cyclic && value > 0 && used >= value;

              return (
                <div key={quota.key} className="border-t border-[var(--color-line)] pt-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 text-[0.9rem] font-semibold">{quota.label}</div>
                      <p className="text-xs leading-snug text-[var(--color-text-muted)]">
                        {quota.description}
                      </p>
                    </div>

                    <div className="flex flex-none items-center gap-0.5 rounded-[var(--radius-pill)] border border-[var(--color-line)] bg-[var(--color-bg)] p-[3px]">
                      <StepButton
                        label={`Lower ${quota.label}`}
                        disabled={value <= quota.min}
                        onClick={() => nudge(quota.key, -quota.step)}
                      >
                        −
                      </StepButton>
                      <span className="min-w-[38px] text-center text-sm font-bold tabular-nums">
                        {displayCap(quota.key, value)}
                      </span>
                      <StepButton
                        label={`Raise ${quota.label}`}
                        disabled={value >= quota.max}
                        onClick={() => nudge(quota.key, quota.step)}
                      >
                        +
                      </StepButton>
                    </div>
                  </div>

                  <div className="mb-1.5 flex justify-between gap-2.5 text-[11.5px] text-[var(--color-text-muted)]">
                    <span>
                      {cyclic
                        ? `${quota.abbreviate ? formatTokens(used) : used} used this cycle`
                        : `${used} on the last run`}
                    </span>
                    <span>{quota.unit}</span>
                  </div>

                  <div className="h-[5px] overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-bg-sunken)]">
                    <div
                      className="h-full rounded-[var(--radius-pill)] transition-[width] duration-300"
                      style={{
                        width: `${pct}%`,
                        background: over ? "var(--color-accent)" : "var(--color-sage-500)",
                      }}
                    />
                  </div>

                  {over ? (
                    <p className="mt-1.5 text-xs leading-snug text-accent-body">
                      At the cap. New runs are refused with this member&rsquo;s name on the
                      message, not a generic error.
                    </p>
                  ) : null}

                  {/* Sits under the token row because it is the same subject and
                      a different decision: a grant unblocks this cycle, a cap
                      change moves what they inherit every cycle from here on. */}
                  {quota.key === "tokens" ? (
                    <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-sage-200)] bg-[var(--color-sage-100)] px-3.5 py-3">
                      <div className="mb-1 text-[0.8rem] font-semibold text-[var(--color-sage-800)]">
                        Grant a one-off top-up
                      </div>
                      <p className="mb-2.5 text-xs leading-snug text-[var(--color-sage-800)]">
                        {selected.topupTokens > 0
                          ? `${formatCount(selected.topupTokens)} already granted or bought. `
                          : ""}
                        Adds tokens now, without changing the cap this member inherits next cycle.
                        Unspent tokens carry over.
                      </p>
                      {grantError ? (
                        <p className="mb-2 text-xs text-accent-body">{grantError}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {GRANTS.map((amount) => (
                          <Button
                            key={amount}
                            size="sm"
                            variant="secondary"
                            disabled={granting}
                            busy={granting}
                            onClick={() => grant(amount)}
                          >
                            +{formatTokens(amount)}
                          </Button>
                        ))}
                      </div>
                      {granted ? (
                        <p className="mt-2 text-xs text-[var(--color-sage-800)]">
                          {formatCount(granted)} granted. It is spendable immediately.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}

            <div className="flex items-start justify-between gap-3 border-t border-[var(--color-line)] pt-4">
              <div className="flex-1">
                <div className="mb-0.5 text-[0.9rem] font-semibold">
                  {draft.suspended ? "Generations suspended" : "Generations enabled"}
                </div>
                <p className="text-xs leading-snug text-[var(--color-text-muted)]">
                  {draft.suspended
                    ? "Existing analyses stay readable. Nothing new runs, and the member is told why."
                    : "This member can run generations up to the caps above."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.suspended}
                aria-label="Suspend generations"
                onClick={() => setDraft({ ...draft, suspended: !draft.suspended })}
                className="h-6 w-11 flex-none rounded-[var(--radius-pill)] p-0.5 transition-colors"
                style={{
                  background: draft.suspended
                    ? "var(--color-accent-500)"
                    : "var(--color-bg-sunken)",
                }}
              >
                <span
                  className="block h-5 w-5 rounded-[var(--radius-pill)] bg-[var(--color-bg)] transition-transform duration-200"
                  style={{ transform: draft.suspended ? "translateX(20px)" : undefined }}
                />
              </button>
            </div>
          </div>
        </div>

        {error ? <ErrorRegion title="That didn't save">{error}</ErrorRegion> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} busy={pending} disabled={pending || (!dirty && !saved)}>
            {saved ? "Saved" : "Save changes"}
          </Button>
          {dirty ? (
            <Button
              variant="ghost"
              onClick={() =>
                setDrafts((d) => {
                  const next = { ...d };
                  delete next[selected.clerkUserId];
                  return next;
                })
              }
            >
              Revert
            </Button>
          ) : null}
          <span className="min-w-[180px] flex-1 text-xs text-[var(--color-text-muted)]">
            Applies at the member&rsquo;s next run. Analyses already under way finish under the
            old cap.
          </span>
        </div>
      </aside>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[var(--color-text-muted)]">{label}</dt>
      <dd className="min-w-0 font-medium">{children}</dd>
    </>
  );
}

/** Clerk's own avatar when the member set one; initials otherwise. */
function Avatar({ member, size }: { member: Member; size: number }) {
  if (member.imageUrl) {
    return (
      // A 34px Clerk-hosted avatar; next/image would need a remote pattern for
      // one decorative thumbnail.
      <img
        src={`${member.imageUrl}${member.imageUrl.includes("?") ? "&" : "?"}width=${size * 2}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="flex-none rounded-[var(--radius-pill)] object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid flex-none place-items-center rounded-[var(--radius-pill)] bg-[var(--color-sage-600)] text-xs font-bold text-[var(--color-bg)]"
      style={{ width: size, height: size }}
    >
      {member.initials}
    </span>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-[26px] w-[26px] place-items-center rounded-[var(--radius-pill)] text-base leading-none transition-colors hover:bg-[var(--color-accent-100)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
