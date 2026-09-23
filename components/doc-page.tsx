import Link from "next/link";
import { DOCS, type Doc } from "@/lib/content/docs";

/**
 * One renderer for all three written documents. They differ in words, not in
 * shape, and giving each its own layout would only mean three places to fix the
 * measure.
 *
 * Each section is a row: the heading hangs on the left, the prose runs on the
 * right, and they stack when there isn't room for both. A heading written as
 * "01 · Reading the posting" has its number pulled out into a marigold numeral
 * — the stages are a sequence, and the number is the fastest way to say so.
 */
export function DocPage({ doc }: { doc: Doc }) {
  const others = (Object.keys(DOCS) as (keyof typeof DOCS)[]).filter((k) => k !== doc.slug);
  // Privacy's lists are refusals, so they sit on the pink; the others on marigold.
  const listTint =
    doc.slug === "privacy" ? "bg-[var(--color-sage-200)]" : "bg-[var(--color-accent-100)]";

  return (
    <article>
      <div className="mb-[clamp(2.5rem,5vw,4.5rem)] max-w-[64ch]">
        <p className="eyebrow mb-3.5">{doc.kicker}</p>
        <h1 className="mb-5">{doc.title}</h1>
        <p className="text-lg leading-relaxed text-[var(--color-text-muted)]">{doc.intro}</p>
      </div>

      <div className="flex flex-col">
        {doc.sections.map((section) => {
          const numbered = /^(\d\d) · (.*)$/.exec(section.heading);
          return (
            <section
              key={section.heading}
              className="grid gap-x-[clamp(1.5rem,4vw,4rem)] gap-y-[18px] border-t border-[var(--color-line)] py-[clamp(1.5rem,3vw,2.25rem)] [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]"
            >
              <div className="flex items-baseline gap-4">
                {numbered ? (
                  <span className="display text-[clamp(2.5rem,4vw,3.5rem)] leading-[0.9] text-[var(--color-accent-600)]">
                    {numbered[1]}
                  </span>
                ) : null}
                <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] leading-none">
                  {numbered ? numbered[2] : section.heading}
                </h2>
              </div>

              <div className="flex max-w-[62ch] flex-col gap-3.5">
                {section.body?.map((para) => (
                  <p key={para} className="text-[16.5px] leading-[1.65]">
                    {para}
                  </p>
                ))}

                {section.list?.length ? (
                  <ul className="flex flex-col gap-2">
                    {section.list.map((item) => (
                      <li
                        key={item}
                        className={`flex items-start gap-3 rounded-[var(--radius-sm)] px-3.5 py-[11px] text-[15px] font-semibold leading-[1.55] ${listTint}`}
                      >
                        <span
                          aria-hidden
                          className="mt-[7px] h-2 w-2 flex-none rounded-[var(--radius-pill)] bg-[var(--color-sage-600)]"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--color-line)] pt-7">
        <span className="eyebrow mr-1.5">Also read</span>
        {others.map((slug) => (
          <Link key={slug} href={`/${slug}`} className="btn btn-secondary btn-sm no-underline">
            {DOCS[slug].kicker}
          </Link>
        ))}
        <Link href="/analyze" className="btn btn-primary btn-sm no-underline">
          Open Roleform
        </Link>
      </div>
    </article>
  );
}
