import type { Metadata } from "next";
import Link from "next/link";
import { listMembers, syncFromDirectory, workspaceStats } from "@/lib/admin/members";
import { listHistory } from "@/lib/admin/history";
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
import { HistoryPanel } from "./history-panel";

export const metadata: Metadata = { title: "Admin" };

/** Caps and usage change under you; a cached admin panel is a wrong one. */
export const dynamic = "force-dynamic";

type Panel = "members" | "history" | "plans" | "promos" | "features" | "defaults" | "inbox";
const PANELS: Panel[] = ["members", "history", "plans", "promos", "features", "defaults", "inbox"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string; member?: string }>;
}) {
  // The layout already turned non-admins away with a 404; asserted again here
  // so the page is never one refactor away from rendering for a member.
  await assertAdminOr404();

  const { panel: raw, member: memberParam } = await searchParams;
  const panel: Panel = PANELS.includes(raw as Panel) ? (raw as Panel) : "members";

  // Each panel reads only what it shows. The defaults read is an upsert (it
  // seeds its own row), and the inbox holds other people's words — both are
  // read only when open. The counts decide what the tab bar says, so they are
  // read on every view.
  //
  // Every view syncs the Clerk directory first (lib/admin/members.ts), so a
  // person who signed up appears here without anyone pressing anything. The
  // member list does it as part of its own read; other panels do it alone.
  const needMembers =
    panel === "members" || panel === "plans" || panel === "inbox" || panel === "history";
  const [memberList, stats, counts, plans] = await Promise.all([
    needMembers ? listMembers() : syncFromDirectory().then(() => null),
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
  const historyFor = memberParam && memberParam.length > 0 ? memberParam : null;
  const history =
    panel === "history" ? await listHistory({ clerkUserId: historyFor ?? undefined }) : null;
  const members = memberList?.members ?? [];

  const tabs: { id: Panel; label: string }[] = [
    { id: "members", label: "Members" },
    { id: "history", label: "History" },
    { id: "plans", label: "Plans" },
    { id: "promos", label: "Promo codes" },
    { id: "features", label: "Features" },
    { id: "defaults", label: "Defaults" },
    { id: "inbox", label: counts.unhandled > 0 ? `Inbox · ${counts.unhandled}` : "Inbox" },
  ];

  return (
    <div className="rise-in">
      <div className="mb-6 max-w-[64ch]">
        <div className="card-kicker mb-2">{adminKicker()}</div>
        <h1 className="mb-2 text-[clamp(1.625rem,4vw,2.25rem)]">Admin</h1>
        <p className="text-[0.9rem] leading-relaxed text-[var(--color-text-muted)]">
          Members sync from Clerk on every visit.
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
      <nav
        aria-label="Admin sections"
        className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.id === "members" ? "/admin" : `/admin?panel=${tab.id}`}
            aria-current={panel === tab.id ? "page" : undefined}
            className={`btn btn-sm flex-none no-underline ${panel === tab.id ? "btn-primary" : "btn-secondary"}`}
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
            syncedFromDirectory={memberList?.syncedFromDirectory ?? 0}
            plans={plans.map((p) => ({ id: p.id, name: p.name }))}
          />
        </>
      ) : null}

      {panel === "history" && history ? (
        <HistoryPanel
          rows={history}
          members={members.map((m) => ({ id: m.clerkUserId, name: m.name }))}
          memberId={historyFor}
        />
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
