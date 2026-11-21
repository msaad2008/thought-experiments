// Placement rules for the bodies a player drops into a level. Pure.
import type { Level } from './levels';
import { WORLD, radius, type Body, type BodyType, type Point } from './physics';

/** Surface gap kept between any two bodies. */
export const BODY_GAP = 8;
/** Surface gap kept from the ship's start. */
export const SHIP_GAP = 40;
// Tolerance so a body placed exactly on a boundary counts as valid.
const EPS = 1e-9;

/**
 * True when `b` fits: fully inside the world, at least BODY_GAP from every
 * body in `others` (surface to surface; a black hole's surface is r_s), not
 * touching the beacon, and at least SHIP_GAP from the ship start.
 */
export function canPlace(b: Body, others: Body[], level: Level): boolean {
  const r = radius(b.type);
  if (b.x - r < -EPS || b.y - r < -EPS || b.x + r > WORLD + EPS || b.y + r > WORLD + EPS) return false;
  const far = (p: Point, min: number) => Math.hypot(b.x - p.x, b.y - p.y) >= min - EPS;
  if (!others.every((o) => far(o, r + radius(o.type) + BODY_GAP))) return false;
  return far(level.goal, r + level.goal.r) && far(level.ship, r + SHIP_GAP);
}

/** Inventory left after `placed`, keeping every type the level offers (0 when used up). */
export function remaining(level: Level, placed: Body[]): Partial<Record<BodyType, number>> {
  const left: Partial<Record<BodyType, number>> = { ...level.inventory };
  for (const b of placed) {
    const n = left[b.type];
    if (n !== undefined) left[b.type] = Math.max(0, n - 1);
  }
  return left;
}

/** The valid spot on a 10-unit grid closest to the world centre, or null if none fits. */
export function nearestFree(type: BodyType, others: Body[], level: Level): Point | null {
  const c = WORLD / 2;
  let best: Point | null = null;
  let bestD = Infinity;
  for (let x = 0; x <= WORLD; x += 10) {
    for (let y = 0; y <= WORLD; y += 10) {
      const d = Math.hypot(x - c, y - c);
      if (d < bestD && canPlace({ type, x, y }, others, level)) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  return best;
}
