/**
 * Questions and answers rendered as plain, visible text — the same pairs the
 * page's FAQPage JSON-LD carries. Visible on purpose: structured data that
 * describes content the reader can't see is a guideline violation, and an
 * agent reading the accessibility tree should find the answers too.
 */
export function FaqList({ faqs, title = "Frequently asked questions" }: {
  faqs: { q: string; a: string }[];
  title?: string;
}) {
  return (
    <section aria-labelledby="faq-heading" className="mt-[clamp(3rem,6vw,4.5rem)]">
      <h2 id="faq-heading" className="mb-6 text-[clamp(2rem,4vw,3rem)] leading-none">
        {title}
      </h2>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr))]">
        {faqs.map((f) => (
          <div key={f.q} className="rounded-[22px] bg-[var(--color-bg-raised)] px-6 py-5">
            <h3 className="mb-2 text-[17px]">{f.q}</h3>
            <p className="text-[15px] leading-relaxed text-[var(--color-text-muted)]">{f.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
