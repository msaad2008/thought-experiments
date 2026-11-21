import { test, expect } from 'vitest';
import {
  C, DT, MAX_TIME, STAR_PICK_R, BODY_TYPES, radius, schwarzschild, createSim, simulate, clockRate, pulls, accel,
  type Body, type BodyType, type SimInput, type Sim,
} from './physics';

const CENTER = { x: 500, y: 500 };
const NOWHERE = { x: -10000, y: -10000, r: 1 };

/** Ship on a tangential orbit around a body at CENTER, starting at distance r with speed v. */
function orbitInput(type: BodyType, r: number, v: number): SimInput {
  return {
    ship: { x: CENTER.x + r, y: CENTER.y, vx: 0, vy: -v },
    bodies: [{ type, ...CENTER }],
    goal: NOWHERE,
    stars: [],
  };
}
const dist = (sim: Sim) => Math.hypot(sim.ship.x - CENTER.x, sim.ship.y - CENTER.y);

test('C is 500 so the black hole radius is 48', () => expect(C).toBe(500));

test('radii from mass and density', () => {
  expect(Math.abs(radius('moon') - 39.93)).toBeLessThan(0.05);
  expect(Math.abs(radius('neutronStar') - 24.0)).toBeLessThan(0.05);
  expect(radius('blackHole')).toBe(48);
});

test('every non-black-hole body is larger than its own Schwarzschild radius', () => {
  for (const t of Object.keys(BODY_TYPES) as BodyType[]) {
    if (t === 'blackHole') continue;
    expect(radius(t)).toBeGreaterThan(schwarzschild(BODY_TYPES[t].mass));
  }
});

test('accel is the sum of pulls; a moon at 100 pulls with 20 toward itself', () => {
  const bodies: Body[] = [{ type: 'moon', x: 600, y: 500 }, { type: 'brownDwarf', x: 200, y: 300 }, { type: 'blackHole', x: 800, y: 900 }];
  const p = { x: 500, y: 500 };
  const ps = pulls(p, bodies);
  expect(ps).toHaveLength(3);
  const a = accel(p, bodies);
  expect(a.x).toBeCloseTo(ps.reduce((s, q) => s + q.x, 0), 12);
  expect(a.y).toBeCloseTo(ps.reduce((s, q) => s + q.y, 0), 12);
  expect(ps[0].x).toBeCloseTo(20, 9);
  expect(ps[0].y).toBeCloseTo(0, 9);
});

test('black hole pull uses Paczynski-Wiita GM/(r - r_s)^2', () => {
  const [pull] = pulls({ x: 500, y: 500 + 4 * 48 }, [{ type: 'blackHole', ...CENTER }]);
  expect(pull.x).toBeCloseTo(0, 9);
  expect(pull.y).toBeCloseTo(-6e6 / (3 * 48) ** 2, 9);
});

test('two-body circular orbit closes after one period and keeps its radius for 10 periods', () => {
  const r = 200, M = BODY_TYPES.brownDwarf.mass, v = Math.sqrt(M / r), T = (2 * Math.PI * r) / v;
  const sim = createSim(orbitInput('brownDwarf', r, v), 11 * T);
  const start = { ...sim.ship };
  const perStep = Math.round(T / DT);
  let maxDev = 0;
  for (let i = 0; i < perStep; i++) { sim.step(); maxDev = Math.max(maxDev, Math.abs(dist(sim) - r)); }
  expect(Math.hypot(sim.ship.x - start.x, sim.ship.y - start.y)).toBeLessThan(0.005 * r);
  for (let i = perStep; i < 10 * perStep; i++) { sim.step(); maxDev = Math.max(maxDev, Math.abs(dist(sim) - r)); }
  expect(sim.outcome).toBeNull();
  expect(maxDev).toBeLessThan(0.005 * r);
});

/** PW circular speed at radius r around a black hole; the ship starts 0.5% inside r with that speed. */
function pwOrbit(rOverRs: number) {
  const M = BODY_TYPES.blackHole.mass, rs = schwarzschild(M), r = rOverRs * rs;
  const v = Math.sqrt((M * r) / (r - rs) ** 2), T = (2 * Math.PI * r) / v;
  return { rs, T, input: orbitInput('blackHole', 0.995 * r, v) };
}

test('PW orbit at 5 r_s nudged inward stays between 4.5 and 5.5 r_s for 5 orbits', () => {
  const { rs, T, input } = pwOrbit(5);
  const sim = createSim(input, 6 * T);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < Math.round((5 * T) / DT); i++) { sim.step(); lo = Math.min(lo, dist(sim)); hi = Math.max(hi, dist(sim)); }
  expect(sim.outcome).toBeNull();
  expect(lo).toBeGreaterThan(4.5 * rs);
  expect(hi).toBeLessThan(5.5 * rs);
});

test('PW orbit at 2.5 r_s nudged inward is captured within 5 orbits', () => {
  const { T, input } = pwOrbit(2.5);
  const sim = createSim(input, 6 * T);
  for (let i = 0; i < Math.round((5 * T) / DT) && !sim.outcome; i++) sim.step();
  expect(sim.outcome).toBe('captured');
});

const flyby: SimInput = {
  ship: { x: 100, y: 450, vx: 220, vy: 0 },
  bodies: [{ type: 'moon', x: 450, y: 700 }, { type: 'blackHole', x: 650, y: 200 }],
  goal: { x: 790, y: 30, r: 40 },
  stars: [{ x: 251, y: 448 }],
};

test('determinism: chunked step() calls match simulate', () => {
  const ref = simulate(flyby);
  // The fixture slingshots past the black hole, collects its star and reaches the goal.
  expect(ref.outcome).toBe('goal');
  expect(ref.collected).toEqual([0]);
  expect(ref.shipTime).toBeLessThan(ref.time);
  for (const chunk of [1, 7, 240]) {
    const sim = createSim(flyby);
    while (!sim.outcome) for (let i = 0; i < chunk; i++) sim.step();
    expect(sim.outcome).toBe(ref.outcome);
    expect(sim.time).toBe(ref.time);
    expect(sim.shipTime).toBe(ref.shipTime);
    expect([...sim.collected].sort()).toEqual(ref.collected);
    const one = createSim(flyby);
    while (!one.outcome) one.step();
    expect(sim.ship).toEqual(one.ship);
  }
});

test('step() is a no-op once an outcome is set', () => {
  const sim = createSim(flyby);
  while (!sim.outcome) sim.step();
  const snap = { ...sim.ship, time: sim.time };
  expect(sim.step()).toBe(sim.outcome);
  expect({ ...sim.ship, time: sim.time }).toEqual(snap);
});

test('aimed straight at a moon: crash', () => {
  expect(simulate({ ship: { x: 100, y: 500, vx: 150, vy: 0 }, bodies: [{ type: 'moon', ...CENTER }], goal: NOWHERE, stars: [] }).outcome).toBe('crash');
});

test('flying away from everything: lost', () => {
  expect(simulate({ ship: { x: 500, y: 500, vx: 300, vy: 0 }, bodies: [], goal: NOWHERE, stars: [] }).outcome).toBe('lost');
});

test('sitting still with nothing around: timeout at MAX_TIME', () => {
  const res = simulate({ ship: { x: 500, y: 500, vx: 0, vy: 0 }, bodies: [], goal: NOWHERE, stars: [] });
  expect(res.outcome).toBe('timeout');
  expect(res.time).toBeCloseTo(MAX_TIME, 9);
});

test('passing a star then reaching the goal collects that star only', () => {
  const res = simulate({
    ship: { x: 100, y: 500, vx: 200, vy: 0 },
    bodies: [],
    goal: { x: 800, y: 500, r: 30 },
    stars: [{ x: 300, y: 500 + STAR_PICK_R - 2 }, { x: 400, y: 700 }],
  });
  expect(res.outcome).toBe('goal');
  expect(res.collected).toEqual([0]);
  expect(res.path[0]).toEqual({ x: 100, y: 500 });
  expect(res.path[1].x).toBeCloseTo(100 + 200 * 4 * DT, 9);
});

test('clockRate: sqrt(0.75) at 4 r_s from a black hole, 1 without one', () => {
  const rs = schwarzschild(BODY_TYPES.blackHole.mass);
  expect(Math.abs(clockRate({ x: 500 + 4 * rs, y: 500 }, [{ type: 'moon', x: 0, y: 0 }, { type: 'blackHole', ...CENTER }]) - Math.sqrt(0.75))).toBeLessThan(1e-9);
  expect(clockRate({ x: 0, y: 0 }, [{ type: 'moon', ...CENTER }])).toBe(1);
});
