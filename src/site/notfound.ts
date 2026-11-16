import '@fontsource-variable/inter';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/pages.css';
import { circlePath, glow, orb } from '../art/shapes';
import { applyClassroomUi } from './classroom-ui';

// A lost satellite drifting beside a small planet. Flat fills, no outlines.
const SVG =
  `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
  `<defs>${glow('nf-glow', '#8f7cff', 0.5)}</defs>` +
  `<circle cx="95" cy="110" r="90" fill="url(#nf-glow)"/>` +
  orb(
    'nf-planet',
    95,
    110,
    52,
    '#6c5ce7',
    '#3f2f9c',
    `<path d="${circlePath(80, 95, 14)}" fill="#8576f0"/><path d="${circlePath(118, 128, 9)}" fill="#8576f0"/>`,
  ) +
  `<g transform="rotate(-22 232 78)">` +
  `<rect x="190" y="70" width="30" height="16" rx="2" fill="#4cc9f0"/>` +
  `<rect x="244" y="70" width="30" height="16" rx="2" fill="#4cc9f0"/>` +
  `<rect x="220" y="64" width="24" height="28" rx="5" fill="#e9e6ff"/>` +
  `<path d="M232 64v-10" stroke="#ffd25e" stroke-width="2.5" stroke-linecap="round"/>` +
  `<circle cx="232" cy="52" r="3.5" fill="#ffd25e"/>` +
  `<circle cx="232" cy="78" r="6" fill="#2a1b5c"/>` +
  `</g>` +
  `<path d="M160 150q40 24 98 -2" fill="none" stroke="#c8c2f0" stroke-opacity=".35" stroke-width="2" stroke-dasharray="2 8" stroke-linecap="round"/>` +
  `</svg>`;

const art = document.getElementById('lost-art');
if (art) art.innerHTML = SVG;

applyClassroomUi();
