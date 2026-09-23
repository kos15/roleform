import { llmsTxt } from "@/lib/seo/markdown";

/** llmstxt.org index: what Roleform is and where an AI agent should read. */
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=3600" },
  });
}
