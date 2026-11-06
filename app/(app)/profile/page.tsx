import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  getBullets,
  getEvidenceCounts,
  getProfileWithDocument,
  getSuggestedSkills,
} from "@/lib/db/queries/profile";
import { Button, EmptyState } from "@/components/ui";
import { PageIntro } from "@/components/page-intro";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";
import { UsagePanel } from "./usage-panel";
import { ProfileEditor } from "./profile-editor";
import { DeleteAccount } from "./delete-account";
import { AccountName } from "./account-name";
import { NotificationsPanel } from "@/components/notifications-panel";
import { getDevices, getNotifyPrefs } from "@/lib/db/queries/rounds";

export const metadata = { title: "Your profile" };

/** Room for the 30-second "test with the app closed" push (app/actions/push.ts). */
export const maxDuration = 60;

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const [loaded, clerkUser] = await Promise.all([getProfileWithDocument(userId), currentUser()]);
  const accountName = (
    <AccountName firstName={clerkUser?.firstName ?? ""} lastName={clerkUser?.lastName ?? ""} />
  );
  if (!loaded) {
    return (
      <div className="max-w-2xl space-y-5">
        <EmptyState title="No profile yet">
          Import a résumé and Roleform will have something to work from.
        </EmptyState>
        <Link href="/onboarding" className="no-underline">
          <Button>Import résumé</Button>
        </Link>
        {accountName}
      </div>
    );
  }

  const resume = loaded.profile.resumeJson as unknown as StoredResume;

  const [bullets, evidence, suggestions] = await Promise.all([
    getBullets(userId, loaded.profile.id),
    getEvidenceCounts(userId),
    getSuggestedSkills(
      userId,
      resume.skills.map((s) => s.name),
    ),
  ]);

  // Path → times used, so the editor can label a bullet without knowing that
  // ids exist. The mapping lives in x_roleform (§6.1), which is the only thing
  // tying a line in the document to a row in the corpus.
  const bulletIds = resume.x_roleform?.bulletIds ?? {};
  const evidenceByPath: Record<string, number> = {};
  for (const [path, id] of Object.entries(bulletIds)) {
    evidenceByPath[path] = evidence.get(id) ?? 0;
  }

  return (
    <div className="rise-in">
      <PageIntro
        compact
        kicker="Your profile"
        title="The corpus we draw on"
        actions={
          <Link href="/onboarding" className="btn btn-secondary btn-sm no-underline">
            Replace résumé
          </Link>
        }
      >
        Everything a tailored résumé can say has to exist here first. Each entry shows how often it
        has actually been used as evidence — the ones at zero are the ones worth rewriting.
      </PageIntro>

      {/* The meter goes INTO the editor's aside: it is the one thing here that is
          not the corpus. Passed as a prop because it is an async server
          component and the editor is a client one — the boundary is the reason
          this is a slot and not an import. */}
      <ProfileEditor
        initial={resume}
        evidenceByPath={evidenceByPath}
        suggestions={suggestions}
        bulletCount={bullets.length}
        sourceFilename={loaded.document?.filename ?? null}
        updatedAt={loaded.profile.updatedAt.toISOString()}
        tokenPanel={<UsagePanel clerkUserId={userId} />}
      />

      {/* One Account block at the foot: name, F29 notification devices, delete. */}
      <section aria-labelledby="account-heading" className="mt-[clamp(2.5rem,5vw,4rem)] max-w-3xl">
        <h2 id="account-heading" className="mb-5">Account</h2>
        <div className="space-y-6">
          {accountName}
          <NotificationsPanel
            devices={(await getDevices(userId)).map((d) => ({
              id: d.id,
              key: d.key,
              deviceLabel: d.deviceLabel,
              createdAt: d.createdAt.toISOString(),
              lastSentAt: d.lastSentAt?.toISOString() ?? null,
              enabled: d.enabled,
            }))}
            prefs={await getNotifyPrefs(userId)}
          />
          <DeleteAccount />
        </div>
      </section>
    </div>
  );
}
