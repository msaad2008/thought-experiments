import { glow, orb } from './shapes';

// Hero illustration, viewBox 0 0 400 220: a ringed planet, its icy moon,
// and a little ship on a dotted path. Ids are prefixed "hero-".
// Classes tw / ship-bob / flame are animated in home.css (off under
// reduced motion).

/** A four-point sparkle centred on (x, y). */
const sparkle = (x: number, y: number, s: number, fill: string, cls = ''): string =>
  `<path${cls ? ` class="${cls}"` : ''} fill="${fill}" d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z"/>`;

const stars =
  `<g fill="#fff">` +
  `<circle cx="30" cy="30" r="1.4" opacity=".8" class="tw"/><circle cx="82" cy="150" r="1" opacity=".5"/>` +
  `<circle cx="162" cy="24" r="1.2" opacity=".7" class="tw tw-2"/><circle cx="384" cy="14" r="1.5" opacity=".8"/>` +
  `<circle cx="384" cy="118" r="1" opacity=".5" class="tw tw-3"/><circle cx="196" cy="206" r="1.2" opacity=".6"/>` +
  `<circle cx="300" cy="208" r="1" opacity=".5" class="tw"/><circle cx="18" cy="110" r="1" opacity=".55"/>` +
  `<circle cx="138" cy="118" r=".9" opacity=".45"/><circle cx="58" cy="76" r="1.1" opacity=".6" class="tw tw-3"/></g>` +
  sparkle(186, 50, 5, '#fff', 'tw tw-2') +
  sparkle(48, 188, 4, '#ffd25e', 'tw') +
  sparkle(378, 76, 3.5, '#bfe9ff', 'tw tw-3');

// The ring is drawn in a group tilted -12deg: the back half first, the
// planet over it, then the front half over the planet.
const ringArc = (front: boolean): string => {
  const arc = (rx: number, ry: number): string =>
    front ? `M${250 + rx} 115A${rx} ${ry} 0 0 1 ${250 - rx} 115` : `M${250 - rx} 115A${rx} ${ry} 0 0 1 ${250 + rx} 115`;
  return (
    `<g fill="none" stroke-linecap="round">` +
    `<path d="${arc(116, 25)}" stroke="#ffd25e" stroke-width="7"/>` +
    `<path d="${arc(101, 20)}" stroke="#f5b54a" stroke-width="4"/>` +
    `</g>`
  );
};

const planet = orb(
  'hero-planet',
  250,
  115,
  62,
  '#ff7a3d',
  '#d24e28',
  `<rect x="180" y="88" width="140" height="10" rx="5" fill="#ffa266" opacity=".8"/>` +
    `<rect x="180" y="106" width="140" height="5" rx="2.5" fill="#ffb27f" opacity=".5"/>` +
    `<rect x="180" y="128" width="140" height="8" rx="4" fill="#e8612f" opacity=".7"/>` +
    `<ellipse cx="226" cy="146" rx="11" ry="5.5" fill="#e8612f"/>`,
);

const moon = orb(
  'hero-moon',
  110,
  70,
  20,
  '#8fdcff',
  '#3fa3dc',
  `<circle cx="103" cy="63" r="4.2" fill="#6cc6f2"/><circle cx="117" cy="75" r="3" fill="#6cc6f2"/>` +
    `<circle cx="101" cy="78" r="2.2" fill="#6cc6f2"/>`,
);

const far = orb('hero-far', 362, 172, 8, '#ff5c8a', '#cf3a6a');

// Ship nose points along +x; it sits at the end of the path, turned to
// follow it (the path's end tangent is about -18deg).
const ship =
  `<g transform="translate(362 38) rotate(-18)"><g class="ship-bob">` +
  `<path class="flame" d="M-13 -3.6Q-27 0 -13 3.6Z" fill="#ffd25e"/>` +
  `<path d="M-8 -6L-15 -12Q-12 -6 -4 -6Z" fill="#ff5c8a"/>` +
  `<path d="M-8 6L-15 12Q-12 6 -4 6Z" fill="#ff5c8a"/>` +
  `<path d="M-13 -6H3Q14 -6 19 0Q14 6 3 6H-13Q-15.5 0 -13 -6Z" fill="#f2f4ff"/>` +
  `<path d="M-14.1 2H16.9Q13.6 6 3 6H-13Q-13.9 4 -14.1 2Z" fill="#c9cdea"/>` +
  `<circle cx="5" cy="-0.5" r="2.8" fill="#5fd0ff"/>` +
  `</g></g>`;

export const HERO_SVG =
  `<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
  `<defs>${glow('hero-glow-planet', '#ff8a4a', 0.5)}${glow('hero-glow-moon', '#5fd0ff', 0.55)}${glow('hero-glow-far', '#ff5c8a', 0.5)}</defs>` +
  stars +
  `<circle cx="250" cy="115" r="118" fill="url(#hero-glow-planet)"/>` +
  `<circle cx="110" cy="70" r="40" fill="url(#hero-glow-moon)"/>` +
  `<circle cx="362" cy="172" r="20" fill="url(#hero-glow-far)"/>` +
  // The probe's path swings round behind the planet, so the ring overlaps it.
  `<path d="M16 200C120 196 200 150 250 110C290 78 320 52 350 42" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0.1 7" opacity=".6"/>` +
  `<g transform="rotate(-12 250 115)">${ringArc(false)}${planet}${ringArc(true)}</g>` +
  moon +
  far +
  ship +
  `</svg>`;
