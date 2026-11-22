import { test, expect } from 'vitest';
import {
  HBAR, REAL_HBAR, DX_MIN, DX_MAX, velocitySpread, spread, bestDx, minSpread, hitChance, atLeast, gaussian,
  sampleFound, predictedCentre, flightTime, sliderToDx, dxToSlider, hbarRatio,
} from './physics';

function mulberry32(a: number): () => number {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// [mass in kg, flight time in s] for the eight levels
const LEVELS: [number, number][] = [
  [5e6, 1], [2.7e5, 3], [7.5e6, 1.5], [2e6, 2], [3.5e6, 2], [8.5e5, 1.5], [2.4e6, 3], [1.9e6, 3],
];

test('the best measurement is Δx* = √(ħt/2m), giving σ_min = √(ħt/m)', () => {
  const m = 2e6, t = 2;
  const dx = bestDx(m, t);
  expect(dx).toBeCloseTo(Math.sqrt((HBAR * 2) / (2 * 2e6)), 8);
  expect(Math.abs(spread(dx, m, t) / Math.sqrt((HBAR * 2) / 2e6) - 1)).toBeLessThan(1e-9);
  expect(Math.abs(minSpread(m, t) / Math.sqrt((HBAR * 2) / 2e6) - 1)).toBeLessThan(1e-9);
  expect(spread(0.9 * dx, m, t)).toBeGreaterThan(spread(dx, m, t));
  expect(spread(1.1 * dx, m, t)).toBeGreaterThan(spread(dx, m, t));
});

test('momentum blur: Δv = ħ/(2mΔx), and Δx·Δp = ħ/2 exactly', () => {
  expect(velocitySpread(10, 5e6) * 5e6 * 10).toBeCloseTo(HBAR / 2, 3);
});

test('spread grows from Δx at t = 0', () => {
  expect(spread(12, 1e6, 0)).toBe(12);
  expect(spread(12, 1e6, 2)).toBeGreaterThan(spread(12, 1e6, 1));
  expect(spread(12, 1e6, 1)).toBeGreaterThan(12);
});

test('hit chance matches the 2D Gaussian', () => {
  const s = 40;
  expect(hitChance(s, s)).toBeCloseTo(1 - Math.exp(-0.5), 12);
  expect(hitChance(s, s, s)).toBeCloseTo(hitChance(s * Math.SQRT2, s), 12);
  expect(hitChance(s, 0)).toBe(0);
});

test('binomial tail', () => {
  expect(atLeast(0.5, 3)).toBeCloseTo(0.5, 12);
  expect(atLeast(1, 5)).toBeCloseTo(1, 12);
  expect(atLeast(0.3, 0)).toBe(1);
  expect(atLeast(0.9, 5)).toBeCloseTo(0.9 ** 5, 12);
});

test('gaussian sampling has the right spread', () => {
  const rng = mulberry32(12345), xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < 20000; i++) { const p = sampleFound({ x: 0, y: 0 }, 40, rng); xs.push(p.x); ys.push(p.y); }
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const std = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + (v - mean(a)) ** 2, 0) / a.length);
  expect(Math.abs(mean(xs))).toBeLessThan(1.5);
  expect(Math.abs(mean(ys))).toBeLessThan(1.5);
  expect(Math.abs(std(xs) / 40 - 1)).toBeLessThan(0.03);
  expect(Math.abs(std(ys) / 40 - 1)).toBeLessThan(0.03);
  expect(gaussian(() => 0) === 0).toBe(true); // the formula gives -0, which is still zero
});

test('flight time upgrades', () => {
  expect(flightTime(4, new Set())).toBe(4);
  expect(flightTime(4, new Set(['fast']))).toBe(3);
  expect(flightTime(4, new Set(['fast', 'fast2']))).toBe(2);
  expect(flightTime(4, new Set(['fast2']))).toBe(2);
});

test('slider is log-scaled and round-trips, even at the ends', () => {
  expect(sliderToDx(0)).toBeCloseTo(3, 10);
  expect(sliderToDx(1)).toBeCloseTo(150, 10);
  expect(sliderToDx(0.5)).toBeCloseTo(Math.sqrt(450), 10);
  for (const s of [0, 0.13, 0.5, 1]) expect(dxToSlider(sliderToDx(s))).toBeCloseTo(s, 10);
  expect(sliderToDx(-1)).toBeCloseTo(DX_MIN, 10);
  expect(sliderToDx(2)).toBeCloseTo(DX_MAX, 10);
  expect(dxToSlider(1)).toBe(0);
  expect(dxToSlider(1000)).toBe(1);
  for (const [m, t] of LEVELS) for (const dx of [DX_MIN, DX_MAX]) {
    expect(Number.isFinite(spread(dx, m, t))).toBe(true);
    expect(Number.isFinite(velocitySpread(dx, m))).toBe(true);
  }
});

test('the game ħ is about 10⁴³ times the real one', () => {
  expect(HBAR).toBe(1e9);
  expect(REAL_HBAR).toBeCloseTo(1.054571817e-34, 40);
  expect(Math.round(Math.log10(hbarRatio()))).toBe(43);
});

test('predicted centre', () => {
  expect(predictedCentre({ x: 1, y: 2, vx: 3, vy: -4 }, 2)).toEqual({ x: 7, y: -6 });
});
