import type { Metadata } from "next";
import Link from "next/link";
import { listMembers, workspaceStats } from "@/lib/admin/members";
import { workspaceDefaults } from "@/lib/admin/defaults";
import { assertAdminOr404 } from "@/lib/admin/guard";
import { adminKicker } from "@/lib/workspace";
import { inboxCounts, listContactMessages } from "@/lib/admin/inbox";
import { isMailConfigured } from "@/lib/mail/config";
import { featureStates } from "@/lib/features";
import { loadPlans } from "@/lib/plans/catalog";
import { listPromos } from "@/lib/promo/server";
import { AdminPanel } from "./admin-panel";
import { InboxPanel } from "./inbox-panel";
import { PlansPanel } from "./plans-panel";
import { rollUpPlans } from "@/lib/admin/plans";
import { WorkspaceDefaultsPanel } from "./workspace-defaults";
import { FeaturesPanel } from "./features-panel";
import { PromosPanel } from "./promos-panel";

export const metadata: Metadata = { title: "Admin" };

/** Caps and usage change under you; a cached admin panel is a wrong one. */
export const dynamic = "force-dynamic";

type Panel = "members" | "plans" | "promos" | "features" | "defaults" | "inbox";
const PANELS: Panel[] = ["members", "plans", "promos", "features", "defaults", "inbox"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string }>;
}) {
  // The layout already turned non-admins away with a 404; asserted again here
  // so the page is never one refactor away from rendering for a member.
  await assertAdminOr404();

  const { panel: raw } = await searchParams;
  const panel: Panel = PANELS.includes(raw as Panel) ? (raw as Panel) : "members";

  // Each panel reads only what it shows. The defaults read is an upsert (it
  // seeds its own row), and the inbox holds other people's words — both are
  // read only when open. The counts decide what the tab bar says, so they are
  // read on every view.
  const needMembers = panel === "members" || panel === "plans" || panel === "inbox";
  const [memberList, stats, counts, plans] = await Promise.all([
    needMembers ? listMembers() : Promise.resolve(null),
    workspaceStats(),
    inboxCounts(),
    loadPlans(),
  ]);
  const [defaults, messages, features, promos] = await Promise.all([
    panel === "defaults" ? workspaceDefaults() : Promise.resolve(null),
    panel === "inbox" ? listContactMessages() : Promise.resolve(null),
    panel === "features" ? featureStates() : Promise.resolve(null),
    panel === "promos" ? listPromos() : Promise.resolve(null),
  ]);
  const members = memberList?.members ?? [];

  const tabs: { id: Panel; label: string }[] = [
    { id: "members", label: "Members" },
    { id: "plans", label: "Plans" },
    { id: "promos", label: "Promo codes" },
    { id: "features", label: "Features" },
    { id: "defaults", label: "New-account defaults" },
    { id: "inbox", label: counts.unhandled > 0 ? `Support inbox · ${counts.unhandled}` : "Support inbox" },
  ];

  return (
    <div className="rise-in">
      <div className="mb-6 max-w-[64ch]">
        <div className="card-kicker mb-2">{adminKicker()}</div>
        <h1 className="mb-2 text-[clamp(1.625rem,4vw,2.25rem)]">Admin</h1>
        <p className="text-[0.9rem] leading-relaxed text-[var(--color-text-muted)]">
          Members and their caps, the public plans, promo codes and which features are open. Names
          and addresses come from the identity provider; this panel never reads a member&rsquo;s
          profile, résumés or postings.
        </p>
        {/* Said here rather than only inside the inbox: a message that never
            reached an inbox is invisible everywhere else. */}
        {counts.undelivered > 0 ? (
          <p className="mt-2 text-[0.85rem] text-[var(--color-accent-700)]">
            {counts.undelivered === 1
              ? "One support message was filed but never emailed to us."
              : `${counts.undelivered} support messages were filed but never emailed to us.`}{" "}
            <Link href="/admin?panel=inbox">Read them in the inbox</Link>.
          </p>
        ) : null}
      </div>

      {/* Links, not buttons: each panel is a URL an admin can share or return to. */}
      <nav aria-label="Admin sections" className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.id === "members" ? "/admin" : `/admin?panel=${tab.id}`}
            aria-current={panel === tab.id ? "page" : undefined}
            className={`btn btn-sm no-underline ${panel === tab.id ? "btn-primary" : "btn-secondary"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {panel === "members" ? (
        <>
          <div className="mb-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr))]">
            {stats.map((stat) => {
              const pct = stat.of && stat.of > 0 ? Math.min(100, (stat.value / stat.of) * 100) : 0;
              return (
                <div
                  key={stat.label}
                  className="rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] px-[1.125rem] py-4"
                >
                  <div className="mb-2 text-[11px] uppercase tracking-[0.09em] text-[var(--color-text-muted)]">
                    {stat.label}
                  </div>
                  <div className="mb-2.5 flex items-baseline gap-2">
                    <span className="display text-[1.625rem] leading-none">{stat.value}</span>
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
          <AdminPanel
            members={members}
            directoryReachable={memberList?.directoryReachable ?? true}
            plans={plans.map((p) => ({ id: p.id, name: p.name }))}
          />
        </>
      ) : null}

      {panel === "plans" ? <PlansPanel plans={plans} rollup={rollUpPlans(members, plans)} /> : null}
      {panel === "promos" && promos ? <PromosPanel promos={promos} plans={plans} /> : null}
      {panel === "features" && features ? <FeaturesPanel states={features} /> : null}
      {panel === "defaults" && defaults ? <WorkspaceDefaultsPanel defaults={defaults} /> : null}
      {panel === "inbox" && messages ? (
        <InboxPanel
          messages={messages}
          mailConfigured={isMailConfigured()}
          // Only the senders who are members, and only their name — enough to
          // say who wrote in without pasting an account ID into the page.
          accounts={Object.fromEntries(
            members
              .filter((m) => messages.some((msg) => msg.clerkUserId === m.clerkUserId))
              .map((m) => [m.clerkUserId, `${m.name} · ${m.plan}`]),
          )}
        />
      ) : null}
    </div>
  );
}
