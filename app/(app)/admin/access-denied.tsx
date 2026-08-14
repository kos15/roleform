"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { requestAdminAccess } from "@/app/actions/admin";
import { BrandMark } from "@/components/brand";
import { Button, ErrorRegion } from "@/components/ui";
import { adminsHeading } from "@/lib/workspace";

/**
 * The 403 (F15).
 *
 * It says which permission is missing, what you can still do, and who can grant
 * it — because the failure mode this replaces is a member clicking a nav link
 * and getting a blank page with the word "Forbidden" on it. The list of things
 * that still work is not consolation copy; it is the fastest route back to
 * doing the thing they were actually trying to do.
 */
export function AccessDenied({
  admins,
  usage,
  preview,
}: {
  admins: { name: string; initials: string }[];
  usage: { used: number; cap: number };
  /** An admin looking at what a member sees (F15, "View as a member"). */
  preview?: boolean;
}) {
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function ask() {
    setError(null);
    startTransition(async () => {
      const result = await requestAdminAccess();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setRequested(true);
    });
  }

  return (
    <div className="grid place-items-center py-[clamp(1.75rem,6vw,4.5rem)]">
      <div className="rise-in w-full max-w-[560px]">
        {preview ? (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-sunken)] px-4 py-3">
            <span className="text-[0.85rem]">
              This is what a member sees. Your own access is unchanged.
            </span>
            <Link href="/admin" className="btn btn-secondary btn-sm ml-auto no-underline">
              Back to controls
            </Link>
          </div>
        ) : null}

        <div className="relative mb-6 h-24 w-24">
          <BrandMark size={96} faded />
          <div className="absolute -bottom-0.5 -right-0.5 grid h-[38px] w-[38px] place-items-center rounded-[var(--radius-pill)] border-2 border-[var(--color-bg)] bg-[var(--color-accent-100)]">
            <Lock className="lucide h-[17px] w-[17px] text-[var(--color-accent-800)]" />
          </div>
        </div>

        <div className="card-kicker mb-2.5">403 · workspace.generation.manage</div>
        <h1 className="mb-3 text-[clamp(1.75rem,4.5vw,2.375rem)]">
          You&rsquo;re signed in — just not as an admin
        </h1>
        <p className="mb-5 text-[0.95rem] leading-[1.65] text-[var(--color-text-muted)]">
          Generation controls set how many analyses, résumés, answers and course matches each
          member gets. That&rsquo;s billing-adjacent, so it sits behind one permission your
          account doesn&rsquo;t carry.
        </p>

        <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-sage-200)] bg-[var(--color-sage-100)] px-5 py-4">
          <div className="mb-2.5 text-[11px] uppercase tracking-[0.09em] text-[var(--color-sage-800)]">
            You can still do all of this
          </div>
          <ul className="flex flex-col gap-2 text-[0.85rem] leading-snug text-[var(--color-sage-900)]">
            <Can>
              Run analyses up to your own cap — {usage.used} of {usage.cap} used this cycle
            </Can>
            <Can>Render every template your cap allows, and draft full answers</Can>
            <Can>Edit your profile and see your own usage</Can>
          </ul>
        </div>

        <div className="mb-5 rounded-[var(--radius-lg)] border border-[var(--color-line)] px-5 py-4">
          <div className="mb-3 text-[11px] uppercase tracking-[0.09em] text-[var(--color-text-muted)]">
            {admins.length > 0 ? adminsHeading() : "Nobody can grant it yet"}
          </div>
          {admins.length > 0 ? (
            <div className="flex flex-wrap gap-2.5">
              {admins.map((admin) => (
                <span
                  key={admin.name}
                  className="flex items-center gap-2.5 rounded-[var(--radius-pill)] bg-[var(--color-bg-sunken)] py-1.5 pl-1.5 pr-3.5"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-[var(--radius-pill)] bg-[var(--color-sage-600)] text-[11px] font-bold text-[var(--color-bg)]">
                    {admin.initials}
                  </span>
                  <span className="text-[0.8rem]">{admin.name}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[0.85rem] leading-snug text-[var(--color-text-muted)]">
              This workspace has no admin yet. Write to us and we&rsquo;ll sort out who it should
              be — we&rsquo;re not going to guess.
            </p>
          )}
        </div>

        {error ? <ErrorRegion title="That didn't send">{error}</ErrorRegion> : null}

        {requested ? (
          <div className="rise-in rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] px-[1.125rem] py-4">
            {/* Named, not "Sent". The person who just asked for something wants
                to know who they asked — and the names are already on screen
                above, so withholding them here would be a stranger choice. */}
            <div className="mb-1 text-[0.9rem] font-semibold">Sent to {firstNames(admins)}</div>
            <p className="mb-3 text-[0.85rem] leading-snug text-[var(--color-text-muted)]">
              They see it in the admin panel with your account and the page you were trying to
              reach. We&rsquo;ll write back either way — including if they decline.
            </p>
            <Link href="/analyze" className="btn btn-secondary no-underline">
              Back to your analysis
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/* Inert while previewing: an admin already holds the permission,
                and filing a request against yourself would put a lie in the
                other admins' inbox. */}
            <Button
              onClick={ask}
              busy={pending}
              disabled={pending || preview || admins.length === 0}
            >
              Request admin access
            </Button>
            <Link href="/analyze" className="btn btn-secondary no-underline">
              Back to your analysis
            </Link>
            {preview ? (
              <span className="text-xs text-[var(--color-text-muted)]">
                Inactive in preview — you already hold this permission.
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Devika and Rahul" — first names, because that is how the design reads and
 * how someone would say it out loud. Falls back to the full name when there is
 * only one word to work with, and to "the admins" when the directory read
 * failed, which is the one case where naming nobody is the honest answer.
 */
function firstNames(admins: { name: string }[]): string {
  const names = admins.map((a) => a.name.split(/\s+/)[0]).filter(Boolean);
  if (names.length === 0) return "the admins";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function Can({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="flex-none">
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}
