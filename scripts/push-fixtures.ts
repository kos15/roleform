/**
 * F29.2 — push delivery, checked by hand against fixtures.
 *
 * Not a test suite (CLAUDE.md §11): the same "sanity-check by hand, written
 * down" as `check:jobs`. Covers the pure half of the outbox (which answers to
 * retry, when, and for how long), the service worker's own push and click
 * handlers (run in a sandbox with a fake `self`), the manifest and the icon
 * files the phones read. No database, no network, no phone.
 *
 *   pnpm check:push
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  MAX_ATTEMPTS,
  PushPayloadSchema,
  categoryAllowed,
  classify,
  inAppPath,
  nextAttempt,
  parseRetryAfter,
  topicFor,
  ttlSeconds,
} from "../lib/domain/push";
import { discreetReminderCopy, reminderCopy } from "../lib/domain/reminders";
import manifest from "../app/manifest";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const NOW = new Date("2026-10-16T10:00:00Z");
const HOUR = 3600_000;

/* ------------------------------------------------------------- the service worker */

interface Shown {
  title: string;
  options: Record<string, unknown>;
}

function loadWorker(origin = "https://roleform.koustubh.org") {
  const listeners = new Map<string, (event: unknown) => void>();
  const shown: Shown[] = [];
  const opened: string[] = [];
  let rejectNext = false;
  const self = {
    location: { origin },
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        if (rejectNext) {
          rejectNext = false;
          return Promise.reject(new TypeError("unsupported option"));
        }
        shown.push({ title, options });
        return Promise.resolve();
      },
      pushManager: { subscribe: () => Promise.resolve({}) },
    },
    clients: {
      matchAll: () => Promise.resolve([]),
      openWindow: (url: string) => {
        opened.push(url);
        return Promise.resolve(null);
      },
    },
    skipWaiting: () => Promise.resolve(),
  };
  const context = vm.createContext({ self, URL, caches: {}, fetch, Promise, console });
  vm.runInContext(readFileSync("public/sw.js", "utf8"), context);
  const safePath = vm.runInContext("safePath", context) as (v: unknown) => string;

  const fire = async (type: string, event: Record<string, unknown>) => {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)!({ ...event, waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
  };
  return {
    safePath,
    shown,
    opened,
    failNextShow: () => (rejectNext = true),
    push: (data: unknown) =>
      fire("push", {
        data:
          data === undefined
            ? null
            : {
                json: () => (typeof data === "string" ? JSON.parse(data) : data),
              },
      }),
    click: (url: unknown) =>
      fire("notificationclick", { notification: { close: () => undefined, data: { url } } }),
  };
}

async function main() {
  console.log("in-app paths (server and service worker agree)");
  const worker = loadWorker();
  const cases: [string, string | null][] = [
    ["/analysis/abc/prep", "/analysis/abc/prep"],
    ["/analysis/abc/prep?family=dsa#q1", "/analysis/abc/prep?family=dsa#q1"],
    ["//evil.com", null],
    ["/\\evil.com", null],
    ["https://evil.com/x", null],
    ["javascript:alert(1)", null],
    ["/api/cron/reminders", null],
    ["/api", null],
    ["/profile\nx", null],
    ["", null],
    ["analysis/abc", null],
  ];
  for (const [input, expected] of cases) {
    await check(`${JSON.stringify(input)} → ${expected ?? "refused"}`, () => {
      assert.equal(inAppPath(input), expected);
      assert.equal(worker.safePath(input), expected ?? "/profile");
    });
  }
  await check("non-strings refused", () => {
    assert.equal(inAppPath(42), null);
    assert.equal(worker.safePath({ url: "/x" }), "/profile");
  });

  console.log("service worker push");
  await check("a well-formed push shows its own title, body and path", async () => {
    const w = loadWorker();
    await w.push({ title: "Interview reminder", body: "In 1 hour", url: "/analysis/a/prep", tag: "round-1" });
    assert.equal(w.shown.length, 1);
    assert.equal(w.shown[0].title, "Interview reminder");
    assert.equal((w.shown[0].options.data as { url: string }).url, "/analysis/a/prep");
    assert.equal(w.shown[0].options.tag, "round-1");
  });
  await check("a malformed payload still shows a notification", async () => {
    const w = loadWorker();
    await w.push("{not json");
    assert.equal(w.shown.length, 1);
    assert.equal(w.shown[0].title, "Roleform");
  });
  await check("an empty push still shows a notification", async () => {
    const w = loadWorker();
    await w.push(undefined);
    assert.equal(w.shown.length, 1);
  });
  await check("a hostile url in a push is replaced, a hostile tag dropped", async () => {
    const w = loadWorker();
    await w.push({ title: "x", url: "https://evil.com", tag: "a b<script>" });
    assert.equal((w.shown[0].options.data as { url: string }).url, "/profile");
    assert.equal(w.shown[0].options.tag, "roleform");
  });
  await check("over-long text is clipped to what a lock screen shows", async () => {
    const w = loadWorker();
    await w.push({ title: "t".repeat(500), body: "b".repeat(500) });
    assert.equal(w.shown[0].title.length, 120);
    assert.equal((w.shown[0].options.body as string).length, 240);
  });
  await check("if the platform rejects the options, a bare notification still shows", async () => {
    const w = loadWorker();
    w.failNextShow();
    await w.push({ title: "x", body: "y", url: "/profile" });
    assert.equal(w.shown.length, 1);
    assert.equal(w.shown[0].title, "Roleform");
  });
  await check("a tap with no open window opens the validated same-origin path", async () => {
    const w = loadWorker();
    await w.click("/analysis/a/rounds");
    await w.click("//evil.com/steal");
    assert.deepEqual(w.opened, [
      "https://roleform.koustubh.org/analysis/a/rounds",
      "https://roleform.koustubh.org/profile",
    ]);
  });

  console.log("push-service answers");
  await check("201 accepted, 404/410 gone", () => {
    assert.equal(classify(201).kind, "accepted");
    assert.equal(classify(404).kind, "gone");
    assert.equal(classify(410).kind, "gone");
  });
  await check("429, 5xx and no answer are retried; 400/403/413 are not", () => {
    for (const s of [429, 500, 502, 503, null]) assert.equal(classify(s).kind, "retry");
    for (const s of [400, 401, 403, 413]) assert.equal(classify(s).kind, "fatal");
  });
  await check("Retry-After as seconds and as an HTTP date", () => {
    assert.equal(parseRetryAfter("120"), 120_000);
    assert.equal(parseRetryAfter(new Date(NOW.getTime() + 30_000).toUTCString(), NOW), 30_000);
    assert.equal(parseRetryAfter("soon"), null);
  });

  console.log("retries");
  const far = new Date(NOW.getTime() + 24 * HOUR);
  const retry = { kind: "retry" as const, retryAfterMs: null };
  await check("backoff grows: 1m, 5m, 15m, 45m", () => {
    const waits = [1, 2, 3, 4].map((n) => (nextAttempt(n, retry, far, NOW)!.getTime() - NOW.getTime()) / 60_000);
    assert.deepEqual(waits, [1, 5, 15, 45]);
  });
  await check(`stops after ${MAX_ATTEMPTS} attempts`, () => assert.equal(nextAttempt(MAX_ATTEMPTS, retry, far, NOW), null));
  await check("never schedules a retry after the push expires", () =>
    assert.equal(nextAttempt(3, retry, new Date(NOW.getTime() + 10 * 60_000), NOW), null),
  );
  await check("a longer Retry-After wins, within an hour", () => {
    assert.equal(nextAttempt(1, { kind: "retry", retryAfterMs: 20 * 60_000 }, far, NOW)!.getTime() - NOW.getTime(), 20 * 60_000);
    assert.equal(nextAttempt(1, { kind: "retry", retryAfterMs: 5 * HOUR }, far, NOW)!.getTime() - NOW.getTime(), 60_000);
  });
  await check("TTL counts down to the expiry and never goes negative", () => {
    assert.equal(ttlSeconds(new Date(NOW.getTime() + HOUR), NOW), 3600);
    assert.equal(ttlSeconds(new Date(NOW.getTime() - HOUR), NOW), 0);
  });
  await check("Topic header is ≤ 32 URL-safe characters", () => {
    assert.equal(topicFor("round-123e4567-e89b-12d3-a456-426614174000").length, 32);
    assert.match(topicFor("study-x"), /^[A-Za-z0-9_-]+$/);
  });

  console.log("payloads and preferences");
  await check("the payload schema refuses an off-app url and a long title", () => {
    assert.equal(PushPayloadSchema.safeParse({ title: "x", body: "", url: "https://evil.com", tag: "t" }).success, false);
    assert.equal(PushPayloadSchema.safeParse({ title: "x".repeat(121), body: "", url: "/", tag: "t" }).success, false);
    assert.equal(PushPayloadSchema.safeParse({ title: "x", body: "", url: "/profile", tag: "round-1" }).success, true);
  });
  await check("categories follow the member's switches; tests always go", () => {
    const off = { notifyRounds: false, notifyStudy: false, notifyDetails: false };
    assert.equal(categoryAllowed("round", off), false);
    assert.equal(categoryAllowed("study", off), false);
    assert.equal(categoryAllowed("test", off), true);
  });
  await check("discreet copy names no company and no round", () => {
    const round = {
      label: "Round 2 · System design",
      kind: "system_design" as const,
      company: "Globex",
      scheduledAt: new Date(NOW.getTime() + HOUR),
      timeZone: "Asia/Kolkata",
    };
    const full = reminderCopy(round, "hour_before", NOW);
    assert.match(full.title + full.body, /Globex/);
    for (const lead of ["hour_before", "day_before", "after_round"] as const) {
      const copy = discreetReminderCopy(round, lead, NOW);
      assert.doesNotMatch(copy.title + copy.body, /Globex|System design|Round 2/);
    }
  });

  console.log("manifest and icons");
  const m = manifest();
  await check("stable id, standalone, start_url inside scope", () => {
    assert.equal(m.id, "/");
    assert.equal(m.display, "standalone");
    assert.ok(m.start_url!.startsWith(m.scope!));
    assert.ok(m.theme_color && m.background_color);
  });
  const pngSize = (file: string) => {
    const buf = readFileSync(file);
    assert.equal(buf.toString("ascii", 1, 4), "PNG", `${file} is not a PNG`);
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
  };
  await check("192 and 512 icons for both 'any' and 'maskable', with matching pixels", () => {
    for (const purpose of ["any", "maskable"]) {
      for (const size of [192, 512]) {
        const icon = m.icons!.find((i) => i.purpose === purpose && i.sizes === `${size}x${size}`);
        assert.ok(icon, `${purpose} ${size} declared`);
        const dims = pngSize(`public${icon.src.split("?")[0]}`);
        assert.deepEqual([dims.width, dims.height], [size, size]);
      }
    }
  });
  await check("maskable icons are opaque (a mask must never reveal a hole)", () => {
    for (const size of [192, 512]) assert.equal(pngSize(`public/icons/icon-maskable-${size}.png`).colorType, 2);
  });
  await check("apple-touch-icon is 180×180 and opaque (iOS paints transparency black)", () => {
    for (const f of ["public/apple-touch-icon.png", "public/apple-touch-icon-precomposed.png"]) {
      const dims = pngSize(f);
      assert.deepEqual([dims.width, dims.height, dims.colorType], [180, 180, 2]);
    }
  });
  await check("the status-bar badge exists (Android paints it from alpha)", () => {
    assert.equal(pngSize("public/icons/badge-96.png").colorType, 6);
  });

  console.log(`\n${passed} checks passed.`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
