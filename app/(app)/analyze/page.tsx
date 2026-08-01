import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { FileText } from "lucide-react";
import { getProfileWithDocument } from "@/lib/db/queries/profile";
import { Card, EmptyState } from "@/components/ui";
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
          <Link href="/onboarding" className="btn btn-primary">
            Import résumé
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="rise-in mb-8 max-w-[620px]">
        <p className="eyebrow mb-2.5 text-[var(--color-accent-700)]">Step 1 of 3 · The posting</p>
        <h1 className="mb-3">One résumé in. Six tailored out.</h1>
        <p className="text-[var(--color-text-muted)]">
          Paste or drop the posting. Roleform reads it, scores how much of it your own profile can
          evidence, and returns six drafts, the questions this posting invites, and the gaps it
          exposes. Nothing is invented — every bullet traces back to something you wrote.
        </p>
      </div>

      {/* The aside carries the corpus and the contract; the posting goes in the
          left column. Keeping them side by side is the point — you can see what
          we'll be drawing on while you paste the thing we'll draw against. */}
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <JdInput />

        <aside className="flex flex-col gap-4">
          {/* The profile card: filename · Parsed · N yrs · N skills (F1). */}
          <Card flat>
            <p className="card-kicker mb-3 text-[var(--color-accent-700)]">Your profile</p>
            <div className="mb-3 flex items-center gap-3">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"
                style={{ background: "var(--color-accent-200)" }}
              >
                <FileText className="lucide h-4 w-4 text-[var(--color-accent-800)]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {profile.document?.filename ?? "Your profile"}
                </span>
                <span className="block text-sm text-[var(--color-text-muted)]">
                  Parsed · {Number(profile.profile.yearsExperience)} yrs ·{" "}
                  {profile.profile.skillCount} skills
                </span>
              </span>
            </div>
            <p className="mb-4 text-sm text-[var(--color-text-muted)]">
              This is the only corpus we draw on. Bullets get reordered, reworded and re-weighted —
              never invented.
            </p>
            {/* The DS classes rather than <Button> — a <button> inside an <a> is
                invalid, and this is a link that happens to look like a button. */}
            <Link href="/profile" className="btn btn-secondary w-full">
              Replace résumé
            </Link>
          </Card>

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] p-5">
            <p className="card-kicker mb-3 text-[var(--color-sage-700)]">What comes back</p>
            <ol className="flex flex-col gap-2.5 text-sm">
              {[
                "Six drafts across classic, sidebar and creative — each with a computed ATS rating",
                "The questions this posting suggests, by family, with frameworks not scripts",
                "Requirements you can't yet evidence, and vetted courses that close them",
              ].map((text, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="font-[family-name:var(--font-heading)] text-[var(--color-sage-600)]">
                    0{i + 1}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
