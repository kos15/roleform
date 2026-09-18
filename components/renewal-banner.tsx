import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { planById } from "@/lib/content/pricing";
import { settlePlan } from "@/lib/db/queries/plan";
import { RenewalNotice } from "@/components/renewal-notice";

/**
 * Decides whether the one-time renewal warning is warranted; the client half
 * decides whether it has already been shown (F23) — the same split
 * `LowBalanceBanner`/`LowBalanceNotice` uses for the token meter, for the
 * same reason: nothing about a member's plan needs to become browser state
 * beyond the one sentence this renders.
 *
 * Five days out, once. Nothing renews itself in this product (no Razorpay
 * Subscriptions in v1, D11) — a plan that lapses silently is a member who
 * finds out by hitting a cap wall, which is a worse way to learn it than a
 * banner with a week's notice.
 */
export async function RenewalBanner() {
  const { userId } = await auth();
  if (!userId) return null;

  // Settled first: a plan that already lapsed is Free, and Free has nothing
  // to renew — this banner is not the token wall's fallback message.
  await settlePlan(userId);

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    select: { plan: true, planExpiresAt: true, suspended: true },
  });
  if (!user || user.plan === "free" || user.suspended || !user.planExpiresAt) return null;

  const daysLeft = Math.ceil((user.planExpiresAt.getTime() - Date.now()) / 86_400_000);
  if (daysLeft > 5 || daysLeft < 0) return null;

  return (
    <RenewalNotice
      planId={user.plan}
      planName={planById(user.plan).name}
      expiresOn={user.planExpiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
      daysLeft={daysLeft}
    />
  );
}
