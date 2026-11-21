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

/** Keep classroom mode when following a same-site link. */
export function withClassroom(href: string, search: string = location.search): string {
  if (!isClassroom(search) || !href.startsWith('/') || href.startsWith('//')) return href;
  const hashAt = href.indexOf('#');
  const base = hashAt < 0 ? href : href.slice(0, hashAt);
  const hash = hashAt < 0 ? '' : href.slice(hashAt);
  const queryAt = base.indexOf('?');
  if (queryAt >= 0 && new URLSearchParams(base.slice(queryAt + 1)).has('classroom')) return href;
  return `${base}${base.includes('?') ? '&' : '?'}classroom${hash}`;
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
      best: p.best && typeof p.best === 'object' && !Array.isArray(p.best)
        ? Object.fromEntries(
            Object.entries(p.best)
              .filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] >= 0)
              .map(([k, v]) => [k, Math.min(3, Math.floor(v))]),
          )
        : {},
      spent: typeof p.spent === 'number' && Number.isFinite(p.spent) && p.spent >= 0 ? p.spent : 0,
      upgrades: Array.isArray(p.upgrades) ? p.upgrades.filter((u): u is string => typeof u === 'string') : [],
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
  if (!Number.isFinite(stars)) return p;
  p.best[levelId] = Math.max(p.best[levelId] ?? 0, Math.max(0, Math.floor(stars)));
  saveProgress(game, p, store);
  return p;
}

export function starsEarned(p: GameProgress): number {
  return Object.values(p.best).reduce((a, b) => a + b, 0);
}

export function starsAvailable(p: GameProgress): number {
  return Math.max(0, starsEarned(p) - p.spent);
}

/** Spend stars on an upgrade. Returns null if unaffordable or already owned. */
export function buyUpgrade(game: GameId, id: string, cost: number, store?: Storage | null): GameProgress | null {
  const p = loadProgress(game, store);
  if (p.upgrades.includes(id) || !Number.isFinite(cost) || cost < 0 || cost > starsAvailable(p)) return null;
  p.spent += cost;
  p.upgrades.push(id);
  saveProgress(game, p, store);
  return p;
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
