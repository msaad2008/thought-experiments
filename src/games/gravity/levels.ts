// The ten Slingshot levels. Each JSON file carries a reference solution;
// levels.test.ts proves it reaches the beacon with all 3 stars.
import type { Body, BodyType, Point, Ship, SimInput } from './physics';
import l01 from './levels/01.json';
import l02 from './levels/02.json';
import l03 from './levels/03.json';
import l04 from './levels/04.json';
import l05 from './levels/05.json';
import l06 from './levels/06.json';
import l07 from './levels/07.json';
import l08 from './levels/08.json';
import l09 from './levels/09.json';
import l10 from './levels/10.json';

export interface Level {
  id: string;
  title: string;
  /** One sentence shown at the start of the level. */
  hint: string;
  /** One sentence shown on the level-end screen. */
  insight: string;
  ship: Ship;
  goal: Point & { r: number };
  stars: [Point, Point, Point];
  fixed: Body[];
  inventory: Partial<Record<BodyType, number>>;
  solution: Body[];
}

// JSON imports type `type` as plain string; the tests check every level's shape.
export const LEVELS: Level[] = [l01, l02, l03, l04, l05, l06, l07, l08, l09, l10] as Level[];

/** Flight input for a level: its fixed bodies first, then the player's. */
export function toSimInput(level: Level, placed: Body[]): SimInput {
  return { ship: level.ship, bodies: [...level.fixed, ...placed], goal: level.goal, stars: level.stars };
}
