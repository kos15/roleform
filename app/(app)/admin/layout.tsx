import type { Metadata } from "next";
import { assertAdminOr404 } from "@/lib/admin/guard";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Resolved on every request: a role can be revoked between two page views. */
export const dynamic = "force-dynamic";

/**
 * The gate for everything under /admin. It sits in the layout, above the
 * segment's loading.tsx, so a non-admin is turned away before any admin
 * skeleton, chrome or data is streamed — they receive the plain 404 page.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await assertAdminOr404();
  return <>{children}</>;
}
