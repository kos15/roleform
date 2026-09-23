/**
 * IndexNow key file. Bing (which grounds Copilot and ChatGPT search), Yandex,
 * Seznam and Naver accept instant "this URL changed" pings from sites that can
 * prove ownership with this key; scripts/indexnow.ts sends them.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) return new Response("Not configured\n", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
