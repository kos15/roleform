import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getBullets, getProfileWithDocument } from "@/lib/db/queries/profile";
import { Button, Card, EmptyState, Tag } from "@/components/ui";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";
import { ProfileEditor } from "./profile-editor";
import { DeleteAccount } from "./delete-account";

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const loaded = await getProfileWithDocument(userId);
  if (!loaded) {
    return (
      <div className="max-w-2xl space-y-5">
        <EmptyState title="No profile yet">
          Import a résumé and Roleform will have something to work from.
        </EmptyState>
        <Link href="/onboarding">
          <Button>Import résumé</Button>
        </Link>
      </div>
    );
  }

  const bullets = await getBullets(userId, loaded.profile.id);
  const resume = loaded.profile.resumeJson as StoredResume;

  return (
    <div className="max-w-3xl space-y-6">
      <h1>Your profile</h1>

      {/* The card the design specifies: filename · Parsed · N yrs · N skills (F1). */}
      <Card flat className="flex flex-wrap items-center gap-3">
        <strong>{loaded.document?.filename ?? "Manual entry"}</strong>
        <Tag tone="sage">Parsed</Tag>
        <Tag tone="muted">{Number(loaded.profile.yearsExperience)} yrs experience</Tag>
        <Tag tone="muted">{loaded.profile.skillCount} skills</Tag>
        <Tag tone="muted">{bullets.length} bullets</Tag>
        <Link href="/onboarding" className="ml-auto text-sm font-semibold text-accent-body">
          Replace résumé
        </Link>
      </Card>

      <p className="text-[var(--color-text-muted)]">
        These are your facts, in your words. Roleform reorders and rephrases them per posting —
        it never adds to them, and every edit here is yours alone.
      </p>

      <ProfileEditor initial={resume} />

      <DeleteAccount />
    </div>
  );
}
