import { Tag } from "@/components/ui";
import type { StageKey } from "@/lib/pipeline/stages";

/**
 * A diagram of the work the running stage is doing.
 *
 * The progress bar says how far along we are; these say what is taking the time,
 * which is the thing a user actually wants to know while a 30-second pass runs.
 * Purely decorative — every one is `aria-hidden`, and the accessible account of
 * progress is the stage list and the progressbar beside them.
 *
 * They loop, which nothing else in the app does. That's deliberate and it's
 * bounded: only one is mounted, only on this screen, and the whole set freezes
 * under prefers-reduced-motion (see `.stage-figure` in globals.css).
 */
export function StageFigure({ stage }: { stage: StageKey }) {
  return (
    <div className="stage-figure rise-in" aria-hidden>
      {stage === "reading" ? <Reading /> : null}
      {stage === "matching" ? <Matching /> : null}
      {stage === "rewriting" ? <Rewriting /> : null}
      {stage === "preparing" ? <Preparing /> : null}
    </div>
  );
}

/** A page under a scan line, a couple of lines already picked out in accent. */
function Reading() {
  const lines = [100, 88, 40, 94, 76, 84, 36, 92, 70, 88];

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        className="relative h-[180px] w-[150px] shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-line)] p-4 shadow-[var(--shadow-sm)]"
        style={{ background: "var(--color-bg)" }}
      >
        <div
          className="fig-read mb-3 h-2 w-[62%] rounded-[3px]"
          style={{ background: "var(--color-text-muted)" }}
        />
        <div className="flex flex-col gap-[7px]">
          {lines.map((width, i) => (
            <div
              key={i}
              className="fig-read h-1 rounded-[2px]"
              style={{
                width: `${width}%`,
                animationDelay: `${0.05 + i * 0.1}s`,
                // The two accent lines are the requirements being lifted out.
                background:
                  width === 40 || width === 36
                    ? "var(--color-accent-500)"
                    : "var(--color-line)",
              }}
            />
          ))}
        </div>
        <div
          className="fig-scan absolute inset-x-0 top-3.5 h-0.5"
          style={{
            background: "var(--color-accent-500)",
            boxShadow: "0 0 12px 3px var(--color-accent-400)",
          }}
        />
      </div>

      <div className="flex min-w-[14rem] flex-1 flex-col gap-2.5">
        <p className="eyebrow">Found so far</p>
        <div className="flex flex-wrap gap-2">
          {["Title", "Company", "Location", "Requirements", "Seniority"].map((label, i) => (
            <Tag key={label} tone="muted" className="pop-in" style={{ animationDelay: `${i * 0.2}s` }}>
              {label}
            </Tag>
          ))}
        </div>
      </div>
    </div>
  );
}

/** What the posting asks on the left, your own words on the right, wired across. */
function Matching() {
  return (
    <div className="grid grid-cols-[1fr_4rem_1fr] items-center gap-2">
      <div className="flex flex-col gap-2">
        <p className="eyebrow mb-0.5">The posting asks</p>
        {[0, 0.25, 0.5, 0.75].map((delay, i) => (
          <Bar key={i} tone="accent" delay={delay} width={["86%", "72%", "94%", "64%"][i]} />
        ))}
      </div>

      <svg
        viewBox="0 0 64 120"
        width="64"
        height="120"
        fill="none"
        stroke="var(--color-sage-500)"
        strokeWidth="2"
        strokeLinecap="round"
        className="overflow-visible"
      >
        <path d="M2 16 C 32 16, 32 16, 62 16" strokeDasharray="120" className="fig-draw" />
        <path
          d="M2 48 C 32 48, 32 84, 62 84"
          strokeDasharray="120"
          className="fig-draw"
          style={{ animationDelay: "0.25s" }}
        />
        <path
          d="M2 80 C 32 80, 32 48, 62 48"
          strokeDasharray="120"
          className="fig-draw"
          style={{ animationDelay: "0.5s" }}
        />
        {/* The fourth requirement has nothing to wire to. That is the product. */}
        <path
          d="M2 112 C 26 112, 26 112, 40 112"
          stroke="var(--color-line)"
          strokeDasharray="4 4"
        />
      </svg>

      <div className="flex flex-col gap-2">
        <p className="eyebrow mb-0.5">Your own words</p>
        <Bar tone="sage" delay={0} width="92%" />
        <Bar tone="sage" delay={0.5} width="76%" />
        <Bar tone="sage" delay={0.25} width="84%" />
        <div
          className="h-[26px] rounded-[var(--radius-pill)] opacity-40"
          style={{ width: "58%", background: "var(--color-bg-sunken)" }}
        />
      </div>
    </div>
  );
}

function Bar({
  tone,
  delay,
  width,
}: {
  tone: "accent" | "sage";
  delay: number;
  width: string;
}) {
  return (
    <div
      className="fig-lock h-[26px] rounded-[var(--radius-pill)]"
      style={{
        width,
        animationDelay: `${delay}s`,
        background: tone === "accent" ? "var(--color-accent-100)" : "var(--color-sage-100)",
        border: `1px solid ${tone === "accent" ? "var(--color-accent-200)" : "var(--color-sage-200)"}`,
      }}
    />
  );
}

/** A bullet being typed while two others swap places around it. */
function Rewriting() {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        className="w-[170px] shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-line)] p-4 shadow-[var(--shadow-sm)]"
        style={{ background: "var(--color-bg)" }}
      >
        <div
          className="mb-1.5 h-[7px] w-[54%] rounded-[3px]"
          style={{ background: "var(--color-text-muted)" }}
        />
        <div
          className="mb-3.5 h-1 w-[34%] rounded-[2px]"
          style={{ background: "var(--color-line)" }}
        />

        <div className="mb-2.5 flex items-center gap-1.5">
          <Dot color="var(--color-accent-500)" />
          {/* Width is declared as the animation's end state so the bar still
              reads as a line of text when the animation is switched off. */}
          <div
            className="fig-type h-1 rounded-[2px]"
            style={{ width: "88%", background: "var(--color-accent-400)" }}
          />
          <div className="fig-caret h-2.5 w-px" style={{ background: "var(--color-accent-500)" }} />
        </div>

        <div className="flex flex-col gap-2.5">
          <Line className="fig-lift-down" dot="var(--color-text-muted)" width="86%" />
          <Line className="fig-lift-up" dot="var(--color-sage-500)" width="72%" bar="var(--color-sage-400)" />
          <Line dot="var(--color-text-muted)" width="90%" />
          <Line dot="var(--color-text-muted)" width="64%" />
        </div>
      </div>

      <div className="flex min-w-[15rem] flex-1 flex-col gap-2.5">
        <p className="eyebrow">Rewriting, with provenance</p>
        <ul className="flex flex-col gap-2 text-sm">
          {[
            "Bullets reordered against what this posting weights",
            "Your phrasing matched to the posting's vocabulary",
            "Every generated line still keyed to a source bullet",
          ].map((text, i) => (
            <li key={text} className="pop-in flex gap-2.5" style={{ animationDelay: `${i * 0.3}s` }}>
              <span className="shrink-0 text-[var(--color-sage-600)]">✓</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Line({
  className,
  dot,
  width,
  bar = "var(--color-line)",
}: {
  className?: string;
  dot: string;
  width: string;
  bar?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <Dot color={dot} />
      <div className="h-1 rounded-[2px]" style={{ width, background: bar }} />
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="h-1 w-1 shrink-0 rounded-[var(--radius-pill)]"
      style={{ background: color }}
    />
  );
}

/** Questions forming on the left, courses being matched on the right. */
function Preparing() {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="flex min-w-[12rem] flex-1 flex-col gap-2">
        <p className="eyebrow mb-0.5">Questions forming</p>
        {[
          [92, 58],
          [78, 66],
          [86, 44],
        ].map(([a, b], i) => (
          <div
            key={i}
            className="pop-in flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-line)] p-3"
            style={{ background: "var(--color-bg)", animationDelay: `${0.05 + i * 0.3}s` }}
          >
            <span
              className="grid h-5 w-5 shrink-0 place-items-center rounded-[var(--radius-pill)] text-[10px] font-bold"
              style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}
            >
              ?
            </span>
            <span className="flex flex-1 flex-col gap-1">
              <span
                className="h-1 rounded-[2px]"
                style={{ width: `${a}%`, background: "var(--color-line)" }}
              />
              <span
                className="h-1 rounded-[2px]"
                style={{ width: `${b}%`, background: "var(--color-bg-sunken)" }}
              />
            </span>
          </div>
        ))}
      </div>

      <div className="flex min-w-[12rem] flex-1 flex-col gap-2">
        <p className="eyebrow mb-0.5">Matching vetted courses</p>
        <div className="grid grid-cols-2 gap-2">
          {/* pop-in and fig-float both set the `animation` shorthand, so they
              can't share an element — the outer one arrives, the inner drifts. */}
          {[0.2, 0.45, 0.7].map((delay, i) => (
            <div key={i} className="pop-in" style={{ animationDelay: `${delay}s` }}>
              <div
                className="fig-float rounded-[var(--radius-sm)] p-3"
                style={{ background: "var(--color-sage-100)", animationDelay: `${0.7 + i * 0.2}s` }}
              >
                <div
                  className="mb-2 h-5 w-5 rounded-[6px]"
                  style={{ background: "var(--color-sage-300)" }}
                />
                <div
                  className="mb-1.5 h-1 rounded-[2px]"
                  style={{ width: `${80 - i * 5}%`, background: "var(--color-sage-400)" }}
                />
                <div
                  className="h-1 rounded-[2px]"
                  style={{ width: `${52 + i * 4}%`, background: "var(--color-sage-300)" }}
                />
              </div>
            </div>
          ))}
          {/* The fourth slot stays grey: a gap we have no vetted course for. */}
          <div
            className="pop-in rounded-[var(--radius-sm)] p-3"
            style={{ background: "var(--color-bg-sunken)", animationDelay: "0.95s" }}
          >
            <div
              className="mb-2 h-5 w-5 rounded-[6px]"
              style={{ background: "var(--color-line)" }}
            />
            <div className="mb-1.5 h-1 w-[64%] rounded-[2px]" style={{ background: "var(--color-line)" }} />
            <div className="h-1 w-[40%] rounded-[2px]" style={{ background: "var(--color-line)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
