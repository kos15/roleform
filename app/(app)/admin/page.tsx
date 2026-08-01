import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listMembers, workspaceStats } from "@/lib/admin/members";
import { workspaceDefaults } from "@/lib/admin/defaults";
import { currentRole, listAdmins } from "@/lib/admin/role";
import { cycleStart } from "@/lib/domain/quotas";
import { adminKicker } from "@/lib/workspace";
import { AccessDenied } from "./access-denied";
import { AdminPanel } from "./admin-panel";
import { PlansPanel } from "./plans-panel";
import { rollUpPlans } from "@/lib/admin/plans";
import { WorkspaceDefaultsPanel } from "./workspace-defaults";

export const metadata: Metadata = { title: "Admin · Roleform" };

/** Caps and usage change under you; a cached admin panel is a wrong one. */
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; panel?: string }>;
}) {
  const user = await requireUser();
  if (!user.ok) redirect("/sign-in");

  const { view, panel } = await searchParams;

  const [role, me] = await Promise.all([
    currentRole(user.value),
    db.user.findUnique({
      where: { clerkUserId: user.value },
      select: { capAnalyses: true, quotaResetsAt: true },
    }),
  ]);

  // A member gets the 403, not a redirect. Bouncing them somewhere else would
  // hide which permission they lack and who can grant it, which is the entire
  // content of that screen.
  //
  // `?view=member` puts an admin on the same screen deliberately (F15, the
  // design's "View as a member"). It is a preview of what a member sees, not a
  // downgrade: the request-access button is inert, because filing a request
  // against yourself would be a lie in the admins' inbox.
  const previewing = role === "admin" && view === "member";
  const showDefaults = panel === "defaults";
  if (role !== "admin" || previewing) {
    const [admins, used] = await Promise.all([
      listAdmins(),
      db.analysis.count({
        where: {
          clerkUserId: user.value,
          createdAt: { gte: cycleStart(me?.quotaResetsAt ?? null) },
        },
      }),
    ]);
    return (
      <AccessDenied
        admins={admins}
        usage={{ used, cap: me?.capAnalyses ?? 0 }}
        preview={previewing}
      />
    );
  }

  // The defaults read is an upsert (it seeds its own row), so it is issued only
  // when the panel is actually open rather than writing on every page view.
  const [members, stats, defaults] = await Promise.all([
    listMembers(),
    workspaceStats(),
    showDefaults ? workspaceDefaults() : Promise.resolve(null),
  ]);

  return (
    <div className="rise-in">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[60ch]">
          <div className="card-kicker mb-2">{adminKicker()}</div>
          <h1 className="mb-2 text-[clamp(1.625rem,4vw,2.25rem)]">Generation controls</h1>
          <p className="text-[0.9rem] leading-relaxed text-[var(--color-text-muted)]">
            Caps are per member, not pooled. A member who hits one is told which cap and who to
            ask — they never see a silent failure. Names and addresses come from the identity
            provider; we hold only a hash, and this panel never reads a member&rsquo;s profile,
            résumés or postings.
          </p>
        </div>

        {/* Both are links rather than buttons: each is a different view of this
            page, so each deserves a URL an admin can share or come back to. */}
        <div className="flex flex-wrap gap-2">
          <Link href="/admin?view=member" className="btn btn-secondary btn-sm no-underline">
            View as a member
          </Link>
          <Link
            href={showDefaults ? "/admin" : "/admin?panel=defaults"}
            className="btn btn-secondary btn-sm no-underline"
            aria-expanded={showDefaults}
          >
            Workspace defaults
          </Link>
        </div>
      </div>

      {showDefaults && defaults ? <WorkspaceDefaultsPanel defaults={defaults} /> : null}

      <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        {stats.map((stat) => {
          const pct = stat.of && stat.of > 0 ? Math.min(100, (stat.value / stat.of) * 100) : 0;
          return (
            <div
              key={stat.label}
              className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] px-[1.125rem] py-4"
            >
              <div className="mb-2 text-[11px] uppercase tracking-[0.09em] text-[var(--color-text-muted)]">
                {stat.label}
              </div>
              <div className="mb-2.5 flex items-baseline gap-2">
                <span className="font-[family-name:var(--font-heading)] text-[1.625rem] leading-none">
                  {stat.value}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">{stat.sub}</span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-bg-sunken)]">
                <div
                  className="h-full rounded-[var(--radius-pill)] bg-[var(--color-sage-500)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <AdminPanel members={members} />

      {/* Rolled up from the list we already have — the plan strip costs no
          second query, which is why it can sit on a force-dynamic page. */}
      <PlansPanel rollup={rollUpPlans(members)} />
    </div>
  );
}
