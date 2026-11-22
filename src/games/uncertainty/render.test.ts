import { describe, expect, it } from 'vitest';
import { LEVELS, massKg } from './levels';
import { bestDx, dxToSlider, predictedCentre, spread, velocitySpread } from './physics';
import { GUN, arrowGeometry, drawScene, fitView, heading, spreadGraphSvg, type Scene } from './render';

describe('uncertainty render', () => {
  it('fitView maps the level width onto the sky', () => {
    expect(fitView(400, 400, 1, 380).k).toBeCloseTo(400 / 380);
    const v = fitView(800, 400, 2, 380);
    expect(v.k).toBeCloseTo(400 / 380);
    expect(v.ox).toBeCloseTo(200);
    expect(v.oy).toBeCloseTo(0);
    expect(GUN(380)).toEqual({ x: 190, y: 380 });
  });

  it('the arrow reaches the predicted centre, or 1 s of travel', () => {
    const l1 = LEVELS[0], r1 = l1.shots[0], t1 = l1.flightTime;
    const a = arrowGeometry(l1, r1, 10, t1);
    const p = predictedCentre(r1, t1);
    expect(a.to.x).toBeCloseTo(p.x);
    expect(a.to.y).toBeCloseTo(p.y);
    expect(a.extend).toBe(false);
    expect(a.fan).toBeCloseTo(velocitySpread(10, massKg(l1)) * t1);
    const l6 = LEVELS[5], r6 = l6.shots[0];
    const b = arrowGeometry(l6, r6, 30, l6.flightTime);
    expect(b.to.x).toBeCloseTo(r6.x + r6.vx);
    expect(b.to.y).toBeCloseTo(r6.y + r6.vy);
    expect(b.extend).toBe(true);
    expect(b.fan).toBeCloseTo(velocitySpread(30, massKg(l6)) * 1);
  });

  it('the spread graph dips at the best setting', () => {
    const m = 2_000_000, t = 2, dx = 40;
    const svg = spreadGraphSvg(m, t, dx);
    expect(svg).toContain('role="img"');
    expect(svg).toContain(`Δx ≈ ${Math.round(bestDx(m, t))} m`);
    const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
    const W = Number(vb[1]);
    const d = svg.match(/<path[^>]* d="([^"]+)"/)![1];
    const pts = [...d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((q) => [Number(q[1]), Number(q[2])]);
    expect(pts.length).toBeGreaterThanOrEqual(60);
    const low = pts.reduce((a, b) => (b[1] > a[1] ? b : a)); // SVG y grows down: lowest blur = largest y
    expect(Math.abs(low[0] / W - dxToSlider(bestDx(m, t)))).toBeLessThan(0.02);
    const cx = Number(svg.match(/<circle[^>]* cx="([-\d.]+)"/)![1]);
    expect(cx / W).toBeCloseTo(dxToSlider(dx), 2);
  });

  /** A fake 2D context: records every method called or property set (with its arguments), and any NaN passed to a path call. */
  function fakeContext() {
    const bad: string[] = [];
    const calls: [string, unknown[]][] = [];
    const g = new Proxy({} as Record<string, unknown>, {
      get: (o, k: string) => (k in o ? o[k] : (...a: unknown[]) => {
        calls.push([k, a]);
        if ((k === 'arc' || k === 'moveTo' || k === 'lineTo') && a.some((n) => typeof n === 'number' && Number.isNaN(n))) bad.push(k);
        return k === 'createRadialGradient' || k === 'createLinearGradient' ? { addColorStop() {} } : undefined;
      }),
      set: (o, k: string, v) => { o[k] = v; calls.push([k, [v]]); return true; },
    }) as unknown as CanvasRenderingContext2D;
    return { g, bad, calls };
  }

  it('drawScene survives every phase and the slider ends, with and without the arrow to impact', () => {
    const { g, bad, calls } = fakeContext();
    // LEVELS[5]: arrowToImpact false, so the dotted extension past the 1-second arrow is drawn too.
    for (const level of [LEVELS[3], LEVELS[5]]) for (const dx of [3, 150]) for (const reduced of [false, true]) {
      const v = fitView(500, 400, 2, level.width);
      for (const phase of ['set', 'aim', 'flight', 'result', 'over'] as const) {
        const s: Scene = {
          level, time: 0.4, reducedMotion: reduced, phase, reading: level.shots[1], dx, t: level.flightTime, progress: 0.5,
          aim: { x: 300, y: 300 }, found: { x: 320, y: 310 }, hit: phase !== 'over' && dx === 3,
          shotMarks: [{ at: { x: 100, y: 100 }, hit: true }, { at: { x: 200, y: 150 }, hit: false }],
        };
        expect(() => drawScene(g, v, s)).not.toThrow();
        expect(() => drawScene(g, v, { ...s, hit: !s.hit, aim: null, found: null })).not.toThrow();
      }
    }
    expect(bad).toEqual([]);
    // Only canvas calls that iOS 15 Safari (2021) has.
    const used = new Set(calls.map(([k]) => k));
    for (const k of ['roundRect', 'reset', 'letterSpacing', 'wordSpacing']) expect(used.has(k), k).toBe(false);
  });

  it('the ship points along its velocity', () => {
    const level = LEVELS[3];
    const v = fitView(400, 400, 1, level.width);
    for (const reading of [{ x: 300, y: 200, vx: 20, vy: 0 }, { x: 300, y: 200, vx: -20, vy: 10 }, { x: 300, y: 200, vx: 0, vy: -15 }]) {
      for (const phase of ['set', 'aim', 'flight', 'result'] as const) {
        const { g, calls } = fakeContext();
        drawScene(g, v, {
          level, time: 0.4, reducedMotion: false, phase, reading, dx: 20, t: level.flightTime, progress: 0.5,
          aim: { x: 300, y: 300 }, found: { x: 320, y: 310 }, hit: false, shotMarks: [],
        });
        const turns = calls.filter(([k]) => k === 'rotate').map(([, a]) => a[0] as number);
        expect(turns, phase).toContainEqual(expect.closeTo(Math.atan2(reading.vy, reading.vx), 9));
      }
    }
    expect(heading({ x: 0, y: 0, vx: 0, vy: 0 })).toBe(0);
  });

  it('the result shows the cloud at impact, also under reduced motion', () => {
    const level = LEVELS[3], reading = level.shots[0], t = level.flightTime, dx = 20;
    const v = fitView(400, 400, 1, level.width);
    for (const reducedMotion of [false, true]) for (const hit of [false, true]) {
      const { g, calls } = fakeContext();
      drawScene(g, v, {
        level, time: 0.2, reducedMotion, phase: 'result', reading, dx, t, progress: 1,
        aim: { x: 300, y: 300 }, found: { x: 320, y: 310 }, hit, shotMarks: [],
      });
      const c = predictedCentre(reading, t), r = 2.5 * spread(dx, massKg(level), t);
      const clouds = calls.filter(([k, a]) => k === 'createRadialGradient'
        && Math.abs((a[0] as number) - c.x) < 1e-9 && Math.abs((a[1] as number) - c.y) < 1e-9 && Math.abs((a[5] as number) - r) < 1e-9);
      expect(clouds, `reduced ${reducedMotion}, hit ${hit}`).toHaveLength(1);
    }
  });
});
