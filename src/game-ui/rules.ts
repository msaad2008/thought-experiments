import { starsAvailable, type GameProgress } from '../shared/progress';
import type { Upgrade } from './types';

/** A level opens once the one before it has been completed (even with 0 stars). */
export function isUnlocked(index: number, levelIds: string[], p: GameProgress, classroom: boolean): boolean {
  if (classroom || index <= 0) return true;
  return levelIds[index - 1] !== undefined && levelIds[index - 1] in p.best;
}

export function ownedUpgrades(all: Upgrade[], p: GameProgress, classroom: boolean): Set<string> {
  if (classroom) return new Set(all.map((u) => u.id));
  const known = new Set(all.map((u) => u.id));
  return new Set(p.upgrades.filter((id) => known.has(id)));
}

export function canBuy(u: Upgrade, p: GameProgress, classroom: boolean): boolean {
  if (classroom || p.upgrades.includes(u.id)) return false;
  if (u.requires && !p.upgrades.includes(u.requires)) return false;
  return starsAvailable(p) >= u.cost;
}
