// Canvas drawing for the Slingshot play view. Drawing only: play.ts owns the state.
// The canvas transform maps world units to device pixels, so everything here is
// drawn in world units; `u` (one CSS pixel in world units) sizes lines and text.
import type { Level } from './levels';
import { WORLD, pulls, radius, type Body, type BodyType, type Point, type Ship } from './physics';

const TAU = Math.PI * 2;
const GOLD = '#ffd25e';
const ACCENT = '#ff7a3d';

export interface View {
  /** CSS px per world unit, and the world origin in CSS px. */
  k: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  dpr: number;
}

/** The square world scaled to fit a w × h CSS-px box, centred. */
export function fitView(w: number, h: number, dpr: number): View {
  const k = Math.min(w, h) / WORLD;
  return { k, ox: (w - WORLD * k) / 2, oy: (h - WORLD * k) / 2, w, h, dpr };
}

export interface Scene {
  level: Level;
  placed: Body[];
  /** Index into `placed`, or -1. */
  selected: number;
  /** The body being dragged over the sky, if any. */
  drag: { body: Body; ok: boolean } | null;
  ship: Ship;
  editing: boolean;
  collected: ReadonlySet<number>;
  trail: Point[];
  lastPath: Point[];
  aim: Point[];
  /** Seconds, for the beacon pulse. */
  time: number;
  reducedMotion: boolean;
}

/** Body colours: light, dark crescent, glow (r,g,b) and glow strength. */
const LOOK: Record<Exclude<BodyType, 'blackHole'>, { light: string; dark: string; glow: string; reach: number; alpha: number }> = {
  moon: { light: '#b9b4d6', dark: '#8a84b0', glow: '185,180,214', reach: 1.3, alpha: 0.14 },
  brownDwarf: { light: '#c0603a', dark: '#8e3f26', glow: '192,96,58', reach: 1.6, alpha: 0.3 },
  whiteDwarf: { light: '#eef3ff', dark: '#c4d2ee', glow: '159,208,255', reach: 2.4, alpha: 0.5 },
  neutronStar: { light: '#7fe0ff', dark: '#45b3d8', glow: '127,224,255', reach: 3.4, alpha: 0.75 },
};

export function bodyColor(t: BodyType): string {
  return t === 'blackHole' ? ACCENT : LOOK[t].light;
}

/** Pull arrows: CSS px per unit of pull, as a fraction of the sky's side. */
export const ARROW_GAIN = 0.04;
/** The longest any pull arrow may be, as a fraction of the sky's side. */
export const ARROW_CAP = 0.32;
/** A nonzero pull never draws shorter than this (CSS px), so it stays visible. */
const ARROW_MIN_PX = 6;

/**
 * The pull arrows as drawn, in CSS px, on a sky `side` px wide. Every arrow (one
 * per pull and the total) shares one linear scale, so lengths are proportional
 * to the pulls and the thin arrows add head to tail to the bold total. The scale
 * is ARROW_GAIN·side px per unit of pull, lowered so the longest arrow is at most
 * ARROW_CAP·side and no arrow runs past `room(dx, dy)` px in its direction.
 */
export function arrowVectors(
  parts: Point[],
  side: number,
  room: (dx: number, dy: number) => number = () => Infinity,
): { parts: Point[]; total: Point } {
  const clean = parts.map((p) => (Number.isFinite(p.x) && Number.isFinite(p.y) ? p : { x: 0, y: 0 }));
  const sum = clean.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  const all = [...clean, sum];
  let s = ARROW_GAIN * side;
  for (const p of all) {
    const m = Math.hypot(p.x, p.y);
    if (!(m > 0) || !Number.isFinite(m)) continue;
    s = Math.min(s, (ARROW_CAP * side) / m, Math.max(0, room(p.x / m, p.y / m)) / m);
  }
  const scale = (p: Point): Point => ({ x: p.x * s, y: p.y * s });
  return { parts: clean.map(scale), total: scale(sum) };
}

function glow(g: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, rgb: string, a: number): void {
  const gr = g.createRadialGradient(x, y, r0, x, y, r1);
  gr.addColorStop(0, `rgba(${rgb},${a})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r1, 0, TAU);
  g.fill();
}

/** A flat ball with a darker crescent on its lower right. */
function ball(g: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, dark: string): void {
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.clip();
  g.fillStyle = dark;
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
  g.fillStyle = light;
  g.beginPath();
  g.arc(x - r * 0.24, y - r * 0.24, r, 0, TAU);
  g.fill();
  g.restore();
}

function drawBody(g: CanvasRenderingContext2D, b: Body, u: number, labels: boolean): void {
  const r = radius(b.type);
  if (b.type === 'blackHole') {
    // Faint dashed rings: 1.5 r_s (no way back) and 3 r_s (no stable orbit).
    g.save();
    g.strokeStyle = 'rgba(255,122,61,0.45)';
    g.lineWidth = 1.5 * u;
    g.setLineDash([6 * u, 6 * u]);
    for (const m of [1.5, 3]) {
      g.beginPath();
      g.arc(b.x, b.y, m * r, 0, TAU);
      g.stroke();
    }
    g.restore();
    glow(g, b.x, b.y, r, r * 1.7, '255,122,61', 0.55);
    g.fillStyle = '#05060f';
    g.beginPath();
    g.arc(b.x, b.y, r, 0, TAU);
    g.fill();
    g.strokeStyle = ACCENT;
    g.lineWidth = 3 * u;
    g.beginPath();
    g.arc(b.x, b.y, r + 1.5 * u, 0, TAU);
    g.stroke();
    if (labels) {
      g.fillStyle = '#c8c2f0';
      g.font = `600 ${17 * u}px 'Inter Variable', system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText('3× radius', b.x, b.y - 3 * r - 6 * u);
      g.fillText('1.5×', b.x, b.y - 1.5 * r - 3 * u);
    }
    return;
  }
  const look = LOOK[b.type];
  glow(g, b.x, b.y, r * 0.8, r * look.reach, look.glow, look.alpha);
  ball(g, b.x, b.y, r, look.light, look.dark);
  if (b.type === 'moon') {
    g.fillStyle = 'rgba(138,132,176,0.7)';
    for (const [dx, dy, s] of [[-0.3, -0.35, 0.16], [0.15, 0.05, 0.11], [-0.35, 0.25, 0.09]]) {
      g.beginPath();
      g.arc(b.x + dx * r, b.y + dy * r, s * r, 0, TAU);
      g.fill();
    }
  } else if (b.type === 'brownDwarf') {
    g.save();
    g.beginPath();
    g.arc(b.x, b.y, r, 0, TAU);
    g.clip();
    g.fillStyle = 'rgba(142,63,38,0.45)';
    g.fillRect(b.x - r, b.y - r * 0.32, 2 * r, r * 0.16);
    g.fillRect(b.x - r, b.y + r * 0.18, 2 * r, r * 0.12);
    g.restore();
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  g.closePath();
}

function polyline(g: CanvasRenderingContext2D, pts: Point[]): void {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.stroke();
}

/** An arrow from p along unit vector (dx, dy) for `len` world units. */
function arrow(g: CanvasRenderingContext2D, p: Point, dx: number, dy: number, len: number, head: number): void {
  if (!(len > 0)) return;
  const ex = p.x + dx * len, ey = p.y + dy * len;
  g.beginPath();
  g.moveTo(p.x, p.y);
  g.lineTo(ex, ey);
  g.stroke();
  const h = Math.min(head, len * 0.6);
  g.beginPath();
  g.moveTo(ex - dx * h - dy * h * 0.6, ey - dy * h + dx * h * 0.6);
  g.lineTo(ex, ey);
  g.lineTo(ex - dx * h + dy * h * 0.6, ey - dy * h - dx * h * 0.6);
  g.stroke();
}

/** World distance from p along (dx, dy) to the edge of the visible sky, less a margin. */
function roomTo(v: View, p: Point, dx: number, dy: number, margin: number): number {
  const x0 = -v.ox / v.k + margin, x1 = (v.w - v.ox) / v.k - margin;
  const y0 = -v.oy / v.k + margin, y1 = (v.h - v.oy) / v.k - margin;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (x1 - p.x) / dx);
  if (dx < 0) t = Math.min(t, (x0 - p.x) / dx);
  if (dy > 0) t = Math.min(t, (y1 - p.y) / dy);
  if (dy < 0) t = Math.min(t, (y0 - p.y) / dy);
  return Math.max(0, t);
}

function pullArrows(g: CanvasRenderingContext2D, v: View, start: Point, bodies: Body[], u: number): void {
  const side = Math.min(v.w, v.h);
  // roomTo is in world units; arrowVectors works in CSS px.
  const { parts, total } = arrowVectors(pulls(start, bodies), side, (dx, dy) => roomTo(v, start, dx, dy, 6 * u) / u);
  const draw = (a: Point, color: string, width: number) => {
    const m = Math.hypot(a.x, a.y);
    if (!(m > 0) || !Number.isFinite(m)) return;
    g.strokeStyle = color;
    g.lineWidth = width * u;
    arrow(g, start, a.x / m, a.y / m, Math.max(m, ARROW_MIN_PX) * u, (width + 6) * u);
  };
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  parts.forEach((a, i) => draw(a, bodyColor(bodies[i].type), 1.75));
  if (bodies.length) draw(total, GOLD, 4);
  g.restore();
}

function drawShip(g: CanvasRenderingContext2D, s: Ship, u: number, launchArrow: boolean): void {
  const ang = Math.atan2(s.vy, s.vx);
  if (launchArrow) {
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 2 * u;
    g.lineCap = 'round';
    g.setLineDash([4 * u, 5 * u]);
    const c = Math.cos(ang), sn = Math.sin(ang);
    const p = { x: s.x + c * 14 * u, y: s.y + sn * 14 * u };
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(p.x + c * 30 * u, p.y + sn * 30 * u);
    g.stroke();
    g.setLineDash([]);
    const e = { x: p.x + c * 34 * u, y: p.y + sn * 34 * u };
    g.beginPath();
    g.moveTo(e.x - c * 6 * u - sn * 4 * u, e.y - sn * 6 * u + c * 4 * u);
    g.lineTo(e.x, e.y);
    g.lineTo(e.x - c * 6 * u + sn * 4 * u, e.y - sn * 6 * u - c * 4 * u);
    g.stroke();
    g.restore();
  }
  glow(g, s.x, s.y, 0, 16 * u, '255,255,255', 0.25);
  g.save();
  g.translate(s.x, s.y);
  g.rotate(ang);
  const L = 9 * u;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineWidth = 2.5 * u;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(L, 0);
  g.lineTo(-L * 0.7, -L * 0.6);
  g.lineTo(-L * 0.35, 0);
  g.lineTo(-L * 0.7, L * 0.6);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

export function drawScene(g: CanvasRenderingContext2D, v: View, s: Scene): void {
  const u = 1 / v.k;
  const { level } = s;
  g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  g.clearRect(0, 0, v.w, v.h);
  g.setTransform(v.dpr * v.k, 0, 0, v.dpr * v.k, v.dpr * v.ox, v.dpr * v.oy);

  // Beacon.
  const gl = level.goal;
  glow(g, gl.x, gl.y, gl.r * 0.3, gl.r * 1.8, '255,210,94', 0.3);
  if (!s.reducedMotion) {
    const ph = (s.time % 1.6) / 1.6;
    g.strokeStyle = `rgba(255,210,94,${0.6 * (1 - ph)})`;
    g.lineWidth = 2 * u;
    g.beginPath();
    g.arc(gl.x, gl.y, gl.r * (1 + 0.6 * ph), 0, TAU);
    g.stroke();
  }
  g.strokeStyle = GOLD;
  g.lineWidth = 3.5 * u;
  g.beginPath();
  g.arc(gl.x, gl.y, gl.r - 1.75 * u, 0, TAU);
  g.stroke();
  g.fillStyle = GOLD;
  g.beginPath();
  g.arc(gl.x, gl.y, gl.r * 0.25, 0, TAU);
  g.fill();

  // Paths: last flight (faint), aim line, current flight.
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (s.lastPath.length > 1) {
    g.strokeStyle = 'rgba(200,194,240,0.3)';
    g.lineWidth = 2 * u;
    polyline(g, s.lastPath);
  }
  if (s.editing && s.aim.length > 1) {
    g.strokeStyle = 'rgba(255,210,94,0.85)';
    g.lineWidth = 2.5 * u;
    g.setLineDash([2 * u, 7 * u]);
    polyline(g, s.aim);
    g.setLineDash([]);
  }
  if (s.trail.length > 1) {
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 2.5 * u;
    polyline(g, s.trail);
  }
  g.restore();

  // Stars.
  const sr = Math.max(14, 9 * u);
  level.stars.forEach((p, i) => {
    if (s.collected.has(i)) {
      g.strokeStyle = 'rgba(255,210,94,0.35)';
      g.lineWidth = 1.5 * u;
      star(g, p.x, p.y, sr);
      g.stroke();
      return;
    }
    glow(g, p.x, p.y, 0, sr * 2.2, '255,210,94', 0.35);
    g.fillStyle = GOLD;
    star(g, p.x, p.y, sr);
    g.fill();
  });

  // Bodies.
  for (const b of level.fixed) drawBody(g, b, u, level.id === '08');
  s.placed.forEach((b, i) => {
    drawBody(g, b, u, false);
    if (s.editing && i === s.selected) {
      g.save();
      g.strokeStyle = '#fff';
      g.lineWidth = 2 * u;
      g.setLineDash([5 * u, 5 * u]);
      g.beginPath();
      g.arc(b.x, b.y, radius(b.type) + 7 * u, 0, TAU);
      g.stroke();
      g.restore();
    }
  });
  if (s.drag) {
    const b = s.drag.body;
    g.save();
    g.globalAlpha = s.drag.ok ? 0.9 : 0.5;
    drawBody(g, b, u, false);
    g.globalAlpha = 1;
    g.strokeStyle = s.drag.ok ? '#fff' : '#ff6b6b';
    g.lineWidth = 2 * u;
    g.setLineDash(s.drag.ok ? [5 * u, 5 * u] : []);
    g.beginPath();
    g.arc(b.x, b.y, radius(b.type) + 7 * u, 0, TAU);
    g.stroke();
    g.restore();
  }

  // Pull arrows at the ship's start, while editing only.
  if (s.editing) {
    const bodies = [...level.fixed, ...s.placed, ...(s.drag ? [s.drag.body] : [])];
    pullArrows(g, v, level.ship, bodies, u);
  }

  drawShip(g, s.ship, u, s.editing);
}
