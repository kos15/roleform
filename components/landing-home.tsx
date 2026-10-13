import Link from "next/link";
import { ArrowRight, Check, GraduationCap, Search } from "lucide-react";
import { TEMPLATES, ratingFor, templateById, type TemplateDef } from "@/lib/render/templates";
import { PORTFOLIO_LOOKS } from "@/lib/domain/portfolio-site";
import { TemplatePaper } from "@/components/template-thumb";
import { InfoNote } from "@/components/info-note";
import { LandingReveal } from "@/components/landing-reveal";

/**
 * The landing page (design: `Roleform Prototype.dc.html`, screen "01 Landing"):
 * the hero, how it works, and one row per tool — find, fit, tailor, rehearse,
 * cram, grow, plan, stand out, track — each linking into the tool itself.
 *
 * Every illustration is a worked example, not a claim about the visitor. The
 * ATS badges come from `ratingFor` (N5), the draft count is the catalog's own
 * length and the look count is `PORTFOLIO_LOOKS.length` — none of them typed.
 */

export interface LandingHrefs {
  start: string;
  jobs: string;
  analyze: string;
  resumes: string;
  prep: string;
  rapid: string;
  learning: string;
  roadmap: string;
  portfolio: string;
  history: string;
}

/** One template per family for the hero's badges, and the three papers fanned behind them. */
const HERO_FAMILIES = ["clean-slate", "ledger", "atlas", "keystone"] as const;

const FAMILY_LABEL: Record<string, string> = { classic: "Classic", sidebar: "Sidebar", creative: "Creative", banner: "Banner" };

const pick = (ids: readonly string[]) => ids.map((id) => templateById(id)).filter((t): t is TemplateDef => t !== undefined);

const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

export function LandingHome({ hrefs }: { hrefs: LandingHrefs }) {
  const drafts = TEMPLATES.length;
  const looks = PORTFOLIO_LOOKS.length;

  return (
    <LandingReveal>
      <section aria-labelledby="landing-heading">
        <div className="grid items-center gap-[clamp(2.25rem,5vw,4.5rem)] [grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr))]">
          {/* Left-aligned and asymmetric — whitespace on the right (CLAUDE.md §9). */}
          <div>
            <span style={i(1)} className="intro-item tag tag-outline min-h-9 px-4 text-sm">
              Your whole job switch · one place
            </span>
            <h1 id="landing-heading" style={i(2)} className="intro-item mb-[30px] mt-7 text-[clamp(3.2rem,5.4vw,5.25rem)] leading-[0.9]">
              Switch jobs.
              <br />
              Skip the chaos.
            </h1>
            <p style={i(3)} className="intro-item mb-[22px] max-w-[46ch] text-[clamp(17px,1.5vw,19px)] leading-[1.55] [text-wrap:pretty]">
              Everything between &ldquo;I want out&rdquo; and &ldquo;I got the offer&rdquo; — built from the
              experience you already have.
            </p>
            <ul style={i(4)} className="intro-item mb-[22px] flex max-w-[520px] flex-wrap gap-2">
              {[
                ["Tailored résumés", "bg-[var(--color-accent-500)]"],
                ["Interview prep", "bg-[var(--color-sage-500)]"],
                ["Skill-gap plan", "bg-[var(--color-accent-700)]"],
                ["Portfolio site", "bg-[var(--color-text)]"],
              ].map(([label, dot]) => (
                <li key={label} className="inline-flex min-h-9 items-center gap-[7px] rounded-[var(--radius-pill)] bg-[var(--color-bg-raised)] px-3.5 text-sm font-bold">
                  <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
                  {label}
                </li>
              ))}
            </ul>
            {/* The product's law, in the product's own copy. */}
            <p style={i(5)} className="intro-item mb-[34px] max-w-[46ch] text-[clamp(16px,1.4vw,17px)] leading-[1.55] [text-wrap:pretty]">
              <strong className="rounded-[6px] bg-[var(--color-accent-500)] px-1.5 py-px">Nothing is invented.</strong>{" "}
              Every line comes from your real work — what you can&rsquo;t back up becomes a to-learn list, not a lie.
            </p>
            <div style={i(6)} className="intro-item flex flex-wrap items-center gap-x-[18px] gap-y-3.5">
              <Link href={hrefs.start} data-help="landing-cta" className="btn btn-primary btn-lg no-underline">
                Start my switch <ArrowRight className="lucide h-[18px] w-[18px]" />
              </Link>
              <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                Starts with the résumé you already have
              </span>
            </div>
          </div>

          <HeroCollage />
        </div>
      </section>

      <SectionHead
        eyebrow="How it works"
        title={["Set up once.", "Reuse for every role."]}
        lede="Your profile does the heavy lifting. Each new posting takes minutes, not a weekend."
      />
      <ol className="grid gap-[clamp(20px,2.4vw,32px)] [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        {[
          ["Add your résumé once", "Upload it and check what we read. It becomes the profile everything else draws on."],
          ["Paste any posting", "Any role, any field. Roleform reads what it asks for and how much of it you already cover."],
          ["Get the full kit", "Tailored drafts, likely questions, a gap plan and a checklist — all for that one role."],
        ].map(([title, body], n) => (
          <li key={title} data-rv data-rv-d={n * 90} className="flex flex-col gap-3.5">
            <div className="flex items-center gap-3.5">
              <span
                className={`display grid h-14 w-14 flex-none place-items-center rounded-full text-2xl ${
                  n === 2 ? "bg-[var(--color-accent-500)] text-[var(--color-text)]" : "bg-[var(--color-text)] text-[var(--color-accent-500)]"
                }`}
              >
                0{n + 1}
              </span>
              {n < 2 ? (
                <span
                  aria-hidden
                  data-rv-bar
                  className="h-0.5 flex-1 origin-left [background:repeating-linear-gradient(90deg,var(--color-line-strong)_0_8px,transparent_8px_16px)]"
                />
              ) : null}
            </div>
            <h3 className="mt-1.5 text-xl">{title}</h3>
            <p className="text-base leading-[1.55] text-[var(--color-text-muted)] [text-wrap:pretty]">{body}</p>
          </li>
        ))}
      </ol>

      <SectionHead
        eyebrow="Everything inside"
        title={["Every step of the", "switch, covered."]}
        lede="Each tool hands its work to the next, so nothing you do for one step is wasted on the next."
      />
      <div className="mt-[clamp(24px,3vw,48px)] flex flex-col gap-[clamp(72px,9vw,136px)]">
        <Feature
          n={1} kicker="Find" title="Find roles worth applying to" panel="bg-[var(--color-bg-raised)]"
          body="Search postings, save the promising ones and see where every application stands."
          points={["Search and save in one place", "A status for every role", "One tap to analyse a listing"]}
          cta={{ href: hrefs.jobs, label: "Search jobs" }}
        >
          <FindVisual />
        </Feature>
        <Feature
          n={2} kicker="Fit" title="Know your fit before you apply" panel="bg-[var(--color-accent-500)]"
          body="Paste any posting and see how much of it your experience already covers — and exactly what’s missing."
          points={["Works for any role or field", "Covered, partial and missing", "No made-up ATS score"]}
          cta={{ href: hrefs.analyze, label: "Analyse a posting" }}
        >
          <FitVisual />
        </Feature>
        <Feature
          n={3} kicker="Tailor" title="A résumé shaped for every role" panel="bg-[var(--color-sage-500)]"
          body={`${drafts} drafts from the same true evidence, rewritten in the posting’s own language.`}
          points={["Classic to creative templates", "An honest ATS rating on each", "Every line traces back to you"]}
          cta={{ href: hrefs.resumes, label: "See the drafts" }}
        >
          <TailorVisual drafts={drafts} />
        </Feature>
        <Feature
          n={4} kicker="Rehearse" title="The questions you’ll actually face" panel="bg-[var(--color-bg-raised)]"
          body="Drawn from the posting itself, each pointing at the story you should answer from."
          points={["Role-specific and behavioural", "The story to answer from", "Full worked answers"]}
          cta={{ href: hrefs.prep, label: "Practise questions" }}
        >
          <RehearseVisual />
        </Feature>
        <Feature
          n={5} kicker="Cram" title="Rapid prep for the night before" panel="bg-[var(--color-text)]"
          body="Revise the posting’s topics, quiz yourself against the clock, then solve one under interview conditions."
          points={["Quick topic revision", "Timed self-tests", "One live run-through"]}
          cta={{ href: hrefs.rapid, label: "Start rapid prep" }}
        >
          <CramVisual />
        </Feature>
        <Feature
          n={6} kicker="Grow" title="Close the gaps that matter" panel="bg-[var(--color-bg-raised)]"
          body="What the posting wants that you can’t show yet — ranked by how often it’s asked for."
          points={["Ranked by demand", "Vetted courses to close each", "Never faked on your résumé"]}
          cta={{ href: hrefs.learning, label: "See your gaps" }}
        >
          <GrowVisual />
        </Feature>
        <Feature
          n={7} kicker="Plan" title="One checklist to the finish line" panel="bg-[var(--color-sage-500)]"
          body="Prepare, rehearse, learn, apply — every step for this role, in order, ticked off as you go."
          points={["Four clear stages", "Each step opens its tool", "Progress saved as you go"]}
          cta={{ href: hrefs.roadmap, label: "Open the roadmap" }}
        >
          <PlanVisual />
        </Feature>
        <Feature
          n={8} kicker="Stand out" title="Your own portfolio site" panel="bg-[var(--color-accent-500)]"
          body={`Turn your profile into a personal website in one of ${looks} looks.`}
          points={[`${looks} ready-made looks`, "Download as a single file", "Host it anywhere"]}
          cta={{ href: hrefs.portfolio, label: "Build my site" }}
        >
          <PortfolioVisual />
        </Feature>
        <Feature
          n={9} kicker="Track" title="Every application, in one place" panel="bg-[var(--color-sage-300)]"
          body="Each posting you’ve analysed, with its drafts, prep and plan — ready when the recruiter calls back."
          points={["Every analysis saved", "Drafts and prep kept together", "Pick up where you left off"]}
          cta={{ href: hrefs.history, label: "View history" }}
        >
          <TrackVisual />
        </Feature>
      </div>

      <div
        data-rv
        className="mt-[clamp(72px,9vw,120px)] flex flex-wrap items-center justify-between gap-x-12 gap-y-7 rounded-[32px] bg-[var(--color-text)] p-[clamp(32px,5vw,64px)] text-[var(--color-bg)]"
      >
        <h2 className="m-0 max-w-[14ch] text-[clamp(2.5rem,5.4vw,5rem)] leading-[0.92] text-[var(--color-accent-500)]">
          Your next role starts here.
        </h2>
        <div className="flex flex-col items-start gap-3">
          <Link
            href={hrefs.start}
            className="btn btn-lg bg-[var(--color-accent-500)] text-[var(--color-text)] no-underline transition-transform hover:-translate-y-0.5 hover:text-[var(--color-text)]"
          >
            Start my switch <ArrowRight className="lucide h-[18px] w-[18px]" />
          </Link>
          <span className="text-sm font-semibold text-[var(--color-bg-tint)]">Starts with the résumé you already have</span>
        </div>
      </div>

      <InfoNote className="mt-11 max-w-[760px]">
        The match score is requirement coverage — how much of the posting your profile can evidence. It isn&rsquo;t
        an ATS score, and it doesn&rsquo;t predict a callback. Nobody can honestly sell you that number.{" "}
        <Link href="/how-it-works">Read how the four stages work</Link>.
      </InfoNote>
    </LandingReveal>
  );
}

function SectionHead({ eyebrow, title, lede }: { eyebrow: string; title: [string, string]; lede: string }) {
  return (
    <div data-rv className="mb-[clamp(28px,3vw,40px)] mt-[clamp(88px,10vw,140px)] flex flex-wrap items-end justify-between gap-x-12 gap-y-4">
      <div>
        <p className="eyebrow mb-3.5">{eyebrow}</p>
        <h2 className="m-0 text-[clamp(2.5rem,4.8vw,4.25rem)] leading-[0.95]">
          {title[0]}
          <br />
          {title[1]}
        </h2>
      </div>
      <p className="m-0 max-w-[40ch] text-[17px] leading-[1.6] text-[var(--color-text-muted)] [text-wrap:pretty]">{lede}</p>
    </div>
  );
}

function Tick({ size = 24 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="grid flex-none place-items-center rounded-full bg-[var(--color-accent-500)] text-[var(--color-text)]"
    >
      <Check className="lucide h-3.5 w-3.5" strokeWidth={3} />
    </span>
  );
}

/** One tool: the illustration panel and its copy, alternating sides row by row. */
function Feature({
  n, kicker, title, body, points, cta, panel, children,
}: {
  n: number;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  cta: { href: string; label: string };
  panel: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`feature-${n}`}
      className={`flex flex-wrap items-center gap-[clamp(24px,4vw,88px)] ${n % 2 === 0 ? "flex-row-reverse" : ""}`}
    >
      <div
        data-rv
        aria-hidden
        className={`grid min-h-[clamp(300px,34vw,440px)] min-w-0 flex-[1.15_1_300px] place-items-center overflow-hidden rounded-[32px] p-[clamp(24px,3.4vw,48px)] ${panel}`}
      >
        {children}
      </div>
      <div data-rv data-rv-d={160} className="mr-auto flex min-w-0 max-w-[520px] flex-[1_1_280px] flex-col items-start gap-[18px]">
        <div className="flex items-center gap-3">
          <span className="display text-[22px] leading-none">0{n}</span>
          <span aria-hidden className="h-[1.5px] w-8 bg-[var(--color-text)]" />
          <span className="eyebrow">{kicker}</span>
        </div>
        <h3 id={`feature-${n}`} className="display m-0 text-[clamp(2.25rem,3.8vw,3.5rem)] uppercase leading-[0.95] [text-wrap:balance]">
          {title}
        </h3>
        <p className="m-0 max-w-[44ch] text-[17px] leading-[1.6] text-[var(--color-text-muted)] [text-wrap:pretty]">{body}</p>
        <ul className="flex flex-col gap-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-3 text-base font-bold">
              <Tick />
              {p}
            </li>
          ))}
        </ul>
        <Link
          href={cta.href}
          className="btn btn-secondary mt-1.5 no-underline hover:bg-[var(--color-text)] hover:text-[var(--color-accent-500)]"
        >
          {cta.label} <ArrowRight className="lucide h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ hero */

/** The score card and the marigold block of templates, side by side. */
function HeroCollage() {
  const families = pick(HERO_FAMILIES);
  const [front, middle, back] = families;

  return (
    <div aria-hidden className="flex flex-wrap items-stretch gap-[22px] pt-11">
      <div style={i(7)} className="intro-item relative flex min-h-[360px] flex-[1_1_220px] flex-col items-center rounded-[26px] bg-[var(--color-bg-raised)] px-6 pb-11 pt-[34px] text-center">
        <span className="tag tag-outline absolute -top-[52px] left-1/2 min-h-10 -translate-x-1/2 whitespace-nowrap bg-[var(--color-bg)] px-4 text-[15px] font-extrabold">
          № Your next role
        </span>
        <span className="display text-[104px] leading-none">61</span>
        <span className="mt-1.5 text-[17px] font-semibold">Requirement coverage</span>
        <div className="mt-[26px] flex w-full max-w-[210px] flex-col gap-2">
          {["Core skills", "Experience level"].map((label) => (
            <span key={label} className="tag tag-outline min-h-[34px] px-3.5 text-sm">
              <Check className="lucide h-3.5 w-3.5" strokeWidth={3} />
              {label}
            </span>
          ))}
          <span className="tag min-h-[34px] bg-[var(--color-accent-200)] px-3.5 text-sm">½ Tools &amp; certifications</span>
        </div>
        <span className="absolute -bottom-[18px] left-1/2 flex min-h-[38px] -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] bg-[var(--color-sage-500)] px-[18px] text-sm">
          Draws on:<strong>your own words</strong>
        </span>
      </div>

      <div style={i(8)} className="intro-item relative mt-10 min-h-[360px] flex-[1.35_1_280px] rounded-[26px] bg-[var(--color-accent-500)] px-[26px] py-[30px] sm:top-[50px] sm:mt-0">
        <div className="relative z-[2] flex flex-col items-start gap-3.5">
          {families.map((t) => (
            <span key={t.id} className="tag tag-outline min-h-[38px] bg-[var(--color-accent-500)] px-4 text-[15px]">
              {FAMILY_LABEL[t.kind] ?? t.name} · ATS {ratingFor(t.id)}
            </span>
          ))}
        </div>
        {back ? (
          <TemplatePaper template={back} style={i(9)} className="intro-fan absolute bottom-[22px] right-[18px] h-[200px] w-[150px] rotate-[9deg] rounded-[10px] shadow-[var(--shadow-lg)]" />
        ) : null}
        {middle ? (
          <TemplatePaper template={middle} style={i(10)} className="intro-fan absolute bottom-16 right-[92px] h-[200px] w-[150px] -rotate-[4deg] rounded-[10px] shadow-[var(--shadow-lg)]" />
        ) : null}
        {front ? (
          <TemplatePaper template={front} style={i(11)} className="intro-fan absolute -top-10 right-10 z-[1] h-[208px] w-[156px] rotate-[3deg] rounded-[10px] shadow-[var(--shadow-lg)]" />
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------- feature illustrations */

/** Placeholder text: a bar of ink, a bar of muted ink. */
function Lines({ a, b }: { a: string; b: string }) {
  return (
    <span className="flex flex-1 flex-col gap-[7px]">
      <span style={{ width: a }} className="h-2 rounded bg-[var(--color-text)] opacity-80" />
      <span style={{ width: b }} className="h-1.5 rounded bg-[var(--color-line-strong)]" />
    </span>
  );
}

const ROW = "flex items-center gap-3.5 rounded-[var(--radius-md)] bg-white px-4 py-3.5 shadow-[var(--shadow-md)]";
const PILL = "flex h-7 flex-none items-center rounded-[var(--radius-pill)] px-3 text-[13px] font-extrabold";

function FindVisual() {
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-3">
      <div className="flex h-[52px] items-center gap-2.5 rounded-[var(--radius-pill)] border-[1.5px] border-[var(--color-line)] bg-[var(--color-bg)] pl-[18px] pr-2">
        <Search className="lucide h-[18px] w-[18px]" />
        <span className="text-[15px] font-semibold text-[var(--color-text-muted)]">Any role, any city</span>
        <span className={`${PILL} ml-auto h-9 bg-[var(--color-text)] px-4 text-[var(--color-accent-500)]`}>Search</span>
      </div>
      {[
        ["bg-[var(--color-sage-500)]", "70%", "42%", "Interview", "bg-[var(--color-text)] text-[var(--color-accent-500)]"],
        ["bg-[var(--color-accent-500)]", "58%", "34%", "Applied", "bg-[var(--color-sage-500)]"],
        ["bg-[var(--color-accent-700)]", "64%", "48%", "Saved", "border-[1.5px] border-[var(--color-text)]"],
      ].map(([logo, a, b, status, pill]) => (
        <div key={status} className={ROW}>
          <span className={`h-10 w-10 flex-none rounded-[12px] ${logo}`} />
          <Lines a={a!} b={b!} />
          <span className={`${PILL} ${pill}`}>{status}</span>
        </div>
      ))}
    </div>
  );
}

function FitVisual() {
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-5">
      <div className="flex items-end gap-4">
        <span className="display text-[clamp(96px,10vw,136px)] leading-[0.8]">61%</span>
        <span className="pb-1 text-base font-bold leading-[1.3]">
          requirement
          <br />
          coverage
        </span>
      </div>
      <span className="h-3.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-line)]">
        <span data-rv-bar className="block h-full w-[61%] origin-left rounded-[var(--radius-pill)] bg-[var(--color-text)]" />
      </span>
      <div className="flex flex-wrap gap-2">
        {["Core skills", "Experience level"].map((label) => (
          <span key={label} className="tag tag-outline min-h-[38px] px-[15px] text-sm">
            <Check className="lucide h-3.5 w-3.5" strokeWidth={3} />
            {label}
          </span>
        ))}
        <span className="tag min-h-[38px] bg-[var(--color-accent-200)] px-[15px] text-sm">½ Tools &amp; certifications</span>
      </div>
    </div>
  );
}

function TailorVisual({ drafts }: { drafts: number }) {
  const [left, middle, right] = pick(["clean-slate", "ledger", "broadsheet"]);
  return (
    <div className="relative h-[250px] w-full max-w-[420px]">
      {left ? <TemplatePaper template={left} className="absolute left-[calc(50%-150px)] top-[34px] h-[156px] w-[116px] -rotate-[9deg] rounded-[10px] shadow-[var(--shadow-md)]" /> : null}
      {middle ? <TemplatePaper template={middle} className="absolute left-[calc(50%-58px)] top-1.5 z-[2] h-[156px] w-[116px] rounded-[10px] shadow-[var(--shadow-lg)]" /> : null}
      {right ? <TemplatePaper template={right} className="absolute left-[calc(50%+34px)] top-[34px] h-[156px] w-[116px] rotate-[9deg] rounded-[10px] shadow-[var(--shadow-md)]" /> : null}
      <span className={`${PILL} absolute bottom-0 left-1/2 z-[3] h-10 -translate-x-1/2 whitespace-nowrap bg-[var(--color-text)] px-[18px] text-sm text-[var(--color-accent-500)]`}>
        {drafts} drafts · honest ATS ratings
      </span>
    </div>
  );
}

function RehearseVisual() {
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-3">
      <span className="max-w-[86%] self-start rounded-[20px_20px_20px_6px] bg-[var(--color-text)] px-[18px] py-3.5 text-base font-bold leading-[1.4] text-[var(--color-bg)]">
        Tell us about a time you led a change.
      </span>
      <span className="max-w-[86%] self-end rounded-[20px_20px_6px_20px] bg-[var(--color-bg)] px-4 py-3 text-[15px] leading-[1.4]">
        Answer from: <strong>your rollout project</strong>
      </span>
      <div className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-white px-[18px] py-4 shadow-[var(--shadow-md)]">
        <span className="eyebrow">Worked answer</span>
        <div className="flex flex-wrap gap-1.5">
          {["Situation", "Task", "Action", "Result"].map((s, n) => (
            <span key={s} className={`${PILL} px-[11px] font-bold ${n === 0 ? "bg-[var(--color-accent-500)]" : "bg-[var(--color-bg)]"}`}>
              {s}
            </span>
          ))}
        </div>
        <span className="h-[5px] w-[92%] rounded-sm bg-[var(--color-bg-sunken)]" />
        <span className="h-[5px] w-[74%] rounded-sm bg-[var(--color-bg-sunken)]" />
      </div>
    </div>
  );
}

function CramVisual() {
  return (
    <div className="flex w-full max-w-[420px] flex-wrap items-center justify-center gap-7">
      <span className="grid h-[168px] w-[168px] flex-none place-items-center rounded-full [background:conic-gradient(var(--color-accent-500)_0_72%,rgb(249_177_48/0.16)_72%_100%)]">
        <span className="flex h-[138px] w-[138px] flex-col items-center justify-center gap-1 rounded-full bg-[var(--color-text)]">
          <span className="display text-[44px] leading-none text-[var(--color-accent-500)]">3:36</span>
          <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--color-bg-tint)]">left</span>
        </span>
      </span>
      <div className="flex flex-col gap-3.5 text-base font-bold text-[var(--color-bg)]">
        {["Revise topics", "Beat the clock"].map((s) => (
          <span key={s} className="flex items-center gap-2.5">
            <Tick size={26} />
            {s}
          </span>
        ))}
        <span className="flex items-center gap-2.5">
          <span className="h-[26px] w-[26px] flex-none rounded-full border-2 border-[var(--color-accent-500)]" />
          Solve one live
        </span>
      </div>
    </div>
  );
}

function GrowVisual() {
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-4">
      <span className="eyebrow">Asked for, not yet shown</span>
      {[
        ["Stakeholder management", "6×", "88%", "bg-[var(--color-text)]"],
        ["Data analysis", "4×", "60%", "bg-[var(--color-accent-500)]"],
        ["Industry certification", "2×", "32%", "bg-[var(--color-sage-500)]"],
      ].map(([label, times, width, fill]) => (
        <div key={label} className="flex flex-col gap-2">
          <div className="flex justify-between gap-3 text-[15px] font-bold">
            <span>{label}</span>
            <span>{times}</span>
          </div>
          <span className="h-3 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-bg-tint)]">
            <span data-rv-bar style={{ width }} className={`block h-full origin-left rounded-[var(--radius-pill)] ${fill}`} />
          </span>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-3 rounded-[16px] bg-[var(--color-bg)] px-3.5 py-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-[12px] bg-[var(--color-accent-500)]">
          <GraduationCap className="lucide h-5 w-5" />
        </span>
        <span className="flex flex-col gap-0.5">
          <strong className="text-[15px]">Vetted course</strong>
          <span className="text-[13px] text-[var(--color-text-muted)]">Closes your top gap</span>
        </span>
      </div>
    </div>
  );
}

function PlanVisual() {
  const steps = ["Pick a draft and export it", "Rehearse two answers", "Finish the top course", "Send the application"];
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-3 rounded-[22px] bg-[var(--color-bg-raised)] p-[22px] shadow-[var(--shadow-lg)]">
      <div className="flex items-center justify-between text-[15px] font-extrabold">
        <span>Your roadmap</span>
        {/* N16: progress is n of m, never a percentage. */}
        <span className="text-[var(--color-text-muted)]">3 of 4</span>
      </div>
      <span className="mb-1 h-2.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-bg-tint)]">
        <span data-rv-bar className="block h-full w-3/4 origin-left rounded-[var(--radius-pill)] bg-[var(--color-text)]" />
      </span>
      {steps.map((s, n) => {
        const done = n < 3;
        return (
          <div key={s} className="flex min-h-[34px] items-center gap-3">
            {done ? (
              <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-[var(--color-text)] text-[var(--color-accent-500)]">
                <Check className="lucide h-3.5 w-3.5" strokeWidth={3} />
              </span>
            ) : (
              <span className="h-[26px] w-[26px] flex-none rounded-full border-2 border-[var(--color-text)]" />
            )}
            <span className={`text-[15px] font-bold ${done ? "text-[var(--color-text-muted)] line-through decoration-[1.5px]" : ""}`}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

function PortfolioVisual() {
  return (
    <div className="flex w-full max-w-[420px] flex-col overflow-hidden rounded-[var(--radius-md)] bg-white shadow-[var(--shadow-lg)]">
      <div className="flex h-[30px] items-center gap-1.5 bg-[var(--color-bg-tint)] px-3">
        <span className="h-2 w-2 rounded-full bg-[var(--color-sage-500)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--color-accent-500)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--color-line-strong)]" />
        <span className="ml-3 h-3.5 w-2/5 rounded-[var(--radius-pill)] bg-[var(--color-bg-raised)]" />
      </div>
      <div className="flex flex-col gap-4 px-[22px] py-5">
        <div className="flex items-center gap-4">
          <span className="h-16 w-16 flex-none rounded-full bg-[var(--color-sage-500)]" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="display text-[30px] leading-none">Hi, I&rsquo;m you.</span>
            <span className="h-1.5 w-[84%] rounded-sm bg-[var(--color-bg-sunken)]" />
            <span className="h-1.5 w-[58%] rounded-sm bg-[var(--color-bg-sunken)]" />
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <span className="h-16 rounded-[10px] bg-[var(--color-accent-200)]" />
          <span className="h-16 rounded-[10px] bg-[var(--color-sage-500)]" />
          <span className="h-16 rounded-[10px] bg-[var(--color-bg-tint)]" />
        </div>
      </div>
    </div>
  );
}

function TrackVisual() {
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-2.5">
      {[
        ["12", "OCT", "66%", "40%", 74],
        ["06", "OCT", "54%", "34%", 61],
        ["28", "SEP", "72%", "46%", 48],
      ].map(([day, month, a, b, score]) => (
        <div key={`${day}${month}`} className="flex items-center gap-3.5 rounded-[var(--radius-md)] bg-[var(--color-bg-raised)] px-4 py-3">
          <span className="flex w-12 flex-none flex-col items-center">
            <span className="display text-2xl leading-none">{day}</span>
            <span className="text-[11px] font-extrabold tracking-[0.12em] text-[var(--color-text-muted)]">{month}</span>
          </span>
          <Lines a={a as string} b={b as string} />
          <span className="display grid h-[46px] w-[46px] flex-none place-items-center rounded-full bg-[var(--color-accent-500)] text-lg">{score}</span>
        </div>
      ))}
    </div>
  );
}
