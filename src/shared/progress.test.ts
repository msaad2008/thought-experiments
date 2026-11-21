// @vitest-environment jsdom
import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadProgress, recordLevel, totalStars, isClassroom, withClassroom, resetAll, starsAvailable, buyUpgrade, GAME_IDS } from './progress';

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
test('withClassroom is idempotent', () => {
  expect(withClassroom('/gravity/?classroom', '?classroom')).toBe('/gravity/?classroom');
  expect(withClassroom('/a/?x=1&classroom#h', '?classroom')).toBe('/a/?x=1&classroom#h');
});
test('recordLevel ignores NaN and floors fractions', () => {
  recordLevel('gravity', '01', NaN, localStorage);
  expect(loadProgress('gravity', localStorage).best).not.toHaveProperty('01');
  recordLevel('gravity', '01', 2.7, localStorage);
  expect(loadProgress('gravity', localStorage).best['01']).toBe(2);
});
test('loadProgress drops malformed entries', () => {
  localStorage.setItem('te:gravity', JSON.stringify({ best: { '01': 'x', '02': 3 }, spent: -4, upgrades: ['aim', 7] }));
  const p = loadProgress('gravity', localStorage);
  expect(p.best).toEqual({ '02': 3 });
  expect(p.spent).toBe(0);
  expect(p.upgrades).toEqual(['aim']);
});
test('starsAvailable never goes negative', () => {
  expect(starsAvailable({ best: { a: 3 }, spent: 5, upgrades: [], introSeen: false })).toBe(0);
  expect(starsAvailable({ best: { a: 3 }, spent: 1, upgrades: [], introSeen: false })).toBe(2);
});
test('buyUpgrade spends stars once', () => {
  recordLevel('gravity', '1', 3, localStorage);
  const p = buyUpgrade('gravity', 'aim', 3, localStorage);
  expect(p?.spent).toBe(3);
  expect(p?.upgrades).toEqual(['aim']);
  expect(buyUpgrade('gravity', 'aim', 3, localStorage)).toBeNull();
});
test('buyUpgrade refuses when too expensive and leaves the store alone', () => {
  recordLevel('gravity', '1', 3, localStorage);
  const before = localStorage.getItem('te:gravity');
  expect(buyUpgrade('gravity', 'aim', 4, localStorage)).toBeNull();
  expect(localStorage.getItem('te:gravity')).toBe(before);
});
test('loadProgress keeps only best values of 0 to 3 whole stars', () => {
  localStorage.setItem('te:gravity', JSON.stringify({ best: { '01': -1, '02': 2.6, '03': 7, '04': 0, '05': null, '06': '2' }, spent: 0, upgrades: [] }));
  expect(loadProgress('gravity', localStorage).best).toEqual({ '02': 2, '03': 3, '04': 0 });
});
