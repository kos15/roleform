import Link from "next/link";
import { Bullet, PageIntro } from "@/components/page-intro";
import type { Doc } from "@/lib/content/docs";

/**
 * One renderer for all three written documents. They differ in words, not in
 * shape, and giving each its own layout would only mean three places to fix the
 * measure.
 */
export function DocPage({ doc }: { doc: Doc }) {
  return (
    <article className="mx-auto w-full max-w-[760px] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.75rem,5vw,3.5rem)] pb-16">
      <PageIntro kicker={doc.kicker} title={doc.title}>
        {doc.intro}
      </PageIntro>

      <div className="mt-8 flex flex-col gap-6">
        {doc.sections.map((section) => (
          <section
            key={section.heading}
            className="border-t border-[var(--color-line)] pt-6"
          >
            <h3 className="mb-2.5">{section.heading}</h3>

            {section.body?.length ? (
              <div className="flex flex-col gap-2.5">
                {section.body.map((para) => (
                  <p
                    key={para}
                    className="text-[0.95rem] leading-[1.7] text-[var(--color-text-muted)]"
                  >
                    {para}
                  </p>
                ))}
              </div>
            ) : null}

            {section.list?.length ? (
              <div className="mt-3 flex flex-col gap-2">
                {section.list.map((item) => (
                  <Bullet key={item}>{item}</Bullet>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>

      <div className="mt-9 flex flex-wrap gap-2">
        <Link href="/analyze" className="btn btn-primary no-underline">
          Start an analysis
        </Link>
        <Link href="/contact" className="btn btn-ghost no-underline">
          Ask us something
        </Link>
      </div>
    </article>
  );
}
