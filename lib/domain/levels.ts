/**
 * Skill levels on one shared axis. PURE.
 *
 * `UserLevel` and `RequiredLevel` are separate enums because they mean different
 * things — a user can be at `none`, and a posting can ask for `expert`, and
 * neither has the other value. But they measure the same quantity, so they are
 * comparable, and drawing them on one track is the honest way to show a gap.
 *
 * The five rungs are `none` → `expert`. Nothing here is a percentage of skill;
 * it is a position on a five-point ordinal scale, and it exists so the meter can
 * put two marks on one line.
 */
import type { RequiredLevel, UserLevel } from "./types";

const RUNG: Record<UserLevel | RequiredLevel, number> = {
  none: 0,
  exposure: 1,
  working: 2,
  strong: 3,
  expert: 4,
};

const TOP = 4;

/** The level's position along the track, 0–100. */
export function levelPosition(level: UserLevel | RequiredLevel): number {
  return (RUNG[level] / TOP) * 100;
}

/**
 * Whether the profile already reaches what the posting asks.
 *
 * A gap row can legitimately show this: coverage marks a requirement `partial`
 * on evidence quality, and the level judgement is a second, coarser read. When
 * they disagree the meter should not draw a negative gap.
 */
export function meetsLevel(user: UserLevel, required: RequiredLevel): boolean {
  return RUNG[user] >= RUNG[required];
}
