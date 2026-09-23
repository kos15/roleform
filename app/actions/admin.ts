"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { currentRole } from "@/lib/admin/role";
import { clampCap, QUOTAS, QUOTA_BY_KEY } from "@/lib/domain/quotas";
import { formatCount } from "@/lib/domain/tokens";
import { deliver } from "@/lib/mail/deliver";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Admin actions (F15).
 *
 * Every one of these re-checks the role from Clerk. The admin UI is hidden from
 * members and /admin 404s for them, but a server action is an endpoint the
 * client can call with whatever it likes, so this role read is the lock that
 * actually stands between a member and another member's caps — the same reasoning as CLAUDE.md §7 on scoping every query by
 * the session subject.
 */

export async function requireAdmin(): Promise<Result<string>> {
  const user = await requireUser();
  if (!user.ok) return user;

  // Read from Clerk, not from the mirrored column. The client can send any
  // payload it likes, and the mirror is write-behind — the only thing worth
  // gating on is the source of truth (lib/admin/role.ts).
  if ((await currentRole(user.value)) !== "admin") {
    return err(
      appError(
        "unauthenticated",
        "Generation controls need the workspace.generation.manage permission, which your account doesn't carry.",
      ),
    );
  }

  return ok(user.value);
}

const CapsShape = z.object({
  tokens: z.number().int(),
  analyses: z.number().int(),
  resumes: z.number().int(),
  answers: z.number().int(),
  courses: z.number().int(),
  roadmaps: z.number().int(),
  jobSearches: z.number().int(),
});

const CapsSchema = z.object({
  clerkUserId: z.string().min(1),
  caps: CapsShape,
  suspended: z.boolean(),
});

export type CapsInput = z.infer<typeof CapsSchema>;

export async function updateMemberCaps(input: CapsInput): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = CapsSchema.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", "Those caps didn't make sense."));

  // Clamped here as well as CHECKed in the database. The constraint is the
  // guarantee; this is so a fat-fingered value snaps to the bound instead of
  // throwing a Postgres error at someone who was only holding down a button.
  const caps = Object.fromEntries(
    QUOTAS.map((q) => [q.column, clampCap(q.key, parsed.data.caps[q.key])]),
  ) as Record<(typeof QUOTAS)[number]["column"], number>;

  const target = await db.user.findUnique({
    where: { clerkUserId: parsed.data.clerkUserId },
    select: { clerkUserId: true },
  });
  if (!target) return err(appError("not_found", "That member is no longer in this workspace."));

  await db.user.update({
    where: { clerkUserId: parsed.data.clerkUserId },
    data: { ...caps, suspended: parsed.data.suspended },
  });

  revalidatePath("/admin");
  return ok(null);
}

const DefaultsSchema = CapsShape;

export type DefaultsInput = z.infer<typeof DefaultsSchema>;

/**
 * Workspace defaults (F15) — the caps a NEW account is provisioned with.
 *
 * Deliberately does not touch a single existing row. An admin who wants to
 * move someone already here has the per-member panel, where they can see the
 * usage they are moving the line across. A "defaults" control that silently
 * re-capped the whole workspace would be the generic, unexplained refusal this
 * feature exists to remove — just delivered a day later.
 */
export async function updateWorkspaceDefaults(input: DefaultsInput): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = DefaultsSchema.safeParse(input);
  if (!parsed.success) return err(appError("invalid_input", "Those defaults didn't make sense."));

  const caps = Object.fromEntries(
    QUOTAS.map((q) => [q.column, clampCap(q.key, parsed.data[q.key])]),
  ) as Record<(typeof QUOTAS)[number]["column"], number>;

  await db.workspaceSettings.upsert({
    where: { id: "workspace" },
    create: { id: "workspace", ...caps },
    update: caps,
  });

  revalidatePath("/admin");
  return ok(null);
}


/* ------------------------------------------------------------- token grants */


/** The same ceiling the cap carries. A grant is not a way around the bound. */
const MAX_GRANT = QUOTA_BY_KEY.tokens.max;

const GrantSchema = z.object({
  clerkUserId: z.string().min(1),
  tokens: z.number().int().positive().max(MAX_GRANT),
});

export type GrantInput = z.infer<typeof GrantSchema>;

/**
 * Give a member a one-off top-up (F19).
 *
 * Deliberately NOT a cap change. Raising `cap_tokens` would move the number
 * this member inherits every cycle from here on, which is a different decision
 * with a different blast radius — an admin unblocking someone today should not
 * have to also decide what they get next month.
 *
 * Written as a `token_grants` row with an `admin:<uuid>` reference, alongside
 * the rows the payment webhook writes. One table, so "where did these tokens
 * come from" has one answer, and the UNIQUE reference means a double-click is a
 * conflict rather than a double grant.
 */
export async function grantTokens(input: GrantInput): Promise<Result<{ tokens: number }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = GrantSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      appError("invalid_input", `A grant has to be between 1 and ${formatCount(MAX_GRANT)} tokens.`),
    );
  }

  const target = await db.user.findUnique({
    where: { clerkUserId: parsed.data.clerkUserId },
    select: { clerkUserId: true },
  });
  if (!target) return err(appError("not_found", "That member is no longer in this workspace."));

  await db.tokenGrant.create({
    data: {
      clerkUserId: parsed.data.clerkUserId,
      tokens: parsed.data.tokens,
      source: "admin",
      reference: `admin:${randomUUID()}`,
      grantedBy: admin.value,
    },
  });

  revalidatePath("/admin");
  return ok({ tokens: parsed.data.tokens });
}


/* ------------------------------------------------------------ support inbox */

const IdSchema = z.uuid();

/**
 * Mark a message answered, or put it back (F16).
 *
 * The handled flag carries the admin's subject beside it, enforced by a CHECK
 * (the `contact_messages_handled_pair` constraint): a message marked answered
 * with nobody's name on it is one two people each assume the other took.
 */
export async function setContactHandled(id: string, handled: boolean): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  if (!IdSchema.safeParse(id).success) {
    return err(appError("invalid_input", "That isn't a message we hold."));
  }

  const updated = await db.contactMessage.updateMany({
    where: { id },
    data: handled
      ? { handledAt: new Date(), handledBy: admin.value }
      : { handledAt: null, handledBy: null },
  });

  if (updated.count === 0) return err(appError("not_found", "That message is no longer here."));

  revalidatePath("/admin");
  return ok(null);
}

/**
 * Send a filed message again (F16).
 *
 * For the rows the mail provider refused, and for every row filed while mail
 * was switched off — the inbox is how those get out once it is switched on. The
 * message text comes from the row, never from the caller, which is what keeps
 * this from being a way to post arbitrary mail through our domain.
 */
export async function retryContactDelivery(id: string): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  if (!IdSchema.safeParse(id).success) {
    return err(appError("invalid_input", "That isn't a message we hold."));
  }

  const row = await db.contactMessage.findUnique({ where: { id } });
  if (!row) return err(appError("not_found", "That message is no longer here."));

  // The receipt is a one-time courtesy at submit. Re-sending it days later
  // would tell the sender something arrived twice when nothing did.
  const outcome = await deliver(
    {
      id: row.id,
      name: row.name,
      email: row.email,
      subject: row.subject,
      body: row.body,
      clerkUserId: row.clerkUserId,
    },
    { receipt: false },
  );

  revalidatePath("/admin");

  if (outcome.notification === "disabled") {
    return err(
      appError(
        "misconfigured",
        "Outbound mail isn't configured on this deployment — set RESEND_API_KEY, CONTACT_FROM and CONTACT_TO, then try again.",
      ),
    );
  }
  if (outcome.notification !== "sent") {
    return err(
      appError("upstream_failed", outcome.error ?? "The mail provider refused that message."),
    );
  }

  return ok(null);
}
