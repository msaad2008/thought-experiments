// @vitest-environment jsdom
import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadProgress, recordLevel, totalStars, isClassroom, withClassroom, resetAll, GAME_IDS } from './progress';

beforeEach(() => localStorage.clear());
afterEach(() => { history.replaceState({}, '', '/'); vi.restoreAllMocks(); });

test('empty progress when nothing stored', () => expect(loadProgress('gravity', localStorage)).toEqual({ best: {}, spent: 0, upgrades: [], introSeen: false }));
test('recordLevel keeps the best stars', () => { recordLevel('gravity', '1', 3, localStorage); recordLevel('gravity', '1', 1, localStorage); expect(loadProgress('gravity', localStorage).best['1']).toBe(3); });
test('totalStars sums all games', () => { recordLevel('gravity', '1', 2, localStorage); recordLevel('uncertainty', '1', 3, localStorage); expect(totalStars(localStorage)).toBe(5); });
test('corrupt JSON resets only that game', () => { recordLevel('uncertainty', '1', 3, localStorage); localStorage.setItem('te:gravity', '{oops'); expect(loadProgress('gravity', localStorage).best).toEqual({}); expect(totalStars(localStorage)).toBe(3); });
test('throwing storage never throws', () => { const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } } as unknown as Storage; expect(() => recordLevel('gravity', '1', 3, bad)).not.toThrow(); expect(loadProgress('gravity', bad).best).toEqual({}); });
test('null store (classroom) saves nothing', () => { recordLevel('gravity', '1', 3, null); expect(localStorage.getItem('te:gravity')).toBeNull(); });
test('isClassroom', () => { expect(isClassroom('?classroom')).toBe(true); expect(isClassroom('?ref=x&classroom=1')).toBe(true); expect(isClassroom('?ref=x')).toBe(false); });

test('default store in classroom mode saves and loads nothing', () => {
  localStorage.setItem('te:gravity', JSON.stringify({ best: { '1': 2 }, spent: 0, upgrades: [], introSeen: false }));
  history.replaceState({}, '', '/?classroom');
  expect(loadProgress('gravity').best).toEqual({});
  localStorage.clear();
  recordLevel('gravity', '1', 3);
  expect(localStorage.getItem('te:gravity')).toBeNull();
});
test('blocked localStorage never throws with the default store', () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => loadProgress('gravity')).not.toThrow();
  expect(() => recordLevel('gravity', '1', 3)).not.toThrow();
});
test('resetAll removes the five te: keys only', () => {
  for (const id of GAME_IDS) recordLevel(id, '1', 1, localStorage);
  localStorage.setItem('other', 'keep');
  resetAll(localStorage);
  for (const id of GAME_IDS) expect(localStorage.getItem(`te:${id}`)).toBeNull();
  expect(localStorage.getItem('other')).toBe('keep');
});
test('withClassroom appends the flag to same-site paths', () => {
  const c = '?classroom';
  expect(withClassroom('/#games', c)).toBe('/?classroom#games');
  expect(withClassroom('/gravity/', c)).toBe('/gravity/?classroom');
  expect(withClassroom('/a/?x=1', c)).toBe('/a/?x=1&classroom');
  expect(withClassroom('/a/?x=1#h', c)).toBe('/a/?x=1&classroom#h');
});
test('withClassroom leaves other hrefs alone', () => {
  expect(withClassroom('/gravity/', '')).toBe('/gravity/');
  expect(withClassroom('https://example.com/', '?classroom')).toBe('https://example.com/');
  expect(withClassroom('//x.com/a', '?classroom')).toBe('//x.com/a');
});
