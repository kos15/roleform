/**
 * What the red-panda helper says, per screen (design: `RoleformGuide.dc.html`,
 * the `HELP` table).
 *
 * The copy is the design's with three deliberate edits, each for a rule the
 * design couldn't see:
 *
 * - "Here are your 11 drafts" counts nothing: how many drafts a run returns is
 *   `capResumes` per member (CLAUDE.md §5).
 * - Token costs are not quoted as numbers. The estimates live in
 *   `lib/domain/tokens.ts` and move; a figure frozen in a tip would drift from
 *   the meter it describes.
 * - Pricing's "coverage, gaps and frameworks cost nothing" is dropped for the
 *   same reason: what a run spends is itemised on the profile, where it is read
 *   from rows.
 *
 * A tip's `target` names a `[data-help]` or `[data-tour]` anchor. "Show me"
 * appears only when that anchor is on the page right now — pointing at a
 * control that isn't rendered would be a lie about where it is.
 */
export interface HelpTip {
  text: string;
  target?: string;
}

export interface HelpScreen {
  title: string;
  /** Said once per visit to the screen, unprompted. Absent → the helper stays quiet. */
  intro?: string;
  /** Appended to the rage-click nudge when the visitor clicks dead space. */
  stuck?: string;
  /** A screen that is mostly waiting (the parsing run) gets no idle nudge. */
  noIdle?: boolean;
  tips: HelpTip[];
}

export type HelpKey =
  | "landing"
  | "analyze"
  | "parsing"
  | "resumes"
  | "preview"
  | "prep"
  | "learning"
  | "roadmap"
  | "profile"
  | "pricing"
  | "onboarding"
  | "jobs"
  | "history"
  | "howitworks"
  | "privacy"
  | "terms"
  | "status"
  | "contact"
  | "support"
  | "signin"
  | "templates"
  | "guides";

export const HELP: Record<HelpKey, HelpScreen> = {
  landing: {
    title: "Home",
    intro: "Start with Get started — your résumé goes in once, then any posting is one paste away.",
    tips: [
      { text: "Get started takes you through adding your résumé first. After that, every posting is one paste away.", target: "landing-cta" },
      { text: "Want the detail first? How it works explains all four stages in plain words." },
    ],
  },
  analyze: {
    title: "New analysis",
    intro: "Paste the whole posting here. No posting handy? Load the sample.",
    stuck: "Paste the posting into the big box, then press Analyse posting.",
    tips: [
      { text: "Paste the whole posting — title, responsibilities and requirements. More of it means a fairer coverage score.", target: "jd" },
      { text: "No posting handy? Load the sample to see a full run.", target: "load-sample" },
      { text: "When it looks right, Analyse posting starts the four stages.", target: "analyze-btn" },
    ],
  },
  parsing: {
    title: "Analysing",
    noIdle: true,
    tips: [
      { text: "Four stages run in order. If one fails it stops there and says what failed — earlier stages are kept." },
      { text: "A stopped run resumes rather than restarts. You’ll find it in History." },
    ],
  },
  resumes: {
    title: "Your drafts",
    intro: "Here are your drafts. They share the same evidence — only the layout changes.",
    tips: [
      { text: "The big number is requirement coverage: how much of the posting your profile can evidence. It isn’t an ATS score.", target: "coverage" },
      { text: "Templates rated High are the safest for company job portals. Creative ones rate Low, honestly.", target: "shelf" },
      { text: "Open any draft to see exactly which lines were reworded." },
    ],
  },
  preview: {
    title: "Résumé preview",
    intro: "Turn on Changes highlighted to see every reworded line.",
    tips: [
      { text: "Changes highlighted marks every line that was reworded from your own bullets.", target: "diff-toggle" },
      { text: "PDF is safest for job portals; DOCX is handy when a recruiter wants to edit." },
    ],
  },
  prep: {
    title: "Interview prep",
    intro: "Start with the questions marked Most likely.",
    tips: [
      { text: "Filter by family — technical and system design each have their own tab.", target: "q-tabs" },
      { text: "Open a question to see why they ask it and which of your bullets to answer from." },
      { text: "Frameworks are free. A full drafted answer draws on your token allowance." },
    ],
  },
  learning: {
    title: "Learning",
    intro: "Gaps are ordered by how much they matter to this posting.",
    tips: [
      { text: "Pick how much time you have and the plan resizes to fit.", target: "budget" },
      { text: "Each gap shows the résumé line it unlocks and the question it answers." },
    ],
  },
  roadmap: {
    title: "Roadmap",
    tips: [
      { text: "Tick items off as you go. It’s your own record — nothing ticks a step but you.", target: "roadmap" },
    ],
  },
  profile: {
    title: "Profile",
    intro: "Everything a tailored résumé says has to exist here first.",
    tips: [
      { text: "Your token allowance, and what each run costs, live here.", target: "token-panel" },
      { text: "Bullets used as evidence zero times are the ones worth rewriting." },
    ],
  },
  pricing: {
    title: "Pricing",
    tips: [
      { text: "Every plan is its caps — what you see in the table is exactly what is enforced." },
      { text: "A run you can’t afford is refused before it starts, so you’re never charged for half a run." },
    ],
  },
  onboarding: {
    title: "Add your résumé",
    intro: "Drop your résumé in. Nothing saves until you’ve checked what we read.",
    stuck: "Drop your résumé onto the big box, or click it to choose a file.",
    tips: [
      { text: "Drop a PDF, Word, ODT, RTF, text file or a photo of your résumé, up to 4 MB — or paste the text instead.", target: "ob-drop" },
      { text: "Start with “Worth a look” — those are the things we couldn’t read confidently.", target: "ob-flags" },
      { text: "It needs a name and at least one bullet before it can save.", target: "ob-save" },
    ],
  },
  jobs: {
    title: "Jobs",
    intro: "Search by title and city. Fit is shown as skills, never a score.",
    tips: [
      { text: "Only titles, skills and a city leave this server when you search.", target: "job-search" },
      { text: "Save a listing to track it, or Analyse to run it straight through Roleform." },
    ],
  },
  history: {
    title: "History",
    tips: [
      { text: "Opening a past analysis shows what was stored — nothing is regenerated and nothing is billed again." },
    ],
  },
  howitworks: {
    title: "How it works",
    tips: [{ text: "Looking for something specific? A person answers on the Contact page." }],
  },
  privacy: {
    title: "Privacy",
    tips: [{ text: "Questions about your data or deletion? Write to us from the Contact page." }],
  },
  terms: {
    title: "Terms",
    tips: [{ text: "Not sure what something means? A person answers on the Contact page." }],
  },
  status: {
    title: "Status",
    intro: "If your run stopped part-way, Open it picks up where it stopped.",
    tips: [
      { text: "A stopped run resumes from the stage it stopped at — the earlier stages are kept.", target: "status-run" },
      { text: "Health here is never cached for longer than a minute." },
    ],
  },
  contact: {
    title: "Contact",
    tips: [
      { text: "A person reads every message, usually within a working day." },
      { text: "If a stage looks slow, check Status first — it may already be known." },
    ],
  },
  support: {
    title: "Support us",
    tips: [{ text: "Roleform is independent and ad-free. Support is how it stays that way." }],
  },
  signin: {
    title: "Sign in",
    tips: [{ text: "No account yet? Sign up from the same box with Google or your email." }],
  },
  templates: {
    title: "Templates",
    tips: [
      { text: "Every ATS rating here is computed from the layout’s structure, never assigned by hand." },
      { text: "Creative templates rate Low because they parse worse. Pick them knowingly." },
    ],
  },
  guides: {
    title: "Guides",
    tips: [{ text: "Every claim in a guide matches a rule the product actually enforces." }],
  },
};

/** "Take me to" — the places a lost visitor most often wants. */
export const HELP_PLACES: readonly { label: string; href: string }[] = [
  { label: "New analysis", href: "/analyze" },
  { label: "Jobs", href: "/jobs" },
  { label: "History", href: "/history" },
  { label: "Profile", href: "/profile" },
  { label: "Pricing", href: "/pricing" },
  { label: "Status", href: "/status" },
];

/**
 * The design is one page whose screens are a state flip; here they are routes.
 * Null for surfaces the helper has nothing to say about (admin, the doc
 * mirrors), where it stays docked and silent.
 */
export function helpKeyFor(pathname: string): HelpKey | null {
  if (pathname === "/") return "landing";
  const [first, , third] = pathname.split("/").filter(Boolean);
  switch (first) {
    case "analyze":
      return "analyze";
    case "analysis":
      if (!third) return "parsing";
      if (third === "resumes" || third === "preview" || third === "prep" || third === "learning" || third === "roadmap")
        return third;
      return null;
    case "onboarding":
    case "profile":
    case "pricing":
    case "jobs":
    case "history":
    case "privacy":
    case "terms":
    case "status":
    case "contact":
    case "support":
    case "templates":
    case "guides":
      return first;
    case "how-it-works":
      return "howitworks";
    case "sign-in":
    case "sign-up":
      return "signin";
    default:
      return null;
  }
}

/**
 * The panda's line for each act of the landing story (design: the landing's
 * `GUIDE` table, s1–s4). Index 0 is the hero, which the helper's own hello
 * covers. "Same evidence, 11 layouts" counts nothing here, for §5's reason.
 */
export const STORY_LINES: { label: string; text: string }[] = [
  { label: "Hello", text: "Scroll, and I’ll show you what Roleform does with one job posting." },
  { label: "Stage 01", text: "Watch the highlighter — every stated requirement gets pulled out first. Nothing the posting doesn’t state is guessed." },
  { label: "Stage 02", text: "61 is requirement coverage: how much of the posting you can evidence. It isn’t an ATS score. The dashed one is a gap — it goes on your learning list, never onto your résumé." },
  { label: "Stage 03", text: "Same evidence, every layout. For big-company job portals, pick one rated High. Every rewritten line keeps a key back to the bullet you wrote." },
  { label: "Stage 04", text: "Start with the questions marked Likely — they come straight from the posting. Gaps are ranked by how often the posting mentions them." },
];
