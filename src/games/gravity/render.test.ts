import { test, expect } from 'vitest';
import { arrowLength, fitView } from './render';
import { pulls } from './physics';

test('arrowLength: zero for no pull, grows with the pull, capped for huge pulls', () => {
  expect(arrowLength(0, 400)).toBe(0);
  expect(arrowLength(NaN, 400)).toBe(0);
  expect(arrowLength(2, 400)).toBeGreaterThan(arrowLength(1, 400));
  expect(arrowLength(200, 400)).toBeGreaterThanOrEqual(arrowLength(20, 400));
  // Just outside r_s the clamped pull is astronomically large: still capped.
  const [near] = pulls({ x: 500 + 48 + 1e-9, y: 500 }, [{ type: 'blackHole', x: 500, y: 500 }]);
  const len = arrowLength(Math.hypot(near.x, near.y), 400);
  expect(Number.isFinite(len)).toBe(true);
  expect(len).toBeLessThanOrEqual(0.32 * 400);
  expect(arrowLength(Infinity, 400)).toBe(0.32 * 400);
});

test('fitView: the square world fits the box and is centred', () => {
  const v = fitView(400, 300, 2);
  expect(v.k).toBe(0.3);
  expect(v.ox).toBe(50);
  expect(v.oy).toBe(0);
});
