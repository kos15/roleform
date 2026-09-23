import { llmsFullTxt } from "@/lib/seo/markdown";

/** Every public page's Markdown in one request, so an agent needn't crawl. */
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsFullTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=3600" },
  });
}
