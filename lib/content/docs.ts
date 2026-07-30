/**
 * The three written documents: how it works, privacy, terms (F12).
 *
 * Content, not code — but it lives in the repo rather than a CMS because every
 * one of these pages is a promise the code has to keep, and a promise you can
 * change without a diff is not a promise. When §3's fabrication boundary moves,
 * "What we can't tell you" moves in the same commit.
 *
 * Each section is prose, an explicit list, or both. The list is used for the
 * refusals — the things a stage will not do — because a refusal buried in a
 * paragraph reads as hedging, and these are the load-bearing sentences.
 */

export interface DocSection {
  heading: string;
  body?: string[];
  list?: string[];
}

export interface Doc {
  slug: DocSlug;
  kicker: string;
  title: string;
  intro: string;
  sections: DocSection[];
}

export type DocSlug = "how-it-works" | "privacy" | "terms";

export const DOCS: Record<DocSlug, Doc> = {
  "how-it-works": {
    slug: "how-it-works",
    kicker: "How it works",
    title: "Four stages, and what each one refuses to do",
    intro:
      "Roleform is a pipeline, not a chatbot. Each stage has one job, states plainly what it will not do, and hands its output to the next. A stage that fails stops there — we resume rather than restart.",
    sections: [
      {
        heading: "01 · Reading the posting",
        body: [
          "We pull the title, the responsibilities and every stated requirement out of the document. Nothing is matched or rewritten yet.",
        ],
        list: [
          "Won't guess at requirements the posting doesn't state",
          "Won't infer seniority from tone — only from what's written",
        ],
      },
      {
        heading: "02 · Matching against your profile",
        body: [
          "Every requirement is checked against your own words. A requirement counts as evidenced only when one of your bullets actually says it — otherwise it lands in partial or not evidenced.",
        ],
        list: [
          "Won't treat a skills-list mention as evidence of doing the work",
          "Won't call the result an ATS score; it is requirement coverage, and no employer's system produced it",
        ],
      },
      {
        heading: "03 · Rewriting your résumé",
        body: [
          "Your bullets are reordered, reworded and re-weighted against the posting, then rendered into six templates. Every generated line keeps a key back to the bullet you wrote.",
        ],
        list: [
          "Won't invent a job, a number, a date or a tool",
          "Won't inflate a claim past the proficiency you set on your profile",
        ],
      },
      {
        heading: "04 · Preparing questions and courses",
        body: [
          "We draw the questions this posting invites, grouped by family, and match what you can't evidence to a vetted course catalog.",
        ],
        list: [
          "Won't pad an empty question family to make a tab look full",
          "Won't link a course we haven't checked — where we have nothing, we say so",
        ],
      },
      {
        heading: "What we can't tell you",
        body: [
          "Whether you'll get an interview. Coverage measures how much of a posting your profile can evidence today — it isn't a prediction, and it says nothing about how a particular employer screens.",
        ],
      },
    ],
  },

  privacy: {
    slug: "privacy",
    kicker: "Privacy",
    title: "Your résumé is the product, so we hold it carefully",
    intro:
      "Short version: your profile and the postings you paste are yours, they are not training data, and you can delete everything in one action.",
    sections: [
      {
        heading: "What we store",
        body: [
          "Your profile — the corpus every tailored résumé draws from. The postings you analyse, so a run can resume rather than restart. The outputs of each run, until you delete them.",
          "Your email address is stored as a hash, not as an address. It exists to de-duplicate an account, and it cannot be read back.",
        ],
      },
      {
        heading: "What we never do",
        list: [
          "Train models on your résumé, your postings or your drafted answers",
          "Sell or broker your profile to recruiters — there is no recruiter side of this product",
          "Put affiliate links in the course catalog",
          "Write your résumé, your postings or your answers into a log, a trace or an error report",
        ],
      },
      {
        heading: "Who can see what",
        body: [
          "Workspace admins see your usage counts and can set your generation caps. They cannot read your profile, your résumés, your drafted answers or the postings you analysed — not as a matter of policy, but because the row-level security policy keyed to your account does not admit them.",
        ],
      },
      {
        heading: "Retention and deletion",
        body: [
          "Analyses are kept until you delete them. Deleting your account removes the profile, every analysis and every rendered résumé within 30 days, including from backups. The deletion runs from your profile page and does not need a support request.",
        ],
      },
      {
        heading: "Where it runs",
        body: [
          "Data is processed and stored in one region, and generated documents are served from private storage behind signed, expiring URLs. Sub-processors are listed on request.",
        ],
      },
    ],
  },

  terms: {
    slug: "terms",
    kicker: "Terms",
    title: "The short, readable version",
    intro:
      "Plain terms for a tool that writes about your working life. The full legal text is available on request and says the same thing at greater length.",
    sections: [
      {
        heading: "What you're responsible for",
        body: [
          "Every claim on a résumé you send out is yours. We reorder and reword what you wrote; we do not verify it. Check the output before you send it.",
        ],
      },
      {
        heading: "What we're responsible for",
        body: [
          "Running the pipeline as described, keeping your profile private, and being honest about failure — including telling you which stage broke and what still works.",
        ],
      },
      {
        heading: "Fair use",
        body: [
          "Caps exist so one workspace cannot exhaust the pipeline. If you hit one, the refusal names the cap and the admin who can raise it. We won't throttle you silently.",
        ],
      },
      {
        heading: "Cancellation",
        body: [
          "Cancel at any time and keep read access to your existing analyses for 30 days. No retention offers, no exit interview.",
        ],
      },
      {
        heading: "Changes to these terms",
        body: [
          "Material changes come with 30 days' notice and a summary of what changed — not a re-accept dialog with no diff.",
        ],
      },
    ],
  },
};
