/**
 * Structured data for search engines and answer engines. Server-rendered into
 * the initial HTML so crawlers that never run JavaScript still read it.
 * `<` is escaped so a string in the data can never close the script tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
