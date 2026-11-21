import { describe, test, expect } from 'vitest';
import { LEVELS, type Level } from './levels';
import { radius, type Body } from './physics';
import { canPlace, nearestFree, remaining } from './place';

// An empty test level: ship at the left, beacon at the right.
const level: Level = {
  id: 'xx',
  title: 't',
  hint: 'h',
  insight: 'i',
  ship: { x: 100, y: 500, vx: 100, vy: 0 },
  goal: { x: 900, y: 500, r: 40 },
  stars: [
    { x: 300, y: 500 },
    { x: 500, y: 500 },
    { x: 700, y: 500 },
  ],
  fixed: [],
  inventory: { moon: 2, whiteDwarf: 1 },
  solution: [],
};
const R = radius('moon');

describe('canPlace', () => {
  test('accepts a body in open space', () => {
    expect(canPlace({ type: 'moon', x: 500, y: 300 }, [], level)).toBe(true);
  });

  test('rejects a body that sticks out of the world', () => {
    expect(canPlace({ type: 'moon', x: R - 1, y: 300 }, [], level)).toBe(false);
    expect(canPlace({ type: 'moon', x: 500, y: 1000 - R + 1 }, [], level)).toBe(false);
    expect(canPlace({ type: 'moon', x: R, y: R }, [], level)).toBe(true);
  });

  test('rejects a body closer than an 8-unit gap to another body', () => {
    const other: Body = { type: 'whiteDwarf', x: 500, y: 300 };
    const gap = R + radius('whiteDwarf') + 8;
    expect(canPlace({ type: 'moon', x: 500 + gap - 1, y: 300 }, [other], level)).toBe(false);
    expect(canPlace({ type: 'moon', x: 500 + gap, y: 300 }, [other], level)).toBe(true);
  });

  test('uses r_s as the black hole radius', () => {
    const hole: Body = { type: 'blackHole', x: 500, y: 300 };
    expect(canPlace({ type: 'moon', x: 500 + 48 + R + 7, y: 300 }, [hole], level)).toBe(false);
    expect(canPlace({ type: 'moon', x: 500 + 48 + R + 8, y: 300 }, [hole], level)).toBe(true);
  });

  test('rejects a body touching the beacon', () => {
    expect(canPlace({ type: 'moon', x: 900, y: 500 - (R + 40) + 1 }, [], level)).toBe(false);
    expect(canPlace({ type: 'moon', x: 900, y: 500 - (R + 40) }, [], level)).toBe(true);
  });

  test('rejects a body within 40 units of the ship start', () => {
    expect(canPlace({ type: 'moon', x: 100, y: 500 - (R + 40) + 1 }, [], level)).toBe(false);
    expect(canPlace({ type: 'moon', x: 100, y: 500 - (R + 40) }, [], level)).toBe(true);
  });
});

describe('remaining', () => {
  test('placing one moon from {moon: 2} leaves {moon: 1}', () => {
    expect(remaining({ ...level, inventory: { moon: 2 } }, [{ type: 'moon', x: 1, y: 1 }])).toEqual({ moon: 1 });
  });

  test('counts each type separately and never goes below zero', () => {
    const placed: Body[] = [
      { type: 'whiteDwarf', x: 1, y: 1 },
      { type: 'whiteDwarf', x: 2, y: 2 },
    ];
    expect(remaining(level, placed)).toEqual({ moon: 2, whiteDwarf: 0 });
  });
});

describe.each(LEVELS.map((l) => [l.id, l] as const))('level %s', (_id, l) => {
  test('every body of the reference solution passes canPlace', () => {
    l.solution.forEach((b, i) => {
      const others = [...l.fixed, ...l.solution.filter((_, j) => j !== i)];
      expect(canPlace(b, others, l)).toBe(true);
    });
  });
});

describe('nearestFree', () => {
  test('returns the world centre when it is free', () => {
    expect(nearestFree('moon', [], level)).toEqual({ x: 500, y: 500 });
  });

  test('returns the closest valid spot when the centre is taken', () => {
    const others: Body[] = [{ type: 'brownDwarf', x: 500, y: 500 }];
    const p = nearestFree('moon', others, level)!;
    expect(canPlace({ type: 'moon', ...p }, others, level)).toBe(true);
    expect(Math.hypot(p.x - 500, p.y - 500)).toBeLessThan(R + radius('brownDwarf') + 8 + 15);
  });
});
