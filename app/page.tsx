import Link from "next/link";
// Clerk v7 replaced <SignedIn>/<SignedOut> with <Show when="signed-in" | "signed-out">.
import { Show, SignInButton } from "@clerk/nextjs";
import { ArrowRight, FileText, MessageSquareQuote, GraduationCap } from "lucide-react";
import { Button, Card, Tag } from "@/components/ui";

export default function MarketingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <nav className="mb-24 flex items-center justify-between">
        <span className="font-[family-name:var(--font-heading)] text-2xl">Roleform</span>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button variant="secondary" size="sm">
              Sign in
            </Button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <Link href="/analyze">
            <Button size="sm">Open Roleform</Button>
          </Link>
        </Show>
      </nav>

      {/* Left-aligned and asymmetric — whitespace on the right (CLAUDE.md §9). */}
      <div className="max-w-2xl">
        <Tag tone="accent" className="mb-6">
          One profile · every posting
        </Tag>
        <h1 className="mb-6">One résumé in. Six tailored out.</h1>
        <p className="mb-4 max-w-xl text-lg">
          Roleform reads a job posting, works out how much of it your own experience can
          evidence, and rewrites your résumé to say so in the posting&rsquo;s language.
        </p>
        {/* The product's law, in the product's own copy. */}
        <p className="mb-10 max-w-xl text-lg text-accent-body">
          <strong>Nothing is invented</strong> — bullets are reordered, reworded and
          re-weighted. What you can&rsquo;t evidence becomes the gap list, not a lie.
        </p>

        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button>
              Get started <ArrowRight className="lucide h-4 w-4" />
            </Button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <Link href="/onboarding">
            <Button>
              Import your résumé <ArrowRight className="lucide h-4 w-4" />
            </Button>
          </Link>
        </Show>
      </div>

      <div className="mt-24 grid gap-5 md:grid-cols-3">
        {[
          {
            icon: FileText,
            title: "Six drafts, same evidence",
            body: "Classic, sidebar and creative templates. Each carries an honestly computed ATS rating — the creative ones rate Low, because they are.",
          },
          {
            icon: MessageSquareQuote,
            title: "The questions you'll be asked",
            body: "Ten questions derived from this posting, four flagged highly likely, each pointing at the experience to answer from.",
          },
          {
            icon: GraduationCap,
            title: "The gaps, ordered honestly",
            body: "What the posting asks for that you can't yet evidence, ranked by how often it's mentioned, with vetted courses that close it.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <Icon className="lucide mb-4 h-6 w-6 text-[var(--color-accent-600)]" />
            <h3 className="mb-2">{title}</h3>
            <p className="text-sm text-[var(--color-text-muted)]">{body}</p>
          </Card>
        ))}
      </div>

      <p className="mt-16 max-w-xl text-sm text-[var(--color-text-muted)]">
        The match score is requirement coverage — how much of the posting your profile can
        evidence. It isn&rsquo;t an ATS score, and it doesn&rsquo;t predict a callback. Nobody
        can honestly sell you that number.
      </p>
    </main>
  );
}
