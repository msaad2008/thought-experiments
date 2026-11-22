import { describe, expect, it } from 'vitest';
import { LEVELS, bestLever, course } from './levels';
import { AT_REST, aberrate, doppler, leverToEta, seenColonyYear, type Ship } from './physics';
import { STARS, drawScene, fitView, predictorCurve, predictorSvg, projectStar, type Phase, type Scene } from './render';

const NONE: ReadonlySet<string> = new Set();

/** A fake 2D context: records every call (with arguments) and flags any NaN passed to a path or rect call. */
function fakeContext() {
  const bad: string[] = [];
  const calls: [string, unknown[]][] = [];
  const g = new Proxy({} as Record<string, unknown>, {
    get: (o, k: string) => (k in o ? o[k] : (...a: unknown[]) => {
      calls.push([k, a]);
      if (['arc', 'moveTo', 'lineTo', 'fillRect', 'ellipse', 'translate', 'rotate', 'scale', 'createRadialGradient', 'fillText'].includes(k)
        && a.some((n) => typeof n === 'number' && !Number.isFinite(n))) bad.push(k);
      return k === 'createRadialGradient' || k === 'createLinearGradient' ? { addColorStop() {} } : undefined;
    }),
    set: (o, k: string, v) => { o[k] = v; calls.push([k, [v]]); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { g, bad, calls };
}

describe('relativity render', () => {
  it('fitView centres a square', () => {
    const v = fitView(800, 400, 2);
    expect(v.size).toBe(400);
    expect(v.ox).toBeCloseTo(200);
    expect(v.oy).toBeCloseTo(0);
    expect(v.dpr).toBe(2);
  });

  it('the star list is a fixed ~300 with the colony star dead ahead', () => {
    expect(STARS.length).toBeGreaterThanOrEqual(250);
    expect(STARS[0].cos).toBe(1);
    expect(STARS.every((s) => s.cos >= -1 && s.cos <= 1 && Number.isFinite(s.az) && s.kelvin > 0 && s.mag > 0)).toBe(true);
    // spread over the whole sphere, not on a line: mean direction near zero in z
    const mean = STARS.reduce((a, s) => a + s.cos, 0) / STARS.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
  });

  it('stars bunch forward and turn blue at speed', () => {
    const cos60 = Math.cos(Math.PI / 3);
    const slow = projectStar(aberrate(cos60, 0), 0, 180)!;
    const fast = projectStar(aberrate(cos60, 0.9), 0, 180)!;
    expect(fast.r).toBeLessThan(slow.r);
    expect(doppler(aberrate(cos60, 0.9), 0.9)).toBeGreaterThan(1);
    expect(projectStar(-1, 0, 110)).toBeNull();
    expect(projectStar(1, 0.3, 110)!.r).toBeCloseTo(0);
  });

  it('drawScene survives every phase, both headings and the lever ends', () => {
    const { g, bad, calls } = fakeContext();
    for (const level of [LEVELS[0], LEVELS[7]]) {
      const c = course(level, NONE);
      const v = fitView(360, 360, 2);
      const ships: Ship[] = [
        AT_REST,
        { eta: Math.atanh(0.999), x: level.distance / 2, t: level.distance / 2 + 3, tau: 2 },
        { eta: leverToEta(0, level.leverMax), x: level.distance * 0.3, t: 5, tau: 5 },
        { eta: 0, x: level.distance, t: level.distance + 1, tau: 3 },
      ];
      for (const ship of ships) for (const heading of [1, -1] as const) for (const reducedMotion of [false, true]) {
        for (const phase of ['brief', 'flight', 'ripening', 'return', 'done', 'late'] as Phase[]) {
          const s: Scene = { level, ship, course: c, heading, colonyYearSeen: seenColonyYear(ship, level.distance), time: 1.3, reducedMotion, phase };
          expect(() => drawScene(g, v, s)).not.toThrow();
        }
      }
    }
    expect(bad).toEqual([]);
    const used = new Set(calls.map(([k]) => k));
    for (const k of ['roundRect', 'reset', 'letterSpacing', 'wordSpacing']) expect(used.has(k), k).toBe(false);
  });

  it('light pulses travel only between the ship and the colony, and never on the way home', () => {
    const level = LEVELS[0], c = course(level, NONE), v = fitView(360, 360, 1), D = level.distance;
    const ship: Ship = { eta: 0.5, x: 1, t: 3.5, tau: 3 };
    const base: Scene = { level, ship, course: c, heading: 1, colonyYearSeen: seenColonyYear(ship, D), time: 0, reducedMotion: true, phase: 'flight' };
    // pulses are the radius-3 glows on the route line (y = 86 in drawing units)
    const pulses = (s: Scene) => { const { g, calls } = fakeContext(); drawScene(g, v, s); return calls.filter(([k, a]) => k === 'arc' && a[1] === 86 && a[2] === 3).map(([, a]) => a[0] as number); };
    const xs = pulses(base);
    expect(xs.length).toBe(3); // colony years 1, 2, 3 are on the way
    const shipX = 14 + (ship.x / D) * 72, colonyX = 86;
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(shipX); expect(x).toBeLessThanOrEqual(colonyX); }
    expect(pulses({ ...base, heading: -1 })).toEqual([]);
    expect(pulses({ ...base, phase: 'brief', ship: AT_REST, colonyYearSeen: -D })).toEqual([]);
  });

  it('the predictor curve is cached, and a new lever only moves the marker', () => {
    const l = LEVELS[1];
    expect(predictorCurve(l, NONE)).toBe(predictorCurve(l, new Set()));
    expect(predictorCurve(l, new Set(['couch']))).not.toBe(predictorCurve(l, NONE));
    const cx = (lev: number) => Number(predictorSvg(l, NONE, lev).match(/<circle[^>]* cx="([-\d.]+)"/)![1]);
    expect(cx(0.2)).not.toBeCloseTo(cx(0.8));
  });

  it('the three line labels never overlap and stay inside the viewBox', () => {
    for (const l of LEVELS) for (const up of [NONE, new Set(['couch', 'incubator'])]) {
      const svg = predictorSvg(l, up, 0.5);
      const H = Number(svg.match(/viewBox="0 0 \d+ (\d+)"/)![1]);
      const ys = [...svg.matchAll(/<text x="199" y="([\d.]+)"/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
      expect(ys, l.id).toHaveLength(3);
      expect(ys[1] - ys[0], l.id).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(ys[2] - ys[1], l.id).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(ys[0]).toBeGreaterThan(0);
      expect(ys[2]).toBeLessThan(H);
    }
  });

  it('the predictor is labelled', () => {
    const svg = predictorSvg(LEVELS[1], NONE, 0.5);
    for (const w of ['slower', 'faster', 'deadline', '★★★']) expect(svg).toContain(w);
  });

  it('the predictor dips at the best lever', () => {
    for (const level of [LEVELS[1], LEVELS[0]]) {
      const best = bestLever(level, NONE);
      const svg = predictorSvg(level, NONE, 0.5);
      expect(svg).toContain('role="img"');
      expect(svg).toMatch(/aria-label="[^"]*best about \d\.\d\d c/);
      expect(svg).toContain('Delivers about year ');
      const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
      const W = Number(vb[1]);
      const d = svg.match(/<path[^>]* d="([^"]+)"/)![1];
      const pts = [...d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((q) => [Number(q[1]), Number(q[2])]);
      expect(pts.length).toBeGreaterThanOrEqual(60);
      const low = pts.reduce((a, b) => (b[1] > a[1] ? b : a)); // y grows down: earliest delivery = largest y
      expect(Math.abs(low[0] / W - best)).toBeLessThan(0.02);
      const cx = Number(svg.match(/<circle[^>]* cx="([-\d.]+)"/)![1]);
      expect(cx / W).toBeCloseTo(0.5, 2);
      expect((svg.match(/stroke-dasharray/g) ?? []).length).toBe(3);
    }
    expect(predictorSvg(LEVELS[1], NONE, 0.5)).toContain('best about 0.84 c');
  });
});
