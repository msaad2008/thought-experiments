// @vitest-environment jsdom
// The Antidote Run play view: brief → flight → (ripening) → delivered → (trip home) → done, or Too late.
import { test, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../game-ui/fit', () => ({ fitSky: vi.fn() }));
vi.mock('./render', async (importOriginal) => {
  const real = await importOriginal<typeof import('./render')>();
  return { ...real, drawScene: vi.fn(), liveCurve: vi.fn(real.liveCurve) };
});

import { fitSky } from '../../game-ui/fit';
import { drawScene, liveCurve, predictorCurve, predictorSvg, type Scene } from './render';
import { startLevel } from './play';
import { LEVELS, bestLever, course, deliveryFor, ripenTime } from './levels';
import { AT_REST, START_BETA, advance, deliveryYear, etaToLever, leverToEta } from './physics';

const L01 = 0, L02 = 1, L03 = 2, L05 = 4, L07 = 6, L08 = 7;
const NONE: ReadonlySet<string> = new Set();
/** The lever's value at a normal start: 0.5c. */
const START = (i: number) => String(Math.round(etaToLever(Math.atanh(START_BETA), LEVELS[i].leverMax) * 1000));

let dispose: (() => void) | null = null;
/** What ctx.paused() answers: true while the Physics panel would be open. */
let pausedNow = false;
let next: FrameRequestCallback | null = null;
let clock = 0;
/** Every status line shown at the end of a frame (or after a click), in order, without repeats. */
let log: string[] = [];
let statusEl: Element | null = null;
const errors: unknown[] = [];
const onError = (e: ErrorEvent) => errors.push(e.error);

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => ((next = cb), 1));
  vi.stubGlobal('cancelAnimationFrame', () => (next = null));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  window.addEventListener('error', onError);
  vi.mocked(drawScene).mockClear();
  vi.mocked(fitSky).mockClear();
  clock = 0;
  next = null;
  log = [];
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
  statusEl = null;
});

interface Opts {
  classroom?: boolean;
  keepSetup?: boolean;
  upgrades?: string[];
}

function setup(index: number, o: Opts = {}) {
  // drawScene is mocked, so any context will do: it records each Scene drawn.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400));
  const stage = document.createElement('div');
  document.body.append(stage);
  const complete = vi.fn();
  const levels = vi.fn();
  const ctx = {
    stage, upgrades: new Set(o.upgrades ?? []), classroom: o.classroom ?? false, keepSetup: o.keepSetup ?? false,
    complete, levels, paused: () => pausedNow,
  };
  dispose = startLevel(index, ctx);
  const [primary, middle, levelsBtn] = [...stage.querySelectorAll<HTMLButtonElement>('.gv-actions > button')];
  statusEl = stage.querySelector('[aria-live]');
  const text = (sel: string) => stage.querySelector(sel)?.textContent ?? '';
  return {
    stage, level: LEVELS[index], complete, levels, primary, middle, levelsBtn, text,
    canvas: stage.querySelector('canvas')!,
    lever: stage.querySelector<HTMLInputElement>('input[type="range"]')!,
    hint: stage.querySelector<HTMLElement>('.gv-hint')!,
    toast: stage.querySelector('.gv-toast')!,
    status: () => statusEl!.textContent ?? '',
    clocks: () => [text('.ar-ship-clock .ar-clock-value'), text('.ar-earth-clock .ar-clock-value')],
    speed: () => parseFloat(text('.ar-speed-text')),
  };
}
type S = ReturnType<typeof setup>;

function record(): void {
  const t = statusEl?.textContent ?? '';
  if (t !== log.at(-1)) log.push(t);
}

function step(n = 1, ms = 1000 / 60): void {
  for (let i = 0; i < n; i++) {
    next?.((clock += ms));
    record();
  }
}

/** Steps frames until `done()`; returns how many it took. */
function until(done: () => boolean, ms = 1000 / 60, max = 20000): number {
  let n = 0;
  while (!done() && n < max) {
    step(1, ms);
    n++;
  }
  if (!done()) throw new Error(`not reached in ${max} frames`);
  return n;
}

/** Steps one frame and returns the Scene it drew. */
function look(): Scene {
  step();
  return vi.mocked(drawScene).mock.calls.at(-1)![2];
}

function setLever(s: S, v: number): void {
  s.lever.value = String(v);
  s.lever.dispatchEvent(new Event('input', { bubbles: true }));
  record();
}

function click(b: HTMLButtonElement): void {
  b.click();
  record();
}

function fresh(): void {
  dispose?.();
  dispose = null;
  document.body.replaceChildren();
  vi.mocked(drawScene).mockClear();
  log = [];
}

/** A one-way flight with the lever held at setting `lever` (0..1) from launch: what the physics says. */
function expected(i: number, lever: number, ups: ReadonlySet<string> = NONE, ripen = ripenTime(LEVELS[i], ups)) {
  const l = LEVELS[i];
  const arrive = advance(AT_REST, course(l, ups), leverToEta(lever, l.leverMax), Infinity);
  return { arrive, R: ripen, year: deliveryYear(arrive, ripen), tau: Math.max(arrive.tau, ripen) };
}

const delivered = (s: S) => () => s.status().startsWith('Delivered');

/** Which parts of the panel are on show (jsdom has no layout: the `hidden` attributes). */
const shown = (s: S) => {
  const on = (sel: string) => !s.stage.querySelector<HTMLElement>(sel)!.hidden;
  return {
    hint: on('.gv-hint'), trip: on('.ar-trip'), marks: on('.ar-marks'),
    clocks: on('.ar-clocks'), speed: on('.ar-speed'), news: on('.ar-news'),
  };
};
const LIVE = { hint: false, trip: false, marks: true, clocks: true, speed: true, news: true };

test('the brief shows the trip, the marks and the lever at 0.5c', () => {
  const s = setup(L02);
  expect(s.text('.ar-trip')).toBe('Epsilon Eridani · 10.5 light-years · crew limit 1 g · culture needs 8.0 yr of ship time');
  expect(s.stage.querySelector('.ar-marks')!.parentElement!.className).toBe('ar-brief');
  expect(s.text('.ar-marks [aria-hidden="true"]')).toBe('Deadline 15.6 · ★★ 14.6 · ★★★ 13.7');
  expect(s.text('.ar-marks .sr-only')).toBe('Deadline year 15.6. Two stars by 14.6. Three stars by 13.7.');
  expect(s.text('.ar-lever-value')).toBe('0.50 c · γ 1.15');
  expect(s.hint.textContent).toBe(s.level.hint);
  expect(s.hint.hidden).toBe(false);
  // Phones: before launch the clocks, speed and news (all zero) make way for the trip and the hint.
  expect(shown(s)).toEqual({ hint: true, trip: true, marks: true, clocks: false, speed: false, news: false });
  expect([s.lever.min, s.lever.max, s.lever.step, s.lever.value]).toEqual(['0', '1000', '1', START(L02)]);
  expect(s.lever.getAttribute('aria-valuetext')).toBe('0.50 c, gamma 1.15');
  expect(s.lever.getAttribute('aria-label')).toBe('Cruise speed');
  expect(s.text('.ar-lever')).toContain('Cruise speed');
  expect(s.lever.disabled).toBe(false);
  expect(s.text('.ar-ship-clock .ar-clock-label')).toBe('Ship');
  expect(s.text('.ar-earth-clock .ar-clock-label')).toBe('Earth & colony');
  expect(s.text('.ar-earth-clock .ar-clock-caption')).toBe('the clock you are passing');
  expect(s.clocks()).toEqual(['0.00 yr', 'year 0.00']);
  expect(s.text('.ar-speed-text')).toBe('0.00 c · γ 1.00');
  expect(s.text('.ar-culture')).toBe('Culture 0% of 8.0 yr');
  expect(s.text('.ar-news')).toBe('');
  expect(s.stage.querySelector('.ar-predictor')).toBeNull();
  expect(s.primary.textContent).toBe('Launch');
  expect(s.primary.disabled).toBe(false);
  expect(s.middle.disabled).toBe(true); // students: no Solution, and nothing is flying
  expect(s.levelsBtn.textContent).toBe('Levels');
  expect(s.canvas.getAttribute('role')).toBe('img');
  expect(s.canvas.getAttribute('aria-label')).toBe('View ahead and route map');
  expect(s.toast.getAttribute('aria-hidden')).toBe('true');
  expect(s.stage.querySelectorAll('[aria-live]')).toHaveLength(1);
  const sc = look();
  expect(sc.phase).toBe('brief');
  expect(sc.heading).toBe(1);
  expect(sc.ship).toEqual(AT_REST);
  s.levelsBtn.click();
  expect(s.levels).toHaveBeenCalledTimes(1);
  fresh();

  const g = setup(L03, { upgrades: ['couch', 'incubator'] }); // 0.5 g × 1.5; 8 yr × 0.8
  expect(g.text('.ar-brief p')).toBe("Barnard's Star · 6.0 light-years · crew limit 0.75 g · culture needs 6.4 yr of ship time");
});

test('launch, fly, dock and deliver: level 02 at its best lever gives 3 stars', () => {
  const s = setup(L02, { classroom: true });
  expect(s.middle.textContent).toBe('Solution');
  expect(s.middle.disabled).toBe(false);
  click(s.middle);
  const best = bestLever(s.level, NONE);
  expect(s.lever.value).toBe(String(Math.round(best * 1000)));
  expect(s.status()).toBe('Best speed chosen.');
  click(s.primary);
  expect(s.status()).toBe('Launched.');
  expect(s.hint.hidden).toBe(true);
  expect(s.primary.textContent).toBe('Launch');
  expect(s.primary.disabled).toBe(true);
  expect(s.middle.textContent).toBe('Speed 1×');
  expect(s.middle.getAttribute('aria-label')).toBe('Playback speed 1×. Press to change.');
  expect(s.middle.disabled).toBe(false);
  expect(s.lever.disabled).toBe(false);
  const frames = until(delivered(s));
  expect(frames).toBeGreaterThan(1800); // about 35 s of flight, plus any ripening
  expect(frames).toBeLessThan(2400);
  const e = expected(L02, best);
  expect(s.status()).toBe(`Delivered in year ${e.year.toFixed(2)}.`);
  expect(s.toast.textContent).toBe(s.status());
  expect(log).toContain('Braking for the colony.');
  expect(log.indexOf('Braking for the colony.')).toBeGreaterThan(log.indexOf('Launched.'));
  expect([s.primary.disabled, s.middle.disabled, s.lever.disabled, s.levelsBtn.disabled]).toEqual([true, true, true, true]);
  expect(s.complete).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1199);
  expect(s.complete).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(s.complete).toHaveBeenCalledTimes(1);
  expect(s.complete).toHaveBeenCalledWith(3, `${s.level.insight} Colony clocks: ${e.year.toFixed(2)} years. Yours: ${e.tau.toFixed(1)}.`);
  const sc = look();
  expect(sc.phase).toBe('done');
  expect(sc.ship.x).toBe(s.level.distance);
  expect(sc.ship.eta).toBe(0);
  expect(errors).toEqual([]);
});

test('timing changes nothing', () => {
  type Mode = 'plain' | 'hz30' | 'hz144' | 'stalls' | 'speed4' | 'half' | 'paused' | 'hidden';
  const run = (mode: Mode) => {
    const s = setup(L02, { classroom: true });
    click(s.middle); // the best lever
    click(s.primary);
    if (mode === 'speed4') {
      click(s.middle);
      click(s.middle);
      expect(s.middle.textContent).toBe('Speed 4×');
      expect(s.middle.getAttribute('aria-label')).toBe('Playback speed 4×. Press to change.');
    } else if (mode === 'half') {
      for (let i = 0; i < 3; i++) click(s.middle);
      expect(s.middle.textContent).toBe('Speed ½×');
    }
    step(300);
    if (mode === 'paused') {
      pausedNow = true;
      const before = s.clocks();
      step(600);
      expect(s.clocks()).toEqual(before);
      expect(look().ship.x).toBeGreaterThan(0);
      pausedNow = false;
    } else if (mode === 'hidden') {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      const before = s.clocks();
      clock += 60000;
      step(600);
      expect(s.clocks()).toEqual(before);
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }
    const ms = { hz30: 1000 / 30, hz144: 1000 / 144, stalls: 500 }[mode as string] ?? 1000 / 60;
    until(delivered(s), ms, 60000);
    if (mode === 'paused') {
      pausedNow = true; // the level end waits too
      vi.advanceTimersByTime(5000);
      expect(s.complete).not.toHaveBeenCalled();
      pausedNow = false;
    }
    vi.advanceTimersByTime(1200);
    expect(s.complete).toHaveBeenCalledTimes(1);
    const out = s.complete.mock.calls[0];
    fresh();
    return out;
  };
  const modes: Mode[] = ['plain', 'hz30', 'hz144', 'stalls', 'speed4', 'half', 'paused', 'hidden'];
  const runs = modes.map(run);
  expect(runs[0][0]).toBe(3);
  for (const r of runs) expect(r).toEqual(runs[0]);
});

test('arriving unripe waits, then delivers', () => {
  const s = setup(L02);
  setLever(s, 1000);
  click(s.primary);
  until(() => s.status().startsWith('Arrived'));
  const e = expected(L02, 1);
  expect(s.status()).toBe(`Arrived. The culture needs ${(e.R - e.arrive.tau).toFixed(1)} more years.`);
  expect(s.toast.textContent).toBe(s.status());
  expect(s.speed()).toBe(0);
  expect(s.middle.textContent).toBe('Speed 1×'); // the wait can be sped up too
  expect(s.primary.disabled).toBe(true);
  expect(look().phase).toBe('ripening');
  const frames = until(delivered(s));
  expect(frames).toBeLessThanOrEqual(3 * 60 + 2); // a ripening wait plays in at most 3 s
  expect(s.status()).toBe(`Delivered in year ${deliveryFor(s.level, NONE, 1).toFixed(2)}.`);
  expect(s.text('.ar-culture')).toBe('Culture 100% of 8.0 yr');
  vi.advanceTimersByTime(1200);
  expect(s.complete).toHaveBeenCalledWith(1, expect.stringContaining('Colony clocks:'));
});

test('too slow ends as Too late, with Try again', () => {
  const s = setup(L08);
  setLever(s, 0);
  click(s.primary);
  click(s.middle);
  click(s.middle); // 4×
  const frames = until(() => s.primary.textContent === 'Try again', 100, 2000);
  expect(frames).toBeLessThan(400); // no endless trip
  const late = "Too late: by the colony's clocks, the deadline was year 28.7.";
  expect(s.status()).toBe(late);
  expect(s.toast.textContent).toBe(late);
  expect(shown(s)).toEqual(LIVE); // the panel keeps its flight shape
  expect(document.activeElement).toBe(s.primary); // Try again
  const year = parseFloat(s.clocks()[1].slice(5));
  expect(year).toBeGreaterThanOrEqual(28.7); // shown to 2 decimals: just past 28.70 reads 28.70
  expect(year).toBeLessThan(28.9);
  expect(s.primary.disabled).toBe(false);
  expect(s.lever.disabled).toBe(true);
  expect(s.middle.disabled).toBe(true);
  expect(look().phase).toBe('late');
  const frozen = s.clocks();
  step(100);
  expect(s.clocks()).toEqual(frozen);
  vi.advanceTimersByTime(10000);
  expect(s.complete).not.toHaveBeenCalled();
  expect(s.toast.classList.contains('on')).toBe(true); // the reason stays on show until Try again
  click(s.primary); // Try again: the brief, the same lever
  expect(s.toast.classList.contains('on')).toBe(false);
  expect(shown(s)).toEqual({ hint: true, trip: true, marks: true, clocks: false, speed: false, news: false });
  expect(s.primary.textContent).toBe('Launch');
  expect(s.primary.disabled).toBe(false);
  expect(s.lever.value).toBe('0');
  expect(s.lever.disabled).toBe(false);
  expect(s.clocks()).toEqual(['0.00 yr', 'year 0.00']);
  expect(s.hint.textContent).toBe(s.level.hint);
  expect(s.hint.hidden).toBe(false);
  const sc = look();
  expect(sc.phase).toBe('brief');
  expect(sc.ship).toEqual(AT_REST);
  click(s.primary);
  expect(s.middle.textContent).toBe('Speed 1×'); // Try again resets the playback speed
  expect(errors).toEqual([]);
});

test('once launched, the panel shows the clocks and the lever has the focus', () => {
  const s = setup(L02, { classroom: true, upgrades: ['predictor'] });
  expect(s.stage.querySelector('.gv-panel')!.classList.contains('ar-live')).toBe(false);
  click(s.primary);
  expect(shown(s)).toEqual(LIVE);
  expect(s.stage.querySelector('.gv-panel')!.classList.contains('ar-live')).toBe(true);
  expect(s.text('.ar-earth-clock .ar-clock-caption')).toBe('the clock you are passing'); // still there, said plainly
  expect(document.activeElement).toBe(s.lever);
  step(60);
  expect(shown(s)).toEqual(LIVE);
  setLever(s, 1000);
  until(() => s.status().startsWith('Arrived'));
  expect(shown(s)).toEqual(LIVE); // ripening
  until(delivered(s));
  expect(shown(s)).toEqual(LIVE); // done
});

test('the trip home takes about RETURN_SECONDS however the lever moves', () => {
  for (const to of [0, 1000]) {
    const s = setup(L07, { classroom: true });
    click(s.middle);
    click(s.primary);
    until(delivered(s));
    step(60); // a second of the trip home
    setLever(s, to);
    const frames = 60 + until(() => s.status().startsWith('Home'));
    expect(frames).toBeGreaterThan(5 * 60 - 5);
    expect(frames).toBeLessThan(5 * 60 + 5);
    expect(look().ship.x).toBe(s.level.distance);
    vi.advanceTimersByTime(1200);
    expect(s.complete).toHaveBeenCalledWith(3, expect.stringContaining('Your twin on Earth aged'));
    fresh();
  }
});

test('the lever works mid-flight', () => {
  const s = setup(L02);
  setLever(s, 600);
  click(s.primary);
  step(600); // past the speeding up: coasting
  const cruise = s.speed();
  expect(cruise).toBeCloseTo(Math.tanh(leverToEta(0.6, s.level.leverMax)), 2);
  step(10);
  expect(s.speed()).toBe(cruise);
  setLever(s, 400);
  expect(s.lever.getAttribute('aria-valuetext')).toMatch(/^0\.\d\d c, gamma \d\.\d\d$/);
  step(30);
  expect(s.speed()).toBeLessThan(cruise);
  expect(log).not.toContain('Braking for the colony.'); // slowing to the lever is not braking for the colony
  step(200);
  expect(s.speed()).toBeCloseTo(Math.tanh(leverToEta(0.4, s.level.leverMax)), 2);
  setLever(s, 600);
  until(() => s.status() === 'Braking for the colony.');
  setLever(s, 1000); // raised while braking: it keeps braking, and docks exactly
  step(5);
  expect(s.status()).toBe('Braking for the colony.');
  until(delivered(s));
  const sc = look();
  expect(sc.phase).toBe('done');
  expect(sc.ship.x).toBe(s.level.distance);
  expect(sc.ship.eta).toBe(0);
  expect(s.speed()).toBe(0);
  for (const c of s.clocks()) expect(c).not.toContain('NaN');
  expect(log.filter((l) => l === 'Braking for the colony.')).toHaveLength(1);
  vi.advanceTimersByTime(1200);
  expect(s.complete).toHaveBeenCalledTimes(1);
  expect(errors).toEqual([]);
});

test('level 05: the news arrives late and changes the culture', () => {
  const msg = 'Colony, sent year 1: The strain has changed: the culture now needs 7 years.';
  let s = setup(L05, { classroom: true });
  click(s.middle); // Solution: the best for what is known at launch
  const best = bestLever(s.level, NONE);
  expect(s.lever.value).toBe(String(Math.round(best * 1000)));
  click(s.primary);
  step(30);
  expect(s.text('.ar-culture')).toMatch(/ of 5\.0 yr$/);
  const frames = until(() => s.status() === msg);
  expect(frames).toBeGreaterThan(300); // its light takes years to catch up
  expect(s.text('.ar-news')).toBe(msg);
  expect(s.text('.ar-culture')).toMatch(/ of 7\.0 yr$/);
  expect(s.text('.ar-trip')).toContain('culture needs 7.0 yr of ship time');
  step(300);
  expect(s.text('.ar-news')).toBe(msg); // the message stays on show
  until(delivered(s));
  const e = expected(L05, best, NONE, 7);
  expect(s.status()).toBe(`Delivered in year ${e.year.toFixed(2)}.`);
  vi.advanceTimersByTime(1200);
  expect(s.complete).toHaveBeenCalledWith(2, expect.stringContaining(`Colony clocks: ${e.year.toFixed(2)} years.`));
  expect(log.filter((l) => l === msg)).toHaveLength(1);
  fresh();

  s = setup(L05, { upgrades: ['incubator'] });
  expect(s.text('.ar-culture')).toBe('Culture 0% of 4.0 yr');
  click(s.primary);
  until(() => s.status() === msg);
  expect(s.text('.ar-culture')).toMatch(/ of 5\.6 yr$/);
});

test('a round trip flies home and compares twins', () => {
  const s = setup(L07, { classroom: true, upgrades: ['predictor'] });
  expect(s.stage.querySelector<HTMLElement>('.ar-predictor')!.hidden).toBe(false);
  click(s.middle);
  const best = bestLever(s.level, NONE);
  click(s.primary);
  until(delivered(s));
  const e = expected(L07, best);
  expect(s.status()).toBe(`Delivered in year ${e.year.toFixed(2)}.`);
  let sc = look();
  expect(sc.phase).toBe('return');
  expect(sc.heading).toBe(-1);
  expect(sc.ship.x).toBeGreaterThanOrEqual(0);
  expect(sc.ship.x).toBeLessThan(0.1);
  expect(s.lever.disabled).toBe(false);
  expect(s.middle.textContent).toBe('Speed 1×');
  expect(s.levelsBtn.disabled).toBe(true); // delivered: leaving now would lose the stars
  expect(s.stage.querySelector<HTMLElement>('.ar-predictor')!.hidden).toBe(true); // the delivery is done
  const frames = until(() => s.status().startsWith('Home'));
  expect(frames).toBeGreaterThan(5 * 60 - 5); // the trip home plays in 5 s
  expect(frames).toBeLessThan(5 * 60 + 5);
  const home = advance(AT_REST, course(s.level, NONE), leverToEta(best, s.level.leverMax), Infinity);
  const A = e.year + home.t, B = e.tau + home.tau;
  expect(s.status()).toBe(`Home in year ${A.toFixed(2)}.`);
  expect(s.clocks()).toEqual([`${B.toFixed(2)} yr`, `year ${A.toFixed(2)}`]);
  sc = look();
  expect(sc.phase).toBe('done');
  expect(sc.heading).toBe(-1);
  expect(sc.ship.x).toBe(s.level.distance);
  expect(s.complete).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1200);
  expect(s.complete).toHaveBeenCalledWith(
    3, `${s.level.insight} Your twin on Earth aged ${A.toFixed(1)} years. You aged ${B.toFixed(1)}.`,
  );
});

test('leaving mid-flight, mid-ripening or mid-return leaves nothing running', () => {
  const leave = (s: S) => {
    dispose!();
    dispose = null;
    expect(s.stage.childElementCount).toBe(0);
    expect(next).toBeNull();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('resize'));
    expect(next).toBeNull(); // the listeners are gone
    vi.advanceTimersByTime(20000);
    step(5);
    expect(s.complete).not.toHaveBeenCalled();
    fresh();
  };
  let s = setup(L02);
  click(s.primary);
  step(10);
  leave(s);

  s = setup(L02);
  setLever(s, 1000);
  click(s.primary);
  until(() => s.status().startsWith('Arrived'));
  leave(s);

  s = setup(L07, { classroom: true });
  click(s.middle);
  click(s.primary);
  until(delivered(s));
  step(30);
  leave(s);

  s = setup(L01); // the level end is on its way
  setLever(s, 1000);
  click(s.primary);
  until(delivered(s));
  leave(s);
  expect(errors).toEqual([]);
});

test('yearly news is shown but not announced', () => {
  const s = setup(L02, { classroom: true });
  click(s.middle);
  click(s.primary);
  let seen = false;
  until(() => {
    if (/^Colony, sent year \d+: holding on\.$/.test(s.text('.ar-news'))) seen = true;
    return delivered(s)();
  });
  expect(seen).toBe(true);
  expect(s.text('.ar-news')).toMatch(/^Colony, sent year \d+: holding on\.$/);
  expect(Number(/year (\d+)/.exec(s.text('.ar-news'))![1])).toBeGreaterThan(5);
  expect(log.some((l) => l.includes('holding on'))).toBe(false);
});

test('Retry with this setup keeps the launch lever', () => {
  let s = setup(L02);
  setLever(s, 500);
  click(s.primary);
  until(() => s.status().startsWith('Arrived'));
  setLever(s, 510); // moved after launch: not the setup
  until(delivered(s));
  vi.advanceTimersByTime(1200);
  expect(s.complete.mock.calls[0][0]).toBeGreaterThanOrEqual(1);
  fresh();

  s = setup(L02);
  expect(s.lever.value).toBe(START(L02)); // a normal start
  fresh();
  s = setup(L02, { keepSetup: true });
  expect(s.lever.value).toBe('500');
  expect(s.lever.getAttribute('aria-valuetext')).toBe(
    `${Math.tanh(leverToEta(0.5, 0.99)).toFixed(2)} c, gamma ${Math.cosh(leverToEta(0.5, 0.99)).toFixed(2)}`,
  );
  setLever(s, 0); // a Too late run is not remembered
  click(s.primary);
  until(() => s.primary.textContent === 'Try again', 100);
  fresh();
  s = setup(L02, { keepSetup: true });
  expect(s.lever.value).toBe('500');
  fresh();
  s = setup(L03, { keepSetup: true }); // never delivered: the normal start
  expect(s.lever.value).toBe(START(L03));
});

/** The same SVG, parsed the way the page parses it (the serializer writes empty tags in full). */
const parsed = (svg: string) => {
  const d = document.createElement('div');
  d.innerHTML = svg;
  return d.innerHTML;
};
/** The year the predictor's caption shows. */
const said = (s: S) => parseFloat(s.text('.ar-pred-caption').replace('Delivers about year ', ''));
const deliveredYear = (s: S) => parseFloat(s.status().replace('Delivered in year ', ''));

test('the Arrival predictor shows only when owned, with its words as page text', () => {
  let s = setup(L02);
  expect(s.stage.querySelector('.ar-predictor')).toBeNull();
  fresh();
  const ups = new Set(['predictor']);
  s = setup(L02, { upgrades: ['predictor'] });
  const graph = s.stage.querySelector('.ar-pred-graph')!;
  const start = Number(START(L02)) / 1000;
  expect(graph.innerHTML).toBe(parsed(predictorSvg(s.level, predictorCurve(s.level, ups), start, deliveryFor(s.level, ups, start))));
  setLever(s, 700);
  const year = deliveryFor(s.level, ups, 0.7).toFixed(2);
  expect(graph.innerHTML).toBe(parsed(predictorSvg(s.level, predictorCurve(s.level, ups), 0.7, deliveryFor(s.level, ups, 0.7))));
  expect(s.text('.ar-pred-caption')).toBe(`Delivers about year ${year}`);
  expect(graph.querySelector('svg')!.getAttribute('role')).toBe('img');
  expect(graph.querySelector('svg')!.getAttribute('aria-label')).toContain(`Delivers about year ${year}.`);
  expect(graph.querySelector('text')).toBeNull(); // the words are page text, readable on a phone
  const axis = [...s.stage.querySelectorAll('.ar-pred-axis > span')].map((e) => e.textContent);
  expect(axis).toEqual(['slower', `Delivers about year ${year}`, 'faster']);
  // the marks are its legend, in the lines' colours
  expect(s.stage.querySelector('.ar-predictor .ar-marks .ar-mark-3')!.textContent).toBe('★★★ 13.7');
  expect(s.stage.querySelector('.ar-brief .ar-marks')).toBeNull();
  expect(shown(s).marks).toBe(true);
});

test('after launch the predictor flies from where the ship is', () => {
  const s = setup(L02, { upgrades: ['predictor'] });
  click(s.primary); // 0.5c
  step(600); // 10 s of flight
  setLever(s, Math.round(bestLever(s.level, NONE) * 1000));
  // From rest the best lever delivers about 13.5 (3 stars); 10 s at 0.5c later it cannot.
  expect(said(s)).toBeGreaterThan(14);
  until(delivered(s));
  expect(Math.abs(said(s) - deliveredYear(s))).toBeLessThanOrEqual(0.0101);
});

test('level 05: after the news the predictor uses the new ripening time', () => {
  const s = setup(L05, { classroom: true, upgrades: ['predictor'] });
  click(s.middle); // the old best
  click(s.primary);
  expect(said(s)).toBeCloseTo(9.77, 1); // what is known at launch
  until(() => s.status().startsWith('Colony, sent year 1'));
  const prediction = said(s);
  expect(prediction).toBeGreaterThan(11.5);
  until(delivered(s));
  expect(deliveredYear(s)).toBeCloseTo(11.77, 1);
  expect(Math.abs(prediction - deliveredYear(s))).toBeLessThanOrEqual(0.0101);
});

test('the live predictor is re-flown a few times a second, not every frame', () => {
  const s = setup(L02, { upgrades: ['predictor'] });
  click(s.primary);
  /** How many times the 101-flight curve is flown over the next `frames` frames. */
  const count = (frames: number) => {
    vi.mocked(liveCurve).mockClear();
    step(frames);
    return vi.mocked(liveCurve).mock.calls.length;
  };
  const n = count(120); // 2 s
  expect(n).toBeGreaterThanOrEqual(6);
  expect(n).toBeLessThanOrEqual(9);
  pausedNow = true;
  expect(count(120)).toBe(0);
  pausedNow = false;
  vi.mocked(liveCurve).mockClear();
  setLever(s, 600); // a lever move re-flies it at once
  expect(vi.mocked(liveCurve)).toHaveBeenCalledTimes(1);
});

test('the delivery year is shown to 2 decimals, so it never contradicts the stars', () => {
  const l = LEVELS[L02];
  const years = Array.from({ length: 1001 }, (_, i) => deliveryFor(l, NONE, i / 1000));
  const i = years.reduce((b, y, j) => (Math.abs(y - 13.74) < Math.abs(years[b] - 13.74) ? j : b), 0);
  const d = years[i];
  expect(d).toBeGreaterThan(l.marks[1]); // 2 stars, though one decimal would say "13.7"
  expect(d.toFixed(2)).toBe('13.74');
  const s = setup(L02);
  setLever(s, i);
  click(s.primary);
  until(delivered(s));
  expect(s.status()).toBe('Delivered in year 13.74.');
  vi.advanceTimersByTime(1200);
  expect(s.complete).toHaveBeenCalledWith(2, expect.stringContaining('Colony clocks: 13.74 years.'));
});

test('reduced motion: the flight still plays, with no twinkle', () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
  const s = setup(L02);
  click(s.primary);
  step(60);
  const sc = look();
  expect(sc.reducedMotion).toBe(true);
  expect(sc.phase).toBe('flight');
  expect(sc.ship.x).toBeGreaterThan(0);
  expect(s.clocks()[0]).not.toBe('0.00 yr');
});

test('the sky is re-fitted when the panel changes height, once at launch, but never in flight', () => {
  const s = setup(L02);
  const panel = s.stage.querySelector('.gv-panel')!;
  let h = 300;
  vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 328, h));
  const fits = () => vi.mocked(fitSky).mock.calls.length;
  setLever(s, 300);
  const n = fits();
  expect(n).toBeGreaterThan(0);
  setLever(s, 310); // same height: no re-fit
  expect(fits()).toBe(n);
  h = 250; // the panel changes shape at launch
  click(s.primary);
  expect(fits()).toBe(n + 1);
  h = 260;
  setLever(s, 320);
  step(30);
  expect(fits()).toBe(n + 1); // not mid-flight
  click(s.middle);
  expect(fits()).toBe(n + 1);
});
