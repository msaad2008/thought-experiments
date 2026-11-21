import type { GameId } from '../shared/progress';

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  cost: number;
  requires?: string;
}
/** art is an inline SVG string. */
export interface IntroCard {
  art: string;
  text: string;
}
export interface LevelContext {
  stage: HTMLElement;
  upgrades: ReadonlySet<string>;
  /** Shows the level end; mount records progress and tracks it. */
  complete(stars: number, insight: string): void;
  /** Leaves the level for the level select. */
  levels(): void;
}
export interface GameConfig {
  id: GameId;
  title: string;
  levels: { id: string; title: string }[];
  intro: IntroCard[];
  physicsHtml: string;
  upgrades: Upgrade[];
  /** Returns a cleanup function. */
  startLevel(index: number, ctx: LevelContext): () => void;
}
