import { describe, expect, it } from 'vitest';
import { LEVELS, massKg } from './levels';
import { bestDx, dxToSlider, predictedCentre, velocitySpread } from './physics';
import { GUN, arrowGeometry, drawScene, fitView, spreadGraphSvg, type Scene } from './render';

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

  it('drawScene survives every phase and the slider ends', () => {
    const bad: string[] = [];
    const fn = (name: string) => (...a: number[]) => { if (a.some((n) => typeof n === 'number' && Number.isNaN(n))) bad.push(name); };
    const g = new Proxy({} as Record<string, unknown>, {
      get: (o, k: string) => (k === 'arc' || k === 'moveTo' || k === 'lineTo' ? fn(k)
        : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} })
        : k in o ? o[k] : () => {}),
      set: (o, k: string, v) => { o[k] = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
    const level = LEVELS[3];
    const v = fitView(500, 400, 2, level.width);
    for (const dx of [3, 150]) for (const reduced of [false, true]) for (const phase of ['set', 'aim', 'flight', 'result', 'over'] as const) {
      const s: Scene = {
        level, time: 0.4, reducedMotion: reduced, phase, reading: level.shots[1], dx, t: level.flightTime, progress: 0.5,
        aim: { x: 300, y: 300 }, found: { x: 320, y: 310 }, hit: phase !== 'over' && dx === 3,
        shotMarks: [{ at: { x: 100, y: 100 }, hit: true }, { at: { x: 200, y: 150 }, hit: false }],
      };
      expect(() => drawScene(g, v, s)).not.toThrow();
      expect(() => drawScene(g, v, { ...s, hit: !s.hit, aim: null, found: null })).not.toThrow();
    }
    expect(bad).toEqual([]);
  });
});
