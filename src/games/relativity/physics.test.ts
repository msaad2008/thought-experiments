import { test, expect } from 'vitest';
import {
  AT_REST, G_LY, advance, docked, brakePoint, etaStop, deliveryYear, leverToEta, etaToLever, seenColonyYear,
  aberrate, doppler, starColour, photonMassRatio, type Course, type Ship,
} from './physics';

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);

test('a burn from rest is hyperbolic motion', () => {
  const a = 1.0323, c: Course = { distance: 1e6, accel: a };
  const s = advance(AT_REST, c, 10, 1);
  near(s.t, Math.sinh(a) / a);
  near(s.x, (Math.cosh(a) - 1) / a);
  near(s.tau, 1);
  near((s.x + 1 / a) ** 2 - s.t ** 2, 1 / (a * a));
});

test('coasting: Earth time runs γ times faster than ship time', () => {
  const c: Course = { distance: 1e6, accel: G_LY };
  const s = advance({ ...AT_REST, eta: 1 }, c, 1, 2);
  near(s.t, 2 * Math.cosh(1));
  near(s.x, 2 * Math.sinh(1));
  near(s.eta, 1);
});

test('speed up, coast, brake: docks exactly with the closed-form times', () => {
  const D = 10.47, c: Course = { distance: D, accel: G_LY };
  for (const v of [0.3, 0.84]) {
    const eL = Math.atanh(v);
    const s = advance(AT_REST, c, eL, Infinity);
    const coast = D - (2 * (Math.cosh(eL) - 1)) / G_LY;
    expect(s.x).toBe(D);
    expect(s.eta).toBe(0);
    near(s.t, (2 * Math.sinh(eL)) / G_LY + coast / Math.tanh(eL));
    near(s.tau, (2 * eL) / G_LY + coast / Math.sinh(eL));
    expect(docked(s, c)).toBe(true);
  }
});

test('a lever out of reach turns at the braking curve', () => {
  const D = 5.96, a = 0.5 * G_LY, c: Course = { distance: D, accel: a };
  const peak = Math.acosh(1 + (a * D) / 2);
  const mid = advance(AT_REST, c, Math.atanh(0.99), peak / a);
  near(mid.eta, peak, 1e-7);
  near(mid.x, D / 2, 1e-7);
  const end = advance(AT_REST, c, Math.atanh(0.99), Infinity);
  expect(end.x).toBe(D);
  expect(end.eta).toBe(0);
  near(end.tau, (2 * peak) / a);
});

test('many small steps equal one big one', () => {
  const c: Course = { distance: 10.47, accel: G_LY };
  const lever = Math.atanh(0.84);
  let s: Ship = AT_REST;
  for (let i = 0; i < 5000; i++) s = advance(s, c, lever, 0.002);
  s = advance(s, c, lever, Infinity);
  const one = advance(AT_REST, c, lever, Infinity);
  near(s.t, one.t);
  near(s.tau, one.tau);
});

test('the lever moved mid-flight', () => {
  const D = 10.47, a = G_LY, c: Course = { distance: D, accel: a };
  const lever = Math.atanh(0.84);
  const bp = (s: Ship) => brakePoint(s, c);
  // raised during braking: nothing changes
  let s = advance(AT_REST, c, lever, 3);
  while (s.x < bp(s) - 1e-6) s = advance(s, c, lever, 0.05);
  const braking = s;
  const calm = advance(braking, c, lever, Infinity);
  const raised = advance(advance(braking, c, Math.atanh(0.99), 0.4), c, Math.atanh(0.99), Infinity);
  const plain = advance(advance(braking, c, lever, 0.4), c, lever, Infinity);
  near(raised.t, plain.t);
  near(raised.tau, plain.tau);
  near(calm.t, plain.t);
  // lowered while coasting: eta falls at rate a, then holds
  const cruise = advance(AT_REST, c, lever, 2.5);
  near(cruise.eta, Math.min(lever, a * 2.5), 1e-12);
  const low = Math.atanh(0.3);
  const dropped = advance(cruise, c, low, (cruise.eta - low) / a);
  near(dropped.eta, low, 1e-9);
  const held = advance(dropped, c, low, 0.5);
  near(held.eta, low, 1e-12);
  const end = advance(cruise, c, low, Infinity);
  expect(end.x).toBe(D);
  for (const k of [dropped, held, end]) {
    expect(Number.isNaN(k.x + k.t + k.tau + k.eta)).toBe(false);
    expect(k.x).toBeLessThanOrEqual(D);
  }
});

test('docked ships spend no more time', () => {
  const c: Course = { distance: 4.25, accel: G_LY };
  const end = advance(AT_REST, c, Math.atanh(0.95), Infinity);
  expect(advance(end, c, Math.atanh(0.5), 100)).toEqual(end);
  expect(etaStop(c, c.distance)).toBe(0);
});

test('delivery waits for ripening', () => {
  expect(deliveryYear({ ...AT_REST, t: 10, tau: 6 }, 8)).toBe(12);
  expect(deliveryYear({ ...AT_REST, t: 10, tau: 9 }, 8)).toBe(10);
});

test('news travels at light speed', () => {
  expect(seenColonyYear({ ...AT_REST, t: 5, x: 3 }, 10)).toBe(-2);
  expect(seenColonyYear({ ...AT_REST, t: 5, x: 10 }, 10)).toBe(5);
});

test('aberration and Doppler', () => {
  near(aberrate(0.3, 0), 0.3, 1e-12);
  near(doppler(0.3, 0), 1, 1e-12);
  near(aberrate(1, 0.8), 1, 1e-12);
  near(aberrate(0, 0.6), 0.6, 1e-12);
  near(doppler(1, 0.6), Math.sqrt(1.6 / 0.4), 1e-12);
});

test('the lever spans 0.1c to the top, evenly in rapidity', () => {
  near(leverToEta(0, 0.95), Math.atanh(0.1), 1e-12);
  near(leverToEta(1, 0.95), Math.atanh(0.95), 1e-12);
  near(leverToEta(0.5, 0.95), (Math.atanh(0.1) + Math.atanh(0.95)) / 2, 1e-12);
  for (const s of [0, 0.25, 0.7, 1]) near(etaToLever(leverToEta(s, 0.99), 0.99), s, 1e-12);
});

test('star colours', () => {
  const warm = starColour(3000).match(/\d+/g)!.map(Number);
  const hot = starColour(20000).match(/\d+/g)!.map(Number);
  expect(warm[0]).toBeGreaterThan(warm[2]);
  expect(hot[2]).toBeGreaterThan(hot[0]);
  for (const k of [1, 1500, 5800, 40000, 1e6]) expect(starColour(k)).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
});

test('photon rocket', () => {
  near(photonMassRatio(1, false), Math.E ** 2, 1e-12);
  near(photonMassRatio(1, true), Math.E ** 4, 1e-12);
});
