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
  /** Classroom mode: a teacher is driving, so a game may offer extras such as showing a solution. */
  classroom: boolean;
  /** Reopen the level as the player left it after their last try ("Retry with this setup"). */
  keepSetup: boolean;
  /** Shows the level end; mount records progress and tracks it. */
  complete(stars: number, insight: string): void;
  /** True while something covers the level (the Physics panel): a game holds its clock still. */
  paused(): boolean;
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
