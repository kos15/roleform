/**
 * F28 — the values the nine portfolio looks render from. PURE.
 *
 * `siteData` turns the profile excerpt into the shape the design's template
 * reads; `siteVals` is the design's own `renderVals` (PortfolioSite.dc.html),
 * ported line for line. Nothing here writes copy: every line on the page is a
 * line the member wrote — selected, ordered and trimmed, never invented
 * (CLAUDE.md §3). Where the design had hand-written flourishes (a pitch, a
 * three-word triad, a headline stat) they are drawn from the profile instead.
 */

import type { PortfolioMaterials } from "./portfolio";

export const PORTFOLIO_LOOKS = [
  "midnight",
  "keynote",
  "desktop",
  "workspace",
  "editorial",
  "scrapbook",
  "pop",
  "journal",
  "sketch",
  "bento",
  "showcase",
  "notebook",
  "chapter",
  "terminal",
] as const;
export type PortfolioLook = (typeof PORTFOLIO_LOOKS)[number];

export type PortfolioFocus = "this_role" | "broad";

/** Photo slots: `portrait`, or a project id. Values are data: URLs. */
export type PortfolioPhotos = Record<string, string>;

interface SiteProject {
  id: string;
  name: string;
  org: string;
  desc: string;
  stat: string;
  statLabel: string;
  tags: string[];
  bullets: string[];
}

export interface SiteData {
  name: string;
  initials: string;
  slug: string;
  headline: string;
  location: string;
  summary: string;
  pitch: Record<PortfolioFocus, string>;
  kicker: Record<PortfolioFocus, string>;
  focusTags: Record<PortfolioFocus, string[]>;
  triad: string;
  years: string;
  email: string;
  phone: string;
  links: Array<{ label: string; url: string }>;
  highlight: { where: string; stat: string; label: string };
  roles: Array<{ title: string; org: string; dates: string; site: string[] }>;
  /** Ordered for each focus — the look shows exactly three. */
  projects: Record<PortfolioFocus, SiteProject[]>;
  skills: string[];
  education: string;
  target: { title: string; company: string } | null;
}

const slugify = (t: string) =>
  String(t)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** A figure as written: "140k", "70%", "4.1s", "$2M", "212" — never a version ("WCAG 2.1", "React 18"). */
const FIGURE = /(?<![\w.])([$€£₹]?\d[\d,]*(?:\.\d+)?(?:%|k|K|M|bn|x|\+|s)?)(?![\w.]*\d)/g;

function firstSentence(t: string): string {
  const m = t.trim().match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m ? m[0] : t).trim();
}

function isVersion(line: string, index: number): boolean {
  // "WCAG 2.1", "React 18", "Python 3": a capitalised word right before a bare number.
  return /[A-Z][\w+#]+\s$/.test(line.slice(Math.max(0, index - 12), index));
}

function figureOf(lines: string[]): { stat: string; line: string } | null {
  let fallback: { stat: string; line: string } | null = null;
  for (const line of lines) {
    for (const m of line.matchAll(FIGURE)) {
      const stat = m[1]!.replace(/[.,]$/, "");
      const unit = /[%kKMx+s$€£₹]|bn/.test(stat);
      if (!unit && isVersion(line, m.index!)) continue;
      if (unit || stat.replace(/\D/g, "").length >= 2) {
        if (unit) return { stat, line };
        fallback ??= { stat, line };
      }
    }
  }
  return fallback;
}

/** The sentence under the big number: the rest when it leads with the figure, else the whole line. */
function labelFor(line: string, stat: string): string {
  const t = line.trim().replace(/\.$/, "");
  if (!t.startsWith(stat)) return t;
  const rest = t.slice(stat.length).trim().replace(/^[-–—,:;\s]+/, "");
  return rest.charAt(0).toLowerCase() + rest.slice(1);
}

function mentions(text: string, term: string): boolean {
  const t = term.toLowerCase().replace(/\s*\(.*\)$/, "");
  return t.length > 1 && text.toLowerCase().includes(t);
}

export function siteData(m: PortfolioMaterials): SiteData {
  const words = m.name.trim().split(/\s+/).filter(Boolean);
  const initials = (words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1]![0] : "");
  const reqText = (m.target?.requirements ?? []).join(" \n ");

  // Skills the posting asks for, first; the rest in the member's own order.
  const relevant = m.skills.filter((s) => mentions(reqText, s));
  const ranked = [...relevant, ...m.skills.filter((s) => !relevant.includes(s))];

  // Projects: the member's own, then roles stand in so a look always has three.
  const fromProjects: SiteProject[] = m.projects.map((p, i) => ({
    id: `p${i}`,
    name: p.name,
    org: "",
    desc: p.description || p.bullets[0] || "",
    ...stat([p.description, ...p.bullets]),
    tags: tagsFor([p.name, p.description, ...p.bullets].join(" "), m.skills),
    bullets: p.bullets,
  }));
  const fromRoles: SiteProject[] = m.roles.map((r, i) => ({
    id: `r${i}`,
    name: r.position || r.employer,
    org: r.employer,
    desc: r.bullets[0] ?? "",
    ...stat(r.bullets),
    tags: tagsFor(r.bullets.join(" "), m.skills),
    bullets: r.bullets.slice(1, 3),
  }));
  const pool = [...fromProjects, ...fromRoles];
  while (pool.length < 3) {
    pool.push({ id: `x${pool.length}`, name: m.headline || m.name, org: "", desc: m.summary, stat: "", statLabel: "", tags: [], bullets: [] });
  }
  const score = (p: SiteProject) => [p.name, p.desc, ...p.bullets, ...p.tags].filter((s) => mentions(reqText, s) || relevant.some((r) => mentions([p.desc, ...p.bullets].join(" "), r))).length;
  const broad = pool.slice(0, 3);
  const thisRole = [...pool].sort((a, b) => score(b) - score(a)).slice(0, 3);

  const allBullets = m.roles.flatMap((r) => r.bullets.map((b) => ({ b, org: r.employer })));
  const hl = (() => {
    for (const { b, org } of allBullets) {
      const f = figureOf([b]);
      if (f) return { where: org ? `At ${org}` : "", stat: f.stat, label: labelFor(b, f.stat) };
    }
    return { where: m.roles[0]?.employer ? `At ${m.roles[0].employer}` : "", stat: String(m.roles.length), label: m.roles.length === 1 ? "role on this page" : "roles on this page" };
  })();

  const years = (() => {
    const ys = m.roles.flatMap((r) => (r.dates.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number));
    if (!ys.length) return m.headline;
    const n = new Date().getFullYear() - Math.min(...ys);
    return n >= 1 ? `${n} year${n === 1 ? "" : "s"} of experience` : m.headline;
  })();

  const pitchOf = (s: string) => firstSentence(m.summary) || s;
  const top3 = (list: string[]) => list.slice(0, 3);
  return {
    name: m.name,
    initials: initials.toUpperCase(),
    slug: slugify(m.name),
    headline: m.headline,
    location: m.location,
    summary: m.summary,
    pitch: { this_role: pitchOf(m.headline), broad: pitchOf(m.headline) },
    kicker: {
      this_role: relevant.slice(0, 2).join(" & ") || top3(m.skills).join(" · ") || m.headline,
      broad: top3(m.skills).join(" · ") || m.headline,
    },
    focusTags: { this_role: top3(ranked), broad: top3(m.skills) },
    triad: top3(ranked).map((s) => `${s}.`).join(" ") || m.headline,
    years,
    email: m.email,
    phone: m.phone,
    links: m.links,
    highlight: hl,
    roles: m.roles.map((r) => ({ title: r.position, org: r.employer, dates: r.dates, site: r.bullets.slice(0, 3) })),
    projects: { this_role: thisRole, broad },
    skills: m.skills.slice(0, 12),
    education: m.education[0] ?? "",
    target: m.target ? { title: m.target.title, company: m.target.company } : null,
  };

  function stat(lines: string[]): { stat: string; statLabel: string } {
    const f = figureOf(lines.filter(Boolean));
    return f ? { stat: f.stat, statLabel: labelFor(f.line, f.stat) } : { stat: "", statLabel: "" };
  }
}

function tagsFor(text: string, skills: string[]): string[] {
  return skills.filter((s) => mentions(text, s)).slice(0, 2);
}

/* ------------------------------------------------- the design's renderVals */

const ROMAN = ["I", "II", "III", "IV", "V"];
const BENTO_T = ["#FFE08A", "#CDEFD8", "#DADDFF"];
const SHOW_T = [
  { bg: "#F5F5F7", fg: "#1D1D1F", mu: "#6E6E73", ki: "#BF4800", pa: "#E8E8ED" },
  { bg: "#000000", fg: "#F5F5F7", mu: "#A1A1A6", ki: "#FF9F0A", pa: "#1D1D1F" },
  { bg: "#FFFFFF", fg: "#1D1D1F", mu: "#6E6E73", ki: "#BF4800", pa: "#F5F5F7" },
];
const NOTE_T = [["#FBF3DB", "#7A5300"], ["#DDEBF1", "#1F5F8B"], ["#EDF3EC", "#2F6B4F"]];
const NOTION = [["#E3E2E0", "#32302C"], ["#EEE0DA", "#442A1E"], ["#FADEC9", "#49290E"], ["#FDECC8", "#402C1B"], ["#DBEDDB", "#1C3829"], ["#D3E5EF", "#183347"], ["#E8DEEE", "#412454"], ["#F5E0E9", "#4C2337"], ["#FFE2DD", "#5D1715"]];
const K_AC = ["#2997FF", "#FF9F0A", "#30D158"];
const K_GL = ["rgba(41,151,255,.34)", "rgba(255,159,10,.3)", "rgba(48,209,88,.28)"];
const M_GL = ["rgba(113,112,255,.42)", "rgba(76,183,130,.34)", "rgba(242,153,74,.34)"];
const E_T = ["#E6DACA", "#DAD8CE", "#E8D3C6"];
const S_ROT = ["-2deg", "1.5deg", "-1deg"], T_ROT = ["4deg", "-5deg", "2deg"], S_PAPER = ["#FFFDF6", "#F4F1E6", "#FFF7E8"], P_TINT = ["#F1E6FD", "#FFF0A1", "#E2F4EA"];
const F_TINT = ["linear-gradient(160deg,#6CB6FF,#2A6FDB)", "linear-gradient(160deg,#C8A2FF,#7A4FE0)", "linear-gradient(160deg,#5FD08A,#1F8A4E)"];
const DOTS = ["#FF5F57", "#FEBC2E", "#28C840"];
const IC = {
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z",
  link: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  person: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8",
  term: "M4 17l6-5-6-5M12 19h8",
  note: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
};
const fmtClock = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + "  " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const tag = (t: string, i: number) => ({ t, bg: NOTION[i % NOTION.length]![0], fg: NOTION[i % NOTION.length]![1] });

export interface SiteProps {
  theme: PortfolioLook;
  vw: number;
  hints?: boolean;
  focus: PortfolioFocus;
  showEmail: boolean;
  showPhone: boolean;
  showLinks: boolean;
  photos: PortfolioPhotos;
}

/** The template's scope. Photo-slot "handlers" are slot names; the renderer turns them into `data-pick`. */
export function siteVals(D: SiteData, p: SiteProps): Record<string, unknown> {
  const theme = p.theme;
  const vw = Number(p.vw) || 1280,
    narrow = vw < 720,
    ph = p.photos || {},
    hints = !!p.hints;
  const focus: PortfolioFocus = p.focus === "broad" ? "broad" : "this_role";
  const projects = D.projects[focus].map((pr, i) => {
    const img = ph[pr.id] || "",
      sh = SHOW_T[i]!;
    return {
      ...pr, n: i + 1, roman: ROMAN[i], img, hasImg: !!img, noImg: !img, hint: hints && !img, pick: pr.id,
      alt: pr.name + ", project image", anchor: i === 0 ? "work" : "work-" + pr.id,
      slug: slugify(pr.name), hash: pr.tags.map((t) => "#" + slugify(t)).join(" "), tagList: pr.tags.map((t) => ({ t })), tagLine: pr.tags.join(", "),
      statSentence: pr.stat ? pr.stat + " — " + pr.statLabel + "." : pr.desc,
      bCol: narrow ? "auto" : i === 0 ? "span 2" : "span 1", bTint: BENTO_T[i],
      sBg: sh.bg, sFg: sh.fg, sMu: sh.mu, sKi: sh.ki, sPa: sh.pa,
      nTint: NOTE_T[i]![0], nInk: NOTE_T[i]![1], nTags: pr.tags.map((t, j) => tag(t, i * 2 + j + 3)),
      num: "0" + (i + 1), dir: narrow || i % 2 === 0 ? "row" : "row-reverse", wsId: "ws-" + pr.id,
      kSpan: i === 0 ? "1 / -1" : "auto", kAR: i === 0 && !narrow ? "21 / 9" : "16 / 10", kAc: K_AC[i], kPa: "radial-gradient(90% 120% at 50% 100%," + K_GL[i] + ",#1D1D1F 72%)",
      mTint: "radial-gradient(100% 100% at 20% 100%," + M_GL[i] + ",#0F1011 70%)", eTint: E_T[i],
      sRot: S_ROT[i], tRot: T_ROT[i], sPaper: S_PAPER[i], pTint: P_TINT[i], fTint: F_TINT[i],
    };
  });
  const contacts: Array<{ label: string; value: string; href: string; cmd: string; todo?: string; ic?: string }> = [];
  if (p.showEmail !== false && D.email) contacts.push({ label: "Email", value: D.email, href: "mailto:" + D.email, cmd: "mail" });
  if (p.showPhone === true && D.phone) contacts.push({ label: "Phone", value: D.phone, href: "tel:" + D.phone.replace(/[^\d+]/g, ""), cmd: "call" });
  if (p.showLinks !== false) D.links.forEach((l) => contacts.push({ label: l.label, value: l.url.replace(/^https?:\/\/(www\.)?/, ""), href: l.url, cmd: "open" }));
  const first = D.name.split(" ")[0] ?? D.name;
  contacts.forEach((c) => {
    c.ic = c.label === "Email" ? IC.mail : c.label === "Phone" ? IC.phone : IC.link;
    c.todo = c.label === "Email" ? "Email " + first : c.label === "Phone" ? "Call " + first : "See " + first + "’s " + c.label;
  });
  const node = (t: string, href: string, pad: string, on?: boolean) => ({ t, href, pad, bg: on ? "#EAEAE8" : "transparent", fg: on ? "#37352F" : "#5F5E5B", fw: on ? "600" : "400" });
  const photo = ph.portrait || "";
  const cta = contacts[0] ? { href: contacts[0].href, label: contacts[0].label === "Email" ? "Email me" : "Get in touch" } : { href: "#", label: "" };
  const lead = projects[0]!;
  const statOf = (x: { stat: string; statLabel: string }) => ({ v: x.stat, l: x.statLabel });
  return {
    isMid: theme === "midnight", isKey: theme === "keynote", isWork: theme === "workspace", isEd: theme === "editorial",
    isMac: theme === "desktop", isScrap: theme === "scrapbook", isPop: theme === "pop", isJournal: theme === "journal", isSketch: theme === "sketch",
    lastName: D.name.split(" ").slice(1).join(" "), clock: fmtClock(new Date()),
    dock: (
      [
        ["About", "#top", "linear-gradient(180deg,#8E9BFF,#5856D6)", IC.person, "#FFFFFF"],
        ["Projects", "#work", "linear-gradient(180deg,#6CC4FF,#1E7CF2)", IC.folder, "#FFFFFF"],
        ["Experience", "#experience", "linear-gradient(180deg,#FFFFFF,#E5E5EA)", IC.doc, "#3A3A3C"],
        ["Toolkit", "#toolkit", "linear-gradient(180deg,#3A3A3C,#1C1C1E)", IC.term, "#5BD778"],
      ] as string[][]
    )
      .concat(contacts.length ? [["Contact", "#contact", "linear-gradient(180deg,#FFE680,#F5B800)", IC.note, "#5A4300"]] : [])
      .map(([t, href, bg, ic, st]) => ({ t, href, bg, ic, st })),
    firstName: first, status: focus === "broad" || !D.target?.title ? "Open to new roles" : "Open to " + D.target.title + " roles",
    nameWords: D.name.split(" ").map((t) => ({ t })),
    triadWords: D.triad.split(" ").map((t, i, a) => ({ t, k: i === a.length - 1 ? "#2997FF" : "#F5F5F7" })),
    stats: [projects[0]!, { stat: D.highlight.stat, statLabel: D.highlight.label }, projects[1]!, projects[2]!].filter((x) => x.stat).map(statOf),
    skillsLoop: D.skills.concat(D.skills).map((t) => ({ t })),
    orgs: [...new Set(D.roles.map((r) => r.org).filter(Boolean))].map((t) => ({ t })),
    edFacts: [{ k: "Role", v: D.headline }, { k: "Focus", v: D.kicker[focus] }, { k: "Experience", v: D.years }].filter((f) => f.v),
    wsTree: [node("Portfolio", "#top", "8px", true), node("Selected work", "#work", "26px"), ...projects.map((x) => node(x.name, "#" + x.wsId, "44px")), node("Experience", "#experience", "26px"), node("Toolkit", "#toolkit", "26px")].concat(contacts.length ? [node("Get in touch", "#contact", "26px")] : []),
    isBento: theme === "bento", isShow: theme === "showcase", isNote: theme === "notebook", isBook: theme === "chapter", isTerm: theme === "terminal",
    name: D.name, initials: D.initials, slug: D.slug, headline: D.headline, location: D.location, summary: D.summary, years: D.years, triad: D.triad,
    pitch: D.pitch[focus], kicker: D.kicker[focus], focusTags: D.focusTags[focus].map((t, i) => ({ ...tag(t, i + 4), dot: DOTS[i % DOTS.length] })),
    hl: D.highlight, education: D.education, year: String(new Date().getFullYear()),
    photo, hasPhoto: !!photo, noPhoto: !photo, hintPhoto: hints && !photo, pickPhoto: "portrait", photoAlt: "Portrait of " + D.name,
    projects, projCount: projects.length + " projects",
    cover: { img: lead.img, hasImg: lead.hasImg },
    roles: D.roles.map((r, i) => ({ ...r, bl: r.site.map((t) => ({ t })), lead: r.site[0] ?? "", open: i === 0, annot: "(" + [r.org, r.dates].filter(Boolean).join(" · ") + ")", y1: (r.dates.split("–")[0] ?? "").trim(), y2: (r.dates.split("–")[1] ?? "").trim(), wBg: NOTION[(i * 3 + 5) % NOTION.length]![0], wFg: NOTION[(i * 3 + 5) % NOTION.length]![1] })),
    skills: D.skills.map((t, i) => tag(t, i)), skillLine: D.skills.join(" · "),
    skillsJson: '{\n  "skills": [\n' + D.skills.map((s) => '    "' + s.replace(/"/g, '\\"') + '"').join(",\n") + "\n  ]\n}",
    contacts, hasContacts: contacts.length > 0, hasCta: contacts.length > 0, cta,
    dropCap: D.summary.charAt(0), summaryRest: D.summary.slice(1),
    toc: [{ n: "I", label: "Preface", href: "#preface", page: "i" }, { n: "II", label: "Selected work", href: "#work", page: "iii" }, { n: "III", label: "Experience", href: "#experience", page: "ix" }, { n: "IV", label: "Particulars", href: "#particulars", page: "xiii" }],
    L: {
      bCols: narrow ? "minmax(0,1fr)" : "repeat(4,minmax(0,1fr))", bRows: narrow ? "auto" : "minmax(170px,auto)",
      s2: narrow ? "auto" : "span 2", sAll: narrow ? "auto" : "1 / -1", r2: narrow ? "auto" : "span 2",
      side: narrow ? "none" : "block", midAR: narrow ? "4 / 5" : "16 / 9",
      macCols: narrow ? "minmax(0,1fr)" : "repeat(12,minmax(0,1fr))", mAbout: narrow ? "auto" : "1 / span 7", mAboutR: narrow ? "auto" : "span 2",
      mSide: narrow ? "auto" : "8 / span 5", mFind: narrow ? "auto" : "1 / -1", mText: narrow ? "auto" : "1 / span 7", mSpec: narrow ? "auto" : "8 / span 5",
      tallH: narrow ? "360px" : "0px", imgH: narrow ? "240px" : "0px", showAR: narrow ? "4 / 5" : "16 / 9", gutter: narrow ? "0" : "1px solid #E4D9C6",
    },
  };
}
