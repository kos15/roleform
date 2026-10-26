/**
 * Tell IndexNow-enabled engines (Bing → Copilot and ChatGPT search, Yandex,
 * Seznam, Naver) that every public URL has changed. Run after a deploy that
 * changes content:
 *
 *   INDEXNOW_KEY=… NEXT_PUBLIC_APP_URL=https://roleform.koustubh.org pnpm seo:indexnow
 *
 * The key must also be set on the deployment so /indexnow.txt can serve it.
 */
import { GUIDES } from "@/lib/content/guides";
import { PUBLIC_PAGES, SITE_URL, absoluteUrl } from "@/lib/seo/site";

async function main() {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) throw new Error("Set INDEXNOW_KEY (8–128 hex characters) first.");

  const urlList = [
    ...PUBLIC_PAGES.map((p) => absoluteUrl(p.path)),
    ...GUIDES.map((g) => absoluteUrl(`/guides/${g.slug}`)),
  ];

  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(SITE_URL).host,
      key,
      keyLocation: absoluteUrl("/indexnow.txt"),
      urlList,
    }),
  });
  console.log(`IndexNow: ${response.status} ${response.statusText} for ${urlList.length} URLs`);
  if (!response.ok && response.status !== 202) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
