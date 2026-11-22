// The eight Antidote Run levels. levels.test.ts flies every lever setting with the exact physics to
// prove the star targets (best setting earns 3 stars, a wide band does too, flooring it fails where it should).
import { AT_REST, G_LY, TRIP_SECONDS, advance, deliveryYear, leverToEta, type Course } from './physics';
import l01 from './levels/01.json';
import l02 from './levels/02.json';
import l03 from './levels/03.json';
import l04 from './levels/04.json';
import l05 from './levels/05.json';
import l06 from './levels/06.json';
import l07 from './levels/07.json';
import l08 from './levels/08.json';

/** News from the colony: it happens at colony year `at` and may change the ripening time. */
export interface Message {
  at: number;
  text: string;
  /** New ripening time in ship years (before upgrades). */
  ripen?: number;
}

export interface Level {
  id: string;
  title: string;
  /** Shown at the start of the level. */
  hint: string;
  /** Shown on the level-end screen. */
  insight: string;
  /** The destination's name. */
  star: string;
  /** Light-years. */
  distance: number;
  /** The crew's limit in g (before upgrades). */
  gLimit: number;
  /** Ship years the culture needs to ripen (before upgrades). */
  ripen: number;
  /** The top of the lever, as a fraction of c. */
  leverMax: number;
  /** Delivery later than this Earth year earns no stars. */
  deadline: number;
  /** [2 stars by, 3 stars by], Earth years. */
  marks: [number, number];
  messages: Message[];
  /** The ship flies home after delivery (levels with the twin comparison). */
  roundTrip: boolean;
}

export const LEVELS: Level[] = [l01, l02, l03, l04, l05, l06, l07, l08] as Level[];

export function course(l: Level, upgrades: ReadonlySet<string>): Course {
  return { distance: l.distance, accel: l.gLimit * G_LY * (upgrades.has('couch') ? 1.5 : 1) };
}

export function ripenTime(l: Level, upgrades: ReadonlySet<string>, base: number = l.ripen): number {
  return base * (upgrades.has('incubator') ? 0.8 : 1);
}

export function starsFor(l: Level, delivered: number): 0 | 1 | 2 | 3 {
  if (delivered <= l.marks[1]) return 3;
  if (delivered <= l.marks[0]) return 2;
  return delivered <= l.deadline ? 1 : 0;
}

/** A delivery year to 2 decimals, rounded up, so a year just past a star mark never reads as the mark. */
export const fmtDelivery = (y: number) => (Math.ceil(y * 100 - 1e-9) / 100).toFixed(2);

/** The delivery year for a lever held at setting s (0..1) the whole trip: what is known at launch. */
export function deliveryFor(l: Level, upgrades: ReadonlySet<string>, lever: number): number {
  const arrive = advance(AT_REST, course(l, upgrades), leverToEta(lever, l.leverMax), Infinity);
  return deliveryYear(arrive, ripenTime(l, upgrades));
}

/** The lowest lever setting (in 1/1000 steps) with the earliest delivery. */
export function bestLever(l: Level, upgrades: ReadonlySet<string>): number {
  let best = 0, bestYear = Infinity;
  for (let i = 0; i <= 1000; i++) {
    const d = deliveryFor(l, upgrades, i / 1000);
    if (d < bestYear - 1e-9) { bestYear = d; best = i / 1000; }
  }
  return best;
}

const paceCache = new Map<string, number>();
/**
 * Ship years that pass per real second of flight: the best trip (no upgrades) plays in TRIP_SECONDS,
 * counting its flight or its ripening time, whichever is longer. Computed once per level.
 */
export function shipYearsPerSecond(l: Level): number {
  let v = paceCache.get(l.id);
  if (v === undefined) {
    const none: ReadonlySet<string> = new Set();
    const best = advance(AT_REST, course(l, none), leverToEta(bestLever(l, none), l.leverMax), Infinity);
    v = Math.max(l.ripen, best.tau) / TRIP_SECONDS;
    paceCache.set(l.id, v);
  }
  return v;
}
