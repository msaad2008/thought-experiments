import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { INTRO, PHYSICS_HTML, UPGRADES } from './content';
import { GAMES } from '../../site/games';
import { LEVELS, bestLever } from './levels';
import { leverToEta, photonMassRatio } from './physics';

test('four intro cards, each with art', () => {
  expect(INTRO).toHaveLength(4);
  for (const c of INTRO) {
    expect(c.art).toContain('<svg');
    expect(c.text.length).toBeGreaterThan(0);
  }
});

test('upgrades', () => {
  expect(UPGRADES.map((u) => [u.id, u.cost])).toEqual([
    ['couch', 5],
    ['incubator', 6],
    ['predictor', 4],
  ]);
});

test('physics panel', () => {
  for (const s of ['tanh', '(γ − 1)', 'face to face']) expect(PHYSICS_HTML).toContain(s);
  const l = LEVELS[1];
  const n = Math.round(photonMassRatio(leverToEta(bestLever(l, new Set()), l.leverMax), false) - 1);
  expect(n).toBeGreaterThan(1);
  expect(PHYSICS_HTML).toContain(`need about ${n} kilograms of fuel for every kilogram of ship`);
});

test('registry entry is live', () => {
  const g = GAMES.find((x) => x.id === 'relativity');
  expect(g?.status).toBe('live');
  expect(g?.maxStars).toBe(24);
});

test('about page no longer says the speed of light is shrunk', () => {
  const html = readFileSync('about/index.html', 'utf8');
  expect(html).not.toContain('shrunk');
  expect(html).toContain('/relativity/');
});
