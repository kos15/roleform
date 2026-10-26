import { describe, expect, it } from "vitest";
import { RUN_LOCK_STALE_MS, draftsState } from "@/lib/services/pipeline/background";
const live = () => new Date(Date.now() - 1_000);
const stale = () => new Date(Date.now() - RUN_LOCK_STALE_MS - 1_000);
describe("draftsState", () => {
  it("is ready whenever drafts exist, even after a cap change", () => {
    expect(draftsState({ status: "ready", runningAt: live() }, 3, 3)).toBe("ready");
    expect(draftsState({ status: "ready", runningAt: null }, 2, 0)).toBe("ready");
  });
  it("is off when the cap is 0 and none exist", () =>
    expect(draftsState({ status: "ready", runningAt: live() }, 0, 0)).toBe("off"));
  it("is pending while the run holds a live claim", () =>
    expect(draftsState({ status: "ready", runningAt: live() }, 0, 3)).toBe("pending"));
  it("is missing once the claim is released or stale", () => {
    expect(draftsState({ status: "ready", runningAt: null }, 0, 3)).toBe("missing");
    expect(draftsState({ status: "ready", runningAt: stale() }, 0, 3)).toBe("missing");
  });
  it("is missing, not pending, for a run that is not ready", () =>
    expect(draftsState({ status: "parsing", runningAt: live() }, 0, 3)).toBe("missing"));
});
