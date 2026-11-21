import { test, expect } from 'vitest';
import { isUnlocked, ownedUpgrades, canBuy } from './rules';
import type { GameProgress } from '../shared/progress';
import type { Upgrade } from './types';

const ids = ['01', '02', '03'];
const empty = (): GameProgress => ({ best: {}, spent: 0, upgrades: [], introSeen: false });
const all: Upgrade[] = [
  { id: 'aim', name: 'Aim', desc: '', cost: 3 },
  { id: 'aim2', name: 'Aim2', desc: '', cost: 6, requires: 'aim' },
];

test('first level is always unlocked, next needs previous completed', () => {
  expect(isUnlocked(0, ids, empty(), false)).toBe(true);
  expect(isUnlocked(1, ids, empty(), false)).toBe(false);
  expect(isUnlocked(1, ids, { ...empty(), best: { '01': 0 } }, false)).toBe(true);
  expect(isUnlocked(2, ids, { ...empty(), best: { '01': 3 } }, false)).toBe(false);
});

test('classroom unlocks everything', () => {
  expect(isUnlocked(2, ids, empty(), true)).toBe(true);
});

test('ownedUpgrades', () => {
  expect([...ownedUpgrades(all, empty(), true)].sort()).toEqual(['aim', 'aim2']);
  const p = { ...empty(), upgrades: ['aim', 'bogus'] };
  expect([...ownedUpgrades(all, p, false)]).toEqual(['aim']);
});

test('canBuy', () => {
  const rich = { ...empty(), best: { '01': 3, '02': 3, '03': 3 } };
  expect(canBuy(all[1], rich, false)).toBe(false); // needs aim
  expect(canBuy(all[0], { ...empty(), best: { '01': 2 } }, false)).toBe(false); // too few stars
  expect(canBuy(all[0], rich, false)).toBe(true);
  expect(canBuy(all[0], { ...rich, upgrades: ['aim'] }, false)).toBe(false); // owned
  expect(canBuy(all[1], { ...rich, upgrades: ['aim'] }, false)).toBe(true);
  expect(canBuy(all[0], rich, true)).toBe(false);
});
