import type { IntroCard, Upgrade } from '../../game-ui/types';
import { hbarRatio } from './physics';

const svg = (inner: string): string =>
  `<svg viewBox="0 0 200 120" role="img" aria-hidden="true" focusable="false">${inner}</svg>`;

/** The warship: pointed hull, fins, engine glow. Drawn pointing up, centred on (cx, cy), scaled by s. */
const ship = (cx: number, cy: number, s: number): string =>
  `<g transform="translate(${cx} ${cy}) scale(${s})">` +
  '<path d="M-6 8 L-16 18 L-6 14 Z M6 8 L16 18 L6 14 Z" fill="#6c5bb5"/>' +
  '<path d="M0 -20 L7 8 L-7 8 Z" fill="#d9ccff"/>' +
  '<path d="M-4 8 L0 20 L4 8 Z" fill="#ff7a3d"/>' +
  '<circle cx="0" cy="-2" r="2.5" fill="#3a2a7a"/></g>';

const arrow = (x1: number, y1: number, x2: number, y2: number): string => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = (d: number): string => `${(x2 - 6 * Math.cos(a + d)).toFixed(1)} ${(y2 - 6 * Math.sin(a + d)).toFixed(1)}`;
  return `<path d="M${x1} ${y1}L${x2} ${y2}M${h(0.5)}L${x2} ${y2}L${h(-0.5)}"/>`;
};

const ARROW_STYLE = 'stroke="#ffd25e" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"';

export const INTRO: IntroCard[] = [
  {
    text: 'In this world, ħ is huge. Even a warship is a fuzzy quantum object.',
    art: svg(
      '<ellipse cx="100" cy="60" rx="70" ry="46" fill="#6c5bb5" opacity="0.3"/>' +
        '<ellipse cx="100" cy="60" rx="50" ry="32" fill="#6c5bb5" opacity="0.4"/>' +
        ship(100, 60, 1.4),
    ),
  },
  {
    text: 'Measure where it is sharply, and its speed turns fuzzy.',
    art: svg(
      '<circle cx="50" cy="60" r="4" fill="#d9ccff"/>' +
        `<g ${ARROW_STYLE}>${arrow(60, 60, 170, 18)}${arrow(60, 60, 175, 38)}${arrow(60, 60, 178, 60)}${arrow(60, 60, 175, 82)}${arrow(60, 60, 170, 102)}</g>`,
    ),
  },
  {
    text: 'Measure its speed sharply, and its position turns fuzzy.',
    art: svg(
      '<ellipse cx="85" cy="60" rx="62" ry="44" fill="#6c5bb5" opacity="0.3"/>' +
        '<ellipse cx="85" cy="60" rx="40" ry="28" fill="#6c5bb5" opacity="0.4"/>' +
        `<g ${ARROW_STYLE}>${arrow(50, 60, 175, 60)}</g>`,
    ),
  },
  {
    text: 'Your shell takes time to arrive, and the fuzz keeps spreading. Five shots: hit three to win.',
    art: svg(
      '<rect x="10" y="98" width="34" height="12" rx="3" fill="#3a2a7a"/>' +
        '<path d="M30 100 L48 88" stroke="#d9ccff" stroke-width="6" stroke-linecap="round"/>' +
        '<path d="M52 86 Q110 20 160 48" stroke="#d9ccff" stroke-width="3" fill="none" stroke-dasharray="2 8" stroke-linecap="round"/>' +
        '<ellipse cx="168" cy="50" rx="26" ry="20" fill="#6c5bb5" opacity="0.3"/>' +
        '<ellipse cx="150" cy="44" rx="12" ry="9" fill="#6c5bb5" opacity="0.4"/>' +
        '<g fill="#ffd25e"><circle cx="30" cy="22" r="4"/><circle cx="52" cy="22" r="4"/><circle cx="74" cy="22" r="4"/><circle cx="96" cy="22" r="4"/><circle cx="118" cy="22" r="4"/></g>',
    ),
  },
];

export const UPGRADES: Upgrade[] = [
  { id: 'fast', name: 'Faster shells', desc: 'Shells arrive in three quarters of the time.', cost: 4 },
  { id: 'fast2', name: 'Rail shells', desc: 'Shells arrive in half the time.', cost: 8, requires: 'fast' },
  { id: 'graph', name: 'Spread graph', desc: 'See how the blur at impact changes with your setting.', cost: 5 },
];

const N = Math.round(Math.log10(hbarRatio()));

export const PHYSICS_HTML = `
<h3>The uncertainty principle</h3>
<p class="eq">Δx·Δp ≥ ħ/2, with Δp = mΔv</p>
<p>Δx is how fuzzy the ship's position is, Δp how fuzzy its momentum is, and ħ is a constant of nature. Pin the position down and the speed has to be fuzzy, and the other way round.</p>

<h3>The spread grows</h3>
<p class="eq">σ(t)² = Δx² + (ħt/2mΔx)²</p>
<p>σ is the width of the cloud when the shell lands, after time t. Δx² is the fuzz in position you measured. (ħt/2mΔx)² is the fuzz in speed (Δv = ħ/2mΔx), which makes the cloud spread by Δv × t. A small Δx makes the second term large, and a large Δx makes the first term large.</p>

<h3>The best setting</h3>
<p class="eq">Δx* = √(ħt/2m)</p>
<p class="eq">σ_min = √(ħt/m)</p>
<p>At Δx* the two terms are equal, which makes the cloud as small as it can be. It never gets smaller than σ_min, whatever you do. A heavier ship or a shorter flight gives a smaller cloud.</p>
<p>Before the shell lands, the ship has no exact position. The landing is a second measurement, and where the ship turns up is random, following the cloud.</p>

<h3>What this game simplifies</h3>
<ul>
  <li>ħ here is 1 × 10⁹ J·s, about 10<sup>${N}</sup> times the real value.</li>
  <li>The whole warship is treated as one quantum particle in the simplest (Gaussian) state.</li>
  <li>There is no gravity or air.</li>
  <li>The shell's flight time is fixed.</li>
  <li>Measurements are perfect.</li>
</ul>
`;
