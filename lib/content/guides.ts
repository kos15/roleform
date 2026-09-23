/**
 * The guides (SEO/AEO content hub).
 *
 * Each guide answers one question people actually search — how to tailor a
 * résumé, what "ATS-friendly" means, where keywords come from — and answers it
 * with the same rules the product enforces. That is the point of writing them
 * here rather than in a CMS: the ATS rules on /guides/ats-friendly-resume are
 * the five in lib/render/ats-rules.ts, the coverage formula is the one in
 * lib/domain/coverage.ts (CLAUDE.md §4–5). A guide that drifted from the code
 * would be advice the product itself doesn't follow.
 *
 * No invented statistics. Where a guide states a number it is one the product
 * computes; where it would need an outside figure, it describes the mechanism
 * instead.
 *
 * Every guide opens with `answer` — a self-contained 40–60 word reply to its
 * title question, the passage an answer engine lifts — and closes with FAQs
 * that are rendered on the page and mirrored in FAQPage JSON-LD.
 */

export interface GuideSection {
  heading: string;
  body?: string[];
  list?: string[];
  /** Rendered as a numbered list and mirrored as HowTo steps. */
  steps?: { name: string; text: string }[];
}

export interface Guide {
  slug: string;
  /** The <title>: the query people type, in the words they type it. */
  seoTitle: string;
  /** The visible H1. */
  title: string;
  kicker: string;
  description: string;
  answer: string;
  updated: string;
  readMinutes: number;
  sections: GuideSection[];
  faqs: { q: string; a: string }[];
  related: string[];
}

const UPDATED = "2026-09-23";

export const GUIDES: Guide[] = [
  {
    slug: "tailor-resume-to-job-description",
    seoTitle: "How to Tailor Your Resume to a Job Description (Step by Step)",
    title: "How to tailor your résumé to a job description",
    kicker: "Guide · Tailoring",
    description:
      "A step-by-step method for tailoring a resume to a job description: pull the requirements, match them to your own bullets, reorder and reword — without inventing anything.",
    answer:
      "To tailor a résumé to a job description, list every requirement the posting states, find the bullet in your own experience that proves each one, then reorder those bullets to the top and reword them in the posting's vocabulary. Requirements you cannot evidence stay off the résumé and become your preparation list.",
    updated: UPDATED,
    readMinutes: 7,
    sections: [
      {
        heading: "What does tailoring a résumé actually mean?",
        body: [
          "Tailoring is selection and phrasing, not invention. A tailored résumé contains the same facts as your master résumé; what changes is which facts lead, how much space each gets, and whether they are described in the words the employer used.",
          "There are three legal moves: rephrase a bullet into the posting's vocabulary, reorder and re-weight bullets so the relevant ones come first, and requantify using only numbers already present in your own bullet. Anything beyond that — a new tool, a longer tenure, a bigger title — is fabrication, and it is the fastest way to lose an offer at the reference check.",
        ],
      },
      {
        heading: "How do you tailor a résumé, step by step?",
        steps: [
          { name: "Extract the requirements", text: "Copy the posting and list every stated requirement separately — responsibilities, must-haves and nice-to-haves. Mark each as required, preferred or implied." },
          { name: "Match each requirement to your evidence", text: "For each requirement, find the bullet in your own history that proves it. A skill named in a skills list is not evidence; a bullet describing work that used it is." },
          { name: "Sort into three buckets", text: "Strong match (a bullet says it), partial (a bullet is adjacent to it) and not evidenced (nothing says it). Be strict — this is the honest picture of your fit." },
          { name: "Reorder and re-weight", text: "Move the bullets that evidence required items to the top of each role. Shorten or drop bullets the posting does not care about — they stay in your master résumé, just not in this draft." },
          { name: "Reword in the posting's language", text: "If the posting says 'improve web performance' and your bullet says 'sped up the site', use their phrase. Keep every number exactly as you wrote it." },
          { name: "Choose a layout for the reader", text: "Applying through a job board or ATS? Use a single-column template. Sending directly to a hiring manager? A two-column or creative layout is fine." },
          { name: "Turn the gaps into a plan", text: "Everything in the not-evidenced bucket is what the interview will probe. Prepare an honest answer for each, and close the ones you can before the interview." },
        ],
      },
      {
        heading: "How much of a job description should my résumé match?",
        body: [
          "There is no pass mark, and anyone quoting one is guessing about a system they cannot see. A more useful number is requirement coverage: of everything the posting asks for, how much can your own résumé evidence?",
          "Roleform computes it as a weighted share — required items count three, preferred two, implied one; an evidenced requirement earns full credit and a partial one half. It tells you how complete your evidence is. It does not predict a callback, and you should distrust any tool that says its score does.",
        ],
      },
      {
        heading: "What should you never do when tailoring?",
        list: [
          "Add a tool, language or certification you have not used",
          "Stretch dates, merge two roles into one, or upgrade a title",
          "Invent a metric, or round a number into a bigger one",
          "Infer a skill from an adjacent one ('used React, so knows Next.js')",
          "Copy the posting's sentences into your résumé verbatim — use its words, not its claims",
        ],
      },
      {
        heading: "How long should tailoring take?",
        body: [
          "Done by hand, most of the time goes on the matching step — reading every requirement against every bullet. That is the part a tool can do in seconds. The part worth keeping human is the final read: checking that every line is still true and still sounds like you.",
        ],
      },
    ],
    faqs: [
      { q: "Should I tailor my résumé for every job?", a: "For any role you genuinely want, yes. The facts stay the same; the order and phrasing change so the most relevant evidence is read first. A generic résumé makes the reader do the matching, and most will not." },
      { q: "Is it okay to copy keywords from the job description?", a: "Use the posting's vocabulary to describe things you actually did — that is good practice. Adding a keyword for a skill you do not have is fabrication, and it tends to surface in the first technical interview." },
      { q: "What if I don't meet all the requirements?", a: "Almost nobody does. Apply if you can evidence most of the required items, leave the gaps off the résumé, and prepare an honest answer for each gap — what you would lean on instead, and what you are doing to close it." },
      { q: "Can AI tailor my résumé without making things up?", a: "Only if it is constrained to your own bullets. Roleform ties every generated line to the source bullet it came from, so a rewrite without a source cannot be produced; requirements you cannot evidence go to a gap list instead." },
    ],
    related: ["resume-keywords-from-job-description", "ats-friendly-resume", "resume-skill-gaps"],
  },
  {
    slug: "ats-friendly-resume",
    seoTitle: "What Makes a Resume ATS-Friendly? The 5 Structural Rules",
    title: "What makes a résumé ATS-friendly?",
    kicker: "Guide · ATS",
    description:
      "The five structural rules that decide whether an applicant tracking system can parse your resume, why two-column and creative layouts parse worse, and when to use them anyway.",
    answer:
      "An ATS-friendly résumé is one a parser can read in order: a single-column body, standard section headings, no tables or text boxes, contact details as plain body text, and no information carried only by an icon or colour. Meet all five and a layout parses reliably; each one broken adds risk.",
    updated: UPDATED,
    readMinutes: 6,
    sections: [
      {
        heading: "What is an ATS and why does layout matter?",
        body: [
          "An applicant tracking system stores applications and extracts text from each résumé into fields — name, contact, employers, dates, skills. Recruiters then search and filter on those fields. If the extraction scrambles your résumé, a recruiter searching for a skill you have may never see you.",
          "Extraction reads text in document order. Anything that breaks that order — side-by-side columns, floating boxes, text in headers or images — risks words landing in the wrong field or being dropped.",
        ],
      },
      {
        heading: "What are the five rules?",
        list: [
          "Single-column body flow — text reads top to bottom with no side-by-side columns",
          "Standard section headings — Experience, Education, Skills, Projects, Certifications",
          "No tables, text boxes or content in the page header or footer",
          "Contact details as body text, not in a graphic or header region",
          "No information conveyed only by an icon or colour — a skill bar or a phone glyph with no label is invisible to a parser",
        ],
        body: [
          "Roleform rates every template against exactly these five checks: all five met is High, one violation is Medium, two or more is Low. The rating is computed from the layout's structure, never assigned by hand.",
        ],
      },
      {
        heading: "Are two-column résumés bad for ATS?",
        body: [
          "They are riskier, not forbidden. A sidebar puts skills and contact details beside the body, and many parsers read across the page, interleaving the two columns. If you apply through a job board, prefer a single column. If you are emailing a hiring manager or handing over a printed copy, a two-column layout is easier for a human to skim and the parsing risk does not apply.",
        ],
      },
      {
        heading: "PDF or DOCX for applicant tracking systems?",
        body: [
          "Both work when the file contains real, selectable text. DOCX tends to extract more predictably in older systems because its structure — paragraphs and named styles — maps directly to fields. A PDF exported from a word processor is fine; a PDF that is a scanned image is not, because there is no text to extract.",
        ],
      },
      {
        heading: "Is there such a thing as an 'ATS score'?",
        body: [
          "Not one you can see. Each employer's system is configured differently and none of them publish how they rank candidates. A tool that gives you an 'ATS score' is scoring something of its own. What you can measure honestly is structure (the five rules above) and requirement coverage (how much of the posting your résumé evidences).",
        ],
      },
    ],
    faqs: [
      { q: "Do ATS systems reject résumés automatically?", a: "Most systems store every application; rejection is usually a person filtering search results or a knock-out question on the form. The real risk of a badly parsed résumé is not rejection but being invisible to a recruiter's search." },
      { q: "Can I use colour on an ATS-friendly résumé?", a: "Yes, as decoration. Colour becomes a problem only when it carries meaning on its own — a coloured dot for skill level, for example — because the parser cannot read it." },
      { q: "Which résumé templates are ATS-friendly?", a: "Single-column templates with standard headings. Roleform's Clean Slate, Broadsheet and Keystone all meet all five structural rules and rate High; its sidebar, timeline and editorial layouts rate Medium; its creative layouts rate Low." },
      { q: "Should I put my contact details in the header?", a: "Keep them in the body, just under your name. Some parsers skip the page header and footer entirely." },
    ],
    related: ["ats-resume-score", "tailor-resume-to-job-description", "resume-keywords-from-job-description"],
  },
  {
    slug: "resume-keywords-from-job-description",
    seoTitle: "How to Find Resume Keywords in a Job Description",
    title: "How to find the right résumé keywords in a job description",
    kicker: "Guide · Keywords",
    description:
      "Where resume keywords come from, which ones matter most, and how to use them in your bullets honestly — with a worked example.",
    answer:
      "The right résumé keywords are the specific skills, tools and responsibilities the job description names, especially in its requirements section and anywhere it repeats itself. Use the posting's exact phrasing inside bullets that describe work you actually did; a keyword with no evidence behind it helps nobody and fails the first interview.",
    updated: UPDATED,
    readMinutes: 5,
    sections: [
      {
        heading: "Where do résumé keywords come from?",
        body: [
          "From the posting itself. The strongest signals are the requirements list, the responsibilities list, and any term the posting repeats. A tool mentioned three times is a priority; a tool mentioned once under 'nice to have' is not.",
        ],
        steps: [
          { name: "Split the posting into requirements", text: "One requirement per line. Separate must-haves from nice-to-haves." },
          { name: "Normalise each one to a skill", text: "'Deep React experience; you understand rendering' is the skill React. 'We run strict mode everywhere' is TypeScript." },
          { name: "Count repetitions", text: "How often a skill appears across the posting is a good proxy for how much the role depends on it." },
          { name: "Find your evidence", text: "For each skill, find the bullet that proves it. No bullet, no keyword." },
          { name: "Rewrite in their words", text: "Replace your synonyms with the posting's terms inside those bullets." },
        ],
      },
      {
        heading: "Worked example",
        body: [
          "The posting says: 'A track record of improving web performance with real measurements.' Your bullet says: 'Sped up the dashboard from 4.1s to 1.8s.' The tailored bullet: 'Improved web performance on the dashboard, cutting load time from 4.1s to 1.8s, measured in real-user monitoring.' Same fact, same numbers, the posting's vocabulary.",
        ],
      },
      {
        heading: "Should I add a skills section full of keywords?",
        body: [
          "A skills section helps a parser and a skimming recruiter, so keep one — but order it to lead with the skills the posting asks for, and list only skills your bullets can back up. A keyword that appears in your skills list but nowhere in your experience reads as padding to a human and proves nothing to an interviewer.",
        ],
      },
    ],
    faqs: [
      { q: "How many keywords should a résumé have?", a: "There is no target count. Aim to evidence every required skill you genuinely have, in the posting's words, once in a bullet and once in the skills list." },
      { q: "Does keyword stuffing work?", a: "No. Hidden text and keyword lists are visible to anyone reading the parsed output, and a recruiter who spots it will discard the application." },
      { q: "Are soft skills keywords?", a: "Only when you can evidence them with an outcome — 'mentored three junior engineers' says 'mentoring' far better than the word 'leadership' does on its own." },
    ],
    related: ["tailor-resume-to-job-description", "ats-friendly-resume", "ats-resume-score"],
  },
  {
    slug: "ats-resume-score",
    seoTitle: "ATS Resume Score: What It Measures (and What It Can't)",
    title: "What an 'ATS résumé score' really measures",
    kicker: "Guide · Scoring",
    description:
      "Why no tool can see an employer's ATS score, what a resume match score can honestly measure instead, and how requirement coverage is calculated.",
    answer:
      "No outside tool can see an employer's ATS score: each company configures its own system and none publish how they rank. What a tool can honestly measure is requirement coverage — how much of a posting your own résumé evidences — and structural parseability. Treat any score that promises callbacks as marketing, not measurement.",
    updated: UPDATED,
    readMinutes: 5,
    sections: [
      {
        heading: "What is requirement coverage?",
        body: [
          "Requirement coverage is the share of a posting's requirements your résumé can prove. Roleform calculates it deterministically: each requirement is weighted — required 3, preferred 2, implied 1 — and earns full credit when a bullet evidences it, half when the evidence is partial, and none when it is absent. The score is the weighted credit as a percentage of the total weight.",
          "Because the formula is fixed, the same résumé and the same posting always produce the same number, and every point can be traced to a specific requirement and bullet.",
        ],
      },
      {
        heading: "Why is a score alone misleading?",
        body: [
          "A single number hides which requirements are missing. Two résumés can both score 60 — one missing a nice-to-have framework, the other missing the core language the job is built on. That is why a coverage score should always be shown next to its three buckets: strong match, partial evidence and not evidenced.",
        ],
      },
      {
        heading: "What a score cannot tell you",
        list: [
          "Whether a particular employer's system will rank you highly",
          "Whether you will get a callback or an interview",
          "Whether a higher number is a better application — coverage gained by exaggeration is worse than an honest gap",
        ],
      },
    ],
    faqs: [
      { q: "What is a good ATS score?", a: "There is no universal one, because the score an employer's system assigns is private. A useful self-check is requirement coverage: if you can evidence most of the required items, the résumé is doing its job." },
      { q: "Are free ATS checkers accurate?", a: "They are accurate about their own formula. None can reproduce a specific employer's configuration, so use them for structure and missing requirements, not as a prediction." },
      { q: "How do I raise my match score?", a: "Surface evidence you already have — reorder and reword bullets into the posting's language. If a requirement genuinely is not in your experience, the honest fix is to learn it, not to write it in." },
    ],
    related: ["ats-friendly-resume", "tailor-resume-to-job-description", "resume-skill-gaps"],
  },
  {
    slug: "resume-skill-gaps",
    seoTitle: "How to Handle Skill Gaps on Your Resume and in Interviews",
    title: "How to handle skill gaps on your résumé",
    kicker: "Guide · Skill gaps",
    description:
      "Find the requirements your resume can't evidence, decide which gaps matter, and prepare honest interview answers and a short learning plan to close them.",
    answer:
      "Handle a skill gap by leaving it off the résumé, ranking it by how much of the posting depends on it, and preparing an honest interview answer: what you have that is adjacent, and what you are doing to close it. Close the most important gap with a short, specific course before the interview if you can.",
    updated: UPDATED,
    readMinutes: 5,
    sections: [
      {
        heading: "How do you find your skill gaps for a job?",
        body: [
          "Match each requirement in the posting against your own bullets. Anything no bullet evidences is a gap; anything only adjacent — Pages Router when they ask for App Router — is a partial gap. The gaps are not a defect in your résumé; they are the most useful list you will get from the posting.",
        ],
      },
      {
        heading: "Which gaps matter most?",
        body: [
          "Rank by weight and repetition. A required skill mentioned several times is a gap the interview will probe directly; a nice-to-have mentioned once may not come up at all. Spend your preparation time in that order.",
        ],
      },
      {
        heading: "How do you answer an interview question about a gap?",
        steps: [
          { name: "Say plainly what you have and haven't done", text: "Interviewers respect a clear boundary far more than a vague stretch." },
          { name: "Lean on the adjacent evidence", text: "Point to the nearest thing you have shipped and why it transfers." },
          { name: "Name what you are doing about it", text: "A specific course, a small project, a date — concrete beats 'I'm a fast learner'." },
        ],
      },
      {
        heading: "Where should you learn to close a gap?",
        body: [
          "Prefer official documentation and well-known free courses, and start at the chapter that covers what the posting actually asks for rather than at page one. Roleform only recommends courses from a vetted catalog and never a generated link; where it has nothing vetted, it says so and points to a public roadmap instead.",
        ],
      },
    ],
    faqs: [
      { q: "Should I mention skills I'm currently learning?", a: "Yes, labelled honestly — 'currently learning GraphQL (course in progress)' in a skills or learning section is fine. Presenting it as experience is not." },
      { q: "Can I apply if I'm missing a required skill?", a: "Usually, yes, if you meet most of the other required items. Prepare the gap answer before the interview rather than hoping it won't come up." },
    ],
    related: ["interview-questions-from-job-description", "tailor-resume-to-job-description", "ats-resume-score"],
  },
  {
    slug: "interview-questions-from-job-description",
    seoTitle: "How to Predict Interview Questions From a Job Description",
    title: "How to predict interview questions from a job description",
    kicker: "Guide · Interview prep",
    description:
      "Turn a job posting into the technical, behavioural and gap questions you're likely to be asked, and prepare answers from your own experience.",
    answer:
      "Predict interview questions by turning each responsibility and requirement in the posting into a question: responsibilities become 'tell us about a time' behavioural questions, named tools become technical questions, the role's main system becomes a design question, and every requirement you can't evidence becomes a gap question you should expect.",
    updated: UPDATED,
    readMinutes: 5,
    sections: [
      {
        heading: "Which question families come from a job description?",
        list: [
          "Behavioural — from responsibilities ('Mentor two engineers' → 'Tell us about mentoring someone through a hard review')",
          "Technical — from named tools and practices ('strict TypeScript' → 'How would you migrate a codebase to strict mode?')",
          "System design — from the thing the role builds ('lead the dashboard rebuild' → 'Design a dashboard that stays fast with 50 widgets')",
          "Situational — from collaboration lines ('work with design' → 'Design wants a component the system lacks, due Friday')",
          "Gap — from requirements you cannot evidence ('What's your experience with the App Router?')",
        ],
      },
      {
        heading: "How should you prepare an answer?",
        steps: [
          { name: "Know why they are asking", text: "Tie the question back to the line in the posting it comes from." },
          { name: "Use a framework, not a script", text: "Situation, what you did, the measurable result. A memorised paragraph sounds memorised." },
          { name: "Pull from your own bullets", text: "Every answer should point at a specific thing on your résumé. If none exists, it is a gap question — answer it honestly." },
        ],
      },
    ],
    faqs: [
      { q: "How many interview questions should I prepare?", a: "Around a dozen covers most interviews: two or three per family, weighted toward the families the posting leans on, plus one for every significant gap." },
      { q: "Should I memorise answers?", a: "Memorise the structure and the numbers, not the sentences. You will be interrupted, and a framework survives interruption where a script does not." },
    ],
    related: ["resume-skill-gaps", "tailor-resume-to-job-description", "resume-keywords-from-job-description"],
  },
];

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/** Questions answered on the home page, mirrored in FAQPage JSON-LD. */
export const HOME_FAQS: { q: string; a: string }[] = [
  { q: "What is Roleform?", a: "Roleform is a résumé tailoring tool. Import your résumé once, paste a job description, and it returns up to eleven tailored résumés with computed ATS ratings, the interview questions the posting invites, and the skill gaps it exposes — using only your own experience." },
  { q: "Is Roleform free?", a: "Yes. The Free plan includes three analyses a month and two tailored résumés per analysis. Pro is ₹499 a month for all eleven templates, job search and more analyses; Ultra is ₹1,299 a month for coaches and career centres." },
  { q: "Does Roleform make up experience?", a: "No. Every generated bullet is tied to a bullet you wrote, and the only changes allowed are rewording, reordering and re-weighting. Requirements you can't evidence go on a gap list, not your résumé." },
  { q: "Is the match score an ATS score?", a: "No. It is requirement coverage — how much of the posting your résumé can evidence, weighted by how important each requirement is. No outside tool can see an employer's ATS score, and Roleform doesn't pretend to." },
  { q: "Are Roleform's résumé templates ATS-friendly?", a: "Each template's ATS rating is computed from five structural rules. Single-column templates rate High; sidebar and editorial layouts rate Medium; creative layouts rate Low, and are labelled that way so you choose knowingly." },
  { q: "What file formats can I download?", a: "Every tailored résumé downloads as DOCX and PDF, with real selectable text." },
];
