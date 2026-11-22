// Canvas drawing for Antidote Run: the view out of the front window and the route strip. Drawing only.
// Everything is drawn in a 100 × 100 square (top 70 the window, bottom 30 the route); the canvas
// transform maps that square to device pixels, so line widths and font sizes are in those units.
import {
  bestLever, deliveryFor, type Level,
} from './levels';
import {
  aberrate, advance, brakePoint, deliveryYear, doppler, leverToEta, starColour,
  type Course, type Ship,
} from './physics';

const TAU = Math.PI * 2;
const GOLD = '#ffd25e';
const ACCENT = '#5fd0ff';
const TEXT = '#c8c2f0';
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fin = (v: number, d = 0) => (Number.isFinite(v) ? v : d);

export interface View { k: number; ox: number; oy: number; size: number; dpr: number }

/** A square, centred in a w × h CSS-px box; k maps the 100-unit drawing square to CSS px. */
export function fitView(w: number, h: number, dpr: number): View {
  const size = Math.min(w, h);
  return { k: size / 100, ox: (w - size) / 2, oy: (h - size) / 2, size, dpr };
}

export type Phase = 'brief' | 'flight' | 'ripening' | 'return' | 'done' | 'late';

export interface Scene {
  level: Level;
  ship: Ship;
  course: Course;
  /** 1 outbound; -1 on the trip home (ship.x then counts from the colony). */
  heading: 1 | -1;
  colonyYearSeen: number;
  /** Seconds, for the twinkle only. */
  time: number;
  reducedMotion: boolean;
  phase: Phase;
}

export interface Star { cos: number; az: number; kelvin: number; mag: number }

/** Small seeded PRNG (mulberry32): the same sky every time, with no visible pattern. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 300 fixed stars, uniform on the sphere from a seeded PRNG (an even spiral showed up as a swirl once the sky bunched forward).
 * Index 0 is the colony's star, dead ahead.
 */
export const STARS: Star[] = (() => {
  const N = 300, rnd = mulberry32(20261122), out: Star[] = [{ cos: 1, az: 0, kelvin: 4200, mag: 1 }];
  for (let i = 1; i < N; i++) {
    const f1 = rnd(), f2 = rnd();
    out.push({
      cos: 2 * rnd() - 1,
      az: rnd() * TAU,
      kelvin: 3200 + 9000 * f1 * f1,
      mag: 0.25 + 0.75 * f2 * f2,
    });
  }
  return out;
})();

/** Azimuthal-equidistant: radius = seen angle / half the field of view, or null past the edge. */
export function projectStar(cosSeen: number, az: number, fovDeg: number): { r: number; az: number } | null {
  const theta = (Math.acos(clamp(fin(cosSeen, 1), -1, 1)) * 180) / Math.PI;
  const r = theta / (fovDeg / 2);
  return r <= 1 ? { r, az } : null;
}

const FOV = 110;
const WIN_H = 70; // the window's height; the route strip is the rest
const CX = 50, CY = WIN_H / 2, REACH = 50; // r = 1 reaches the side of the square

function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number): void {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(${rgb},${alpha})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath(); g.arc(x, y, Math.max(0, r), 0, TAU); g.fill();
}

function poly(g: CanvasRenderingContext2D, pts: number[][]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

/** "rgb(r,g,b)" to "r,g,b". */
const rgbOf = (c: string) => c.slice(4, -1);

function viewAhead(g: CanvasRenderingContext2D, s: Scene): void {
  const beta = Math.tanh(fin(s.ship.eta));
  const flip = s.heading === -1 ? -1 : 1;
  const T = s.reducedMotion ? 0 : fin(s.time);
  g.save();
  g.beginPath(); g.rect(0, 0, 100, WIN_H); g.clip();
  STARS.forEach((st, i) => {
    const cosSeen = aberrate(st.cos, beta);
    const p = projectStar(cosSeen, st.az, FOV);
    if (!p) return;
    const d = doppler(cosSeen, beta);
    const kelvin = (i === 0 && s.heading === -1 ? 5800 : st.kelvin) * d;
    const colour = starColour(kelvin);
    const x = CX + flip * Math.cos(p.az) * p.r * REACH;
    const y = CY + Math.sin(p.az) * p.r * REACH;
    const boost = clamp(Math.sqrt(d), 0.6, 2.2);
    const twinkle = s.reducedMotion ? 1 : 0.9 + 0.1 * Math.sin(T * 2 + i * 1.7);
    const alpha = clamp(0.25 + 0.6 * st.mag * Math.pow(d, 0.8), 0.2, 1) * twinkle;
    if (i === 0) {
      glow(g, x, y, 11, rgbOf(colour), 0.55);
      glow(g, x, y, 4.5, '255,255,255', 0.5);
      disc(g, x, y, 2.2, colour);
      return;
    }
    const r = clamp((0.3 + 0.7 * st.mag) * boost, 0.3, 1.8);
    g.globalAlpha = alpha;
    disc(g, x, y, r, colour);
    g.globalAlpha = 1;
  });
  g.restore();
}

const EX = 14, CXR = 86, RY = 86; // Earth, colony, and the route line's height

function planet(g: CanvasRenderingContext2D, x: number, y: number, r: number, sea: string, land: string): void {
  disc(g, x, y, r, sea);
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
  g.fillStyle = land;
  poly(g, [[x - r * 0.7, y - r * 0.1], [x - r * 0.2, y - r * 0.6], [x + r * 0.1, y - r * 0.1], [x - r * 0.3, y + r * 0.3]]); g.fill();
  poly(g, [[x + r * 0.3, y + r * 0.2], [x + r * 0.8, y - r * 0.1], [x + r * 0.7, y + r * 0.6], [x + r * 0.2, y + r * 0.7]]); g.fill();
  g.restore();
}

/** A flat little rocket, `len` long, nose along +x. */
function rocket(g: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1, len: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(dir === 1 ? 0 : Math.PI);
  const u = len / 10;
  g.fillStyle = '#ff7a3d'; // flame
  poly(g, [[-5 * u, 0], [-8.5 * u, -1.1 * u], [-8.5 * u, 1.1 * u]]); g.fill();
  g.fillStyle = '#4a3b8c'; // fins
  poly(g, [[-3 * u, -1.5 * u], [-5 * u, -3.4 * u], [-5 * u, -1.5 * u]]); g.fill();
  poly(g, [[-3 * u, 1.5 * u], [-5 * u, 3.4 * u], [-5 * u, 1.5 * u]]); g.fill();
  g.fillStyle = '#e8e0ff'; // body
  poly(g, [[5 * u, 0], [2 * u, -1.8 * u], [-5 * u, -1.8 * u], [-5 * u, 1.8 * u], [2 * u, 1.8 * u]]); g.fill();
  disc(g, 0.5 * u, 0, 0.9 * u, ACCENT);
  g.restore();
}

function routeStrip(g: CanvasRenderingContext2D, s: Scene): void {
  const D = s.course.distance, hd = s.heading;
  g.fillStyle = 'rgba(13,20,51,0.6)';
  g.fillRect(0, WIN_H, 100, 100 - WIN_H);
  g.strokeStyle = 'rgba(95,208,255,0.35)'; g.lineWidth = 0.5; g.setLineDash([]);
  g.beginPath(); g.moveTo(0, WIN_H); g.lineTo(100, WIN_H); g.stroke();

  // x position in the strip for a distance `d` from the start of the current leg
  const at = (d: number) => {
    const f = clamp(fin(d / D), 0, 1);
    return hd === 1 ? EX + f * (CXR - EX) : CXR - f * (CXR - EX);
  };

  g.strokeStyle = 'rgba(200,194,240,0.35)'; g.lineWidth = 0.6; g.setLineDash([1.5, 1.5]);
  g.beginPath(); g.moveTo(EX, RY); g.lineTo(CXR, RY); g.stroke(); g.setLineDash([]);

  planet(g, EX, RY, 5, '#2f7fd6', '#4cc38a');
  glow(g, CXR + 8, RY - 6, 8, '255,210,94', 0.6);
  disc(g, CXR + 8, RY - 6, 2, GOLD);
  planet(g, CXR, RY, 4, '#d6744a', '#f0a868');
  g.fillStyle = TEXT; g.font = '5px sans-serif'; g.textBaseline = 'alphabetic';
  g.textAlign = 'left'; g.fillText('Earth', 3, 97);
  g.textAlign = 'right'; g.fillText(s.level.star, 97, 97);

  const moving = s.phase === 'flight' || s.phase === 'return';
  const shipD = s.phase === 'brief' ? 0 : s.ship.x;

  if (moving && s.ship.eta > 1e-9) {
    const bp = brakePoint(s.ship, s.course);
    if (Number.isFinite(bp) && bp >= shipD && bp <= D) {
      g.strokeStyle = GOLD; g.lineWidth = 0.7; g.setLineDash([1.2, 1]);
      g.beginPath(); g.moveTo(at(bp), RY - 6); g.lineTo(at(bp), RY + 6); g.stroke(); g.setLineDash([]);
    }
  }

  // the colony's yearly news, on its way to the ship
  if (hd === 1 && s.phase !== 'brief') {
    const t = fin(s.ship.t);
    const first = Math.max(0, Math.floor(fin(s.colonyYearSeen, -1e9)) + 1);
    const last = Math.min(Math.floor(t), first + 400);
    for (let y = first; y <= last; y++) {
      const px = D - (t - y);
      if (px < shipD - 1e-9 || px > D) continue;
      const x = at(px);
      glow(g, x, RY, 3, '255,210,94', 0.7);
      disc(g, x, RY, 0.9, '#fff3c4');
    }
  }

  const sx = at(shipD);
  rocket(g, sx, RY - 7, hd, 9);
}

export function drawScene(g: CanvasRenderingContext2D, v: View, s: Scene): void {
  g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  g.setLineDash([]); g.globalAlpha = 1;
  g.save();
  g.setTransform(v.k * v.dpr, 0, 0, v.k * v.dpr, v.ox * v.dpr, v.oy * v.dpr);
  const sky = g.createLinearGradient(0, 0, 0, 100);
  sky.addColorStop(0, '#1c2e6e'); sky.addColorStop(1, '#0d1433');
  g.fillStyle = sky; g.fillRect(0, 0, 100, 100);
  viewAhead(g, s);
  routeStrip(g, s);
  g.restore();
}

/** A predictor curve: the delivery year for each of 101 lever settings, and the year range it is drawn over. */
export interface Curve {
  vals: number[];
  lo: number;
  hi: number;
  /** The speed of the earliest delivery, or null when every setting delivers the same year (at the colony). */
  bestSpeed: number | null;
}
const curves = new Map<string, Curve>();
const N_PTS = 100;

function shape(l: Level, vals: number[], bestSpeed: number | null): Curve {
  const lo = Math.min(...vals, l.marks[1]) - 0.3;
  const hi = Math.max(lo + 1, Math.min(Math.max(...vals), l.deadline + 4));
  return { vals, lo, hi, bestSpeed };
}

/** Before launch: from rest, with the ripening time known at launch. Cached per level and upgrade set. */
export function predictorCurve(l: Level, upgrades: ReadonlySet<string>): Curve {
  const key = `${l.id}|${[...upgrades].sort().join(',')}`;
  let c = curves.get(key);
  if (!c) {
    const vals = Array.from({ length: N_PTS + 1 }, (_, i) => deliveryFor(l, upgrades, i / N_PTS));
    c = shape(l, vals, Math.tanh(leverToEta(bestLever(l, upgrades), l.leverMax)));
    curves.set(key, c);
  }
  return c;
}

/**
 * After launch: each setting held from the ship's current state (its t and τ carry on), with the
 * current ripening time. 101 exact flights: the caller recomputes it a few times a second, not every frame.
 */
export function liveCurve(l: Level, c: Course, ship: Ship, ripen: number): Curve {
  const vals = Array.from({ length: N_PTS + 1 }, (_, i) =>
    deliveryYear(advance(ship, c, leverToEta(i / N_PTS, l.leverMax), Infinity), ripen));
  const min = Math.min(...vals), max = Math.max(...vals);
  const at = vals.findIndex((v) => v <= min + 1e-9);
  return shape(l, vals, max - min > 1e-6 ? Math.tanh(leverToEta(at / N_PTS, l.leverMax)) : null);
}

/**
 * Delivery year against the lever setting for the whole lever, the three marks, and a marker at `lever`
 * (which delivers in year `here`). It stretches to fill its box (preserveAspectRatio none) while the lines
 * and the marker keep their size on screen; its words (caption, marks, slower/faster) are page text.
 */
export function predictorSvg(l: Level, curve: Curve, lever: number, here: number): string {
  const W = 400, H = 100, top = 10, bot = 90;
  const { vals, lo, hi, bestSpeed } = curve;
  const yOf = (year: number) => bot - (clamp(fin(year, hi), lo, hi) - lo) / (hi - lo) * (bot - top);
  const d = vals.map((y, i) => `${i ? 'L' : 'M'}${((i / N_PTS) * W).toFixed(2)} ${yOf(y).toFixed(2)}`).join(' ');
  const s = clamp(fin(lever), 0, 1);
  const label = `Delivery year against your speed setting. Delivers about year ${fin(here).toFixed(2)}.`
    + (bestSpeed === null ? '' : ` Earliest delivery: best about ${bestSpeed.toFixed(2)} c.`);
  const ns = 'vector-effect="non-scaling-stroke"';
  const marks = [[l.marks[1], GOLD, '6 4'], [l.marks[0], ACCENT, '6 4'], [l.deadline, TEXT, '2 3']] as const;
  const line = ([year, colour, dash]: typeof marks[number]) => {
    const y = yOf(year).toFixed(2);
    return `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${colour}" stroke-opacity="0.8" stroke-width="1.5" stroke-dasharray="${dash}" ${ns}/>`;
  };
  // A zero-length round-capped stroke is a dot that stays round however the box stretches.
  const dot = (colour: string, w: number) =>
    `<path d="M${(s * W).toFixed(2)} ${yOf(here).toFixed(2)}h0.01" stroke="${colour}" stroke-width="${w}" stroke-linecap="round" ${ns}/>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}" style="overflow:visible">`
    + marks.map(line).join('')
    + `<path d="${d}" fill="none" stroke="${ACCENT}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" ${ns}/>`
    + dot('#0d1433', 13) + dot(GOLD, 9) + '</svg>';
}
