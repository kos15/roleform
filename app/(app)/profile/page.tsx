import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  getBullets,
  getEvidenceCounts,
  getProfileWithDocument,
  getSuggestedSkills,
} from "@/lib/db/queries/profile";
import { Button, EmptyState } from "@/components/ui";
import { PageIntro } from "@/components/page-intro";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";
import { TokenPanel } from "./token-panel";
import { ProfileEditor } from "./profile-editor";
import { DeleteAccount } from "./delete-account";

export const metadata = { title: "Your profile · Roleform" };

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
        <Link href="/onboarding" className="no-underline">
          <Button>Import résumé</Button>
        </Link>
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
      <PageIntro kicker="Your profile" title="The corpus we draw on">
        Everything a tailored résumé can say has to exist here first. Each entry shows how often it
        has actually been used as evidence — the ones at zero are the ones worth rewriting.
      </PageIntro>

      {/* The meter goes INTO the editor's left column rather than under it, as
          in the design: it is the first thing on this screen, above the corpus
          it pays for. Passed as a prop because it is an async server component
          and the editor is a client one — the boundary is the reason this is a
          slot and not an import. */}
      <ProfileEditor
        initial={resume}
        evidenceByPath={evidenceByPath}
        suggestions={suggestions}
        bulletCount={bullets.length}
        sourceFilename={loaded.document?.filename ?? null}
        updatedAt={loaded.profile.updatedAt.toISOString()}
        tokenPanel={<TokenPanel clerkUserId={userId} />}
      />

      <div className="mt-8 max-w-3xl">
        <DeleteAccount />
      </div>
    </div>
  );
}
