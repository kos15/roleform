import { markdownFor, markdownPaths } from "@/lib/seo/markdown";
import { absoluteUrl } from "@/lib/seo/site";

/**
 * Markdown mirror of a public page. Reached by rewrite from `/<path>.md` and
 * from any public URL requested with `Accept: text/markdown` (middleware.ts),
 * so agents fetch compact text instead of parsing the rendered page.
 */
export const dynamic = "force-static";

export async function GET(_request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const pagePath = `/${(path ?? []).join("/")}`;
  const body = markdownFor(pagePath);
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
