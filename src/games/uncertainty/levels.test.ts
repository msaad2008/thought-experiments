// Proves the eight levels have the agreed shape and are tuned by exact odds (binomial over SHOTS):
// the best setting usually earns 3 stars, a real player's aim error still passes, and the wrong
// setting fails where it should. Readings must be on screen and clear of the gun.
import { describe, expect, it } from 'vitest';
import { LEVELS, bestSetting, massKg, startSetting, type Level } from './levels';
import { AIM_ERROR, PRESETS, SHOTS, atLeast, hitChance, predictedCentre, spread } from './physics';

const TABLE = [
  ['01', 'Point blank', 5000, 1.0, 30, 380, true, true],
  ['02', 'Long range', 270, 3.0, 256, 3200, true, true],
  ['03', 'On the move', 7500, 1.5, 30, 380, true, true],
  ['04', 'The dial', 2000, 2.0, 66, 820, false, true],
  ['05', 'Heavy cruiser', 3500, 2.0, 50, 620, false, true],
  ['06', 'Scout', 850, 1.5, 88, 1100, false, false],
  ['07', 'Far and fast', 2400, 3.0, 74, 920, false, false],
  ['08', 'Final salvo', 1900, 3.0, 83, 1040, false, false],
] as const;

const FACTORS = [1, 0.75, 0.5];
const odds = (l: Level, dx: number, t = l.flightTime, aim = 0) =>
  hitChance(spread(dx, massKg(l), t), l.hitRadius, aim);
const best = (l: Level) => odds(l, bestSetting(l));
const other = (l: Level) =>
  bestSetting(l) === PRESETS.position ? PRESETS.momentum : PRESETS.position;

describe('uncertainty levels', () => {
  it('every level has the right shape', () => {
    expect(LEVELS).toHaveLength(8);
    LEVELS.forEach((l, i) => {
      const [id, title, tonnes, t, r, w, presetsOnly, arrow] = TABLE[i];
      expect(l.id).toBe(id);
      for (const s of [l.id, l.title, l.hint, l.insight]) expect(s.length).toBeGreaterThan(0);
      for (const n of [l.massTonnes, l.flightTime, l.hitRadius, l.width]) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThan(0);
      }
      expect(l.shots).toHaveLength(SHOTS);
      expect([l.title, l.massTonnes, l.flightTime, l.hitRadius, l.width, l.presetsOnly, l.arrowToImpact])
        .toEqual([title, tonnes, t, r, w, presetsOnly, arrow]);
      expect(massKg(l)).toBe(tonnes * 1000);
    });
  });

  it('the best setting usually earns 3 stars', () => {
    for (const l of LEVELS) {
      const p = best(l);
      expect(atLeast(p, 4), l.id).toBeGreaterThanOrEqual(0.8);
      expect(atLeast(p, 5), l.id).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("a real player's aim still passes at the best setting", () => {
    for (const l of LEVELS) {
      const p = odds(l, bestSetting(l), l.flightTime, AIM_ERROR * l.hitRadius);
      expect(atLeast(p, 3), l.id).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('levels 1-3: the wrong preset fails, even with faster shells', () => {
    for (const l of LEVELS.slice(0, 3)) {
      for (const f of FACTORS) {
        const p = odds(l, other(l), l.flightTime * f);
        expect(atLeast(p, 3), `${l.id} x${f}`).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it('from level 4 the slider beats both presets', () => {
    const [l4, ...rest] = LEVELS.slice(3);
    for (const d of Object.values(PRESETS)) {
      expect(atLeast(odds(l4, d), 5), l4.id).toBeLessThanOrEqual(0.2);
    }
    for (const l of rest) {
      const b = atLeast(best(l), 5);
      for (const d of Object.values(PRESETS)) {
        expect(atLeast(odds(l, d), 5), l.id).toBeLessThanOrEqual(b - 0.3);
      }
    }
  });

  it('the slider starts where it loses like a preset, so the dial must be turned', () => {
    for (const l of LEVELS.slice(0, 3)) expect(startSetting(l), l.id).toBeNull(); // pick a mode
    const [l4, ...rest] = LEVELS.slice(3);
    expect(atLeast(odds(l4, startSetting(l4)!), 5), l4.id).toBeLessThanOrEqual(0.2);
    for (const l of rest) {
      expect(atLeast(odds(l, startSetting(l)!), 5), l.id).toBeLessThanOrEqual(atLeast(best(l), 5) - 0.3);
    }
  });

  it('the ship is big enough to aim at', () => {
    for (const l of LEVELS) expect(l.hitRadius / l.width, l.id).toBeGreaterThanOrEqual(0.07);
  });

  it('every shot is on screen and clear of the gun', () => {
    for (const l of LEVELS) {
      const R = l.hitRadius;
      const ok = (p: { x: number; y: number }) =>
        p.x >= R && p.x <= l.width - R && p.y >= R && p.y <= 0.75 * l.width;
      for (const r of l.shots) {
        expect(ok(r), `${l.id} reading`).toBe(true);
        for (const f of FACTORS) expect(ok(predictedCentre(r, l.flightTime * f)), `${l.id} x${f}`).toBe(true);
      }
      expect(new Set(l.shots.map((r) => `${r.x},${r.y},${r.vx},${r.vy}`)).size, l.id).toBeGreaterThan(1);
    }
  });

  it('the levels teach in order', () => {
    const [l1, l2, l3, l4, l5] = LEVELS;
    expect(bestSetting(l1)).toBe(PRESETS.position);
    expect(bestSetting(l2)).toBe(PRESETS.momentum);
    expect(bestSetting(l3)).toBe(PRESETS.position);
    expect(bestSetting(l5)).toBeLessThan(bestSetting(l4));
    const speed = (l: Level) => l.shots.map((r) => Math.hypot(r.vx, r.vy));
    expect(Math.min(...speed(l3))).toBeGreaterThanOrEqual(2 * Math.max(...speed(l1)));
    expect(Math.max(...speed(l1))).toBeLessThanOrEqual(0.05 * l1.width / l1.flightTime);
  });
});
