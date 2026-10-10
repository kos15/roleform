"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Copy, Download, Loader2, Sparkles } from "lucide-react";
import { Button, Card, ErrorRegion, Field, Input, Tag, Textarea } from "@/components/ui";
import { TokenWallDialog } from "@/components/token-wall";
import { buildPortfolio } from "@/app/actions/portfolio";
import { PORTFOLIO_BRIEF } from "@/lib/content/portfolio-brief";
import { PORTFOLIO_STYLES, type PortfolioChoices } from "@/lib/ai/schemas/portfolio";
import { STYLE_LABEL, buildCuratedPrompt, type PortfolioMaterials } from "@/lib/domain/portfolio";
import { formatCount, type TokenWall } from "@/lib/domain/tokens";

interface Site {
  html: string;
  builtFor: string;
  createdAt: string;
}

/**
 * F28 — the portfolio studio. The brief's clarifying questions come first,
 * because both outputs read them: the curated prompt prints them as
 * "Additional instructions", and the build sends them as <answers>.
 *
 * The preview is a sandboxed iframe with no `allow-same-origin`: the page is
 * model-written HTML and script, so it runs in an opaque origin and can reach
 * nothing of ours. For the same reason there is no "open in a new tab" — a
 * blob URL would inherit this origin.
 */
export function PortfolioStudio({
  analysisId,
  materials,
  estimate,
  initialChoices,
  site: initialSite,
  building,
}: {
  analysisId: string;
  materials: PortfolioMaterials;
  estimate: number;
  initialChoices: PortfolioChoices;
  site: Site | null;
  building: boolean;
}) {
  const [choices, setChoices] = useState<PortfolioChoices>(
    materials.target ? initialChoices : { ...initialChoices, focus: "broad" },
  );
  const [site, setSite] = useState<Site | null>(initialSite);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wall, setWall] = useState<TokenWall | null>(null);
  const [pending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(0);

  const prompt = useMemo(() => buildCuratedPrompt(PORTFOLIO_BRIEF, materials, choices), [materials, choices]);
  const set = <K extends keyof PortfolioChoices>(key: K, value: PortfolioChoices[K]) =>
    setChoices((c) => ({ ...c, [key]: value }));

  useEffect(() => {
    setElapsed(0);
    if (!pending) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Your browser blocked copying. Select the text and copy it instead.");
    }
  }

  function build() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await buildPortfolio(analysisId, choices);
        if (result.ok) {
          setSite({ html: result.value.html, builtFor: "this posting", createdAt: new Date().toISOString() });
        } else if (result.error.code === "token_wall" && result.error.wall) {
          setWall(result.error.wall);
        } else {
          setError(result.error.message);
        }
      } catch {
        setError("The connection dropped before the build finished. If it completed, reload to see it; your build is only used by a page you receive.");
      }
    });
  }

  const roles = materials.roles.length;
  const projects = materials.projects.length;

  return (
    <section className="space-y-6">
      <div className="max-w-[760px]">
        <p className="eyebrow mb-2.5">Portfolio site</p>
        <h2 className="mb-2.5">Turn this profile into a portfolio site</h2>
        <p className="text-base leading-relaxed text-[var(--color-text-muted)]">
          A one-page site recruiters can scan in a minute. It uses a short excerpt of your profile —{" "}
          {[
            `${roles} role${roles === 1 ? "" : "s"}`,
            projects ? `${projects} project${projects === 1 ? "" : "s"}` : "",
            "your skills",
          ]
            .filter(Boolean)
            .join(", ")}{" "}
          — and nothing you didn&rsquo;t write.
        </p>
      </div>

      {/* The brief's questions, answered once for both paths. */}
      <Card className="p-[clamp(1.25rem,2.6vw,1.75rem)]">
        <h3 className="mb-4 text-lg">A few answers first</h3>

        <div className="grid gap-x-6 [grid-template-columns:repeat(auto-fit,minmax(min(20rem,100%),1fr))]">
          <div>
            <div className="field">
              <label>Who is it for?</label>
              <div className="seg w-fit">
                <button
                  type="button"
                  aria-selected={choices.focus === "this_role"}
                  disabled={!materials.target}
                  onClick={() => set("focus", "this_role")}
                >
                  {materials.target?.title ? `This role: ${materials.target.title}` : "This role"}
                </button>
                <button type="button" aria-selected={choices.focus === "broad"} onClick={() => set("focus", "broad")}>
                  A broader range of roles
                </button>
              </div>
            </div>

            <Field label="What should it emphasise? (optional)">
              <Input
                value={choices.emphasis}
                maxLength={400}
                placeholder="e.g. my data platform work and mentoring"
                onChange={(e) => set("emphasis", e.target.value)}
              />
            </Field>

            <Field label="Leave anything out? (optional)">
              <Input
                value={choices.avoid}
                maxLength={400}
                placeholder="Confidential clients, an old role…"
                onChange={(e) => set("avoid", e.target.value)}
              />
            </Field>

            <div className="field">
              <label>Contact on the page</label>
              <div className="flex flex-wrap gap-4 text-[15px]">
                <Toggle label="Email" checked={choices.showEmail} disabled={!materials.email} onChange={(v) => set("showEmail", v)} />
                <Toggle label="Phone" checked={choices.showPhone} disabled={!materials.phone} onChange={(v) => set("showPhone", v)} />
                <Toggle label="Links" checked={choices.showLinks} disabled={materials.links.length === 0} onChange={(v) => set("showLinks", v)} />
              </div>
            </div>
          </div>

          <div>
            <div className="field">
              <label>Visual direction</label>
              <div className="grid gap-2">
                {PORTFOLIO_STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    aria-pressed={choices.style === style}
                    onClick={() => set("style", style)}
                    className="rounded-[var(--radius-sm)] border-[1.5px] px-4 py-3 text-left transition-colors"
                    style={{
                      borderColor: choices.style === style ? "var(--color-text)" : "var(--color-line-strong)",
                      background: choices.style === style ? "var(--color-accent-100)" : "transparent",
                    }}
                  >
                    <span className="block font-extrabold">
                      {STYLE_LABEL[style].name}
                      {style === "editorial" ? <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">recommended</span> : null}
                    </span>
                    <span className="block text-sm text-[var(--color-text-muted)]">{STYLE_LABEL[style].blurb}</span>
                  </button>
                ))}
              </div>
            </div>

            <Field label="Project details your résumé doesn't have (optional)">
              <Textarea
                rows={3}
                value={choices.projectNotes}
                maxLength={1200}
                placeholder="Your role, what you built, outcomes you can stand behind, repo or demo links"
                onChange={(e) => set("projectNotes", e.target.value)}
              />
            </Field>
          </div>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          No photo is used. Any figure or link on the page must come from your profile or these notes.
        </p>
      </Card>

      <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(24rem,100%),1fr))]">
        {/* Path 1 — free. */}
        <Card className="flex flex-col p-[clamp(1.25rem,2.6vw,1.75rem)]">
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <h3 className="text-lg">Copy the prompt</h3>
            <Tag tone="sage">Free</Tag>
          </div>
          <p className="mb-3.5 text-[15px] text-[var(--color-text-muted)]">
            Paste it into any AI chat tool. It asks a few questions, then writes your index.html. Copy it as often
            as you like.
          </p>
          <Textarea readOnly rows={12} value={prompt} aria-label="Curated portfolio prompt" className="font-mono text-[13px]" />
          <div className="mt-3.5 flex flex-wrap gap-3">
            <Button onClick={() => void copy()}>
              {copied ? <Check className="lucide h-4 w-4" /> : <Copy className="lucide h-4 w-4" />}
              {copied ? "Copied" : "Copy prompt"}
            </Button>
            <Button variant="secondary" onClick={() => download("portfolio-prompt.txt", prompt, "text/plain")}>
              <Download className="lucide h-4 w-4" /> Download .txt
            </Button>
          </div>
        </Card>

        {/* Path 2 — the one paid trial. */}
        <div className="promo-glow">
          <Card className="flex h-full flex-col p-[clamp(1.25rem,2.6vw,1.75rem)]">
            <div className="mb-2 flex flex-wrap items-center gap-2.5">
              <h3 className="text-lg">Build it here</h3>
              <Tag tone="accent">One trial per account</Tag>
            </div>
            {site ? (
              <p className="text-[15px] text-[var(--color-text-muted)]">
                Your build is done (made for {site.builtFor}, {new Date(site.createdAt).toLocaleDateString("en-GB")}).
                The trial is used — the curated prompt is how you make more versions.
              </p>
            ) : (
              <>
                <p className="mb-3.5 text-[15px] text-[var(--color-text-muted)]">
                  We write the page for you, check every link and figure against your profile, and give you the file.
                  Costs about {formatCount(estimate)} tokens — most of a full analysis — and you get one build, so
                  check the answers above first.
                </p>
                <label className="mb-4 flex items-start gap-2.5 text-[15px]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I&rsquo;ve checked my answers. Use my one build now.
                </label>
                <div className="mt-auto flex flex-wrap items-center gap-3">
                  <Button onClick={build} disabled={!confirmed || pending || building} busy={pending}>
                    {pending ? <Loader2 className="lucide h-4 w-4 animate-spin" /> : <Sparkles className="lucide h-4 w-4" />}
                    {pending ? "Building…" : building ? "Already building" : "Build my portfolio"}
                  </Button>
                  {pending ? (
                    <span className="text-sm text-[var(--color-text-muted)]" role="status">
                      Writing and checking your page — usually 1–2 minutes. {elapsed >= 3 ? `${elapsed}s` : ""}
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {error ? <ErrorRegion title="That didn't work">{error}</ErrorRegion> : null}
      {wall ? (
        <TokenWallDialog
          wall={wall}
          onClose={() => setWall(null)}
          onResume={() => {
            setWall(null);
            build();
          }}
          resumeLabel="Try again"
        />
      ) : null}

      {site ? (
        <Card className="p-[clamp(1.25rem,2.6vw,1.75rem)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg">Your portfolio</h3>
            <Button onClick={() => download("index.html", site.html, "text/html")}>
              <Download className="lucide h-4 w-4" /> Download index.html
            </Button>
          </div>
          <iframe
            title="Portfolio preview"
            srcDoc={site.html}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            className="h-[min(78vh,760px)] w-full rounded-[var(--radius-sm)] border-[1.5px] border-[var(--color-line-strong)] bg-[var(--color-bg-raised)]"
          />
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            Open the downloaded file in any browser, or upload it to a free host such as GitHub Pages or Netlify.
            Read it through before you share it — it&rsquo;s your name on it.
          </p>
        </Card>
      ) : null}
    </section>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
