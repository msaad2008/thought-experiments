// Pure, deterministic flight model for the gravity game. Masses are GM (G = 1).
// Bodies are fixed; only the ship moves. A black hole pulls with the
// Paczynski-Wiita force GM/(r - r_s)^2, which has no stable orbit inside 3 r_s.

export const WORLD = 1000, C = 500, DT = 1 / 240, MAX_TIME = 30, LOST_MARGIN = 300, STAR_PICK_R = 22;

export type BodyType = 'moon' | 'brownDwarf' | 'whiteDwarf' | 'neutronStar' | 'blackHole';
export interface BodySpec { id: BodyType; name: string; mass: number; density: number | null; tier: 1 | 2 | 3 | 4 | 5 }

export const BODY_TYPES: Record<BodyType, BodySpec> = {
  moon: { id: 'moon', name: 'Moon', mass: 2e5, density: 0.75, tier: 1 },
  brownDwarf: { id: 'brownDwarf', name: 'Brown dwarf', mass: 8e5, density: 1.15, tier: 2 },
  whiteDwarf: { id: 'whiteDwarf', name: 'White dwarf', mass: 1.2e6, density: 10.6, tier: 3 },
  neutronStar: { id: 'neutronStar', name: 'Neutron star', mass: 2e6, density: 34.5, tier: 4 },
  blackHole: { id: 'blackHole', name: 'Black hole', mass: 6e6, density: null, tier: 5 },
};

export function schwarzschild(mass: number): number {
  return (2 * mass) / (C * C);
}

/** R = (3M / 4πρ)^(1/3), or r_s for a black hole. */
export function radius(t: BodyType): number {
  const { mass, density } = BODY_TYPES[t];
  return density === null ? schwarzschild(mass) : Math.cbrt((3 * mass) / (4 * Math.PI * density));
}

export interface Body { type: BodyType; x: number; y: number }
export interface Ship { x: number; y: number; vx: number; vy: number }
export interface Point { x: number; y: number }
export interface SimInput { ship: Ship; bodies: Body[]; goal: Point & { r: number }; stars: Point[] }
export type Outcome = 'goal' | 'crash' | 'captured' | 'lost' | 'timeout';
export interface Sim { ship: Ship; time: number; shipTime: number; collected: Set<number>; outcome: Outcome | null; step(): Outcome | null }

/** One acceleration vector per body, in the same order as `bodies`. */
export function pulls(p: Point, bodies: Body[]): Point[] {
  return bodies.map((b) => {
    const dx = b.x - p.x, dy = b.y - p.y, r = Math.hypot(dx, dy);
    if (r === 0) return { x: 0, y: 0 };
    const { mass } = BODY_TYPES[b.type];
    // Paczynski-Wiita for black holes; clamp so a point at or inside r_s stays finite.
    const d = b.type === 'blackHole' ? Math.max(r - schwarzschild(mass), 1e-6) : r;
    const k = mass / (d * d) / r;
    return { x: dx * k, y: dy * k };
  });
}

export function accel(p: Point, bodies: Body[]): Point {
  let x = 0, y = 0;
  for (const q of pulls(p, bodies)) { x += q.x; y += q.y; }
  return { x, y };
}

/** Ship clock rate √(1 − r_s/r) near the first black hole; 1 if there is none. */
export function clockRate(ship: Point, bodies: Body[]): number {
  const bh = bodies.find((b) => b.type === 'blackHole');
  if (!bh) return 1;
  const r = Math.hypot(ship.x - bh.x, ship.y - bh.y);
  return Math.sqrt(Math.max(0, 1 - schwarzschild(BODY_TYPES.blackHole.mass) / r));
}

/** One step() advances exactly DT; once an outcome is set, step() does nothing. */
export function createSim(input: SimInput, maxTime = MAX_TIME): Sim {
  const { bodies, goal, stars } = input;
  const maxSteps = Math.round(maxTime / DT);
  const hit = bodies.map((b) => (b.type === 'blackHole' ? 1.5 : 1) * radius(b.type));
  let steps = 0;
  let a = accel(input.ship, bodies);

  const sim: Sim = {
    ship: { ...input.ship },
    time: 0,
    shipTime: 0,
    collected: new Set<number>(),
    outcome: null,
    step() {
      if (sim.outcome) return sim.outcome;
      const s = sim.ship;
      // Velocity Verlet.
      s.x += s.vx * DT + 0.5 * a.x * DT * DT;
      s.y += s.vy * DT + 0.5 * a.y * DT * DT;
      const a2 = accel(s, bodies);
      s.vx += 0.5 * (a.x + a2.x) * DT;
      s.vy += 0.5 * (a.y + a2.y) * DT;
      a = a2;
      steps++;
      sim.time = steps * DT;
      sim.shipTime += clockRate(s, bodies) * DT;

      stars.forEach((p, i) => { if (Math.hypot(s.x - p.x, s.y - p.y) < STAR_PICK_R) sim.collected.add(i); });

      for (let i = 0; i < bodies.length; i++) {
        if (Math.hypot(s.x - bodies[i].x, s.y - bodies[i].y) < hit[i]) {
          return (sim.outcome = bodies[i].type === 'blackHole' ? 'captured' : 'crash');
        }
      }
      if (Math.hypot(s.x - goal.x, s.y - goal.y) < goal.r) return (sim.outcome = 'goal');
      if (s.x < -LOST_MARGIN || s.y < -LOST_MARGIN || s.x > WORLD + LOST_MARGIN || s.y > WORLD + LOST_MARGIN) return (sim.outcome = 'lost');
      if (steps >= maxSteps) return (sim.outcome = 'timeout');
      return null;
    },
  };
  return sim;
}

/** Runs a flight to its end. `path` holds the start point and then every 4th step. */
export function simulate(input: SimInput, maxTime = MAX_TIME): { outcome: Outcome; time: number; shipTime: number; collected: number[]; path: Point[] } {
  const sim = createSim(input, maxTime);
  const path: Point[] = [{ x: sim.ship.x, y: sim.ship.y }];
  let n = 0;
  let outcome: Outcome | null = null;
  while (!outcome) {
    outcome = sim.step();
    if (++n % 4 === 0) path.push({ x: sim.ship.x, y: sim.ship.y });
  }
  return { outcome, time: sim.time, shipTime: sim.shipTime, collected: [...sim.collected].sort((p, q) => p - q), path };
}
