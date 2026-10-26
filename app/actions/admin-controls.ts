"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/app/actions/admin";
import { FEATURES } from "@/lib/domain/features";
import { clampCap, QUOTAS } from "@/lib/domain/quotas";
import { PROMO_CODE_SHAPE, normaliseCode } from "@/lib/domain/promo";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import { capColumns, loadPlan } from "@/lib/services/plans/catalog";

/**
 * Admin controls (F31, F32): feature switches, the public plan catalog, a
 * member's plan by hand, and promo codes. Every action re-checks the role from
 * Clerk through `requireAdmin` — the panel is hidden, but an action is an
 * endpoint anyone can call.
 */

const PlanIdSchema = z.enum(["free", "pro", "ultra"]);

/** Every surface a plan or promo shows up on. */
function revalidatePricing() {
  revalidatePath("/pricing");
  revalidatePath("/md/pricing");
  revalidatePath("/llms-full.txt");
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}

/* ------------------------------------------------------------ feature switches */

const FeatureSchema = z.object({
  key: z.enum(FEATURES.map((f) => f.key) as [string, ...string[]]),
  enabled: z.boolean(),
});

export async function setFeature(input: { key: string; enabled: boolean }): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = FeatureSchema.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", "That isn't a feature we can switch."));

  const key = parsed.data.key as (typeof FEATURES)[number]["key"];
  await db.featureSwitch.upsert({
    where: { key },
    create: { key, enabled: parsed.data.enabled, updatedBy: admin.value },
    update: { enabled: parsed.data.enabled, updatedBy: admin.value },
  });

  // Nav links and tabs everywhere read the switch.
  revalidatePath("/", "layout");
  return ok(null);
}

/* -------------------------------------------------------------- plan catalog */

const PlanConfigSchema = z.object({
  id: PlanIdSchema,
  name: z.string().trim().min(1).max(40),
  pricePaise: z.number().int().min(0).max(10_000_000),
  unit: z.string().trim().min(1).max(40),
  tagline: z.string().trim().min(1).max(400),
  cta: z.string().trim().min(1).max(40),
  featured: z.boolean(),
  caps: z.object({
    tokens: z.number().int(),
    analyses: z.number().int(),
    resumes: z.number().int(),
    answers: z.number().int(),
    courses: z.number().int(),
    roadmaps: z.number().int(),
    jobSearches: z.number().int(),
    practice: z.number().int(),
  }),
});

export type PlanConfigInput = z.infer<typeof PlanConfigSchema>;

/**
 * Save a public plan (F31). Changes what /pricing prints and what checkout
 * charges from the next order on. It never touches an existing member — their
 * caps are their own row; a paid member picks up the new caps on renewal.
 */
export async function savePlanConfig(input: PlanConfigInput): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = PlanConfigSchema.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", "Some of those plan fields didn't make sense."));
  const p = parsed.data;

  if (p.id === "free" && p.pricePaise !== 0) {
    return err(appError("invalid_input", "Free has to stay at ₹0."));
  }
  if (p.id !== "free" && p.pricePaise < 100) {
    return err(appError("invalid_input", "A paid plan has to cost at least ₹1 — Razorpay's minimum."));
  }

  const caps = Object.fromEntries(QUOTAS.map((q) => [q.key, clampCap(q.key, p.caps[q.key])])) as typeof p.caps;
  const data = {
    name: p.name,
    pricePaise: p.pricePaise,
    unit: p.unit,
    tagline: p.tagline,
    cta: p.cta,
    featured: p.featured,
    ...capColumns(caps),
    updatedBy: admin.value,
  };

  await db.$transaction(async (tx) => {
    // One featured plan at most — two "most people want this" badges is none.
    if (p.featured) {
      await tx.planConfig.updateMany({ where: { id: { not: p.id } }, data: { featured: false } });
    }
    await tx.planConfig.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  });

  // A featured flag cleared on another plan only exists once that plan has a
  // row; seed the others so the flag move actually lands.
  if (p.featured) {
    for (const other of ["free", "pro", "ultra"] as const) {
      if (other === p.id) continue;
      const exists = await db.planConfig.findUnique({ where: { id: other }, select: { id: true } });
      if (exists) continue;
      const def = await loadPlan(other);
      await db.planConfig.create({
        data: {
          id: other,
          name: def.name,
          pricePaise: def.pricePaise,
          unit: def.unit,
          tagline: def.tagline,
          cta: def.cta,
          featured: false,
          ...capColumns(def.caps),
          updatedBy: admin.value,
        },
      });
    }
  }

  revalidatePricing();
  return ok(null);
}

/** Back to the shipped defaults in lib/content/pricing.ts. */
export async function resetPlanConfig(id: string): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const parsed = PlanIdSchema.safeParse(id);
  if (!parsed.success) return err(appError("invalid_input", "That isn't a plan."));
  await db.planConfig.deleteMany({ where: { id: parsed.data } });
  revalidatePricing();
  return ok(null);
}

/* ------------------------------------------------------- a member's plan */

const AssignSchema = z.object({
  clerkUserId: z.string().min(1),
  plan: PlanIdSchema,
  /** YYYY-MM-DD. Ignored for Free. */
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Put a member on a plan by hand (F31 — N21 as amended: the webhook on a
 * captured payment, or an audited admin grant). Paid plans need an expiry —
 * the `users` CHECK says so — and get that plan's current caps, the same write
 * a purchase makes. Free clears the expiry and drops to the Free caps.
 *
 * Every paid assignment is a `plan_purchases` row with an `admin:` reference
 * and the admin's subject, so "why is this person on Ultra" has an answer.
 */
export async function assignMemberPlan(input: z.infer<typeof AssignSchema>): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = AssignSchema.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", "Pick a plan and, for a paid one, an end date."));
  const { clerkUserId, plan: planId, until } = parsed.data;

  const target = await db.user.findUnique({ where: { clerkUserId }, select: { clerkUserId: true } });
  if (!target) return err(appError("not_found", "That member is no longer in this workspace."));

  const plan = await loadPlan(planId);

  if (planId === "free") {
    await db.user.update({
      where: { clerkUserId },
      data: { plan: "free", planExpiresAt: null, ...capColumns(plan.caps) },
    });
    revalidatePath("/admin");
    return ok(null);
  }

  if (!until) return err(appError("invalid_input", "A paid plan needs an end date."));
  // End of that day, India time — the date an admin picks is the last day it applies.
  const expires = new Date(`${until}T23:59:59+05:30`);
  if (Number.isNaN(expires.getTime()) || expires <= new Date()) {
    return err(appError("invalid_input", "The end date has to be in the future."));
  }
  if (expires.getTime() - Date.now() > 366 * 86_400_000) {
    return err(appError("invalid_input", "Grant a year at most at a time."));
  }

  await db.$transaction([
    db.planPurchase.create({
      data: { clerkUserId, plan: planId, reference: `admin:${randomUUID()}`, grantedBy: admin.value },
    }),
    db.user.update({
      where: { clerkUserId },
      data: { plan: planId, planExpiresAt: expires, ...capColumns(plan.caps) },
    }),
  ]);

  revalidatePath("/admin");
  return ok(null);
}

/* ---------------------------------------------------------------- promo codes */

const PromoSchema = z
  .object({
    code: z.string().max(40),
    label: z.string().trim().min(1).max(60),
    kind: z.enum(["percent", "flat"]),
    percentOff: z.number().int().min(1).max(90).optional(),
    amountOffPaise: z.number().int().min(100).max(10_000_000).optional(),
    plans: z.array(z.enum(["pro", "ultra"])).min(1),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    maxRedemptions: z.number().int().min(1).max(1_000_000).optional(),
    showBanner: z.boolean(),
    bannerText: z.string().trim().max(160).optional(),
  })
  .refine((v) => (v.kind === "percent" ? v.percentOff !== undefined : v.amountOffPaise !== undefined), {
    message: "discount",
  });

export type PromoInput = z.infer<typeof PromoSchema>;

function parseLocal(value: string | undefined): Date | null | "bad" {
  if (!value) return null;
  // `datetime-local` gives "YYYY-MM-DDTHH:mm" with no zone; admins are in India.
  const d = new Date(`${value}${value.length === 16 ? ":00" : ""}+05:30`);
  return Number.isNaN(d.getTime()) ? "bad" : d;
}

export async function createPromo(input: PromoInput): Promise<Result<{ code: string }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = PromoSchema.safeParse(input);
  if (!parsed.success) {
    return err(appError("invalid_input", "Check the discount, the plans and the label — something didn't fit."));
  }
  const p = parsed.data;
  const code = normaliseCode(p.code);
  if (!PROMO_CODE_SHAPE.test(code)) {
    return err(appError("invalid_input", "Codes are 3–24 characters: letters, digits and dashes."));
  }

  const startsAt = parseLocal(p.startsAt);
  const endsAt = parseLocal(p.endsAt);
  if (startsAt === "bad" || endsAt === "bad") return err(appError("invalid_input", "One of the dates didn't parse."));
  const start = startsAt ?? new Date();
  if (endsAt && endsAt <= start) return err(appError("invalid_input", "The offer has to end after it starts."));

  try {
    await db.promoCode.create({
      data: {
        code,
        label: p.label,
        kind: p.kind,
        percentOff: p.kind === "percent" ? p.percentOff! : null,
        amountOffPaise: p.kind === "flat" ? p.amountOffPaise! : null,
        plans: p.plans,
        startsAt: start,
        endsAt,
        maxRedemptions: p.maxRedemptions ?? null,
        showBanner: p.showBanner,
        bannerText: p.bannerText ? p.bannerText : null,
        createdBy: admin.value,
      },
    });
  } catch {
    return err(appError("conflict", `“${code}” already exists. Pick another or generate one.`));
  }

  revalidatePricing();
  return ok({ code });
}

const PromoPatchSchema = z.object({
  id: z.uuid(),
  active: z.boolean().optional(),
  showBanner: z.boolean().optional(),
});

/** Pause/resume a code, or take it off the banner. Codes are never edited after the fact. */
export async function updatePromo(input: z.infer<typeof PromoPatchSchema>): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const parsed = PromoPatchSchema.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", "That isn't a code we hold."));
  const { id, ...data } = parsed.data;
  const updated = await db.promoCode.updateMany({ where: { id }, data });
  if (updated.count === 0) return err(appError("not_found", "That code is no longer here."));
  revalidatePricing();
  return ok(null);
}

/**
 * Delete a code nobody has used. A code with redemptions is paused instead —
 * those rows are the record of what was charged and why (FK RESTRICT).
 */
export async function deletePromo(id: string): Promise<Result<{ deleted: boolean }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (!z.uuid().safeParse(id).success) return err(appError("invalid_input", "That isn't a code we hold."));

  const used = await db.promoRedemption.count({ where: { promoId: id } });
  if (used > 0) {
    await db.promoCode.updateMany({ where: { id }, data: { active: false, showBanner: false } });
    revalidatePricing();
    return ok({ deleted: false });
  }
  await db.promoCode.deleteMany({ where: { id } });
  revalidatePricing();
  return ok({ deleted: true });
}
