// Proves the eight levels have the agreed shape and hit the star targets, by flying every one of the
// 1001 lever settings with the exact physics. Level 05 is checked with a switch-on-the-news flight.
import { describe, expect, it } from 'vitest';
import { LEVELS, bestLever, course, deliveryFor, ripenTime, shipYearsPerSecond, starsFor, type Level } from './levels';
import {
  AT_REST, LEVER_STEPS, START_BETA, TRIP_SECONDS, advance, deliveryYear, etaToLever, leverToEta, seenColonyYear,
} from './physics';

const NONE: ReadonlySet<string> = new Set();
const settings = Array.from({ length: LEVER_STEPS + 1 }, (_, i) => i / LEVER_STEPS);
const stars = (l: Level, s: number) => starsFor(l, deliveryFor(l, NONE, s));
const startStars = (l: Level) => {
  const arrive = advance(AT_REST, course(l, NONE), Math.atanh(START_BETA), Infinity);
  return starsFor(l, deliveryYear(arrive, ripenTime(l, NONE)));
};
const rest = LEVELS.filter((l) => l.id !== '05');

/** Level 05: fly the old best lever; when the news is first seen, switch lever and ripening time. */
function switched(l: Level, candidate: number): number {
  const c = course(l, NONE);
  const oldEta = leverToEta(bestLever(l, NONE), l.leverMax);
  let ship = AT_REST;
  while (seenColonyYear(ship, l.distance) < 1.0) ship = advance(ship, c, oldEta, 0.01);
  const arrive = advance(ship, c, leverToEta(candidate, l.leverMax), Infinity);
  return deliveryYear(arrive, ripenTime(l, NONE, 7));
}

describe('relativity levels', () => {
  it('eight levels with real distances and valid fields', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08']);
    for (const l of LEVELS) {
      expect(l.title && l.hint && l.insight && l.star).toBeTruthy();
      expect(l.distance).toBeGreaterThan(4);
      expect(l.gLimit).toBeGreaterThan(0);
      expect(l.ripen).toBeGreaterThan(0);
      expect(l.leverMax).toBeLessThan(1);
      expect(l.marks[1]).toBeLessThan(l.marks[0]);
      expect(l.marks[0]).toBeLessThan(l.deadline);
      expect(l.messages.length).toBe(l.id === '05' ? 1 : 0);
    }
    expect(LEVELS.filter((l) => l.roundTrip).map((l) => l.id)).toEqual(['07', '08']);
    expect(shipYearsPerSecond(LEVELS[1])).toBeCloseTo(8 / TRIP_SECONDS, 12);
  });

  it('the best lever earns 3 stars', () => {
    for (const l of rest) expect(stars(l, bestLever(l, NONE)), l.id).toBe(3);
  });

  it('3 stars cover at least 4% of the lever', () => {
    for (const l of rest) {
      const n = settings.filter((s) => stars(l, s) === 3).length;
      expect(n, l.id).toBeGreaterThanOrEqual(0.04 * settings.length);
    }
  });

  it('flooring it or 0.5c earns at most 1 star (levels 02-08); flooring it wins level 01', () => {
    expect(stars(LEVELS[0], 1)).toBe(3);
    for (const l of LEVELS.slice(1)) {
      if (l.id !== '05') expect(stars(l, 1), l.id).toBeLessThanOrEqual(1);
      else expect(starsFor(l, deliveryYear(advance(AT_REST, course(l, NONE), leverToEta(1, l.leverMax), Infinity), ripenTime(l, NONE, 7))), l.id).toBeLessThanOrEqual(1); // top lever all the way, news 7 yr
      expect(startStars(l), l.id).toBeLessThanOrEqual(1);
    }
  });

  it('level 05: switching on the news earns 3 stars, ignoring it earns 2', () => {
    const l = LEVELS[4];
    const old = bestLever(l, NONE);
    const band = settings.filter((s) => starsFor(l, switched(l, s)) === 3);
    expect(band.length).toBeGreaterThanOrEqual(0.04 * settings.length);
    expect(starsFor(l, switched(l, old))).toBe(2);
    expect(Math.max(...settings.map((s) => stars(l, s)))).toBe(3); // the old ripening time is still winnable alone
  });

  it('starting at 0.5c is never the answer', () => {
    for (const l of LEVELS) {
      expect(startStars(l), l.id).toBeLessThanOrEqual(1);
      expect(etaToLever(Math.atanh(START_BETA), l.leverMax)).toBeGreaterThan(0);
    }
  });

  it('upgrades scale the course and the ripening time', () => {
    const l = LEVELS[0];
    expect(course(l, new Set(['couch'])).accel).toBeCloseTo(1.5 * course(l, NONE).accel, 12);
    expect(ripenTime(l, new Set(['incubator']))).toBeCloseTo(1.6, 12);
    expect(ripenTime(l, new Set(['incubator']), 7)).toBeCloseTo(5.6, 12);
  });
});
