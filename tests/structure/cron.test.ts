/**
 * Scheduled work is a closed list (N24). Each test names one rule a new cron
 * route must keep; a route added without its middleware line, its Bearer
 * check or its CRON_JOBS entry fails here.
 */
import { describe, expect, it } from "vitest";
import { CRON_JOBS } from "@/lib/services/cron";
import { entriesOf, filesUnder, importsOf, sourceOf } from "./files";

describe("cron routes", () => {
  it("every directory under app/api/cron is a CRON_JOBS entry, and every entry has one", () => {
    const dirs = entriesOf("app/api/cron")
      .filter((e) => e.isDir)
      .map((e) => "/api/cron/" + e.name)
      .sort();
    expect(dirs).toEqual(CRON_JOBS.map((j) => j.path).sort());
  });

  it("middleware names each cron path, with no wildcard", () => {
    const mw = sourceOf("middleware.ts");
    for (const job of CRON_JOBS) expect(mw).toContain(`"${job.path}"`);
    expect(mw).not.toMatch(/\/api\/cron(\/)?\(\.\*\)/);
  });

  it("each cron route checks cronAuthorised before anything else", () => {
    for (const job of CRON_JOBS) {
      const file = `app${job.path}/route.ts`;
      expect(importsOf(file)).toContain("@/lib/services/cron");
      // The guard is the FIRST statement of `handle`, not merely present.
      expect(sourceOf(file)).toMatch(
        /async function handle\(request: Request\)(: Promise<Response>)? \{\s*if \(!cronAuthorised\(request\)\) return new Response\("unauthorised", \{ status: 401 \}\);/,
      );
    }
  });

  it("no cron route keeps its own Bearer check", () => {
    const offenders = filesUnder("app/api/cron").filter((f) => sourceOf(f).includes("timingSafeEqual"));
    expect(offenders).toEqual([]);
  });

  it("each cron route's maxDuration is ≤ 300 s and covers its pg_net timeout", () => {
    for (const job of CRON_JOBS) {
      const src = sourceOf(`app${job.path}/route.ts`);
      const n = Number(/export const maxDuration = (\d+);/.exec(src)![1]);
      expect(n).toBeLessThanOrEqual(300);
      expect(job.timeoutMs).toBeLessThanOrEqual(n * 1000);
    }
  });

  it("no cron route reaches lib/ai", () => {
    const offenders = filesUnder("app/api/cron").flatMap((f) =>
      importsOf(f).filter((s) => /(^@\/lib\/ai|\/lib\/ai)(\/|$)/.test(s)).map((s) => `${f} -> ${s}`),
    );
    expect(offenders).toEqual([]);
  });
});
