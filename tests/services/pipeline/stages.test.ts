import { expect, it } from "vitest";
import { parsingFinished, type StageUpdate } from "@/lib/services/pipeline/stages";
it.each<[StageUpdate, boolean]>([
  [{ stage: "matching", state: "done", progressPct: 45 }, true],
  [{ stage: "matching", state: "running", progressPct: 25 }, false],
  [{ stage: "reading", state: "done", progressPct: 25 }, false],
  [{ stage: "rewriting", state: "done", progressPct: 80 }, false],
  [{ stage: "rewriting", state: "degraded", progressPct: 80, message: "x" }, false],
  [{ stage: "preparing", state: "done", progressPct: 100 }, true],
  [{ stage: "preparing", state: "degraded", progressPct: 100 }, true],
  [{ stage: "preparing", state: "running", progressPct: 100 }, false],
  [{ stage: "preparing", state: "running", progressPct: 80 }, false],
  [{ stage: "reading", state: "failed", progressPct: 0 }, false],
])("parsingFinished(%j) → %s", (u, want) => expect(parsingFinished(u)).toBe(want));
