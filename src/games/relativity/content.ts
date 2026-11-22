import type { IntroCard, Upgrade } from '../../game-ui/types';
import { LEVELS, bestLever } from './levels';
import { leverToEta, photonMassRatio } from './physics';

const svg = (inner: string): string =>
  `<svg viewBox="0 0 200 120" role="img" aria-hidden="true" focusable="false">${inner}</svg>`;

const BLUE = '#5fd0ff';
const YELLOW = '#ffd25e';
const STROKE = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';

/** The ship: a rounded hull pointing right, with a window and a flame. Centred on (cx, cy). */
const ship = (cx: number, cy: number, s: number): string =>
  `<g transform="translate(${cx} ${cy}) scale(${s})">` +
  `<path d="M-16 -7 L8 -7 Q20 0 8 7 L-16 7 Z" fill="#dff4ff"/>` +
  `<circle cx="2" cy="0" r="3" fill="#1c2e6e"/>` +
  `<path d="M-16 -4 L-26 0 L-16 4 Z" fill="${YELLOW}"/></g>`;

const star = (cx: number, cy: number, r: number, fill: string): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r * 1.8}" fill="${fill}" opacity="0.25"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

const mirror = (x: number, y: number, w: number): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="${BLUE}"/>`;

export const INTRO: IntroCard[] = [
  {
    text: 'A colony near a real star needs a cure. It grows on your ship, so it ripens by your clock.',
    art: svg(
      star(168, 60, 9, YELLOW) +
        ship(60, 60, 1.5) +
        `<path d="M92 60 H148" stroke="${BLUE}" stroke-width="3" stroke-dasharray="2 8" ${STROKE}/>` +
        `<circle cx="100" cy="100" r="9" fill="none" stroke="${BLUE}" stroke-width="3"/>` +
        `<path d="M100 100 V94 M100 100 L104 102" stroke="${BLUE}" stroke-width="2" ${STROKE}/>`,
    ),
  },
  {
    text: "Moving clocks run slow, as measured from the frame they move through. When you arrive and read the colony's clock face to face, yours shows less time.",
    art: svg(
      // resting light clock: pulse goes straight up and down
      mirror(20, 18, 50) +
        mirror(20, 92, 50) +
        `<path d="M45 90 V25" stroke="${YELLOW}" stroke-width="3" ${STROKE}/>` +
        `<circle cx="45" cy="58" r="4" fill="${YELLOW}"/>` +
        // moving light clock: the pulse zigzags, a longer path
        mirror(110, 18, 76) +
        mirror(110, 92, 76) +
        `<path d="M114 90 L136 25 L158 90 L180 25" stroke="${YELLOW}" stroke-width="3" ${STROKE}/>` +
        `<path d="M118 108 H176 M170 104 L176 108 L170 112" stroke="${BLUE}" stroke-width="3" ${STROKE}/>`,
    ),
  },
  {
    text: "Too slow and you're late. Too fast and the cure isn't ripe, so you have to wait.",
    art: svg(
      `<path d="M20 100 H180" stroke="${BLUE}" stroke-width="3" opacity="0.5" ${STROKE}/>` +
        star(172, 100, 7, YELLOW) +
        `<path d="M24 96 Q60 20 100 60 T160 96" stroke="${YELLOW}" stroke-width="3" stroke-dasharray="2 8" ${STROKE}/>` +
        `<circle cx="100" cy="30" r="11" fill="none" stroke="${BLUE}" stroke-width="3"/>` +
        `<path d="M100 30 V22 M100 30 L106 33" stroke="${BLUE}" stroke-width="3" ${STROKE}/>` +
        ship(40, 96, 0.9),
    ),
  },
  {
    text: 'Your crew can only take about 1 g, so speeding up and stopping take years. News from the colony travels at light speed.',
    art: svg(
      ship(36, 80, 1.1) +
        `<path d="M20 108 H180" stroke="${BLUE}" stroke-width="3" opacity="0.5" ${STROKE}/>` +
        star(172, 40, 7, YELLOW) +
        `<path d="M160 44 Q110 60 70 74" stroke="${YELLOW}" stroke-width="3" stroke-dasharray="2 8" ${STROKE}/>` +
        `<rect x="92" y="22" width="26" height="18" rx="3" fill="${BLUE}"/>` +
        `<path d="M92 24 L105 33 L118 24" stroke="#0d1433" stroke-width="2" ${STROKE}/>`,
    ),
  },
];

export const UPGRADES: Upgrade[] = [
  { id: 'couch', name: 'Crew couches', desc: 'Your crew can take one and a half times the g-force.', cost: 5 },
  { id: 'incubator', name: 'Fast incubator', desc: 'The culture ripens in four fifths of the time.', cost: 6 },
  { id: 'predictor', name: 'Arrival predictor', desc: 'See which delivery year each cruise speed gives.', cost: 4 },
];

const L2 = LEVELS[1];
const N = Math.round(photonMassRatio(leverToEta(bestLever(L2, new Set()), L2.leverMax), false) - 1);

export const PHYSICS_HTML = `
<h3>Time dilation</h3>
<p class="eq">γ = 1/√(1 − v²/c²)</p>
<p>v is your speed and c is the speed of light. Picture a clock made of a light pulse bouncing between two mirrors. When the clock moves, the pulse has to travel a longer zigzag path, but light always goes at c, so each tick takes longer. Seen from the frame the clock moves through, it ticks slower by the factor γ.</p>

<h3>Slowing looks mutual, arriving does not</h3>
<p>Imagine a line of clocks along the route, all at rest relative to Earth and the colony and synchronized with each other. As you fly past them, each one you pass ticks slow compared with your own clock. And from the ship's frame, the clocks of the line, Earth and the colony all run slow. Coasting is symmetric, and neither side is "really" slow.</p>
<p>The reading when you stop is not symmetric. When you read the colony's clock face to face, there is one reading and nothing to argue about. Your clock shows less time, because you were the one who sped up, turned around and slowed down. The same goes for the trip home.</p>

<h3>Speeding up</h3>
<p class="eq">v = c·tanh(gτ/c)</p>
<p>At a steady acceleration g, measured on the ship, your speed creeps toward c without ever reaching it. τ is the time on your clock. Most of the effect is felt near the end, where each extra bit of speed costs a lot.</p>

<h3>Stopping</h3>
<p class="eq">d = (c²/a)(γ − 1)</p>
<p>To stop at the colony you have to start braking this far away. It grows quickly with γ, so a fast ship must brake from far out.</p>

<h3>News and light delay</h3>
<p>News from the colony travels at the speed of light, so it is old when it arrives. The ship receives it later still the further along it is, and a message sent in year t reaches a point a distance d away in year t + d. In the game, news always says when it was sent.</p>

<h3>The view ahead</h3>
<p>At high speed the stars bunch toward the direction you are flying (aberration), and light from ahead looks bluer and brighter while light from behind looks redder (the Doppler effect). The view ahead shows both.</p>

<h3>Length contraction</h3>
<p>The distance to the star, measured on the ship, shrinks by the same factor γ, which is another way to see why your trip takes less time on your clock.</p>

<h3>What this game simplifies</h3>
<ul>
  <li>The trip plays as a time-lapse.</li>
  <li>The colonies are invented. The stars and their distances are real.</li>
  <li>Fuel is ignored. A perfect photon rocket on level 2's best trip would need about ${N} kilograms of fuel for every kilogram of ship.</li>
  <li>The ship is a point that turns around instantly.</li>
  <li>Earth and the colonies are treated as at rest relative to each other.</li>
</ul>
`;
