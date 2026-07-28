import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getProfileWithDocument } from "@/lib/db/queries/profile";
import { Button, Card, EmptyState, Tag } from "@/components/ui";
import { JdInput } from "./jd-input";

export default async function AnalyzePage() {
  const { userId } = await auth();
  const profile = userId ? await getProfileWithDocument(userId) : null;

  if (!profile) {
    return (
      <div className="max-w-2xl">
        <EmptyState title="Import your résumé first">
          Roleform matches a posting against your own experience. Without a profile there is
          nothing to match — and nothing we&rsquo;d be willing to invent.
        </EmptyState>
        <div className="mt-5">
          <Link href="/onboarding">
            <Button>Import résumé</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Step 1 of 3
      </p>
      <h1 className="mb-3">Paste the job description</h1>
      <p className="mb-8 max-w-xl text-[var(--color-text-muted)]">
        We&rsquo;ll pull out what the role actually requires, work out how much of it your
        profile can evidence, and show you both — including what it can&rsquo;t.
      </p>

      {/* The profile card: filename · Parsed · N yrs · N skills (F1). */}
      <Card flat className="mb-6 flex flex-wrap items-center gap-3">
        <strong>{profile.document?.filename ?? "Your profile"}</strong>
        <Tag tone="sage">Parsed</Tag>
        <Tag tone="muted">{Number(profile.profile.yearsExperience)} yrs</Tag>
        <Tag tone="muted">{profile.profile.skillCount} skills</Tag>
        <Link href="/profile" className="ml-auto text-sm font-semibold text-accent-body">
          Replace résumé
        </Link>
      </Card>

      <JdInput />
    </div>
  );
}
