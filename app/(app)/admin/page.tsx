import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listMembers, workspaceStats } from "@/lib/admin/members";
import { currentRole, listAdmins } from "@/lib/admin/role";
import { cycleStart } from "@/lib/domain/quotas";
import { AccessDenied } from "./access-denied";
import { AdminPanel } from "./admin-panel";

export const metadata: Metadata = { title: "Admin · Roleform" };

/** Caps and usage change under you; a cached admin panel is a wrong one. */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  if (!user.ok) redirect("/sign-in");

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
  if (role !== "admin") {
    const [admins, used] = await Promise.all([
      listAdmins(),
      db.analysis.count({
        where: {
          clerkUserId: user.value,
          createdAt: { gte: cycleStart(me?.quotaResetsAt ?? null) },
        },
      }),
    ]);
    return <AccessDenied admins={admins} usage={{ used, cap: me?.capAnalyses ?? 0 }} />;
  }

  const [members, stats] = await Promise.all([listMembers(), workspaceStats()]);

  return (
    <div className="rise-in">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[60ch]">
          <div className="card-kicker mb-2">Admin · generation controls</div>
          <h1 className="mb-2 text-[clamp(1.625rem,4vw,2.25rem)]">Generation controls</h1>
          <p className="text-[0.9rem] leading-relaxed text-[var(--color-text-muted)]">
            Caps are per member, not pooled. A member who hits one is told which cap and who to
            ask — they never see a silent failure. Names and addresses come from the identity
            provider; we hold only a hash, and this panel never reads a member&rsquo;s profile,
            résumés or postings.
          </p>
        </div>
      </div>

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
    </div>
  );
}
