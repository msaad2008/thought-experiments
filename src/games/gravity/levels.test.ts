import { describe, test, expect } from 'vitest';
import { LEVELS, toSimInput, type Level } from './levels';
import { BODY_TYPES, WORLD, radius, schwarzschild, simulate, type Body, type BodyType } from './physics';

const TYPES = Object.keys(BODY_TYPES) as BodyType[];
const R_S = schwarzschild(BODY_TYPES.blackHole.mass);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const inWorld = (p: { x: number; y: number }) => p.x >= 0 && p.x <= WORLD && p.y >= 0 && p.y <= WORLD;
const fly = (l: Level, placed: Body[]) => simulate(toSimInput(l, placed));
const wins = (l: Level, placed: Body[]) => {
  const r = fly(l, placed);
  return r.outcome === 'goal' && r.collected.length === 3;
};
const byId = (id: string) => LEVELS.find((l) => l.id === id)!;

test('ids run 01..10, in order', () => {
  expect(LEVELS.map((l) => l.id)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
});

test('toSimInput puts the fixed bodies first, then the placed ones', () => {
  const l = byId('08');
  const placed: Body[] = [{ type: 'moon', x: 1, y: 2 }];
  const input = toSimInput(l, placed);
  expect(input.bodies).toEqual([...l.fixed, ...placed]);
  expect(input.ship).toEqual(l.ship);
  expect(input.goal).toEqual(l.goal);
  expect(input.stars).toEqual(l.stars);
});

test('the first level that offers each type appears in tier order', () => {
  const first = TYPES.map((t) => LEVELS.findIndex((l) => (l.inventory[t] ?? 0) > 0 || l.fixed.some((b) => b.type === t)));
  expect(first.every((i) => i >= 0)).toBe(true);
  const byTier = [...TYPES].sort((a, b) => BODY_TYPES[a].tier - BODY_TYPES[b].tier).map((t) => first[TYPES.indexOf(t)]);
  for (let i = 1; i < byTier.length; i++) expect(byTier[i]).toBeGreaterThan(byTier[i - 1]);
});

describe.each(LEVELS.map((l) => [l.id, l] as const))('level %s', (id, l) => {
  test('has a title, a hint and an insight', () => {
    for (const s of [l.title, l.hint, l.insight]) expect(s.trim().length).toBeGreaterThan(0);
  });

  test('the reference solution reaches the goal with all 3 stars in 4–12 s', () => {
    const r = fly(l, l.solution);
    expect(r.outcome).toBe('goal');
    expect(r.collected).toEqual([0, 1, 2]);
    expect(r.time).toBeGreaterThanOrEqual(4);
    expect(r.time).toBeLessThanOrEqual(12);
  });

  test('with nothing placed the ship does not reach the goal', () => {
    expect(fly(l, []).outcome).not.toBe('goal');
  });

  test('the solution uses only the inventory, no more than its counts', () => {
    const used: Partial<Record<BodyType, number>> = {};
    for (const b of l.solution) used[b.type] = (used[b.type] ?? 0) + 1;
    for (const t of TYPES) expect(used[t] ?? 0).toBeLessThanOrEqual(l.inventory[t] ?? 0);
  });

  test('bodies, ship start, goal and stars are inside the world', () => {
    for (const p of [l.ship, l.goal, ...l.stars, ...l.fixed, ...l.solution]) expect(inWorld(p)).toBe(true);
  });

  test('every body obeys the placement rules', () => {
    const all = [...l.fixed, ...l.solution];
    all.forEach((b, i) => {
      const R = radius(b.type);
      expect(b.x - R).toBeGreaterThanOrEqual(0);
      expect(b.y - R).toBeGreaterThanOrEqual(0);
      expect(b.x + R).toBeLessThanOrEqual(WORLD);
      expect(b.y + R).toBeLessThanOrEqual(WORLD);
      all.forEach((o, j) => { if (i !== j) expect(dist(b, o)).toBeGreaterThanOrEqual(R + radius(o.type) + 8); });
      expect(dist(b, l.goal)).toBeGreaterThanOrEqual(R + l.goal.r);
      expect(dist(b, l.ship)).toBeGreaterThanOrEqual(R + 40);
    });
  });

  test('black holes appear only in the finale, exactly one, in fixed', () => {
    const holes = l.fixed.filter((b) => b.type === 'blackHole').length;
    expect(holes).toBe(Number(id) >= 8 ? 1 : 0);
    expect(l.inventory.blackHole ?? 0).toBe(0);
    expect(l.solution.some((b) => b.type === 'blackHole')).toBe(false);
  });

  test('the solution survives moving any one body 5 units along x or y', () => {
    l.solution.forEach((b, i) => {
      for (const [dx, dy] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) {
        const moved = l.solution.map((o, j) => (j === i ? { ...o, x: o.x + dx, y: o.y + dy } : o));
        expect(wins(l, moved), `body ${i} (${b.type}) moved by (${dx}, ${dy})`).toBe(true);
      }
    });
  });
});

describe('each level teaches its idea', () => {
  test('02: both moons are needed for 3 stars', () => {
    const l = byId('02');
    expect(l.solution.filter((b) => b.type === 'moon')).toHaveLength(2);
    for (let i = 0; i < l.solution.length; i++) expect(wins(l, l.solution.filter((_, j) => j !== i))).toBe(false);
  });

  // Put another type in the same place as one solution body: 3 stars should no longer be possible.
  const swap = (id: string, from: BodyType, to: BodyType) => {
    const l = byId(id);
    expect(l.solution.some((b) => b.type === from)).toBe(true);
    return wins(l, l.solution.map((b) => (b.type === from ? { ...b, type: to } : b)));
  };

  test('03: a moon in the brown dwarf\'s place does not bend the path enough', () => {
    expect(swap('03', 'brownDwarf', 'moon')).toBe(false);
  });

  test('04: a brown dwarf in the white dwarf\'s place does not work', () => {
    expect(swap('04', 'whiteDwarf', 'brownDwarf')).toBe(false);
  });

  test('06: a white dwarf in the neutron star\'s place does not turn tightly enough', () => {
    expect(swap('06', 'neutronStar', 'whiteDwarf')).toBe(false);
  });

  test('05: the ship swings round by more than 135 degrees', () => {
    const l = byId('05');
    const { path } = fly(l, l.solution);
    const a = path[1], b = path[path.length - 1], c = path[path.length - 2];
    const v0 = { x: a.x - path[0].x, y: a.y - path[0].y }, v1 = { x: b.x - c.x, y: b.y - c.y };
    const cos = (v0.x * v1.x + v0.y * v1.y) / (Math.hypot(v0.x, v0.y) * Math.hypot(v1.x, v1.y));
    expect(Math.acos(cos)).toBeGreaterThan((135 * Math.PI) / 180);
  });

  test('08: left alone the ship falls into the hole; the solution stays outside 3 r_s', () => {
    const l = byId('08');
    expect(fly(l, []).outcome).toBe('captured');
    const hole = l.fixed.find((b) => b.type === 'blackHole')!;
    for (const p of fly(l, l.solution).path) expect(dist(p, hole)).toBeGreaterThan(3 * R_S);
  });

  test('09: the ship clock falls at least 0.5 s behind', () => {
    const l = byId('09');
    const r = fly(l, l.solution);
    expect(r.time - r.shipTime).toBeGreaterThanOrEqual(0.5);
  });

  test('10: the ship whips all the way round the hole', () => {
    const l = byId('10');
    const hole = l.fixed.find((b) => b.type === 'blackHole')!;
    const { path } = fly(l, l.solution);
    let swept = 0;
    for (let i = 1; i < path.length; i++) {
      const a0 = Math.atan2(path[i - 1].y - hole.y, path[i - 1].x - hole.x);
      const a1 = Math.atan2(path[i].y - hole.y, path[i].x - hole.x);
      let d = a1 - a0;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      swept += d;
    }
    expect(Math.abs(swept)).toBeGreaterThan(2 * Math.PI);
  });
});
