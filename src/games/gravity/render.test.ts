import { test, expect } from 'vitest';
import { ARROW_CAP, ARROW_GAIN, arrowVectors, fitView } from './render';
import { pulls, type Body, type Point } from './physics';

const len = (p: Point) => Math.hypot(p.x, p.y);
const sum = (ps: Point[]) => ps.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });

test('arrowVectors: the thin arrows, as drawn, add head to tail to the drawn total', () => {
  const ship = { x: 120, y: 300 };
  const bodies: Body[] = [
    { type: 'moon', x: 400, y: 250 },
    { type: 'brownDwarf', x: 300, y: 600 },
    { type: 'neutronStar', x: 80, y: 700 },
  ];
  const { parts, total } = arrowVectors(pulls(ship, bodies), 320);
  const s = sum(parts);
  expect(s.x).toBeCloseTo(total.x, 9);
  expect(s.y).toBeCloseTo(total.y, 9);
});

test('arrowVectors: four times the mass at the same distance draws four times as long', () => {
  const ship = { x: 500, y: 500 };
  const bodies: Body[] = [
    { type: 'moon', x: 800, y: 500 },
    { type: 'brownDwarf', x: 500, y: 200 },
  ];
  const { parts } = arrowVectors(pulls(ship, bodies), 320);
  expect(len(parts[1]) / len(parts[0])).toBeCloseTo(4, 9);
});

test('arrowVectors: small pulls use the fixed gain, big ones are scaled down together to the cap', () => {
  const small = arrowVectors([{ x: 1, y: 0 }], 400);
  expect(len(small.parts[0])).toBeCloseTo(ARROW_GAIN * 400, 9);
  const big = arrowVectors([{ x: 1000, y: 0 }, { x: 0, y: 250 }], 400);
  expect(len(big.total)).toBeCloseTo(ARROW_CAP * 400, 9); // the total is the longest here
  expect(len(big.parts[0]) / len(big.parts[1])).toBeCloseTo(4, 9);
  for (const p of [...big.parts, big.total]) expect(len(p)).toBeLessThanOrEqual(ARROW_CAP * 400 + 1e-9);
});

test('arrowVectors: the edge-of-sky room shrinks every arrow by the same factor', () => {
  // Only 10 px of room straight to the right; plenty elsewhere (the diagonal total included).
  const room = (dx: number) => (dx > 0.9 ? 10 : Infinity);
  const { parts, total } = arrowVectors([{ x: 2, y: 0 }, { x: 0, y: -2 }], 400, room);
  expect(parts[0].x).toBeCloseTo(10, 9);
  expect(len(parts[1])).toBeCloseTo(10, 9);
  expect(total.x).toBeCloseTo(10, 9);
  expect(total.y).toBeCloseTo(-10, 9);
});

test('arrowVectors: no pull, or a huge pull just outside r_s, stays finite', () => {
  expect(arrowVectors([], 400).total).toEqual({ x: 0, y: 0 });
  expect(len(arrowVectors([{ x: 0, y: 0 }], 400).parts[0])).toBe(0);
  const [near] = pulls({ x: 500 + 48 + 1e-9, y: 500 }, [{ type: 'blackHole', x: 500, y: 500 }]);
  const { parts, total } = arrowVectors([near, { x: 0, y: 1 }], 400);
  for (const p of [...parts, total]) expect(Number.isFinite(len(p))).toBe(true);
  expect(len(total)).toBeLessThanOrEqual(ARROW_CAP * 400 + 1e-9);
});

test('fitView: the square world fits the box and is centred', () => {
  const v = fitView(400, 300, 2);
  expect(v.k).toBe(0.3);
  expect(v.ox).toBe(50);
  expect(v.oy).toBe(0);
});
