import type { TemplateDef } from "@/lib/render/templates";

/**
 * A miniature of the template's layout, on a paper ground.
 *
 * Deliberately abstract — grey bars, not readable text. It answers the only
 * question the card can't answer in words ("what shape is this document?") and
 * makes the ATS badge legible: you can see the two-column body that costs
 * Ledger its High rating without having to open the draft.
 *
 * White paper and grey rules are the document's own colours, not the brand's.
 * A résumé is not a Roleform surface (CLAUDE.md §9), so the same exemption that
 * covers the export covers its picture.
 */
const PAPER = "#ffffff";
const INK = "#2e2b25";
const RULE = "#dcd3c4";
const FAINT = "#eee7db";

type Shape = "classic" | "sidebar" | "creative" | "banner" | "modular";

/** Which miniature a template draws. Timeline is a narrow-railed sidebar,
 *  editorial a classic, infographic a creative — close enough in shape that a
 *  separate drawing would say nothing more. */
function shapeOf(template: TemplateDef): { shape: Shape; narrow?: boolean } {
  switch (template.kind) {
    case "sidebar":
      return { shape: "sidebar" };
    case "timeline":
      return { shape: "sidebar", narrow: true };
    case "creative":
    case "infographic":
      return { shape: "creative" };
    case "banner":
      return { shape: "banner" };
    case "modular":
      return { shape: "modular" };
    default:
      return { shape: "classic" };
  }
}

/** The paper alone — used on its own, tilted, in the landing collage. */
export function TemplatePaper({
  template,
  className,
  style,
}: {
  template: TemplateDef;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { shape, narrow } = shapeOf(template);
  return (
    <div aria-hidden className={`overflow-hidden p-3 ${className ?? ""}`} style={{ background: PAPER, ...style }}>
      {shape === "classic" ? <Classic accent={template.accent} /> : null}
      {shape === "sidebar" ? (
        <Sidebar accent={template.accent} rail={template.rail ?? "left"} narrow={narrow} />
      ) : null}
      {shape === "creative" ? <Creative accent={template.accent} /> : null}
      {shape === "banner" ? <Banner accent={template.accent} /> : null}
      {shape === "modular" ? <Modular accent={template.accent} /> : null}
    </div>
  );
}

/** The card thumbnail: a sheet of paper rising out of a sunken frame. */
export function TemplateThumb({ template }: { template: TemplateDef }) {
  return (
    <div
      aria-hidden
      className="h-[184px] overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-bg-sunken)] px-[18px] pt-4"
    >
      <TemplatePaper
        template={template}
        className="h-full rounded-t-[8px] shadow-[var(--shadow-md)]"
      />
    </div>
  );
}

/** Centred header, full-width rules, one column top to bottom. */
function Classic({ accent }: { accent: string }) {
  return (
    <div className="flex h-full flex-col gap-1.5">
      <Bar w="50%" h={8} c={INK} className="mx-auto" />
      <Bar w="68%" h={3} c="#c0b6a5" className="mx-auto mb-1" />
      <Bar w="100%" h={1} c={accent} />
      <Bar w="32%" h={3} c={accent} className="mt-1" />
      <Bar w="100%" h={3} c={FAINT} />
      <Bar w="94%" h={3} c={FAINT} />
      <Bar w="86%" h={3} c={FAINT} />
      <Bar w="100%" h={1} c={RULE} className="mt-1" />
      <Bar w="28%" h={3} c={accent} className="mt-1" />
      <Bar w="100%" h={3} c={FAINT} />
      <Bar w="90%" h={3} c={FAINT} />
      <Bar w="74%" h={3} c={FAINT} />
      <Bar w="82%" h={3} c={FAINT} />
    </div>
  );
}

/** A coloured rail beside the body — the two-column body the badge is about. */
function Sidebar({
  accent,
  rail,
  narrow,
}: {
  accent: string;
  rail: "left" | "right";
  narrow?: boolean;
}) {
  return (
    <div
      className="flex h-full gap-2"
      style={{ flexDirection: rail === "right" ? "row-reverse" : "row" }}
    >
      <div
        className="flex shrink-0 flex-col gap-1.5 rounded-[5px] p-2"
        style={{ background: accent, width: narrow ? "20%" : "34%" }}
      >
        <span className="h-[15px] w-[15px] rounded-[var(--radius-pill)] bg-white/80" />
        <Bar w="100%" h={4} c="rgba(255,255,255,.7)" />
        <Bar w="68%" h={4} c="rgba(255,255,255,.5)" />
        <Bar w="84%" h={4} c="rgba(255,255,255,.35)" className="mt-2" />
        <Bar w="58%" h={4} c="rgba(255,255,255,.35)" />
        <Bar w="74%" h={4} c="rgba(255,255,255,.35)" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Bar w="70%" h={7} c={INK} />
        <Bar w="100%" h={3} c={RULE} />
        <Bar w="86%" h={3} c={RULE} />
        <Bar w="38%" h={3} c={accent} className="mt-1.5" />
        <Bar w="100%" h={3} c={FAINT} />
        <Bar w="92%" h={3} c={FAINT} />
        <Bar w="78%" h={3} c={FAINT} />
        <Bar w="38%" h={3} c={accent} className="mt-1.5" />
        <Bar w="100%" h={3} c={FAINT} />
        <Bar w="68%" h={3} c={FAINT} />
      </div>
    </div>
  );
}

/** A colour band, an icon row, and a floated aside — three violations, visible. */
function Creative({ accent }: { accent: string }) {
  return (
    <div className="flex h-full flex-col gap-1.5">
      <div
        className="flex h-[34px] flex-col justify-center gap-1 rounded-[4px] px-2"
        style={{ background: accent }}
      >
        <Bar w="56%" h={8} c="rgba(255,255,255,.9)" />
        <Bar w="34%" h={3} c="rgba(255,255,255,.6)" />
      </div>
      {/* The icon-only contact row. It's what makes this rate Low. */}
      <div className="my-0.5 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[9px] w-[9px] rounded-[var(--radius-pill)] opacity-35"
            style={{ background: accent }}
          />
        ))}
      </div>
      <div className="flex flex-1 gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Bar w="40%" h={3} c={accent} />
          <Bar w="100%" h={3} c={FAINT} />
          <Bar w="92%" h={3} c={FAINT} />
          <Bar w="80%" h={3} c={FAINT} />
          <Bar w="40%" h={3} c={accent} className="mt-1" />
          <Bar w="100%" h={3} c={FAINT} />
          <Bar w="70%" h={3} c={FAINT} />
        </div>
        <div
          className="flex w-[30%] flex-col gap-1 rounded-[6px] p-1.5"
          style={{ background: "#f9f4ed" }}
        >
          <Bar w="100%" h={3} c={RULE} />
          <Bar w="70%" h={3} c={RULE} />
          <Bar w="84%" h={3} c={RULE} />
        </div>
      </div>
    </div>
  );
}

/** A tinted masthead with a monogram above one plain column. */
function Banner({ accent }: { accent: string }) {
  return (
    <div className="flex h-full flex-col gap-1.5">
      <div
        className="-mx-3 -mt-3 mb-1 flex items-center gap-2 p-3"
        style={{ background: `${accent}22` }}
      >
        <span className="h-5 w-5 shrink-0 rounded-[var(--radius-pill)]" style={{ background: accent }} />
        <span className="flex flex-1 flex-col gap-1">
          <Bar w="60%" h={7} c={INK} />
          <Bar w="40%" h={3} c="#c0b6a5" />
        </span>
      </div>
      <Bar w="60%" h={3} c="#c0b6a5" />
      <Bar w="30%" h={3} c={accent} className="mt-1" />
      <Bar w="100%" h={3} c={FAINT} />
      <Bar w="92%" h={3} c={FAINT} />
      <Bar w="80%" h={3} c={FAINT} />
      <Bar w="30%" h={3} c={accent} className="mt-1" />
      <Bar w="100%" h={3} c={FAINT} />
      <Bar w="70%" h={3} c={FAINT} />
    </div>
  );
}

/** Every section a bordered panel on a grid — which is why it reads as a table. */
function Modular({ accent }: { accent: string }) {
  const panel = { border: `1.5px solid ${accent}` };
  return (
    <div className="flex h-full flex-col gap-1.5">
      <Bar w="52%" h={8} c={INK} />
      <div className="grid flex-1 grid-cols-2 gap-1.5">
        <div className="flex flex-col gap-1 rounded-[5px] p-1.5" style={panel}>
          <Bar w="50%" h={3} c={accent} />
          <Bar w="100%" h={3} c={FAINT} />
          <Bar w="80%" h={3} c={FAINT} />
        </div>
        <div className="flex flex-wrap content-start gap-[3px] rounded-[5px] p-1.5" style={panel}>
          <Bar w="40%" h={8} c={FAINT} />
          <Bar w="30%" h={8} c={FAINT} />
          <Bar w="50%" h={8} c={FAINT} />
        </div>
        <div className="col-span-2 flex flex-col gap-1 rounded-[5px] p-1.5" style={panel}>
          <Bar w="30%" h={3} c={accent} />
          <Bar w="100%" h={3} c={FAINT} />
          <Bar w="90%" h={3} c={FAINT} />
        </div>
      </div>
    </div>
  );
}

function Bar({
  w,
  h,
  c,
  className,
}: {
  w: string;
  h: number;
  c: string;
  className?: string;
}) {
  return (
    <span
      className={`block shrink-0 ${className ?? ""}`}
      style={{ width: w, height: h, background: c, borderRadius: h > 4 ? 3 : 2 }}
    />
  );
}
