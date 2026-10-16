import { markdownFor, markdownPaths } from "@/lib/seo/markdown";
import { absoluteUrl } from "@/lib/seo/site";
import { loadPlans } from "@/lib/plans/catalog";

/**
 * Markdown mirror of a public page. Reached by rewrite from `/<path>.md` and
 * from any public URL requested with `Accept: text/markdown` (middleware.ts),
 * so agents fetch compact text instead of parsing the rendered page.
 */
// Regenerated every five minutes rather than frozen at build: /pricing's
// mirror quotes the live plan catalog an admin can edit (F31), and saving a
// plan also revalidates this path directly.
export const revalidate = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const pagePath = `/${(path ?? []).join("/")}`;
  const body = markdownFor(pagePath, await loadPlans());
  if (!body) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain" } });

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      Vary: "Accept",
      // The HTML page is the canonical document; this is its alternate.
      Link: `<${absoluteUrl(pagePath)}>; rel="canonical"`,
      "X-Robots-Tag": "noindex",
    },
  });
}

export function generateStaticParams() {
  return markdownPaths().map((p) => ({ path: p === "/" ? [] : p.slice(1).split("/") }));
}
