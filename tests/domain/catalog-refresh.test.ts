import { it } from "vitest";
/**
 * The catalog re-check's pure TTL rules (N24, F8).
 */
import assert from "node:assert/strict";
import {
  CATALOG_TTL_DAYS,
  OVERDUE_DAYS,
  daysBefore,
  isDue,
  nextStatus,
} from "@/lib/domain/catalog-refresh";

const now = new Date("2026-10-26T03:17:00.000Z");
const H = 3_600_000;

it("exposes the TTL and overdue windows", () => {
  assert.equal(CATALOG_TTL_DAYS, 7);
  assert.equal(OVERDUE_DAYS, 30);
});

it("daysBefore subtracts whole days", () => {
  assert.equal(daysBefore(now, 7).toISOString(), "2026-10-19T03:17:00.000Z");
  assert.equal(daysBefore(now, 30).toISOString(), "2026-09-26T03:17:00.000Z");
});

it("isDue is true from exactly seven days on", () => {
  assert.equal(isDue(new Date(now.getTime() - (6 * 24 + 23) * H), now), false);
  assert.equal(isDue(daysBefore(now, 7), now), true);
  assert.equal(isDue(daysBefore(now, 30), now), true);
  assert.equal(isDue(now, now), false);
  assert.equal(isDue(new Date(now.getTime() + H), now), false);
});

it("nextStatus moves one way: only a dead verdict flips", () => {
  assert.equal(nextStatus("active", "dead"), "dead");
  assert.equal(nextStatus("active", "live"), "active");
  assert.equal(nextStatus("active", "blocked"), "active");
});
