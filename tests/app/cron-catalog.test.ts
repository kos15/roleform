import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/learning/refresh-catalog", () => ({ refreshDueLinks: vi.fn() }));

import { refreshDueLinks } from "@/lib/services/learning/refresh-catalog";
import { GET, POST, dynamic, maxDuration } from "@/app/api/cron/catalog/route";

const S = "s".repeat(32);
const refresh = vi.mocked(refreshDueLinks);
const summary = { due: 3, checked: 3, dead: 0, blocked: 1, skipped: 0, overdue30: 0, rebuilt: "no" as const };
const authed = () =>
  new Request("https://x.test/api/cron/catalog", { headers: { authorization: `Bearer ${S}` } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T03:17:00.000Z"));
  vi.stubEnv("CRON_SECRET", S);
  refresh.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/api/cron/catalog", () => {
  it("401s with no header and does not refresh", async () => {
    const res = await GET(new Request("https://x.test/api/cron/catalog"));
    expect(res.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("401s when CRON_SECRET is empty, even with a matching-looking header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(authed());
    expect(res.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("runs the refresh with a 200 s claim window and returns the summary", async () => {
    refresh.mockResolvedValue(summary);
    const res = await GET(authed());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(summary);
    expect(refresh).toHaveBeenCalledWith({ limit: 150, claimUntil: Date.parse("2026-10-26T03:20:20.000Z") });
  });

  it("500s with the summary when the rebuild failed", async () => {
    refresh.mockResolvedValue({ ...summary, dead: 1, rebuilt: "failed" });
    const res = await GET(authed());
    expect(res.status).toBe(500);
    expect((await res.json()).rebuilt).toBe("failed");
  });

  it("500s with a bare body and a count-free log when the refresh throws (N7)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    refresh.mockRejectedValue(new Error("db down"));
    const res = await GET(authed());
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("failed");
    expect(err).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledWith("[cron:catalog] failed");
  });

  it("exports POST as GET, maxDuration 300 and force-dynamic", () => {
    expect(POST).toBe(GET);
    expect(maxDuration).toBe(300);
    expect(dynamic).toBe("force-dynamic");
  });
});
