// Pure model for Antidote Run. Units: years and light-years, c = 1. The state variable is rapidity η
// (v = tanh η, γ = cosh η), so every burn has a closed form and results never depend on the step size.

export const G_LY = (9.80665 * 31557600) / 299792458; // 1 g in ly/yr² (≈ 1.0323)
export const BETA_MIN = 0.1; // lever bottom
export const LEVER_STEPS = 1000; // the range input's max
export const TRIP_SECONDS = 35; // real seconds of a trip whose ship time equals the ripening time
export const RETURN_SECONDS = 5; // the automatic trip home
export const RIPEN_MAX_SECONDS = 3; // longest a ripening wait plays
export const START_BETA = 0.5; // the lever's starting speed on every level

export interface Ship { eta: number; x: number; t: number; tau: number }
export interface Course { distance: number; accel: number }

export const AT_REST: Ship = { eta: 0, x: 0, t: 0, tau: 0 };

const EPS = 1e-12;

/** The fastest rapidity from which the ship can still stop at the colony: arccosh(1 + a(D − x)). */
export function etaStop(c: Course, x: number): number {
  return x >= c.distance ? 0 : Math.acosh(1 + c.accel * (c.distance - x));
}

/** Where braking at full thrust must start, for the current rapidity. */
export function brakePoint(s: Ship, c: Course): number {
  return c.distance - (Math.cosh(s.eta) - 1) / c.accel;
}

export function docked(s: Ship, c: Course): boolean {
  return s.x >= c.distance - EPS && s.eta <= EPS;
}

/** Burn at proper acceleration alpha (signed) for ship time d. */
function burn(s: Ship, alpha: number, d: number): Ship {
  const eta = s.eta + alpha * d;
  if (alpha === 0) return { eta: s.eta, x: s.x + Math.sinh(s.eta) * d, t: s.t + Math.cosh(s.eta) * d, tau: s.tau + d };
  return {
    eta,
    x: s.x + (Math.cosh(eta) - Math.cosh(s.eta)) / alpha,
    t: s.t + (Math.sinh(eta) - Math.sinh(s.eta)) / alpha,
    tau: s.tau + d,
  };
}

/**
 * Fly dTau ship-years under the rule: allowed η = min(lever, braking curve); accelerate below it,
 * decelerate above it, coast on it. Each phase is solved exactly, in order. dTau = Infinity flies to the dock.
 */
export function advance(s: Ship, c: Course, leverEta: number, dTau: number): Ship {
  const a = c.accel, D = c.distance, L = Math.max(leverEta, 0);
  let cur = s, left = dTau;
  for (let guard = 0; guard < 50 && left > 0; guard++) {
    if (docked(cur, c)) return { eta: 0, x: D, t: cur.t, tau: cur.tau };
    const onCurve = cur.eta >= etaStop(c, cur.x) - 1e-9;
    let alpha: number, target: number | null, duration: number;
    if (cur.eta > L + EPS) {
      // above the lever (this includes braking when the lever is raised or lowered): slow down at a
      alpha = -a; target = L; duration = (cur.eta - L) / a;
    } else if (onCurve) {
      alpha = -a; target = 0; duration = cur.eta / a;
    } else if (cur.eta < L - EPS) {
      const hit = Math.acosh((a * (D - cur.x) + Math.cosh(cur.eta) + 1) / 2);
      target = Math.min(L, hit); alpha = a; duration = (target - cur.eta) / a;
    } else {
      const sh = Math.sinh(cur.eta);
      if (sh <= 0) return cur; // coasting at rest: nothing moves
      alpha = 0; target = null; duration = (brakePoint(cur, c) - cur.x) / sh;
    }
    duration = Math.max(duration, 0);
    if (duration <= left) {
      const next = burn(cur, alpha, duration);
      if (target !== null) next.eta = target;
      else next.x = brakePoint(cur, c);
      if (target === 0 || next.x >= D - EPS && next.eta <= EPS) { next.eta = 0; next.x = D; }
      next.x = Math.min(next.x, D);
      left -= duration; cur = next;
    } else {
      const next = burn(cur, alpha, left);
      next.x = Math.min(next.x, D); next.eta = Math.max(next.eta, 0);
      return next;
    }
  }
  return cur;
}

/** Earth year the antidote is delivered: the arrival, or the end of the ripening, whichever is later. */
export function deliveryYear(arrive: Ship, ripen: number): number {
  return Math.max(arrive.t, arrive.t - arrive.tau + ripen);
}

const etaMin = Math.atanh(BETA_MIN);
/** Lever setting s in [0, 1] to rapidity: evenly spaced in η from 0.1c to the level's top speed. */
export function leverToEta(s: number, leverMax: number): number {
  return etaMin + s * (Math.atanh(leverMax) - etaMin);
}
export function etaToLever(eta: number, leverMax: number): number {
  return (eta - etaMin) / (Math.atanh(leverMax) - etaMin);
}

/** The colony year whose light is reaching the ship now: t − (D − x). */
export function seenColonyYear(s: Ship, distance: number): number {
  return s.t - (distance - s.x);
}

/** Aberration: the direction a ray appears to come from, cos θ′ = (cos θ + β)/(1 + β cos θ). */
export function aberrate(cosTheta: number, beta: number): number {
  return (cosTheta + beta) / (1 + beta * cosTheta);
}

/** Doppler factor δ = 1/(γ(1 − β cos θ′)) for the seen direction. */
export function doppler(cosThetaSeen: number, beta: number): number {
  return Math.sqrt(1 - beta * beta) / (1 - beta * cosThetaSeen);
}

// Blackbody colours (Tanner Helland's fit), 1500–40000 K.
export function starColour(kelvin: number): string {
  const k = Math.min(40000, Math.max(1500, kelvin)) / 100;
  const clamp = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  const r = k <= 66 ? 255 : 329.698727446 * (k - 60) ** -0.1332047592;
  const g = k <= 66 ? 99.4708025861 * Math.log(k) - 161.1195681661 : 288.1221695283 * (k - 60) ** -0.0755148492;
  const b = k >= 66 ? 255 : k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
}

/** Photon rocket: mass ratio e^(2η) one way, e^(4η) there and back (stopping at each end). */
export function photonMassRatio(eta: number, roundTrip: boolean): number {
  return Math.exp((roundTrip ? 4 : 2) * eta);
}
