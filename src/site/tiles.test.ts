import { test, expect } from 'vitest';
import { GAMES } from './games';
import { renderTiles } from './tiles';

const gravity = GAMES.find((g) => g.id === 'gravity')!;

test('live tile links to its game and shows stars', () => {
  const html = renderTiles([{ ...gravity, status: 'live', maxStars: 30 }], () => 9);
  expect(html).toContain('href="/gravity/"');
  expect(html).toContain('★ 9/30');
});

test('soon tile is not a link', () => {
  const html = renderTiles([{ ...gravity, status: 'soon' }], () => 0);
  expect(html).toContain('Coming soon');
  expect(html).not.toContain('href');
});

test('tile uses the registry gradient', () => {
  const html = renderTiles([gravity], () => 0);
  expect(html).toContain('#6a2a1c');
  expect(html).toContain('#2a1236');
});
