// Pure model for Uncertain Fire (SI units). The ship is a minimum-uncertainty Gaussian packet: measuring
// its position to within dx leaves a momentum blur dv = ħ/(2m·dx), so the cloud widens as it flies.
// The shell's landing is a second measurement: the found position is drawn from that cloud.

export const HBAR = 1e9; // the game's ħ, J·s
export const REAL_HBAR = 1.054571817e-34;
export const PRESETS = { position: 10, momentum: 50 } as const; // dx in metres
export const DX_MIN = 3, DX_MAX = 150;
export const SHOTS = 5, PASS_HITS = 3;
export const AIM_ERROR = 0.3; // human aim error as a fraction of R, per axis (tests only)

export type Point = { x: number; y: number };
export type Reading = Point & { vx: number; vy: number };

/** Δv = ħ / (2mΔx). */
export function velocitySpread(dx: number, mass: number): number {
  return HBAR / (2 * mass * dx);
}

/** σ(t)² = Δx² + (Δv·t)², per axis. */
export function spread(dx: number, mass: number, t: number): number {
  return Math.hypot(dx, velocitySpread(dx, mass) * t);
}

/** The Δx that minimises σ(t): √(ħt/2m). */
export function bestDx(mass: number, t: number): number {
  return Math.sqrt((HBAR * t) / (2 * mass));
}

/** σ at the best Δx: √(ħt/m). */
export function minSpread(mass: number, t: number): number {
  return Math.sqrt((HBAR * t) / mass);
}

/** P(shell lands within r of the aim point), with optional per-axis aim error. */
export function hitChance(sigma: number, r: number, aimSigma = 0): number {
  const v = sigma * sigma + aimSigma * aimSigma;
  return 1 - Math.exp((-r * r) / (2 * v));
}

/** Binomial P(at least k successes in n shots). */
export function atLeast(p: number, k: number, n = SHOTS): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let total = 0, choose = 1;
  for (let i = 0; i <= n; i++) {
    if (i >= k) total += choose * p ** i * (1 - p) ** (n - i);
    choose = (choose * (n - i)) / (i + 1);
  }
  return total;
}

/** Standard normal sample (Box–Muller); rng = () => 0 gives exactly 0. */
export function gaussian(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

export function sampleFound(centre: Point, sigma: number, rng: () => number): Point {
  const x = centre.x + sigma * gaussian(rng);
  const y = centre.y + sigma * gaussian(rng);
  return { x, y };
}

export function predictedCentre(r: Reading, t: number): Point {
  return { x: r.x + r.vx * t, y: r.y + r.vy * t };
}

/** Flight time after upgrades: fast2 halves it, fast takes a quarter off. */
export function flightTime(t: number, upgrades: ReadonlySet<string>): number {
  return t * (upgrades.has('fast2') ? 0.5 : upgrades.has('fast') ? 0.75 : 1);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function sliderToDx(s: number): number {
  return DX_MIN * (DX_MAX / DX_MIN) ** clamp01(s);
}

export function dxToSlider(dx: number): number {
  return clamp01(Math.log(dx / DX_MIN) / Math.log(DX_MAX / DX_MIN));
}

export function hbarRatio(): number {
  return HBAR / REAL_HBAR;
}
