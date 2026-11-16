export type GameId = 'relativity' | 'gravity' | 'entanglement' | 'uncertainty' | 'collider';
export const GAME_IDS: GameId[] = ['relativity', 'gravity', 'entanglement', 'uncertainty', 'collider'];

export interface GameProgress {
  best: Record<string, number>;
  spent: number;
  upgrades: string[];
  introSeen: boolean;
}

export function isClassroom(search: string = location.search): boolean {
  return new URLSearchParams(search).has('classroom');
}

function defaultStore(): Storage | null {
  if (isClassroom()) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolve(store: Storage | null | undefined): Storage | null {
  return store === undefined ? defaultStore() : store;
}

function empty(): GameProgress {
  return { best: {}, spent: 0, upgrades: [], introSeen: false };
}

const key = (game: GameId): string => `te:${game}`;

export function loadProgress(game: GameId, store?: Storage | null): GameProgress {
  const s = resolve(store);
  if (!s) return empty();
  try {
    const raw = s.getItem(key(game));
    if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<GameProgress> | null;
    if (!p || typeof p !== 'object') return empty();
    return {
      best: p.best && typeof p.best === 'object' && !Array.isArray(p.best) ? p.best : {},
      spent: typeof p.spent === 'number' ? p.spent : 0,
      upgrades: Array.isArray(p.upgrades) ? p.upgrades : [],
      introSeen: p.introSeen === true,
    };
  } catch {
    return empty();
  }
}

export function saveProgress(game: GameId, p: GameProgress, store?: Storage | null): void {
  const s = resolve(store);
  if (!s) return;
  try {
    s.setItem(key(game), JSON.stringify(p));
  } catch {
    /* storage unavailable or full: ignore */
  }
}

export function recordLevel(game: GameId, levelId: string, stars: number, store?: Storage | null): GameProgress {
  const p = loadProgress(game, store);
  p.best[levelId] = Math.max(p.best[levelId] ?? 0, stars);
  saveProgress(game, p, store);
  return p;
}

export function starsEarned(p: GameProgress): number {
  return Object.values(p.best).reduce((a, b) => a + b, 0);
}

export function totalStars(store?: Storage | null): number {
  const s = resolve(store);
  return GAME_IDS.reduce((sum, id) => sum + starsEarned(loadProgress(id, s)), 0);
}

export function resetAll(store?: Storage | null): void {
  const s = resolve(store);
  if (!s) return;
  try {
    for (const id of GAME_IDS) s.removeItem(key(id));
  } catch {
    /* ignore */
  }
}
