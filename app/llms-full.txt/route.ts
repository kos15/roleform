import { llmsFullTxt } from "@/lib/seo/markdown";
import { loadPlans } from "@/lib/plans/catalog";

/** Every public page's Markdown in one request, so an agent needn't crawl. */
/** Five minutes, not build-time: it carries the live plan catalog (F31). */
export const revalidate = 300;

export async function GET() {
  return new Response(llmsFullTxt(await loadPlans()), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=3600" },
  });
}
