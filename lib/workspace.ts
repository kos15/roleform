/**
 * The workspace's own name (F15).
 *
 * The design heads the admin panel "Admin · Northwind Labs workspace" and the
 * 403's admin list "Admins on Northwind Labs". Both read better named than
 * generic — a member asking to be let in should see whose workspace they are
 * asking to be let into.
 *
 * There is no organisation model yet (lib/admin/role.ts), so the name is
 * configuration rather than a row: one install, one workspace. When
 * organisations arrive this becomes a lookup and the two call sites are
 * unchanged.
 *
 * Unset is a first-class case, not a placeholder to paper over. We would rather
 * fall back to the generic heading than print "Admins on this workspace
 * workspace" or, worse, invent a company name onto a person's 403.
 */
export const WORKSPACE_NAME = process.env.NEXT_PUBLIC_WORKSPACE_NAME?.trim() || null;

/** "Admin · Acme workspace", or the generic kicker when unnamed. */
export function adminKicker(): string {
  return WORKSPACE_NAME ? `Admin · ${WORKSPACE_NAME} workspace` : "Admin · generation controls";
}

/** "Admins on Acme", or the generic heading when unnamed. */
export function adminsHeading(): string {
  return WORKSPACE_NAME ? `Admins on ${WORKSPACE_NAME}` : "Who can grant it";
}
