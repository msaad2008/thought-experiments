// @vitest-environment jsdom
// The Uncertain Fire play view: set → aim → flight → result, five shots a level.
import { test, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../game-ui/fit', () => ({ fitSky: vi.fn() }));
vi.mock('./render', async (importOriginal) => ({ ...(await importOriginal<typeof import('./render')>()), drawScene: vi.fn() }));

import { fitSky } from '../../game-ui/fit';
import { drawScene, type Scene } from './render';
import { startLevel } from './play';
import { LEVELS, massKg } from './levels';
import { bestDx, dxToSlider, predictedCentre, sliderToDx, spread, type Point } from './physics';

/** The canvas is mocked as a 400 px square at the page's top-left, so 1 m = 400 / width px. */
const SIDE = 400;

let dispose: (() => void) | null = null;
/** What ctx.paused() answers: true while the Physics panel would be open. */
let pausedNow = false;
let next: FrameRequestCallback | null = null;
let clock = 0;
const errors: unknown[] = [];
const onError = (e: ErrorEvent) => errors.push(e.error);

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => ((next = cb), 1));
  vi.stubGlobal('cancelAnimationFrame', () => (next = null));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  window.addEventListener('error', onError);
  vi.mocked(drawScene).mockClear();
  vi.mocked(fitSky).mockClear();
  clock = 0;
  next = null;
});

afterEach(() => {
  dispose?.();
  dispose = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (document as { hidden?: boolean }).hidden;
  window.removeEventListener('error', onError);
  errors.length = 0;
  vi.restoreAllMocks();
  document.body.replaceChildren();
  pausedNow = false;
});

interface Opts {
  classroom?: boolean;
  keepSetup?: boolean;
  upgrades?: string[];
  rng?: () => number;
}

function setup(index: number, o: Opts = {}) {
  // drawScene is mocked, so any context will do: it records each Scene drawn.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, SIDE, SIDE));
  const stage = document.createElement('div');
  document.body.append(stage);
  const complete = vi.fn();
  const levels = vi.fn();
  const ctx = {
    stage, upgrades: new Set(o.upgrades ?? []), classroom: o.classroom ?? false, keepSetup: o.keepSetup ?? false,
    complete, levels, paused: () => pausedNow,
  };
  dispose = startLevel(index, ctx, o.rng);
  const [primary, middle, levelsBtn] = [...stage.querySelectorAll<HTMLButtonElement>('.gv-actions > button')];
  const level = LEVELS[index];
  return {
    stage, level, complete, levels, primary, middle, levelsBtn,
    canvas: stage.querySelector('canvas')!,
    radios: [...stage.querySelectorAll<HTMLInputElement>('input[type="radio"]')],
    slider: stage.querySelector<HTMLInputElement>('input[type="range"]'),
    readout: stage.querySelector('.uc-readout')!,
    hint: stage.querySelector<HTMLElement>('.gv-hint')!,
    toast: stage.querySelector('.gv-toast')!,
    status: () => stage.querySelector('[aria-live]')!.textContent,
    dots: () => [...stage.querySelectorAll('.uc-shots > span')].map((d) => d.className),
    /** Where the cloud is predicted to be at impact for shot i, with this run's flight time. */
    centre: (i: number, t = level.flightTime) => predictedCentre(level.shots[i], t),
  };
}
type S = ReturnType<typeof setup>;

function step(n = 1, ms = 1000 / 60): void {
  for (let i = 0; i < n; i++) next?.((clock += ms));
}

/** Steps one frame and returns the Scene it drew. */
function look(): Scene {
  step();
  return vi.mocked(drawScene).mock.calls.at(-1)![2];
}

function ptr(target: Element, type: string, x: number, y: number): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
}

function aimAt(s: S, p: Point): void {
  const k = SIDE / s.level.width;
  ptr(s.canvas, 'pointerdown', p.x * k, p.y * k);
  ptr(s.canvas, 'pointerup', p.x * k, p.y * k);
}

const key = (s: S, k: string, shiftKey = false) =>
  s.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));

/** Steps frames until the shell lands; returns how many it took. */
function fly(s: S, ms = 1000 / 60): number {
  let n = 0;
  while (s.primary.textContent === 'Fire' && n < 5000) {
    step(1, ms);
    n++;
  }
  return n;
}

/** Measure, aim, Fire, and watch it land. */
function playShot(s: S, aim: Point): void {
  s.primary.click();
  aimAt(s, aim);
  s.primary.click();
  fly(s);
}

/** 100 m from p, towards the middle of the sky. */
const away = (s: S, p: Point): Point => ({ x: p.x + (p.x < s.level.width / 2 ? 100 : -100), y: p.y });

/** Plays a whole level 01 attempt (Position mode, every sample on the centre); shots in `miss` are aimed 100 m off. */
function attempt(s: S, miss: number[]): void {
  s.radios[0].click();
  for (let i = 0; i < 5; i++) {
    playShot(s, miss.includes(i) ? away(s, s.centre(i)) : s.centre(i));
    if (i < 4) s.primary.click(); // Next shot
  }
}

function fresh(): void {
  dispose?.();
  dispose = null;
  document.body.replaceChildren();
  vi.mocked(drawScene).mockClear();
}

test('levels 1–3 offer only the two modes; level 4 brings the slider', () => {
  for (const i of [0, 1, 2]) {
    const s = setup(i);
    expect(s.radios.map((r) => r.closest('label')!.textContent)).toEqual(['Position mode', 'Momentum mode']);
    expect(s.radios.every((r) => !r.checked)).toBe(true);
    expect(s.radios[0].closest('[role="radiogroup"]')).not.toBeNull();
    expect(s.slider).toBeNull();
    fresh();
  }
  for (const i of [3, 4, 5, 6, 7]) {
    const s = setup(i);
    expect(s.radios).toEqual([]);
    expect(s.slider).not.toBeNull();
    expect([s.slider!.min, s.slider!.max, s.slider!.value]).toEqual(['0', '1000', '500']);
    expect(s.slider!.getAttribute('aria-valuetext')).toBe(`Δx ${Math.round(sliderToDx(0.5))} m`);
    const row = s.slider!.parentElement!.textContent!;
    expect(row.indexOf('Position')).toBeLessThan(row.indexOf('Momentum'));
    fresh();
  }
  const s = setup(0);
  expect(s.canvas.getAttribute('role')).toBe('application');
  expect(s.canvas.getAttribute('aria-label')).toBe('Battle area. Tap or use the arrow keys to aim, Enter to fire.');
  expect(s.dots()).toHaveLength(5);
});

test('Measure needs a mode; Fire needs an aim', () => {
  const s = setup(0);
  expect(s.primary.textContent).toBe('Measure');
  expect(s.primary.disabled).toBe(true);
  expect(s.middle.textContent).toBe('Change setting');
  expect(s.middle.disabled).toBe(true);
  s.radios[0].click();
  expect(s.readout.textContent).toContain('Δx = 10 m');
  expect(s.primary.disabled).toBe(false);
  s.primary.click();
  expect(s.status()).toBe('Measured. Aim where the ship will be in 1.0 seconds.');
  expect(s.primary.textContent).toBe('Fire');
  expect(s.primary.disabled).toBe(true);
  expect(s.radios[1].disabled).toBe(true); // the setting is fixed while aiming
  aimAt(s, { x: 100, y: 100 });
  expect(s.primary.disabled).toBe(false);
  expect(look().aim).toEqual({ x: expect.closeTo(100, 6), y: expect.closeTo(100, 6) });
  s.middle.click(); // Change setting: back to set, the same shot
  expect(s.primary.textContent).toBe('Measure');
  expect(s.radios[0].checked).toBe(true);
  expect(look().aim).toBeNull();
  aimAt(s, { x: 50, y: 50 }); // the sky ignores taps while setting
  expect(look().aim).toBeNull();
  s.primary.click();
  aimAt(s, { x: 9999, y: -50 }); // clamped to the sky
  expect(look().aim).toEqual({ x: 380, y: 0 });
});

test('a shot aimed at the centre hits when the sample lands on it', () => {
  const s = setup(0, { rng: () => 0 });
  s.radios[0].click();
  s.primary.click();
  aimAt(s, s.centre(0));
  s.primary.click();
  expect(s.status()).toBe('Fired.');
  expect(s.hint.hidden).toBe(true);
  const frames = fly(s);
  expect(frames).toBeGreaterThanOrEqual(60);
  expect(frames).toBeLessThan(64);
  expect(s.status()).toBe('Hit!');
  expect(s.dots()[0]).toContain('hit');
  expect(s.primary.textContent).toBe('Next shot');
  const sc = look();
  expect(sc.phase).toBe('result');
  expect(sc.hit).toBe(true);
  expect(sc.found).toEqual(s.centre(0));
});

test('the result is fixed at Fire: pausing, a hidden tab or a slow phone change nothing', () => {
  /** A fixed, repeating sequence of random numbers, so every run samples the same. */
  const seq = () => {
    const v = [0.42, 0.13, 0.77, 0.31];
    let i = 0;
    return vi.fn(() => v[i++ % v.length]);
  };
  const run = (mode: 'plain' | 'paused' | 'hidden' | 'stalls') => {
    const rng = seq();
    const s = setup(3, { rng });
    s.primary.click();
    aimAt(s, s.centre(0));
    s.primary.click();
    expect(rng).toHaveBeenCalledTimes(4); // sampled once, at Fire
    if (mode === 'paused') {
      pausedNow = true;
      step(600);
      expect(s.primary.textContent).toBe('Fire'); // still in flight
      expect(look().progress).toBe(0);
      pausedNow = false;
    } else if (mode === 'hidden') {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      step(600);
      expect(s.primary.textContent).toBe('Fire');
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }
    fly(s, mode === 'stalls' ? 500 : 1000 / 60);
    const sc = look();
    const out = { found: sc.found, hit: sc.hit, status: s.status(), calls: rng.mock.calls.length };
    fresh();
    return out;
  };
  const runs = (['plain', 'paused', 'hidden', 'stalls'] as const).map(run);
  expect(runs[0].calls).toBe(4);
  expect(runs[0].found).not.toEqual(LEVELS[3].shots[0]);
  for (const r of runs) expect(r).toEqual(runs[0]);
});

test('five hits give 3 stars; three give 1; two give a Try again', () => {
  const insight = LEVELS[0].insight;
  let s = setup(0, { rng: () => 0 });
  attempt(s, []);
  expect(s.primary.disabled).toBe(true); // the level end is on its way
  expect(s.levelsBtn.disabled).toBe(true);
  expect(s.complete).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1400);
  expect(s.complete).toHaveBeenCalledTimes(1);
  expect(s.complete).toHaveBeenCalledWith(3, insight);
  fresh();

  s = setup(0, { rng: () => 0 });
  attempt(s, [0, 1]);
  vi.advanceTimersByTime(1400);
  expect(s.complete).toHaveBeenCalledWith(1, insight);
  fresh();

  s = setup(0, { rng: () => 0 });
  attempt(s, [0, 2, 4]);
  expect(s.status()).toBe('Missed by 100 m. 2 of 5 hits. You need 3.');
  expect(s.hint.hidden).toBe(false);
  expect(s.hint.textContent).toBe('2 of 5 hits. You need 3.');
  expect(s.dots()).toEqual(['uc-dot miss', 'uc-dot hit', 'uc-dot miss', 'uc-dot hit', 'uc-dot miss']);
  expect(s.primary.textContent).toBe('Try again');
  vi.advanceTimersByTime(5000);
  expect(s.complete).not.toHaveBeenCalled();
  s.primary.click();
  expect(s.primary.textContent).toBe('Measure');
  expect(s.primary.disabled).toBe(false); // the same setting is kept
  expect(s.radios[0].checked).toBe(true);
  expect(s.dots()).toEqual(Array(5).fill('uc-dot'));
  expect(look().reading).toEqual(LEVELS[0].shots[0]);
});

test('a result waits, then the next shot comes by itself', () => {
  const s = setup(0, { rng: () => 0 });
  s.radios[0].click();
  playShot(s, away(s, s.centre(0)));
  expect(s.status()).toBe('Missed by 100 m.');
  vi.advanceTimersByTime(1399);
  expect(s.primary.textContent).toBe('Next shot');
  vi.advanceTimersByTime(1);
  expect(s.primary.textContent).toBe('Measure');
  const sc = look();
  expect(sc.reading).toEqual(LEVELS[0].shots[1]);
  expect(sc.shotMarks).toEqual([{ at: s.centre(0), hit: false }]);
});

test('double Fire fires once, and buttons do nothing mid-flight', () => {
  const rng = vi.fn(() => 0);
  const s = setup(0, { rng });
  s.radios[1].click();
  s.primary.click();
  aimAt(s, s.centre(0));
  s.primary.click();
  s.primary.click();
  key(s, 'Enter');
  expect(rng).toHaveBeenCalledTimes(4);
  expect(s.primary.disabled).toBe(true);
  expect(s.middle.disabled).toBe(true);
  expect(s.radios.every((r) => r.disabled)).toBe(true);
  const before = look().aim;
  aimAt(s, { x: 10, y: 10 }); // the reticle stays put
  key(s, 'ArrowLeft');
  key(s, 'Escape');
  const sc = look();
  expect(sc.phase).toBe('flight');
  expect(sc.aim).toEqual(before);
  fly(s);
  expect(rng).toHaveBeenCalledTimes(4);
  expect(errors).toEqual([]);
});

test('leaving mid-flight leaves nothing running', () => {
  let s = setup(0, { rng: () => 0 });
  s.radios[0].click();
  s.primary.click();
  aimAt(s, s.centre(0));
  s.primary.click();
  step(10);
  dispose!();
  dispose = null;
  expect(s.stage.childElementCount).toBe(0);
  expect(next).toBeNull();
  vi.advanceTimersByTime(10000);
  expect(s.complete).not.toHaveBeenCalled();
  fresh();

  s = setup(0, { rng: () => 0 });
  attempt(s, []); // the level end is waiting
  dispose!();
  dispose = null;
  vi.advanceTimersByTime(10000);
  step(5);
  expect(s.complete).not.toHaveBeenCalled();
  expect(errors).toEqual([]);
});

test('classroom Solution picks the best setting and pre-aims', () => {
  let s = setup(1); // students never see it
  expect(s.middle.textContent).toBe('Change setting');
  fresh();

  s = setup(1, { classroom: true });
  expect(s.middle.textContent).toBe('Solution');
  s.middle.click();
  expect(s.radios[1].checked).toBe(true); // Momentum
  expect(s.status()).toBe('Best setting chosen.');
  s.primary.click();
  const aim = look().aim!;
  const c = s.centre(0);
  expect(aim.x).toBeCloseTo(c.x, 6);
  expect(aim.y).toBeCloseTo(c.y, 6);
  expect(s.primary.disabled).toBe(false);
  fresh();

  s = setup(3, { classroom: true, upgrades: ['fast'] });
  s.middle.click();
  const best = bestDx(massKg(s.level), 2 * 0.75);
  expect(s.slider!.getAttribute('aria-valuetext')).toBe(`Δx ${Math.round(best)} m`);
  expect(s.slider!.value).toBe(String(Math.round(dxToSlider(best) * 1000)));
  expect(s.readout.textContent).toContain(`Δx = ${Math.round(best)} m`);
  s.primary.click();
  const a = look().aim!;
  const c4 = s.centre(0, 1.5);
  expect(a.x).toBeCloseTo(c4.x, 6);
  expect(a.y).toBeCloseTo(c4.y, 6);
});

test('Retry with this setup keeps the setting', () => {
  let s = setup(3, { rng: () => 0 });
  s.slider!.value = '200';
  s.slider!.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 0; i < 5; i++) {
    playShot(s, s.centre(i));
    if (i < 4) s.primary.click();
  }
  vi.advanceTimersByTime(1400);
  expect(s.complete).toHaveBeenCalledWith(3, s.level.insight);
  fresh();

  s = setup(3);
  expect(s.slider!.value).toBe('500'); // a normal start
  fresh();
  s = setup(3, { keepSetup: true });
  expect(s.slider!.value).toBe('200');
  expect(s.slider!.getAttribute('aria-valuetext')).toBe(`Δx ${Math.round(sliderToDx(0.2))} m`);
  fresh();
  s = setup(4, { keepSetup: true }); // never won: the normal start
  expect(s.slider!.value).toBe('500');
});

test('keyboard: arrows aim from the cloud centre, Enter fires', () => {
  const s = setup(3, { rng: () => 0 });
  const r = s.level.shots[0];
  const W = s.level.width;
  key(s, 'ArrowRight'); // nothing to aim yet
  expect(look().aim).toBeNull();
  key(s, 'Enter'); // Measure
  expect(s.status()).toBe('Measured. Aim where the ship will be in 2.0 seconds.');
  key(s, 'Enter'); // no reticle: nothing to fire at
  expect(s.primary.textContent).toBe('Fire');
  expect(s.primary.disabled).toBe(true);
  key(s, 'ArrowRight');
  expect(look().aim).toEqual({ x: r.x, y: r.y });
  key(s, 'ArrowRight');
  key(s, 'ArrowUp', true);
  const aim = look().aim!;
  expect(aim.x).toBeCloseTo(r.x + 0.02 * W, 6);
  expect(aim.y).toBeCloseTo(r.y - 0.1 * W, 6);
  key(s, 'Escape'); // Change setting
  expect(s.primary.textContent).toBe('Measure');
  key(s, 'Enter');
  expect(look().aim).toBeNull(); // the reticle was cleared
  key(s, 'ArrowDown');
  key(s, 'Enter');
  expect(s.status()).toBe('Fired.');
  expect(s.primary.disabled).toBe(true);
});

test('the readout shows the blur at impact only with the Spread graph', () => {
  let s = setup(3);
  const m = massKg(s.level);
  const dx = sliderToDx(0.5);
  expect(s.readout.textContent).toBe(`Δx = ${Math.round(dx)} m · Δv = 11.8 m/s · shell flight 2.0 s`);
  expect(s.stage.querySelector('.uc-graph')).toBeNull();
  s.primary.click();
  aimAt(s, s.centre(0));
  s.primary.click();
  fly(s);
  expect(s.readout.textContent).not.toContain('blur'); // not even after impact
  fresh();

  s = setup(3, { upgrades: ['graph'] });
  expect(s.readout.textContent).toBe(
    `Δx = ${Math.round(dx)} m · Δv = 11.8 m/s · shell flight 2.0 s · blur at impact ≈ ${Math.round(spread(dx, m, 2))} m`,
  );
  expect(s.stage.querySelector('.uc-graph svg')).not.toBeNull();
  s.slider!.value = '0';
  s.slider!.dispatchEvent(new Event('input', { bubbles: true }));
  expect(s.readout.textContent).toContain(`Δx = 3 m`);
  expect(s.readout.textContent).toContain(`blur at impact ≈ ${Math.round(spread(3, m, 2))} m`);
});

test('faster shells shorten the flight', () => {
  const frames = (upgrades: string[]) => {
    const s = setup(3, { upgrades, rng: () => 0 });
    const text = s.readout.textContent;
    s.primary.click();
    aimAt(s, s.centre(0));
    s.primary.click();
    const n = fly(s);
    fresh();
    return { text, n };
  };
  const slow = frames([]);
  const fast = frames(['fast']);
  const fast2 = frames(['fast', 'fast2']);
  expect(fast.text).toContain('shell flight 1.5 s');
  expect(fast2.text).toContain('shell flight 1.0 s');
  expect(slow.n).toBeGreaterThanOrEqual(120);
  expect(fast.n).toBeGreaterThanOrEqual(90);
  expect(fast.n).toBeLessThan(slow.n - 25);
  expect(fast2.n).toBeLessThan(fast.n - 25);
});

test('reduced motion: the shell lands at once', () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
  const s = setup(0, { rng: () => 0 });
  s.radios[0].click();
  s.primary.click();
  aimAt(s, s.centre(0));
  s.primary.click();
  expect(s.status()).toBe('Hit!');
  expect(s.primary.textContent).toBe('Next shot');
});

test('messages are announced once', () => {
  const s = setup(0, { rng: () => 0 });
  expect(s.stage.querySelectorAll('[aria-live]')).toHaveLength(1);
  expect(s.toast.getAttribute('aria-hidden')).toBe('true');
  s.radios[0].click();
  playShot(s, s.centre(0));
  expect(s.toast.textContent).toBe('Hit!');
  expect(s.status()).toBe(s.toast.textContent);
  s.primary.click();
  playShot(s, away(s, s.centre(1)));
  expect(s.toast.textContent).toBe('Missed by 100 m.');
  expect(s.status()).toBe(s.toast.textContent);
});

test('the Levels button leaves for the level select', () => {
  const s = setup(0);
  expect(s.levelsBtn.textContent).toBe('Levels');
  s.levelsBtn.click();
  expect(s.levels).toHaveBeenCalledTimes(1);
});

test('the sky is re-fitted when the panel changes height, but never while aiming or in flight', () => {
  const s = setup(0, { rng: () => 0 });
  const panel = s.stage.querySelector('.gv-panel')!;
  let h = 300;
  vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 328, h));
  const fits = () => vi.mocked(fitSky).mock.calls.length;
  s.radios[1].click(); // the readout grows a line
  let n = fits();
  expect(n).toBeGreaterThan(0);
  s.radios[0].click(); // same height: no re-fit
  expect(fits()).toBe(n);
  h = 324;
  s.radios[1].click();
  expect(fits()).toBe(n + 1);
  n = fits();
  s.primary.click(); // Measure
  aimAt(s, s.centre(0));
  h = 200; // the hint hides at Fire
  s.primary.click();
  step(10);
  expect(fits()).toBe(n); // not while aiming or in flight
  fly(s);
  expect(fits()).toBe(n + 1); // the result shows: the sky grows back
});
