// The eight Uncertain Fire levels. levels.test.ts computes the exact binomial odds for each one
// (best setting, human aim error, wrong preset) and proves the tuning targets are met.
import { PRESETS, bestDx, spread, type Reading } from './physics';
import l01 from './levels/01.json';
import l02 from './levels/02.json';
import l03 from './levels/03.json';
import l04 from './levels/04.json';
import l05 from './levels/05.json';
import l06 from './levels/06.json';
import l07 from './levels/07.json';
import l08 from './levels/08.json';

export interface Level {
  id: string;
  title: string;
  /** Shown at the start of the level. */
  hint: string;
  /** Shown on the level-end screen. */
  insight: string;
  massTonnes: number;
  /** Seconds from firing to landing (before upgrades). */
  flightTime: number;
  /** Metres: a shell this close to the aim point hits. */
  hitRadius: number;
  /** Metres: the sky is a width x width square, origin top-left, gun at (width/2, width). */
  width: number;
  presetsOnly: boolean;
  arrowToImpact: boolean;
  /** Exactly 5: the instrument reading at each shot. */
  shots: Reading[];
}

export const LEVELS: Level[] = [l01, l02, l03, l04, l05, l06, l07, l08] as Level[];

export const massKg = (l: Level): number => l.massTonnes * 1000;

/** The best Δx the player can choose: the better preset when presetsOnly, else Δx*. */
export function bestSetting(l: Level, t: number = l.flightTime): number {
  const m = massKg(l);
  if (!l.presetsOnly) return bestDx(m, t);
  return spread(PRESETS.position, m, t) <= spread(PRESETS.momentum, m, t) ? PRESETS.position : PRESETS.momentum;
}

/**
 * Where the setting starts when there is no kept setup: no mode on levels 1–3 (the player picks one),
 * Position mode's Δx on the slider levels. A slider start inside the dip would win the level untouched.
 */
export function startSetting(l: Level): number | null {
  return l.presetsOnly ? null : PRESETS.position;
}
