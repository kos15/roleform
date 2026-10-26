import { expect, it } from "vitest";
import { parseRole } from "@/scripts/evals/run";
const argv = (...rest: string[]) => ["node", "run.ts", "bullet-tailor", ...rest];
it("parseRole", () => {
  expect(parseRole(argv())).toBeUndefined();
  expect(parseRole(argv("--role", "writer-fast"))).toBe("writer-fast");
  expect(parseRole(argv("--role", "writer"))).toBe("writer");
  expect(() => parseRole(argv("--role", "gpt-5"))).toThrow("--role must be writer or writer-fast");
  expect(() => parseRole(argv("--role"))).toThrow("--role must be writer or writer-fast");
});
