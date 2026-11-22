import { test, expect } from 'vitest';
import { INTRO, PHYSICS_HTML, UPGRADES } from './content';
import { GAMES } from '../../site/games';

test('four intro cards, each with art', () => {
  expect(INTRO).toHaveLength(4);
  for (const c of INTRO) {
    expect(c.art).toContain('<svg');
    expect(c.text.length).toBeGreaterThan(0);
  }
});

test('upgrades', () => {
  expect(UPGRADES.map((u) => [u.id, u.cost, u.requires])).toEqual([
    ['fast', 4, undefined],
    ['fast2', 8, 'fast'],
    ['graph', 5, undefined],
  ]);
});

test('physics panel', () => {
  for (const s of ['Δx* = √(ħt/2m)', 'σ_min = √(ħt/m)', '10<sup>43</sup>', 'second measurement']) {
    expect(PHYSICS_HTML).toContain(s);
  }
});

test('registry entry is live', () => {
  const g = GAMES.find((x) => x.id === 'uncertainty');
  expect(g?.status).toBe('live');
  expect(g?.maxStars).toBe(24);
});
