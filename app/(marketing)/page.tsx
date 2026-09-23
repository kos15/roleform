import Link from "next/link";
// Clerk v7 replaced <SignedIn>/<SignedOut> with <Show when="signed-in" | "signed-out">.
import { Show, SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, Check, FileText, GraduationCap, MessageSquareQuote } from "lucide-react";
import { hasProfile } from "@/lib/db/queries/profile";
import { TEMPLATES, ratingFor, templateById } from "@/lib/render/templates";
import { Button } from "@/components/ui";
import { InfoNote } from "@/components/info-note";
import { JsonLd } from "@/components/json-ld";
import { FaqList } from "@/components/faq-list";
import { GUIDES, HOME_FAQS } from "@/lib/content/guides";
import { faqSchema, graph, organizationSchema, softwareSchema, websiteSchema } from "@/lib/seo/schema";
import { pageMetadata } from "@/lib/seo/metadata";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo/site";
import type { Metadata } from "next";
import { TemplatePaper } from "@/components/template-thumb";

/**
 * The hero's right-hand illustration is a worked example, not a claim about
 * the visitor: a sample requirement-coverage card and four template families
 * with their computed ATS ratings (N5 — read through `ratingFor`, never typed).
 */
const SHOWCASE = ["clean-slate", "ledger", "atlas", "keystone"] as const;

export const metadata: Metadata = {
  ...pageMetadata({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/" }),
  // The home title stands alone rather than going through "%s | Roleform".
  title: { absolute: SITE_TITLE },
};

export default async function MarketingPage() {
  // A member who already imported a résumé is not here to import one again.
  // The button they get is the one for where they actually are.
  const { userId } = await auth();
  const returning = userId ? await hasProfile(userId) : false;

  const cta = (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <Button size="lg">
            Get started <ArrowRight className="lucide h-[18px] w-[18px]" />
          </Button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <Link href={returning ? "/analyze" : "/onboarding"} className="btn btn-primary btn-lg no-underline">
          {returning ? "Analyse a posting" : "Import your résumé"}
          <ArrowRight className="lucide h-[18px] w-[18px]" />
        </Link>
      </Show>
    </>
  );

  return (
    <div>
      <JsonLd
        data={graph(organizationSchema(), websiteSchema(), softwareSchema(), faqSchema(HOME_FAQS))}
      />
      <div className="grid items-center gap-[clamp(2.25rem,5vw,4.5rem)] [grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr))]">
        {/* Left-aligned and asymmetric — whitespace on the right (CLAUDE.md §9). */}
        <div>
          <span className="tag tag-outline min-h-9 px-4 text-sm">One profile · every posting</span>
          {/* The catalog size, read from the catalog. A member's own run returns
              as many as their cap allows (F15); this is the default and the most
              anyone gets. */}
          <h1 className="mb-[30px] mt-7 text-[clamp(3.4rem,6vw,6.75rem)]">
            One résumé in.
            <br />
            {TEMPLATES.length} tailored out.
          </h1>
          <p className="mb-3.5 max-w-[46ch] text-[clamp(17px,1.5vw,19px)] leading-[1.55] [text-wrap:pretty]">
            Roleform reads a job posting, works out how much of it your own experience can
            evidence, and rewrites your résumé to say so in the posting&rsquo;s language.
          </p>
          {/* The product's law, in the product's own copy. */}
          <p className="mb-9 max-w-[46ch] text-[clamp(17px,1.5vw,19px)] leading-[1.55] [text-wrap:pretty]">
            <strong className="rounded-[6px] bg-[var(--color-accent-500)] px-1.5 py-px">
              Nothing is invented
            </strong>{" "}
            — bullets are reordered, reworded and re-weighted. What you can&rsquo;t evidence
            becomes the gap list, not a lie.
          </p>
          {cta}
        </div>

        <HeroCollage />
      </div>

      <div className="mb-[clamp(2.25rem,4vw,3.25rem)] mt-[clamp(3.5rem,8vw,6.5rem)] h-px bg-[var(--color-line)]" />

      <div className="grid gap-[26px] [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        {[
          {
            icon: FileText,
            title: `${TEMPLATES.length} drafts, same evidence`,
            body: "Classic, sidebar and creative templates. Each carries an honestly computed ATS rating — the creative ones rate Low, because they are.",
            card: "bg-[var(--color-bg-raised)]",
            dot: "bg-[var(--color-bg-tint)]",
            muted: true,
          },
          {
            icon: MessageSquareQuote,
            title: "The questions you'll be asked",
            body: "Twelve questions derived from this posting — technical and system design in their own tabs — each pointing at the experience to answer from, and expandable into a full worked answer.",
            card: "bg-[var(--color-sage-500)]",
            dot: "bg-[var(--color-sage-300)]",
            muted: false,
          },
          {
            icon: GraduationCap,
            title: "The gaps, ordered honestly",
            body: "What the posting asks for that you can't yet evidence, ranked by how often it's mentioned, with vetted courses that close it.",
            card: "bg-[var(--color-accent-100)]",
            dot: "bg-[var(--color-bg-raised)]",
            muted: true,
          },
        ].map(({ icon: Icon, title, body, card, dot, muted }) => (
          <div key={title} className={`flex flex-col gap-3.5 rounded-[22px] px-6 pb-7 pt-[22px] ${card}`}>
            <span className={`grid h-10 w-10 place-items-center rounded-[var(--radius-pill)] ${dot}`}>
              <Icon className="lucide h-[18px] w-[18px]" />
            </span>
            <h3 className="mt-3.5 text-xl">{title}</h3>
            <p
              className={`text-base leading-[1.55] ${muted ? "text-[var(--color-text-muted)]" : ""}`}
            >
              {body}
            </p>
          </div>
        ))}
      </div>

      <InfoNote className="mt-11">
        The match score is requirement coverage — how much of the posting your profile can
        evidence. It isn&rsquo;t an ATS score, and it doesn&rsquo;t predict a callback. Nobody
        can honestly sell you that number.{" "}
        <Link href="/how-it-works">Read how the four stages work</Link>.
      </InfoNote>

      <section aria-labelledby="guides-heading" className="mt-[clamp(3rem,6vw,4.5rem)]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h2 id="guides-heading" className="text-[clamp(2rem,4vw,3rem)] leading-none">
            Tailoring, explained
          </h2>
          <Link href="/guides" className="btn btn-secondary btn-sm no-underline">
            All guides
          </Link>
        </div>
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          {GUIDES.slice(0, 3).map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="card card-link flex h-full flex-col gap-2 rounded-[22px] no-underline"
              >
                <span className="eyebrow">{g.kicker}</span>
                <span className="text-lg font-extrabold leading-snug">{g.title}</span>
                <span className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                  {g.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <FaqList faqs={HOME_FAQS} />
    </div>
  );
}

/** The score card and the marigold block of templates, side by side. */
function HeroCollage() {
  const showcase = SHOWCASE.map((id) => templateById(id)).filter((t) => t !== undefined);
  const [front, middle, back] = [showcase[0], showcase[1], showcase[2]];

  return (
    <div aria-hidden className="flex flex-wrap items-stretch gap-[22px] pt-11">
      <div className="relative flex min-h-[360px] flex-[1_1_220px] flex-col items-center rounded-[26px] bg-[var(--color-bg-raised)] px-6 pb-11 pt-[34px] text-center">
        <span className="tag tag-outline absolute -top-[52px] left-1/2 min-h-10 -translate-x-1/2 bg-[var(--color-bg)] px-4 text-[15px] font-extrabold">
          № Senior Frontend
        </span>
        <span className="display text-[104px] leading-none">61</span>
        <span className="mt-1.5 text-[17px] font-semibold">Requirement coverage</span>
        <div className="mt-[26px] flex w-full max-w-[210px] flex-col gap-2">
          {["React", "TypeScript"].map((skill) => (
            <span key={skill} className="tag tag-outline min-h-[34px] px-3.5 text-sm">
              <Check className="lucide h-3.5 w-3.5" strokeWidth={3} />
              {skill}
            </span>
          ))}
          <span className="tag min-h-[34px] bg-[var(--color-accent-200)] px-3.5 text-sm">
            ½ Next.js App Router
          </span>
        </div>
        <span className="absolute -bottom-[18px] left-1/2 flex min-h-[38px] -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] bg-[var(--color-sage-500)] px-[18px] text-sm">
          Draws on:<strong>your own words</strong>
        </span>
      </div>

      <div className="relative mt-10 min-h-[360px] sm:top-[50px] sm:mt-0 flex-[1.35_1_280px] rounded-[26px] bg-[var(--color-accent-500)] px-[26px] py-[30px]">
        <div className="relative z-[2] flex flex-col items-start gap-3.5">
          {showcase.map((t) => (
            <span key={t.id} className="tag tag-outline min-h-[38px] bg-[var(--color-accent-500)] px-4 text-[15px]">
              {t.name} · ATS {ratingFor(t.id)}
            </span>
          ))}
        </div>
        {back ? (
          <TemplatePaper
            template={back}
            className="absolute bottom-[22px] right-[18px] h-[200px] w-[150px] rotate-[9deg] rounded-[10px] shadow-[var(--shadow-lg)]"
          />
        ) : null}
        {middle ? (
          <TemplatePaper
            template={middle}
            className="absolute bottom-16 right-[92px] h-[200px] w-[150px] -rotate-[4deg] rounded-[10px] shadow-[var(--shadow-lg)]"
          />
        ) : null}
        {front ? (
          <TemplatePaper
            template={front}
            className="absolute -top-10 right-10 z-[1] h-[208px] w-[156px] rotate-[3deg] rounded-[10px] shadow-[var(--shadow-lg)]"
          />
        ) : null}
      </div>
    </div>
  );
}
