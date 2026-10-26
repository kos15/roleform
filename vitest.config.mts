import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Every behaviour change starts with a failing test here (CLAUDE.md §11).
 * `server-only` resolves to the scripts stub so server modules import under
 * Node; the app build keeps the real guard.
 */
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}` },
      { find: /^server-only$/, replacement: `${root}scripts/server-only-stub.ts` },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
