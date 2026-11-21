import type { IntroCard, Upgrade } from '../../game-ui/types';

const svg = (inner: string): string =>
  `<svg viewBox="0 0 200 120" role="img" aria-hidden="true" focusable="false">${inner}</svg>`;

export const INTRO: IntroCard[] = [
  {
    text: 'Everything with mass pulls on everything else.',
    art: svg(
      '<circle cx="60" cy="60" r="26" fill="#6c63d6"/><circle cx="150" cy="60" r="14" fill="#ffd25e"/>' +
        '<path d="M120 60H92m6-6-6 6 6 6M92 60h0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>',
    ),
  },
  {
    text: "Your ship has no engine. Once it launches, it can't steer.",
    art: svg(
      '<path d="M30 90 L130 50" stroke="#c8c2f0" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/>' +
        '<path d="M130 38 L160 50 L130 62 Z" fill="#ff7a3d" transform="rotate(-22 145 50)"/>',
    ),
  },
  {
    text: 'So you place moons and stars in its way, and let gravity do the steering.',
    art: svg(
      '<path d="M20 95 Q90 100 120 50 T185 25" stroke="#c8c2f0" stroke-width="3" fill="none" stroke-dasharray="2 8" stroke-linecap="round"/>' +
        '<circle cx="110" cy="85" r="18" fill="#6c63d6"/><circle cx="20" cy="95" r="6" fill="#ff7a3d"/>',
    ),
  },
  {
    text: 'Reach the beacon. Grab the three stars on the way.',
    art: svg(
      '<circle cx="165" cy="60" r="16" fill="none" stroke="#ffd25e" stroke-width="4"/><circle cx="165" cy="60" r="5" fill="#ffd25e"/>' +
        '<g fill="#ffd25e"><circle cx="50" cy="75" r="6"/><circle cx="85" cy="50" r="6"/><circle cx="122" cy="68" r="6"/></g>',
    ),
  },
];

export const UPGRADES: Upgrade[] = [
  { id: 'aim', name: 'Aim line', desc: 'See where the first 1.5 seconds of the flight will go.', cost: 3 },
  { id: 'aim2', name: 'Long aim line', desc: 'See the first 4 seconds of the flight.', cost: 6, requires: 'aim' },
];

export const PHYSICS_HTML = `
<h3>The pull</h3>
<p class="eq">a = GM/r²</p>
<p>The ship feels every body at once and the pulls add as arrows. Before launch, the thin arrows on the ship show each body's pull and the bold arrow shows the total.</p>

<h3>Size and density</h3>
<p class="eq">R = (3M/4πρ)^(1/3)</p>
<p>Outside a round body its pull depends only on its mass (the shell theorem). Density only sets its size, so a denser body lets you pass closer, where the pull is stronger.</p>

<h3>Black holes</h3>
<p class="eq">Φ = −GM/(r − r_s), r_s = 2GM/c²</p>
<p>The game uses the Paczyński–Wiita approximation. Like real general relativity, it has no stable orbits inside 3 r_s. Inside 1.5 r_s nothing falling inward escapes.</p>
<p class="eq">clock rate = √(1 − r_s/r)</p>
<p>The ship's clock ticks at this rate compared with a far-away clock. That is the rate for a clock held still at that distance; the game ignores the extra slowing from the ship's speed.</p>

<h3>What this game simplifies</h3>
<ul>
  <li>The masses, sizes and distances are not to scale.</li>
  <li>Space is 2D.</li>
  <li>The bodies stay put instead of pulling on each other.</li>
  <li>Near a black hole, the approximation is good but not exact general relativity.</li>
</ul>
`;
