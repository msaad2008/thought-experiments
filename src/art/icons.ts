import type { GameId } from '../shared/progress';
import { glow, orb } from './shapes';

// One decorative icon per game, viewBox 0 0 100 100. Every gradient and
// clip id is prefixed with the game so icons can share a page.

const svg = (inner: string): string =>
  `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`;

/** Clock ticks around (cx, cy): bars at 12/3/6/9, dots elsewhere. */
function ticks(cx: number, cy: number, r: number): string {
  let out = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const x = Math.sin(a);
    const y = -Math.cos(a);
    const f = (n: number): number => Math.round(n * 10) / 10;
    if (i % 3 === 0) {
      out += `<path d="M${f(cx + x * (r - 4))} ${f(cy + y * (r - 4))}L${f(cx + x * r)} ${f(cy + y * r)}"/>`;
    } else {
      out += `<circle cx="${f(cx + x * (r - 1))}" cy="${f(cy + y * (r - 1))}" r="1.3" stroke="none"/>`;
    }
  }
  return `<g stroke="#8fdcff" stroke-width="2.6" stroke-linecap="round" fill="#8fdcff">${out}</g>`;
}

// Relativity: a stopwatch racing along, speed streaks trailing behind it.
const relativity = svg(
  `<defs>${glow('rel-glow', '#5fd0ff', 0.6)}</defs>` +
    `<circle cx="56" cy="52" r="44" fill="url(#rel-glow)"/>` +
    `<g stroke="#5fd0ff" stroke-width="4" stroke-linecap="round">` +
    `<path d="M10 40H22" opacity=".55"/><path d="M5 53H21" opacity=".9"/><path d="M11 66H23" opacity=".55"/></g>` +
    `<rect x="53.5" y="18" width="5" height="7" rx="1.5" fill="#cfe9fb"/>` +
    `<rect x="49" y="13" width="14" height="7" rx="3.5" fill="#eaf6ff"/>` +
    `<rect x="74.5" y="25" width="5" height="7" rx="2" fill="#cfe9fb" transform="rotate(45 77 28.5)"/>` +
    orb('rel-body', 56, 53, 28, '#eaf6ff', '#b4d6ee') +
    orb('rel-face', 56, 53, 22, '#24346f', '#1a2758', '', 0.22) +
    ticks(56, 53, 19) +
    `<g stroke-linecap="round" fill="none">` +
    `<path d="M56 53V40" stroke="#fff" stroke-width="3"/>` +
    `<path d="M56 53L65.5 58.5" stroke="#ffd25e" stroke-width="4"/></g>` +
    `<circle cx="56" cy="53" r="3.4" fill="#ffd25e"/><circle cx="56" cy="53" r="1.3" fill="#24346f"/>`,
);

// Gravity: a banded planet bending a probe's dotted path around it.
const gravity = svg(
  `<defs>${glow('grav-glow', '#ff7a3d', 0.6)}</defs>` +
    `<circle cx="44" cy="50" r="42" fill="url(#grav-glow)"/>` +
    orb(
      'grav-body',
      44,
      50,
      21,
      '#ff7a3d',
      '#d24e28',
      `<g transform="rotate(-14 44 50)">` +
        `<rect x="18" y="41" width="52" height="5" rx="2.5" fill="#ffa266" opacity=".85"/>` +
        `<rect x="18" y="52" width="52" height="3.5" rx="1.75" fill="#ffa266" opacity=".55"/>` +
        `<ellipse cx="38" cy="59" rx="5" ry="2.6" fill="#e8612f"/></g>`,
    ) +
    `<path d="M6 82C30 86 62 88 74 66C82 51 80 32 86 21" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="0.1 6.6" opacity=".9"/>` +
    `<circle cx="89" cy="15" r="8" fill="#fff" opacity=".18"/>` +
    `<circle cx="89" cy="15" r="4" fill="#fff"/>`,
);

// Entanglement: two particles with opposite spins, linked by twin strands.
const entanglement = svg(
  `<defs>${glow('ent-glow-a', '#ff5c8a', 0.6)}${glow('ent-glow-b', '#5fd0ff', 0.6)}</defs>` +
    `<circle cx="28" cy="50" r="27" fill="url(#ent-glow-a)"/>` +
    `<circle cx="72" cy="50" r="27" fill="url(#ent-glow-b)"/>` +
    `<g fill="none" stroke-width="2.6" stroke-linecap="round">` +
    `<path d="M28 50C43 27 57 73 72 50" stroke="#ffb3c8" opacity=".9"/>` +
    `<path d="M28 50C43 73 57 27 72 50" stroke="#b5ecff" opacity=".9"/></g>` +
    `<circle cx="50" cy="50" r="2.6" fill="#fff"/>` +
    orb('ent-a', 28, 50, 14, '#ff5c8a', '#d23a6b') +
    orb('ent-b', 72, 50, 14, '#5fd0ff', '#2d9ad4') +
    `<g fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M28 56.5V43.5M23.5 48L28 43.5L32.5 48"/>` +
    `<path d="M72 43.5V56.5M67.5 52L72 56.5L76.5 52"/></g>`,
);

// Uncertainty: a particle smeared into a fuzzy cloud, its momentum only
// known within a cone.
const uncertainty = svg(
  `<defs><radialGradient id="unc-fuzz">` +
    `<stop offset="0" stop-color="#9b7bff" stop-opacity=".8"/>` +
    `<stop offset=".35" stop-color="#9b7bff" stop-opacity=".42"/>` +
    `<stop offset=".7" stop-color="#9b7bff" stop-opacity=".14"/>` +
    `<stop offset="1" stop-color="#9b7bff" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="unc-cone" cx="44" cy="56" r="42" gradientUnits="userSpaceOnUse">` +
    `<stop offset=".2" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
    `<circle cx="44" cy="56" r="40" fill="url(#unc-fuzz)"/>` +
    `<path d="M44 56L68.1 21.6A42 42 0 0 1 84.6 45.1Z" fill="url(#unc-cone)"/>` +
    `<g fill="#e2d8ff">` +
    `<circle cx="22" cy="42" r="1.7" opacity=".8"/><circle cx="28" cy="75" r="1.4" opacity=".6"/>` +
    `<circle cx="60" cy="79" r="1.6" opacity=".7"/><circle cx="17" cy="60" r="1.2" opacity=".5"/>` +
    `<circle cx="36" cy="29" r="1.3" opacity=".6"/><circle cx="50" cy="88" r="1.1" opacity=".45"/></g>` +
    orb('unc-p', 44, 56, 11, '#e2d8ff', '#a88cff') +
    `<g fill="none" stroke="#ffd25e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M55 48.3L74.6 34.6"/><path d="M66 34.4L74.6 34.6L71.8 42.7"/></g>`,
);

// Collider: a segmented detector ring with curling particle tracks
// spraying out of one bright collision.
const collider = svg(
  `<defs>${glow('col-glow', '#ffd25e', 0.75)}</defs>` +
    `<circle cx="50" cy="50" r="38" fill="none" stroke="#2ec4b6" stroke-width="7" stroke-dasharray="12.4 2.5" transform="rotate(-84 50 50)"/>` +
    `<circle cx="50" cy="50" r="30.5" fill="none" stroke="#2ec4b6" stroke-width="1.6" opacity=".45"/>` +
    `<circle cx="50" cy="50" r="24" fill="url(#col-glow)"/>` +
    `<g fill="none" stroke-width="2.6" stroke-linecap="round">` +
    `<path d="M50 50Q60 35 72 31" stroke="#ffd25e"/>` +
    `<path d="M50 50Q36 43 25 58" stroke="#ff5c8a"/>` +
    `<path d="M50 50Q55 66 46 78" stroke="#5fd0ff"/>` +
    `<path d="M50 50Q66 54 77 61" stroke="#fff"/>` +
    `<path d="M50 50Q44 34 37 24" stroke="#ffd25e" opacity=".6"/></g>` +
    `<g><circle cx="72" cy="31" r="2.4" fill="#ffd25e"/><circle cx="25" cy="58" r="2.4" fill="#ff5c8a"/>` +
    `<circle cx="46" cy="78" r="2.4" fill="#5fd0ff"/><circle cx="77" cy="61" r="2.4" fill="#fff"/>` +
    `<circle cx="37" cy="24" r="2.4" fill="#ffd25e" opacity=".6"/></g>` +
    `<circle cx="50" cy="50" r="5.5" fill="#fff"/>`,
);

export const ICONS: Record<GameId, string> = { relativity, gravity, entanglement, uncertainty, collider };
