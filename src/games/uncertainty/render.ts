// Canvas drawing for the Uncertain Fire play view. Drawing only: play.ts owns the state.
// The canvas transform maps metres to device pixels, so everything is drawn in metres;
// `u` (one CSS pixel in metres) sizes lines and glows.
import { massKg, type Level } from './levels';
import {
  bestDx, dxToSlider, predictedCentre, sliderToDx, spread, velocitySpread, type Point, type Reading,
} from './physics';

const TAU = Math.PI * 2;
const GOLD = '#ffd25e';
const ACCENT = '#9b7bff';
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fin = (v: number, d = 0) => (Number.isFinite(v) ? v : d);

export interface View { k: number; ox: number; oy: number; w: number; h: number; dpr: number }

/** The level's width × width square scaled to fit a w × h CSS-px box, centred. */
export function fitView(w: number, h: number, dpr: number, width: number): View {
  const k = Math.min(w, h) / width;
  return { k, ox: (w - width * k) / 2, oy: (h - width * k) / 2, w, h, dpr };
}

export const GUN = (width: number): Point => ({ x: width / 2, y: width });

export interface Scene {
  level: Level; time: number; reducedMotion: boolean;
  phase: 'set' | 'aim' | 'flight' | 'result' | 'over';
  reading: Reading;
  dx: number; t: number;
  progress: number;
  aim: Point | null;
  found: Point | null;
  hit: boolean;
  shotMarks: { at: Point; hit: boolean }[];
}

/** Arrow from the cloud centre: to the predicted centre (arrowToImpact) or 1 s of travel; fan half-width Δv × its time. */
export function arrowGeometry(level: Level, r: Reading, dx: number, t: number): { from: Point; to: Point; fan: number; extend: boolean } {
  const from = { x: r.x, y: r.y };
  const secs = level.arrowToImpact ? t : 1;
  const to = level.arrowToImpact ? predictedCentre(r, t) : { x: r.x + r.vx, y: r.y + r.vy };
  return { from, to, fan: velocitySpread(dx, massKg(level)) * secs, extend: !level.arrowToImpact };
}

/** The Spread graph: σ at impact against the slider (log Δx), a marker at dx. */
export function spreadGraphSvg(mass: number, t: number, dx: number): string {
  const W = 200, H = 80, top = 8, bot = 72, N = 80;
  const vals = Array.from({ length: N + 1 }, (_, i) => spread(sliderToDx(i / N), mass, t));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const yOf = (s: number) => (hi > lo ? bot - ((s - lo) / (hi - lo)) * (bot - top) : bot);
  const d = vals.map((s, i) => `${i ? 'L' : 'M'}${((i / N) * W).toFixed(2)} ${yOf(s).toFixed(2)}`).join(' ');
  const mx = dxToSlider(dx) * W, my = yOf(spread(dx, mass, t));
  const label = `Blur at impact against your setting. The lowest blur is at Δx ≈ ${Math.round(bestDx(mass, t))} m.`;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">`
    + `<line x1="0" y1="${bot + 4}" x2="${W}" y2="${bot + 4}" stroke="${ACCENT}" stroke-opacity="0.4" stroke-width="1"/>`
    + `<path d="${d}" fill="none" stroke="${ACCENT}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<circle cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="4.5" fill="${GOLD}" stroke="#140f38" stroke-width="1.5"/></svg>`;
}

function glow(g: CanvasRenderingContext2D, p: Point, r: number, rgb: string, alpha: number): void {
  const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  grad.addColorStop(0, `rgba(${rgb},${alpha})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
}

function disc(g: CanvasRenderingContext2D, p: Point, r: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath(); g.arc(p.x, p.y, Math.max(0, r), 0, TAU); g.fill();
}

function line(g: CanvasRenderingContext2D, a: Point, b: Point): void {
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
}

/** Which way a reading's ship points: along its velocity (nose right when it is not moving). */
export const heading = (r: Reading): number => fin(Math.atan2(r.vy, r.vx));

/**
 * A cartoon space warship, `s` metres long, nose along `angle` (radians, canvas y down). Static (no pulsing).
 * Drawn with paths, rects and arcs only (no roundRect: iOS 15 Safari lacks it).
 */
function ship(g: CanvasRenderingContext2D, p: Point, angle: number, s: number, alpha: number, u: number, dashed = false, engine = true): void {
  g.save();
  g.globalAlpha = alpha;
  g.translate(p.x, p.y);
  g.rotate(angle);
  if (Math.cos(angle) < 0) g.scale(1, -1); // flying left: keep the dark underside below
  const poly = (pts: number[][]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)));
    g.closePath();
  };
  const hull = [[0.5, 0], [0.12, -0.13], [-0.36, -0.12], [-0.46, -0.06], [-0.46, 0.06], [-0.36, 0.12], [0.12, 0.13]];
  if (dashed) {
    g.strokeStyle = '#d9ccff'; g.lineWidth = 2 * u; g.setLineDash([5 * u, 4 * u]);
    poly(hull); g.stroke();
    g.beginPath(); g.arc(s * 0.1, 0, s * 0.06, 0, TAU); g.stroke();
  } else {
    if (engine) {
      for (const y of [-0.06, 0.06]) glow(g, { x: -s * 0.5, y: y * s }, s * 0.14, '255,122,61', 0.8);
    }
    g.fillStyle = '#4a3b8c'; // fins and underside
    poly([[-0.1, 0.1], [-0.4, 0.3], [-0.46, 0.3], [-0.36, 0.1]]);
    g.fill();
    poly([[-0.1, -0.1], [-0.4, -0.3], [-0.46, -0.3], [-0.36, -0.1]]);
    g.fill();
    g.fillStyle = '#ff7a3d'; // engine nozzles
    for (const y of [-0.08, 0.02]) g.fillRect(-s * 0.52, y * s, s * 0.08, s * 0.06);
    g.fillStyle = '#6c5bb5'; poly(hull); g.fill();
    g.fillStyle = '#4a3b8c'; poly([[0.5, 0], [0.12, 0.13], [-0.36, 0.12], [-0.46, 0.06], [-0.46, 0.0], [0.3, 0]]); g.fill();
    g.fillStyle = '#d9ccff'; // cockpit
    g.beginPath(); g.ellipse(s * 0.12, -s * 0.02, s * 0.1, s * 0.05, 0, 0, TAU); g.fill();
  }
  g.restore();
}

function gunArt(g: CanvasRenderingContext2D, p: Point, aim: Point | null, u: number): void {
  const ang = aim ? Math.atan2(aim.y - p.y, aim.x - p.x) : -Math.PI / 2;
  g.save();
  g.translate(p.x, p.y - 4 * u);
  g.rotate(fin(ang, -Math.PI / 2));
  g.fillStyle = '#c9bdf5'; g.fillRect(0, -3.5 * u, 26 * u, 7 * u);
  g.fillStyle = GOLD; g.fillRect(24 * u, -4.5 * u, 4 * u, 9 * u);
  g.restore();
  g.fillStyle = '#6c5bb5'; g.beginPath(); g.arc(p.x, p.y, 14 * u, Math.PI, TAU); g.fill();
  g.fillStyle = '#4a3b8c'; g.fillRect(p.x - 18 * u, p.y - 3 * u, 36 * u, 3 * u);
}

function reticle(g: CanvasRenderingContext2D, p: Point, u: number): void {
  g.strokeStyle = GOLD; g.lineWidth = 2 * u; g.setLineDash([]);
  g.beginPath(); g.arc(p.x, p.y, 10 * u, 0, TAU); g.stroke();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    line(g, { x: p.x + dx * 6 * u, y: p.y + dy * 6 * u }, { x: p.x + dx * 16 * u, y: p.y + dy * 16 * u });
  }
}

function arrow(g: CanvasRenderingContext2D, a: Point, b: Point, u: number): void {
  g.strokeStyle = GOLD; g.fillStyle = GOLD; g.lineWidth = 2.5 * u; g.setLineDash([]);
  line(g, a, b);
  const ang = Math.atan2(b.y - a.y, b.x - a.x), h = 9 * u;
  g.beginPath();
  g.moveTo(b.x, b.y);
  g.lineTo(b.x - h * Math.cos(ang - 0.45), b.y - h * Math.sin(ang - 0.45));
  g.lineTo(b.x - h * Math.cos(ang + 0.45), b.y - h * Math.sin(ang + 0.45));
  g.closePath(); g.fill();
}

/** Where a ray from `a` towards `b` leaves the width × width sky. */
function skyEdge(a: Point, b: Point, width: number): Point {
  const dx = b.x - a.x, dy = b.y - a.y;
  let s = Infinity;
  if (dx > 0) s = Math.min(s, (width - a.x) / dx); else if (dx < 0) s = Math.min(s, -a.x / dx);
  if (dy > 0) s = Math.min(s, (width - a.y) / dy); else if (dy < 0) s = Math.min(s, -a.y / dy);
  return Number.isFinite(s) ? { x: a.x + dx * s, y: a.y + dy * s } : b;
}

/** Point on the shell's quadratic arc from the gun to the aim point. */
function arcAt(from: Point, to: Point, p: number): Point {
  const c = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - Math.hypot(to.x - from.x, to.y - from.y) * 0.25 };
  const q = 1 - p;
  return { x: q * q * from.x + 2 * q * p * c.x + p * p * to.x, y: q * q * from.y + 2 * q * p * c.y + p * p * to.y };
}

export function drawScene(g: CanvasRenderingContext2D, v: View, s: Scene): void {
  const W = s.level.width, k = v.k, u = 1 / k;
  const m = massKg(s.level), rd = s.reading, gun = GUN(W);
  // Whole canvas, in CSS px: dark surround, then the sky square with its gradient.
  g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  g.setLineDash([]); g.globalAlpha = 1;
  g.fillStyle = '#140f38'; g.fillRect(0, 0, v.w, v.h);
  const sky = g.createLinearGradient(0, v.oy, 0, v.oy + W * k);
  sky.addColorStop(0, '#3a2a7a'); sky.addColorStop(1, '#140f38');
  g.fillStyle = sky; g.fillRect(v.ox, v.oy, W * k, W * k);

  g.save();
  g.beginPath(); g.rect(v.ox, v.oy, W * k, W * k); g.clip();
  g.setTransform(v.dpr * k, 0, 0, v.dpr * k, v.dpr * v.ox, v.dpr * v.oy);

  // a few faint stars, fixed positions
  for (let i = 0; i < 28; i++) {
    disc(g, { x: ((i * 0.618034 + 0.13) % 1) * W, y: ((i * 0.754878 + 0.31) % 1) * W * 0.85 }, (0.8 + (i % 3) * 0.4) * u, 'rgba(255,255,255,0.3)');
  }

  for (const sm of s.shotMarks) {
    const a = { x: fin(sm.at.x), y: fin(sm.at.y) };
    g.globalAlpha = 0.35;
    if (sm.hit) disc(g, a, 5 * u, GOLD);
    else {
      g.strokeStyle = '#d9ccff'; g.lineWidth = 1.5 * u;
      line(g, { x: a.x - 4 * u, y: a.y - 4 * u }, { x: a.x + 4 * u, y: a.y + 4 * u });
      line(g, { x: a.x + 4 * u, y: a.y - 4 * u }, { x: a.x - 4 * u, y: a.y + 4 * u });
    }
    g.globalAlpha = 1;
  }

  const shipW = Math.max(s.level.hitRadius * 1.8, 26 * u);
  const head = heading(rd);
  const aimPt = s.aim ? { x: fin(s.aim.x), y: fin(s.aim.y) } : null;
  // radial gradient reaching zero alpha at 2.5σ, never smaller than ~6 CSS px
  const cloud = (c: Point, sigma: number) => glow(g, c, Math.max(2.5 * fin(sigma, 1), 6 * u), '155,123,255', 0.6);
  gunArt(g, gun, s.phase === 'set' || s.phase === 'over' ? null : aimPt, u);

  if (s.phase === 'set') {
    ship(g, rd, head, shipW, 0.7, u, true);
  } else if (s.phase === 'aim') {
    const a = arrowGeometry(s.level, rd, s.dx, s.t);
    cloud(rd, s.dx);
    ship(g, rd, head, shipW, 0.4, u);
    // the fan: a translucent wedge at the arrow tip, half-width `fan`
    const ang = Math.atan2(a.to.y - a.from.y, a.to.x - a.from.x);
    const nx = -Math.sin(ang) * a.fan, ny = Math.cos(ang) * a.fan;
    g.fillStyle = 'rgba(255,210,94,0.18)';
    g.beginPath(); g.moveTo(a.from.x, a.from.y); g.lineTo(a.to.x + nx, a.to.y + ny); g.lineTo(a.to.x - nx, a.to.y - ny); g.closePath(); g.fill();
    if (a.extend) {
      g.strokeStyle = 'rgba(255,210,94,0.5)'; g.lineWidth = 1.5 * u; g.setLineDash([2 * u, 5 * u]);
      line(g, a.to, skyEdge(a.from, a.to, W)); g.setLineDash([]);
    }
    arrow(g, a.from, a.to, u);
    if (aimPt) reticle(g, aimPt, u);
  } else if (s.phase === 'flight') {
    const p = clamp01(s.progress), tt = p * s.t;
    const c = { x: rd.x + rd.vx * tt, y: rd.y + rd.vy * tt };
    cloud(c, spread(s.dx, m, tt));
    ship(g, c, head, shipW, 0.35, u);
    if (aimPt) {
      reticle(g, aimPt, u);
      g.strokeStyle = 'rgba(217,204,255,0.4)'; g.lineWidth = 1.5 * u; g.setLineDash([3 * u, 4 * u]);
      g.beginPath(); g.moveTo(gun.x, gun.y);
      for (let i = 1; i <= 24; i++) { const q = arcAt(gun, aimPt, (i / 24) * p); g.lineTo(q.x, q.y); }
      g.stroke(); g.setLineDash([]);
      const sh = arcAt(gun, aimPt, p);
      glow(g, sh, 12 * u, '255,210,94', 0.5);
      disc(g, sh, 4 * u, '#fff3c4');
    }
  } else if (s.phase === 'result' || s.phase === 'over') {
    const f = s.found ? { x: fin(s.found.x), y: fin(s.found.y) } : null;
    const T = s.reducedMotion ? 99 : Math.max(0, fin(s.time));
    // The cloud at impact, faint: where the ship could have been found. It is the flight's last frame,
    // and the only one reduced-motion players see.
    g.globalAlpha = 0.45;
    cloud(predictedCentre(rd, s.t), spread(s.dx, m, s.t));
    g.globalAlpha = 1;
    if (f) {
      g.strokeStyle = 'rgba(255,210,94,0.35)'; g.lineWidth = 1.5 * u; g.setLineDash([4 * u, 4 * u]);
      g.beginPath(); g.arc(f.x, f.y, s.level.hitRadius, 0, TAU); g.stroke(); g.setLineDash([]);
      ship(g, f, head, shipW, s.hit ? 1 - 0.85 * clamp01(T / 1.2) : 1, u, false, !s.reducedMotion);
      if (s.hit) {
        if (!s.reducedMotion && T < 0.35) glow(g, f, s.level.hitRadius * (0.6 + 3 * T), '255,240,200', 0.9 * (1 - T / 0.35));
        const grow = clamp01(T / 1.0), sc = 0.4 + grow * 0.6;
        for (const [dx, dy, r] of [[0, -0.3, 0.55], [-0.45, 0.05, 0.4], [0.45, 0, 0.42], [0.1, -0.7, 0.35]]) {
          disc(g, { x: f.x + dx * shipW * sc, y: f.y + dy * shipW * sc }, shipW * r * (0.3 + 0.7 * grow), `rgba(232,224,255,${(0.55 - 0.2 * grow).toFixed(3)})`);
        }
      }
    }
    if (!s.hit && aimPt) {
      if (f) { g.strokeStyle = 'rgba(217,204,255,0.55)'; g.lineWidth = 1.5 * u; g.setLineDash([5 * u, 4 * u]); line(g, aimPt, f); g.setLineDash([]); }
      const pulse = s.reducedMotion ? 1 : 1 - clamp01(T / 0.5) * 0.5;
      glow(g, aimPt, 16 * u * pulse, '255,210,94', 0.8);
      g.strokeStyle = GOLD; g.lineWidth = 2 * u;
      for (let i = 0; i < 4; i++) {
        const a = (i * TAU) / 4 + 0.4;
        line(g, { x: aimPt.x + Math.cos(a) * 4 * u, y: aimPt.y + Math.sin(a) * 4 * u }, { x: aimPt.x + Math.cos(a) * 11 * u * pulse, y: aimPt.y + Math.sin(a) * 11 * u * pulse });
      }
    }
  }
  g.restore();
}
