import { withClassroom, type GameId } from '../shared/progress';
import { ICONS } from '../art/icons';
import type { GameInfo } from './games';

function tile(g: GameInfo, earned: number, search: string): string {
  const style = `background:linear-gradient(160deg, ${g.from}, ${g.to});--accent:${g.accent}`;
  const body =
    `<span class="tile-art" aria-hidden="true">${ICONS[g.id]}</span>` +
    `<span class="tile-title">${g.title}</span>` +
    `<span class="tile-sub">${g.subtitle}</span>`;
  if (g.status === 'live') {
    const stars =
      `<span class="tile-meta"><span aria-hidden="true">★ ${earned}/${g.maxStars}</span>` +
      `<span class="sr-only">${earned} of ${g.maxStars} stars</span></span>`;
    return `<li><a class="tile" href="${withClassroom(`/${g.id}/`, search)}" style="${style}">${body}${stars}</a></li>`;
  }
  return `<li><div class="tile soon" aria-disabled="true" style="${style}">${body}<span class="tile-meta">Coming soon</span></div></li>`;
}

/** Tile list items for the home page grid (goes inside `<ul class="tiles">`). */
export function renderTiles(games: GameInfo[], earned: (id: GameId) => number, search: string = typeof location === 'undefined' ? '' : location.search): string {
  return games.map((g) => tile(g, g.status === 'live' ? earned(g.id) : 0, search)).join('');
}
