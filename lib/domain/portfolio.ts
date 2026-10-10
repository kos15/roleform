/**
 * F28 — portfolio site. PURE.
 *
 * Three jobs, none of which needs a model:
 *
 *   1. `portfolioMaterials` — a deliberately SHORT excerpt of the profile: who
 *      they are, up to four roles with their first bullets, a few projects,
 *      skills, education, links. A portfolio is a selection, and handing the
 *      whole résumé to a tool invites "the résumé as a web page".
 *   2. `buildCuratedPrompt` — the supplied brief plus that excerpt and the
 *      member's answers. Free: string assembly, no call, nothing metered.
 *   3. `checkPortfolioHtml` — the build's guardrail. The page is the user's
 *      document going to strangers, so every link must be one their profile
 *      states (N8/N18: a URL we did not get from them is one we cannot vouch
 *      for), it may not load or send anything, and a number in its copy must
 *      exist in the source (CLAUDE.md §3: no invented metrics).
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

/** The nine looks, as the design names and describes them. */
export const STYLE_LABEL: Record<PortfolioStyle, LookLabel> = {
  midnight: { name: "Midnight", rec: true, fresh: true, best: "Engineering · Product", ground: "#08090A", blurb: "A dark, precise launch page: a glowing grid, a hero window that tilts flat as you scroll, and numbers that count up.",
    where: "In Midnight, your portrait sits in the hero window that tilts flat as visitors scroll, and each project image tops its card.", portraitWhere: "Put it in the hero window under the headline.", shotsWhere: "Use each one at the top of its project card." },
  keynote: { name: "Keynote", fresh: true, best: "Product · Design · Engineering", ground: "#000000", blurb: "Keynote-style: a metallic headline, a portrait that grows into place on scroll and big rounded project tiles.",
    where: "In Keynote, your portrait runs wide under the headline and grows into place on scroll; each project image fills the foot of its tile.", portraitWhere: "Run it wide under the headline, growing into place on scroll.", shotsWhere: "Set each one at the foot of its project tile, with a gentle parallax." },
  workspace: { name: "Workspace", fresh: true, best: "Any role", ground: "#FFFFFF", blurb: "A workspace page: a sidebar of pages, a title that types itself, linked project pages and a table of roles.",
    where: "In Workspace, your portrait is the page icon over a drifting cover, and each project image heads its linked page.", portraitWhere: "Use it as the page icon, overlapping the cover.", shotsWhere: "Use the first as the page cover, and each one beside its linked project page." },
  editorial: { name: "Editorial", fresh: true, best: "Design · Writing · Leadership", ground: "#F3EFE7", blurb: "A magazine feature: a giant serif masthead, a scrolling ticker, photographs that wipe in and numbered stories.",
    where: "In Editorial, your portrait is the lead photograph beside the brief, and each project image wipes in beside its numbered story.", portraitWhere: "Run it as the lead photograph beside the brief.", shotsWhere: "Set each one beside its numbered story, wiping in on scroll." },
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
  if (!a || (!a.portrait && a.shots.length === 0)) {
    return "No portrait or images supplied. Design a complete layout without one, and no resume download.";
  }
  const look = STYLE_LABEL[c.style];
  const lines: string[] = [];
  if (a.portrait) lines.push(`Portrait: attached as portrait.jpg — my own photo; do not alter or generate one. ${look.portraitWhere}`);
  else lines.push("No portrait — design the layout without one.");
  if (a.shots.length) lines.push(`Project images attached for: ${a.shots.join(", ")}. ${look.shotsWhere}`);
  lines.push("No resume download.");
  return lines.join("\n");
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
    "Reference examples: None yet — suggest two or three directions.",
    "",
    `Project details and supporting evidence: ${c.projectNotes || "Nothing beyond the résumé yet — ask me what you need."}`,
    "",
    `Portrait and other assets: ${assetsText(c, assets)}`,
    "",
    "Additional instructions:",
    instructionsText(m, c),
  ].join("\n");
}

/** What the in-app build sends as its variable block. Same facts, no brief. */
export function buildRequestText(m: PortfolioMaterials, c: PortfolioChoices, nowYear: number): string {
  return [
    "<materials>",
    materialsText(m, c),
    "</materials>",
    "",
    "<target>",
    targetText(m, c),
    "</target>",
    "",
    "<project_notes>",
    c.projectNotes || "None.",
    "</project_notes>",
    "",
    "<answers>",
    instructionsText(m, c),
    `No portrait, no images, no résumé file. The current year is ${nowYear}.`,
    "</answers>",
  ].join("\n");
}

/* --------------------------------------------------------------- guardrail */

/** Hosts a page may load from: fonts only. Nothing else leaves the page. */
const FONT_HOSTS = ["https://fonts.googleapis.com/", "https://fonts.gstatic.com/"];

const FORBIDDEN: Array<[RegExp, string]> = [
  [/<script\b[^>]*\bsrc\s*=/i, "no external scripts"],
  [/<(iframe|object|embed|frame|base)\b/i, "no iframes, embeds or <base>"],
  [/<form\b/i, "no forms — contact is an email link (nothing can send a message)"],
  [/<img\b/i, "no images — none were supplied"],
  [/\b(lorem ipsum|insert here|your name here|placeholder text)\b/i, "no placeholder text"],
];

function normaliseUrl(u: string): string {
  return u.trim().replace(/&amp;/g, "&").replace(/\/+$/, "").toLowerCase();
}

/** Every URL the page may link to: the profile's own, as the choices allow. */
export function allowedLinks(m: PortfolioMaterials, c: PortfolioChoices): Set<string> {
  const urls = new Set<string>();
  if (c.showLinks) {
    for (const l of m.links) urls.add(normaliseUrl(l.url));
    for (const p of m.projects) if (p.url) urls.add(normaliseUrl(p.url));
  }
  if (c.showEmail && m.email) urls.add(`mailto:${m.email.toLowerCase()}`);
  if (c.showPhone && m.phone) urls.add(`tel:${m.phone.replace(/[^\d+]/g, "")}`);
  return urls;
}

function urlAllowed(raw: string, allowed: Set<string>): boolean {
  const u = raw.trim();
  if (!u || u.startsWith("#")) return true;
  if (u.startsWith("data:font/") || u.startsWith("data:image/svg+xml")) return true;
  if (FONT_HOSTS.some((h) => u.startsWith(h))) return true;
  const lower = u.toLowerCase();
  if (lower.startsWith("mailto:")) return allowed.has(lower.split("?")[0]!);
  if (lower.startsWith("tel:")) return allowed.has(`tel:${u.slice(4).replace(/[^\d+]/g, "")}`);
  return allowed.has(normaliseUrl(u));
}

function visibleText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
}

/**
 * Numbers that carry a claim: a percentage, a multiple, a money or "k/M"
 * figure, a "+", or anything of three or more digits. Small bare numbers
 * (section indices, "2 projects") pass; a year passes only if it is in the
 * source or is the current year (a copyright line).
 */
export function unsourcedNumbers(html: string, sourceText: string, nowYear: number): string[] {
  const source = new Set((sourceText.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,]/g, "").replace(/\.$/, "")));
  const found = new Set<string>();
  const re = /([$€£₹]\s?)?(\d[\d,.]*)\s?(%|\+|x\b|k\b|m\b|bn\b)?/gi;
  for (const m of visibleText(html).matchAll(re)) {
    const digits = m[2]!.replace(/,/g, "").replace(/\.$/, "");
    const claim = Boolean(m[1] || m[3]) || digits.replace(/\D/g, "").length >= 3;
    if (!claim) continue;
    if (digits === String(nowYear)) continue;
    if (!source.has(digits)) found.add(m[0].trim());
  }
  return [...found];
}

/**
 * Null when the page is acceptable; otherwise one line naming what to fix,
 * fed back to the model as a correction (lib/ai/run.ts `verify`).
 */
export function checkPortfolioHtml(
  html: string,
  args: { allowed: Set<string>; sourceText: string; nowYear: number },
): string | null {
  const problems: string[] = [];
  if (!/^\s*<!doctype html>/i.test(html)) problems.push("start with <!doctype html>");
  if (!/<title>[^<]{3,}<\/title>/i.test(html)) problems.push("include a <title>");
  if (!/<meta\s+name=["']description["']/i.test(html)) problems.push('include <meta name="description">');
  if (!/<main\b/i.test(html)) problems.push("wrap the content in <main>");
  for (const [re, why] of FORBIDDEN) if (re.test(html)) problems.push(why);
  // Script bodies only: the copy may well say "fetch" or "cookie".
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!).join("\n");
  if (/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/.test(scripts)) {
    problems.push("no network calls from script");
  }
  if (/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/.test(scripts)) problems.push("no storage or cookies");

  const urls = [
    ...[...html.matchAll(/\b(?:href|src|action)\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]!),
    ...[...html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((m) => m[1]!),
    ...[...html.matchAll(/@import\s+["']([^"']+)["']/gi)].map((m) => m[1]!),
  ];
  const bad = [...new Set(urls.filter((u) => !urlAllowed(u, args.allowed)))];
  if (bad.length) problems.push(`remove links not in <materials>: ${bad.slice(0, 5).join(", ")}`);

  const numbers = unsourcedNumbers(html, args.sourceText, args.nowYear);
  if (numbers.length) problems.push(`remove figures not in the source: ${numbers.slice(0, 5).join(", ")}`);

  return problems.length ? `Fix the page: ${problems.join("; ")}.` : null;
}
