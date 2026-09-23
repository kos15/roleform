# Search & AI visibility strategy

*Last updated 2026-09-23. Owner: whoever ships `lib/seo/` or `lib/content/guides.ts`.*

Goal: Roleform ranks for résumé searches ("tailor resume to job description", "ATS friendly
resume", "resume keywords", "resume templates ATS"), and answer engines — ChatGPT, Gemini,
Claude, Perplexity, Copilot, Google AI Overviews — know Roleform exists, describe it correctly,
and can read or operate the site on a user's behalf.

---

## 1. How does an AI assistant know a business exists?

An assistant learns about you in exactly three ways. Everything in this plan feeds one of them.

| Channel | What it is | Who uses it | How Roleform feeds it |
|---|---|---|---|
| **Training data** | Web text crawled months before a model is released | Every model's built-in knowledge | Crawlable public pages; AI crawlers explicitly allowed in `robots.txt`; being mentioned on *other* sites (the biggest lever — see §4) |
| **Live search (retrieval)** | The assistant searches the web at question time and cites what it finds | ChatGPT search (Bing + OpenAI's index), Gemini & AI Overviews (Google index), Copilot (Bing), Perplexity (own index), Claude (Brave) | Being indexed and ranking in **Google and Bing**; pages whose first paragraph answers the question; FAQ/HowTo structure; freshness |
| **Agents browsing the site** | An agent opens the site to read, compare or act | ChatGPT agent, Gemini in Chrome, Claude for Chrome, Perplexity Comet | `llms.txt`, Markdown mirrors, server-rendered HTML, WebMCP tools, semantic HTML |

Two consequences:

1. **Classic SEO is still the foundation.** Gemini/AI Overviews read Google's index; ChatGPT
   and Copilot lean on Bing's. If you aren't indexed in both, you can't be retrieved.
2. **Your own site is necessary but not sufficient.** Models recommend what the *web* agrees on.
   Third-party mentions (reviews, Reddit threads, directories, articles) decide whether you're
   *recommended*, not just cited.

---

## 2. What is implemented (this repo)

### Classic technical SEO
- **Canonical origin** in `lib/seo/site.ts` (`NEXT_PUBLIC_APP_URL` → Vercel production URL → `https://roleform.koustubh.org`).
- **Metadata on every public page** (`lib/seo/metadata.ts`): query-shaped `<title>` (under 60
  characters), a description of about 155 characters, canonical URL, Open Graph + Twitter card and a
  Markdown alternate link. The home page title is *"Roleform — Tailor your resume to any job
  description"*.
- **`/sitemap.xml`** (`app/sitemap.ts`): all public pages and every guide.
- **`/robots.txt`** (`app/robots.ts`): open to all crawlers, with the AI search and assistant
  crawlers named explicitly (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot,
  PerplexityBot, Google-Extended, Bingbot, Applebot-Extended, …). The signed-in app is disallowed:
  those pages are users' résumés (N7), and the `(app)`/`(auth)` layouts also send `noindex`.
- **Share image** (`app/opengraph-image.tsx`), **icon** (`app/icon.svg`) and a **web manifest**.
- **Search Console / Bing Webmaster verification** via `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`
  and `NEXT_PUBLIC_BING_SITE_VERIFICATION`.
- **IndexNow** (`/indexnow.txt` + `pnpm seo:indexnow`): instant re-crawl requests to Bing,
  which grounds Copilot and ChatGPT search.
- **Content renders without JavaScript.** The marketing `loading.tsx` skeletons were removed:
  they made non-JS crawlers and agents see placeholders instead of text.

### Content that matches searches (topical cluster)
- **`/guides`**: six guides, each aimed at a high-intent query and its likely "fan-out" related
  queries:
  - how to tailor a resume to a job description
  - what makes a resume ATS-friendly
  - resume keywords from a job description
  - ATS resume score (what it measures)
  - skill gaps on a resume
  - predicting interview questions from a job description
- **`/templates`**: all 11 templates with their *computed* ATS rating and the rules each breaks.
  It targets "ATS friendly resume templates".
- **Home page FAQ**: six visible Q&As, mirrored in FAQPage JSON-LD.
- Every guide **opens with a 40–60 word answer block** (the passage answer engines quote), uses
  question-shaped H2s, shows an *Updated* date, and ends with FAQs and internal links.
- **No invented statistics.** Every number is one the product computes: coverage weights 3/2/1, the
  five ATS rules, plan caps. This is original first-party methodology, which is the kind of content
  engines prefer to cite.

### Structured data (JSON-LD, `lib/seo/schema.ts`)
| Page | Types |
|---|---|
| Home | Organization, WebSite, SoftwareApplication (with the three plans as Offers in INR), FAQPage |
| Pricing | SoftwareApplication + Offers, BreadcrumbList |
| Guides | Article, FAQPage, HowTo (where the guide has steps), BreadcrumbList |
| Templates | ItemList (11 templates with ratings), FAQPage, BreadcrumbList |
| How it works / Privacy / Terms | WebPage, BreadcrumbList, HowTo (the four stages) |

All values are read from the same modules the page renders (plans, ratings, guides), so the
markup cannot contradict the visible page.

### AI-readable layer (for ChatGPT, Claude, Perplexity and agents)
- **`/llms.txt`**: llmstxt.org-format summary: definition, key facts (category, audience, input,
  output, pricing, principles, privacy) and links to every page's Markdown.
- **`/llms-full.txt`**: the entire public site in one Markdown file.
- **Markdown mirror of every public page**, available three ways:
  - `/<path>.md`, e.g. `/pricing.md`, `/templates.md`, `/guides/ats-friendly-resume.md`, `/index.md`
  - the normal URL requested with `Accept: text/markdown` (content negotiation in `middleware.ts`)
  - a `Link: <…md>; rel="alternate"; type="text/markdown"` header, plus a `<link rel="alternate">`
    tag, on every HTML page
- **`/pricing.md`**: machine-readable plans, caps and top-ups, so an agent comparing tools can
  read Roleform's pricing without rendering the page.

### Agent-actionable layer (WebMCP)
`components/agent-tools.tsx` registers tools through `navigator.modelContext` in browsers that
support WebMCP. It does nothing in browsers that don't.

| Tool | What it does |
|---|---|
| `get_roleform_overview` | Returns `llms.txt` |
| `read_roleform_page` | Returns any public page as Markdown |
| `get_roleform_pricing` | Returns `/pricing.md` |
| `list_resume_templates` | Returns the template ratings |
| `start_resume_tailoring` | Navigates to `/analyze` (sign-in first if needed) |
| `open_roleform_page` | Navigates to a path |

The contact form carries declarative WebMCP attributes (`toolname="send_roleform_message"`).
The design choice: agents can read and navigate, but **a person completes every consequential
step** (sign-in, checkout, saving a profile, sending the form).

---

## 3. Launch checklist (needs you — accounts, not code)

Do these in the first week after deploying. They are what turns "crawlable" into "indexed".

1. **Set `NEXT_PUBLIC_APP_URL=https://roleform.koustubh.org`** in Vercel production.
2. **Google Search Console**: add the domain property (DNS TXT via Cloudflare) or use the
   HTML-tag token in `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`. Submit `/sitemap.xml`. Use URL
   Inspection → *Request indexing* on `/`, `/templates`, `/guides` and each guide.
3. **Bing Webmaster Tools**: import from Search Console (one click) or use
   `NEXT_PUBLIC_BING_SITE_VERIFICATION`. Submit the sitemap. *This is the ChatGPT-search and
   Copilot pipeline — don't skip it.*
4. **IndexNow**: generate a key (`openssl rand -hex 16`), set `INDEXNOW_KEY` in Vercel, deploy,
   then run `pnpm seo:indexnow` after each content release.
5. **Check crawler access**: make sure Cloudflare/Vercel bot protection is not challenging
   GPTBot, ClaudeBot, PerplexityBot or Bingbot. Many setups block them by default.
6. **Run an agent-readiness check** before and after launch: `npx is-agentic roleform.koustubh.org`
   or frase.io/tools/agent-readiness. Fix whatever fails.
7. **Validate structured data**: search.google.com/test/rich-results on `/`, `/templates` and a
   guide.

---

## 4. Off-site presence (the recommendation lever)

Assistants cite your site but *recommend* what the wider web agrees on. Build a portfolio, not a
single channel:

- **Product listings**: Product Hunt launch, AlternativeTo, G2, Capterra, SaaSHub, There's An AI
  For That, Futurepedia. Use the same one-sentence definition everywhere (`SITE_DEFINITION` in
  `lib/seo/site.ts`) so every source describes the product consistently.
- **Entity data**: create a Wikidata item for Roleform (instance of: software / web
  application; official website; founded 2026; country India), and a LinkedIn company page. These
  feed Google's Knowledge Graph, which Gemini reads.
- **Communities** (genuine participation, not spam): r/resumes, r/jobs, r/cscareerquestions,
  r/developersIndia, Indie Hackers, Hacker News "Show HN". Answer real questions; link a guide only
  when it actually answers the question.
- **YouTube**: a short walkthrough per guide ("tailor your resume to a job description in 3
  minutes"). Write full descriptions, chapters and accurate captions — models read the text around
  a video, not the video itself.
- **Earned mentions**: pitch "honest résumé tools" roundups and career blogs. The
  *no-fabrication* and *no-fake-ATS-score* stance is the story, and it stands out.
- **Career centres and coaches** (the Ultra audience): a mention on a university careers page is a
  high-authority link and a trusted source for models.

---

## 5. Content roadmap

Publish one or two pieces a month, each built on the product's own rules. Never publish
AI-generated filler — thin content at scale is a Google spam-policy risk.

| Next pieces | Target query |
|---|---|
| Résumé vs CV in India / UK / US | "resume vs cv" |
| How to write résumé bullet points with numbers | "resume bullet points examples" |
| Résumé for a career change | "career change resume" |
| Fresher résumé for tech roles (India) | "fresher resume" |
| Comparison: Roleform vs generic AI résumé builders | "best ai resume builder" (honest comparison table) |
| Role-specific tailoring guides (frontend, data analyst, product manager…) | "[role] resume" |

Refresh each guide's `updated` date only when its content actually changes.

---

## 6. Measuring it

- **Google Search Console / Bing Webmaster**: impressions and clicks for the target queries;
  index coverage for every sitemap URL.
- **Monthly AI check** (manual, about 30 minutes): ask ChatGPT, Gemini, Claude, Perplexity and
  Copilot these questions and log whether Roleform is cited or recommended, and which competitors
  are:
  - "best tool to tailor my resume to a job description"
  - "ATS friendly resume templates"
  - "what is Roleform"
- **Referral traffic** from chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com and
  claude.ai in analytics.
- Paid trackers if budget allows: Otterly, Peec AI, ZipTie.

Realistic timeline: indexing takes days to weeks; ranking for competitive résumé queries takes
months and depends mostly on §4. Answer engines with live search can start citing a well-structured
page within days of it being indexed.
