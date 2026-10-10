/**
 * F28 — portfolio site. PURE.
 *
 * Two jobs, neither of which needs a model:
 *
 *   1. `portfolioMaterials` — a deliberately SHORT excerpt of the profile: who
 *      they are, up to four roles with their first bullets, a few projects,
 *      skills, education, links. A portfolio is a selection, and handing the
 *      whole résumé to a tool invites "the résumé as a web page".
 *   2. `buildCuratedPrompt` — the supplied brief plus that excerpt and the
 *      member's answers. Free: string assembly, no call, nothing metered.
 */

import type { StoredResume } from "@/lib/ai/schemas/resume-json";
import type { PortfolioChoices, PortfolioStyle } from "@/lib/ai/schemas/portfolio";

export interface PortfolioRole {
  position: string;
  employer: string;
  dates: string;
  bullets: string[];
}

export interface PortfolioMaterials {
  name: string;
  headline: string;
  location: string;
  summary: string;
  email: string;
  phone: string;
  links: Array<{ label: string; url: string }>;
  roles: PortfolioRole[];
  projects: Array<{ name: string; description: string; url: string; bullets: string[] }>;
  skills: string[];
  education: string[];
  certificates: string[];
  target: { title: string; company: string; requirements: string[] } | null;
}

const LIMITS = { roles: 4, bulletsPerRole: 4, projects: 4, bulletsPerProject: 3, skills: 24, requirements: 10 };

export function portfolioMaterials(
  resume: StoredResume,
  target: { title: string | null; company: string | null; requirements: Array<{ text: string; necessity: string; mentionCount: number }> } | null,
): PortfolioMaterials {
  const b = resume.basics;
  const location = [b.location.city, b.location.region].filter(Boolean).join(", ");
  const links = [
    ...(b.url ? [{ label: "Website", url: b.url }] : []),
    ...b.profiles.filter((p) => p.url).map((p) => ({ label: p.network || "Profile", url: p.url })),
  ];
  const range = (start: string | null | undefined, end: string | null | undefined) =>
    [start ?? "", end ?? "present"].filter(Boolean).join(" – ");

  const necessityRank: Record<string, number> = { required: 0, preferred: 1, implied: 2 };
  return {
    name: b.name,
    headline: b.label,
    location,
    summary: b.summary,
    email: b.email,
    phone: b.phone,
    links,
    roles: resume.work.slice(0, LIMITS.roles).map((w) => ({
      position: w.position,
      employer: w.name,
      dates: range(w.startDate, w.endDate),
      bullets: w.highlights.slice(0, LIMITS.bulletsPerRole),
    })),
    projects: resume.projects.slice(0, LIMITS.projects).map((p) => ({
      name: p.name,
      description: p.description,
      url: p.url,
      bullets: p.highlights.slice(0, LIMITS.bulletsPerProject),
    })),
    skills: [...new Set(resume.skills.flatMap((s) => (s.keywords.length ? s.keywords : [s.name])))].slice(0, LIMITS.skills),
    education: resume.education.map((e) =>
      [[e.studyType, e.area].filter(Boolean).join(" in "), e.institution, e.endDate ?? ""].filter(Boolean).join(", "),
    ),
    certificates: resume.certificates.map((c) => [c.name, c.issuer, c.date ?? ""].filter(Boolean).join(", ")),
    target: target
      ? {
          title: target.title ?? "",
          company: target.company ?? "",
          requirements: [...target.requirements]
            .sort(
              (a, c) =>
                (necessityRank[a.necessity] ?? 3) - (necessityRank[c.necessity] ?? 3) || c.mentionCount - a.mentionCount,
            )
            .slice(0, LIMITS.requirements)
            .map((r) => r.text),
        }
      : null,
  };
}

export interface LookLabel {
  name: string;
  blurb: string;
  /** Roles it suits, shown beside the name. */
  best: string;
  /** The page's ground colour, painted behind the card while it renders. */
  ground: string;
  rec?: boolean;
  /** Carries scroll motion (portfolio-motion). */
  fresh?: boolean;
  /** Where photos go in this look — shown in the studio and written into the prompt. */
  where: string;
  portraitWhere: string;
  shotsWhere: string;
}

/** The fourteen looks, in the design's order, as it names and describes them. */
export const STYLE_LABEL: Record<PortfolioStyle, LookLabel> = {
  midnight: { name: "Midnight", rec: true, fresh: true, best: "Engineering · Product", ground: "#08090A", blurb: "A dark, precise launch page: a glowing grid, a hero window that tilts flat as you scroll, and numbers that count up.",
    where: "In Midnight, your portrait sits in the hero window that tilts flat as visitors scroll, and each project image tops its card.", portraitWhere: "Put it in the hero window under the headline.", shotsWhere: "Use each one at the top of its project card." },
  keynote: { name: "Keynote", fresh: true, best: "Product · Design · Engineering", ground: "#000000", blurb: "Keynote-style: a metallic headline, a portrait that grows into place on scroll and big rounded project tiles.",
    where: "In Keynote, your portrait runs wide under the headline and grows into place on scroll; each project image fills the foot of its tile.", portraitWhere: "Run it wide under the headline, growing into place on scroll.", shotsWhere: "Set each one at the foot of its project tile, with a gentle parallax." },
  desktop: { name: "Desktop", fresh: true, best: "Engineering · Design", ground: "#2B2F5E", blurb: "A desktop on a soft wallpaper: windows you can drag, a dock that magnifies, a live menu-bar clock and a terminal of skills.",
    where: "In Desktop, your portrait is the avatar in the About window, and each project image is a file in the Projects window.", portraitWhere: "Use it as the avatar in the About window.", shotsWhere: "Show each one as a file thumbnail in the Projects window." },
  workspace: { name: "Workspace", fresh: true, best: "Any role", ground: "#FFFFFF", blurb: "A workspace page: a sidebar of pages, a title that types itself, linked project pages and a table of roles.",
    where: "In Workspace, your portrait is the page icon over a drifting cover, and each project image heads its linked page.", portraitWhere: "Use it as the page icon, overlapping the cover.", shotsWhere: "Use the first as the page cover, and each one beside its linked project page." },
  editorial: { name: "Editorial", fresh: true, best: "Design · Writing · Leadership", ground: "#F3EFE7", blurb: "A magazine feature: a giant serif masthead, a scrolling ticker, photographs that wipe in and numbered stories.",
    where: "In Editorial, your portrait is the lead photograph beside the brief, and each project image wipes in beside its numbered story.", portraitWhere: "Run it as the lead photograph beside the brief.", shotsWhere: "Set each one beside its numbered story, wiping in on scroll." },
  scrapbook: { name: "Scrapbook", fresh: true, best: "Design · Creative", ground: "#8E8B78", blurb: "A manila folder of paper: a torn notepad, a title circled in red pen, a taped polaroid and project clippings that drop in.",
    where: "In Scrapbook, your portrait is a taped polaroid beside your name, and each project image is a clipping taped into the folder.", portraitWhere: "Tape it up as a polaroid beside my name.", shotsWhere: "Tape each one into the folder as a clipping." },
  pop: { name: "Pop", fresh: true, best: "Marketing · Social · Creative", ground: "#FBF9FE", blurb: "Loud and friendly: a giant two-tone name, a photo in a lilac blob, doodles that draw themselves and a clipped sticky note.",
    where: "In Pop, your portrait sits in the lilac blob under your name, and each project image fills a pinned card.", portraitWhere: "Put it in the blob shape under my name.", shotsWhere: "Use each one on a pinned project card." },
  journal: { name: "Journal", fresh: true, best: "Any role", ground: "#CFCFCC", blurb: "A spiral-bound journal: bold “About Me.” pages that flip down as you scroll, a captioned polaroid and a black chat box.",
    where: "In Journal, your portrait is the polaroid on the first page, and each project image sits beside its entry.", portraitWhere: "Clip it in as a polaroid with a handwritten caption.", shotsWhere: "Set each one beside its entry on the work page." },
  sketch: { name: "Sketch", fresh: true, best: "Design · Engineering", ground: "#ECEAE3", blurb: "Typewriter type on paper, hand-written notes in the margins, and a circle sketched round your portrait as you watch.",
    where: "In Sketch, your portrait sits in a hand-drawn circle beside your name, and each project image sits in a sketched frame.", portraitWhere: "Put it in the hand-drawn circle beside my name.", shotsWhere: "Put each one in a sketched frame." },
  bento: { name: "Bento", best: "Engineering · Product", ground: "#ECEAE4", blurb: "Your story in tiles — portrait, numbers and projects side by side. Scannable in seconds.",
    where: "In Bento, your portrait fills the tall tile beside your name, and each project image tops its tile.", portraitWhere: "Fill the tall tile beside my name with it.", shotsWhere: "Use each one full-bleed at the top of its project’s tile." },
  showcase: { name: "Showcase", best: "Product · Design", ground: "#FFFFFF", blurb: "Huge type, one idea per screen and big rounded imagery — the product-launch look.",
    where: "In Showcase, your portrait runs wide under the headline, and each project image sits large at the foot of its section.", portraitWhere: "Run it wide, with rounded corners, under the headline.", shotsWhere: "Set each one large at the foot of its project section." },
  notebook: { name: "Notebook", best: "Any role", ground: "#FFFFFF", blurb: "A tidy workspace page: properties, a callout, a gallery of projects and a toggle for each role.",
    where: "In Notebook, your portrait is the page icon, the first project image becomes the cover, and each image heads its gallery card.", portraitWhere: "Use it as the page icon, overlapping the cover.", shotsWhere: "Use the first as the page cover, and each one as its gallery card’s cover." },
  chapter: { name: "Chapter", best: "Research · Writing · Leadership", ground: "#E9E2D4", blurb: "Set like a book: a title spread, a contents page, chapters and captioned plates.",
    where: "In Chapter, your portrait is the frontispiece plate, and project images become captioned figures.", portraitWhere: "Set it as a frontispiece plate with a caption.", shotsWhere: "Set each one as a captioned figure in its chapter." },
  terminal: { name: "Terminal", best: "Engineering · Data", ground: "#F6F5F0", blurb: "Monospace, hairline windows and a command for every section. Engineering through and through.",
    where: "In Terminal, your portrait opens as portrait.jpg beside whoami, and each project image sits in its folder’s window.", portraitWhere: "Show it in a window titled portrait.jpg beside the introduction.", shotsWhere: "Show each one in a window inside its project card." },
};

/** Which photos the member has added in the studio — names only; the images never leave the browser. */
export interface PromptAssets {
  portrait: boolean;
  /** Project names that have an image. */
  shots: string[];
}

function assetsText(c: PortfolioChoices, a?: PromptAssets): string {
  const look = STYLE_LABEL[c.style];
  const out: string[] = [];
  if (a?.portrait) out.push(`A portrait is attached as portrait.jpg. ${look.portraitWhere}`);
  else out.push("No portrait supplied — design a complete layout without one.");
  if (a?.shots.length) {
    const files = a.shots.map((n) => `${n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.jpg (${n})`);
    out.push(`Project images are attached: ${files.join(", ")}. ${look.shotsWhere}`);
  } else out.push("No project images — let the typography and the figures carry the projects.");
  out.push("No résumé download.");
  return out.join(" ");
}

/** The excerpt as plain text. Shared by both paths so they describe one person. */
export function materialsText(m: PortfolioMaterials, c: PortfolioChoices): string {
  const lines: string[] = [];
  lines.push(`Name: ${m.name}`);
  if (m.headline) lines.push(`Title: ${m.headline}`);
  if (m.location) lines.push(`Location: ${m.location}`);
  if (c.showEmail && m.email) lines.push(`Email: ${m.email}`);
  if (c.showPhone && m.phone) lines.push(`Phone: ${m.phone}`);
  if (c.showLinks) for (const l of m.links) lines.push(`${l.label}: ${l.url}`);
  if (m.summary) lines.push("", `Summary: ${m.summary}`);
  if (m.roles.length) {
    lines.push("", "Experience:");
    for (const r of m.roles) {
      lines.push(`- ${[r.position, r.employer].filter(Boolean).join(", ")}${r.dates ? ` (${r.dates})` : ""}`);
      for (const b of r.bullets) lines.push(`  • ${b}`);
    }
  }
  if (m.projects.length) {
    lines.push("", "Projects:");
    for (const p of m.projects) {
      lines.push(`- ${p.name}${p.description ? `: ${p.description}` : ""}${c.showLinks && p.url ? ` (${p.url})` : ""}`);
      for (const b of p.bullets) lines.push(`  • ${b}`);
    }
  }
  if (m.skills.length) lines.push("", `Skills: ${m.skills.join(", ")}`);
  if (m.education.length) lines.push("", "Education:", ...m.education.map((e) => `- ${e}`));
  if (m.certificates.length) lines.push("", "Certifications:", ...m.certificates.map((e) => `- ${e}`));
  return lines.join("\n");
}

function targetText(m: PortfolioMaterials, c: PortfolioChoices): string {
  if (c.focus === "broad" || !m.target) return "This is a general portfolio, not tailored to one posting.";
  const role = [m.target.title, m.target.company].filter(Boolean).join(" at ") || "The target role";
  return [`${role}. Its main requirements:`, ...m.target.requirements.map((r) => `- ${r}`)].join("\n");
}

function instructionsText(m: PortfolioMaterials, c: PortfolioChoices): string {
  const style = STYLE_LABEL[c.style];
  const lines = [
    `Visual direction: ${style.name} — ${style.blurb}`,
    c.focus === "this_role" && m.target
      ? "Tailor closely to the target role above."
      : "Keep it broad enough for a range of related roles.",
  ];
  if (c.emphasis) lines.push(`Emphasise: ${c.emphasis}`);
  if (c.avoid) lines.push(`Leave out (confidential or outdated): ${c.avoid}`);
  lines.push(
    `Contact to show: ${[c.showEmail && m.email ? "email" : "", c.showPhone && m.phone ? "phone" : "", c.showLinks && m.links.length ? "the links above" : ""].filter(Boolean).join(", ") || "none listed — ask me"}.`,
  );
  return lines.join("\n");
}

/** The curated prompt for an external tool. The brief, then the materials it asks for. */
export function buildCuratedPrompt(brief: string, m: PortfolioMaterials, c: PortfolioChoices, assets?: PromptAssets): string {
  return [
    brief,
    "",
    "MY MATERIALS",
    "Resume (an excerpt — my strongest roles and projects):",
    materialsText(m, c),
    "",
    `Target job description: ${targetText(m, c)}`,
    "",
    "Reference examples: None — follow the visual direction below.",
    "",
    `Project details and supporting evidence: ${c.projectNotes || "Nothing beyond the résumé yet — ask me what you need."}`,
    "",
    `Portrait and other assets: ${assetsText(c, assets)}`,
    "",
    "Additional instructions:",
    instructionsText(m, c),
  ].join("\n");
}
