// @vitest-environment jsdom
import { test, expect, beforeEach } from 'vitest';
import { loadProgress, recordLevel, totalStars, isClassroom } from './progress';

beforeEach(() => localStorage.clear());

test('empty progress when nothing stored', () => expect(loadProgress('gravity', localStorage)).toEqual({ best: {}, spent: 0, upgrades: [], introSeen: false }));
test('recordLevel keeps the best stars', () => { recordLevel('gravity', '1', 3, localStorage); recordLevel('gravity', '1', 1, localStorage); expect(loadProgress('gravity', localStorage).best['1']).toBe(3); });
test('totalStars sums all games', () => { recordLevel('gravity', '1', 2, localStorage); recordLevel('uncertainty', '1', 3, localStorage); expect(totalStars(localStorage)).toBe(5); });
test('corrupt JSON resets only that game', () => { recordLevel('uncertainty', '1', 3, localStorage); localStorage.setItem('te:gravity', '{oops'); expect(loadProgress('gravity', localStorage).best).toEqual({}); expect(totalStars(localStorage)).toBe(3); });
test('throwing storage never throws', () => { const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } } as unknown as Storage; expect(() => recordLevel('gravity', '1', 3, bad)).not.toThrow(); expect(loadProgress('gravity', bad).best).toEqual({}); });
test('null store (classroom) saves nothing', () => { recordLevel('gravity', '1', 3, null); expect(localStorage.getItem('te:gravity')).toBeNull(); });
test('isClassroom', () => { expect(isClassroom('?classroom')).toBe(true); expect(isClassroom('?ref=x&classroom=1')).toBe(true); expect(isClassroom('?ref=x')).toBe(false); });
