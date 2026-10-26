/**
 * catalog_syncs (N25) is build bookkeeping: RLS on, no policy (N10), and the
 * hash/count CHECKs are hand-added to the migration (CLAUDE.md §13).
 */
import { describe, expect, it } from "vitest";
import { sourceOf } from "./files";

const schema = sourceOf("prisma/schema.prisma");
const policies = sourceOf("lib/db/policies.sql");
const MIG = "prisma/migrations/20261026000000_catalog_syncs/migration.sql";

describe("catalog_syncs", () => {
  const models = [...schema.matchAll(/^model (\w+) \{[\s\S]*?^\}/gm)].map((m) => ({
    name: m[1],
    map: /@@map\("([a-z_]+)"\)/.exec(m[0])?.[1],
  }));

  /** Tables whose RLS is really enabled: comments stripped, so a mention is not enough. */
  function rlsEnabledTables(): Set<string> {
    const sql = policies.replace(/--[^\n]*/g, "");
    const out = new Set<string>();
    for (const m of sql.matchAll(/alter table public\.(\w+) enable row level security/g)) out.add(m[1]);
    for (const block of sql.matchAll(/do \$\$[\s\S]*?end \$\$;/g)) {
      if (!/enable row level security/.test(block[0])) continue;
      for (const arr of block[0].matchAll(/array\[([\s\S]*?)\]/g)) {
        for (const n of arr[1].matchAll(/'(\w+)'/g)) out.add(n[1]);
      }
    }
    return out;
  }

  it("every model has an @@map, so the table name is never guessed", () => {
    expect(models.filter((m) => !m.map).map((m) => m.name)).toEqual([]);
  });

  it("every model table has RLS enabled in policies.sql (N10)", () => {
    const tables = models.map((m) => m.map ?? m.name);
    expect(tables).toContain("catalog_syncs");
    const enabled = rlsEnabledTables();
    expect(tables.filter((t) => !enabled.has(t))).toEqual([]);
  });

  it("catalog_syncs is RLS-on with no policy", () => {
    expect(policies).toMatch(/array\['catalog_syncs'\]/);
    expect(policies).not.toMatch(/create policy[^;]*on public\.catalog_syncs/i);
  });

  it("the migration creates the table and carries the hand-added CHECKs", () => {
    const sql = sourceOf(MIG);
    expect(sql).toContain('CREATE TABLE "catalog_syncs"');
    expect(sql).toContain(`CHECK ("hash" ~ '^[0-9a-f]{64}$')`);
    for (const c of ["courses", "skills", "templates", "bundles"]) {
      expect(sql).toContain(`"catalog_syncs_${c}_nonneg" CHECK ("${c}" >= 0)`);
    }
  });
});
