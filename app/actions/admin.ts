"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { currentRole } from "@/lib/admin/role";
import { clampCap, QUOTAS } from "@/lib/domain/quotas";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Admin actions (F15).
 *
 * Every one of these re-checks the role from the database. The link in the nav
 * is visible to everyone and the client can send whatever it likes, so the
 * server-side role read is the only thing standing between a member and another
 * member's caps — the same reasoning as CLAUDE.md §7 on scoping every query by
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

const CapsSchema = z.object({
  clerkUserId: z.string().min(1),
  caps: z.object({
    analyses: z.number().int(),
    resumes: z.number().int(),
    answers: z.number().int(),
    courses: z.number().int(),
  }),
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

const DefaultsSchema = z.object({
  analyses: z.number().int(),
  resumes: z.number().int(),
  answers: z.number().int(),
  courses: z.number().int(),
});

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

/**
 * A member asking to be let in (F15).
 *
 * Filed as a support message rather than as a new table and a new notification
 * path. It reaches the same two people, and a request that sits in a queue
 * nobody reads is worse than an email.
 */
export async function requestAdminAccess(): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const existing = await db.contactMessage.findFirst({
    where: { clerkUserId: user.value, subject: ACCESS_SUBJECT },
    orderBy: { createdAt: "desc" },
  });

  // Asking twice is not an escalation. Treat a repeat as the same request.
  if (existing && Date.now() - existing.createdAt.getTime() < 24 * 3600 * 1000) return ok(null);

  await db.contactMessage.create({
    data: {
      clerkUserId: user.value,
      // N7: the subject id is not an address, and this table is never joined to
      // a profile. The admins resolve who it is through Clerk, as they do in
      // the panel itself.
      name: "A workspace member",
      email: "noreply@roleform.app",
      subject: ACCESS_SUBJECT,
      body: `A member requested the workspace.generation.manage permission. Clerk subject: ${user.value}`,
    },
  });

  return ok(null);
}

const ACCESS_SUBJECT = "Admin access request";
