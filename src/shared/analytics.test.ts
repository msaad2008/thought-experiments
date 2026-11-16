// @vitest-environment jsdom
import { test, expect, vi, afterEach } from 'vitest';
import { trackLevelComplete } from './analytics';

afterEach(() => { delete window.goatcounter; });

test('no-op when goatcounter is blocked', () => {
  delete window.goatcounter;
  expect(() => trackLevelComplete('gravity', '3', 2)).not.toThrow();
});

test('sends an event path', () => {
  window.goatcounter = { count: vi.fn() };
  trackLevelComplete('gravity', '3', 2);
  expect(window.goatcounter.count).toHaveBeenCalledWith(expect.objectContaining({ path: 'level/gravity/3/2', event: true }));
});

test('count throwing is swallowed', () => {
  window.goatcounter = { count: () => { throw new Error('blocked'); } };
  expect(() => trackLevelComplete('gravity', '3', 2)).not.toThrow();
});
