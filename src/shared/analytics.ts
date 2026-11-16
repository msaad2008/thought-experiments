import type { GameId } from './progress';

declare global {
  interface Window {
    goatcounter?: { count(o: object): void };
  }
}

export function trackLevelComplete(game: GameId, levelId: string, stars: number): void {
  try {
    window.goatcounter?.count({ path: `level/${game}/${levelId}/${stars}`, title: 'level complete', event: true });
  } catch {
    /* analytics blocked or failing: ignore */
  }
}
