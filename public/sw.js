/*
 * Roleform service worker (F29, F29.2). Three jobs, nothing more:
 *
 *   1. Make the app installable and give it a page to show offline.
 *   2. Receive pushes and ALWAYS show one — also when the app is closed: the
 *      browser wakes this worker for each push, and a push that shows nothing
 *      is one Safari and Chrome count against the site (userVisibleOnly).
 *   3. Open the right page when a notification is tapped — an in-app path,
 *      checked here again, whatever the payload says.
 *
 * What it deliberately does NOT do is cache signed-in pages or API answers. A
 * page under /analysis or /profile is someone's résumé; a copy left in Cache
 * Storage on a shared phone would outlive sign-out. Navigations always go to
 * the network, and only the offline page and public, content-hashed static
 * assets are ever cached.
 *
 * Updates: navigations are never served from cache and static assets are
 * content-hashed, so a new worker can take over at once (skipWaiting) without
 * a page ever mixing old and new HTML. /sw.js itself is served no-cache
 * (next.config.ts) so browsers find a new version on the next navigation.
 */

const VERSION = "rf-v4";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";
/** Hashed chunks pile up across deploys; keep the newest this many. */
const STATIC_LIMIT = 150;
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/badge-96.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - STATIC_LIMIT;
  for (let i = 0; i < extra; i += 1) await cache.delete(keys[i]);
}

/** Public and safe to keep: a same-origin 200 nobody marked private. */
function cacheable(response) {
  if (!response || !response.ok || response.type !== "basic") return false;
  const cc = response.headers.get("Cache-Control") || "";
  return !/no-store|private/i.test(cc);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network only, offline page when the network is gone.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Build output under /_next/static is content-hashed and public — safe to
  // keep, and it is what makes a relaunch of the installed app feel instant.
  // Nothing else is touched: /api, RSC payloads and pages pass straight through.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (cacheable(response)) {
          event.waitUntil(cache.put(request, response.clone()).then(() => trim(cache)));
        }
        return response;
      }),
    );
  }
});

/**
 * Only ever an in-app path on this origin; anything else opens the profile.
 * Same rule as lib/domain/push.ts#inAppPath: one leading "/", never "//",
 * never a backslash ("/\evil.com" parses as "//evil.com"), no control
 * characters, never /api, and it must resolve to this origin.
 */
const FALLBACK_PATH = "/profile";
function safePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return FALLBACK_PATH;
  if (value[0] !== "/" || value.startsWith("//") || value.includes("\\")) return FALLBACK_PATH;
  if (/[\u0000-\u001f\u007f]/.test(value)) return FALLBACK_PATH;
  let url;
  try {
    url = new URL(value, self.location.origin);
  } catch {
    return FALLBACK_PATH;
  }
  if (url.origin !== self.location.origin) return FALLBACK_PATH;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return FALLBACK_PATH;
  return url.pathname + url.search + url.hash;
}

function readPayload(event) {
  if (!event.data) return {};
  try {
    const parsed = event.data.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function text(value, max, fallback) {
  return typeof value === "string" && value.trim() ? value.slice(0, max) : fallback;
}

self.addEventListener("push", (event) => {
  const data = readPayload(event);
  const title = text(data.title, 120, "Roleform");
  const options = {
    body: text(data.body, 240, "Open Roleform to see what's new."),
    icon: "/icons/icon-192.png",
    // Android paints the status-bar badge from alpha alone: a white
    // silhouette shows the mark, a full-colour icon shows a blank square.
    badge: "/icons/badge-96.png",
    tag: typeof data.tag === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(data.tag) ? data.tag : "roleform",
    renotify: true,
    timestamp: Date.now(),
    data: { url: safePath(data.url) },
  };
  // Always show something: if the platform rejects an option, fall back to
  // the bare minimum rather than leave the push unshown.
  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .catch(() => self.registration.showNotification("Roleform", { body: options.body, data: options.data })),
  );
});

// Push services rotate endpoints. Re-subscribe at once with the same key so
// the device keeps receiving; the next app open hands the server the new
// endpoint and the old one it replaces (components/push-sync.tsx).
self.addEventListener("pushsubscriptionchange", (event) => {
  const options = event.oldSubscription && event.oldSubscription.options;
  if (!options) return;
  event.waitUntil(self.registration.pushManager.subscribe(options).catch(() => undefined));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.url);
  const target = new URL(path, self.location.origin).href;
  // A signed-out tap lands on sign-in with this path as redirect_url
  // (middleware.ts → Clerk), and the page itself still checks the member owns
  // what it shows: the link is a destination, never an authorisation.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin || !("focus" in client)) continue;
        const focused = await client.focus();
        if (focused && "navigate" in focused) {
          const moved = await focused.navigate(target).catch(() => null);
          if (moved) return moved;
        }
        break;
      }
      return self.clients.openWindow(target);
    }),
  );
});
