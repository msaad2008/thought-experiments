// @vitest-environment jsdom
// Input regressions for the play view: buttons pressed mid-drag, and finger drags from the tray.
import { test, expect, afterEach, vi } from 'vitest';
import { startLevel } from './play';

/** The canvas is mocked as a 400 px square at the page's top-left: 1 world unit = 0.4 px. */
const SIDE = 400;
const K = SIDE / 1000;
/** The tray sits under the sky, as on a phone. */
const TRAY = new DOMRect(0, 420, SIDE, 60);

let dispose: (() => void) | null = null;
/** What ctx.paused() answers: true while the Physics panel would be open. */
let pausedNow = false;
const errors: unknown[] = [];
const onError = (e: ErrorEvent) => errors.push(e.error);

afterEach(() => {
  dispose?.();
  dispose = null;
  window.removeEventListener('error', onError);
  errors.length = 0;
  vi.restoreAllMocks();
  document.body.replaceChildren();
  pausedNow = false;
});

function setup(index: number, classroom = false, keepSetup = false) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, SIDE, SIDE));
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  window.addEventListener('error', onError);
  const stage = document.createElement('div');
  document.body.append(stage);
  const complete = vi.fn();
  const levels = vi.fn();
  dispose = startLevel(index, { stage, upgrades: new Set(), classroom, keepSetup, complete, levels, paused: () => pausedNow });
  const tray = stage.querySelector<HTMLElement>('.gv-tray')!;
  vi.spyOn(tray, 'getBoundingClientRect').mockReturnValue(TRAY);
  const items = [...stage.querySelectorAll<HTMLButtonElement>('.gv-item')];
  const [launch, reset, levelsBtn] = [...stage.querySelectorAll<HTMLButtonElement>('.gv-actions > button')];
  const canvas = stage.querySelector('canvas')!;
  const count = (i: number) => items[i].querySelector('.gv-count')!.textContent;
  return { stage, canvas, items, launch, reset, levelsBtn, levels, count, complete };
}

function ptr(target: Element, type: string, x: number, y: number, pointerType = 'mouse'): void {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y, pointerType }),
  );
}

/** Drag from a tray item to a world point with the mouse. */
function trayDrop(s: ReturnType<typeof setup>, item: number, wx: number, wy: number): void {
  ptr(s.items[item], 'pointerdown', 40, 450);
  ptr(s.canvas, 'pointermove', wx * K, wy * K);
  ptr(s.canvas, 'pointerup', wx * K, wy * K);
}

/** Level 02, both moons placed at the reference spots, the second one mid-drag. */
function dragSecondMoon() {
  const s = setup(1);
  trayDrop(s, 0, 360, 250);
  trayDrop(s, 0, 600, 420);
  expect(s.count(0)).toBe('0');
  ptr(s.canvas, 'pointerdown', 600 * K, 420 * K);
  ptr(s.canvas, 'pointermove', 650 * K, 500 * K);
  return s;
}

test('Reset during a drag is ignored, and the drop still lands', () => {
  const s = dragSecondMoon();
  s.reset.click();
  ptr(s.canvas, 'pointerup', 650 * K, 500 * K);
  expect(s.count(0)).toBe('0');
  ptr(s.canvas, 'pointerdown', 50 * K, 900 * K); // tap empty sky: deselect, so the slot is Reset
  ptr(s.canvas, 'pointerup', 50 * K, 900 * K);
  expect(s.reset.textContent).toBe('Reset');
  s.reset.click();
  expect(s.count(0)).toBe('2');
  expect(errors).toEqual([]);
});

test('Launch during a drag is ignored', () => {
  const s = dragSecondMoon();
  s.launch.click();
  expect(s.launch.textContent).toBe('Launch');
  ptr(s.canvas, 'pointerup', 650 * K, 500 * K);
  s.launch.click();
  expect(s.launch.textContent).toBe('Stop');
  expect(errors).toEqual([]);
});

test('A tray tap during a drag places nothing', async () => {
  const s = setup(1);
  trayDrop(s, 0, 360, 250);
  await new Promise((r) => setTimeout(r, 0)); // the click after a tray drag is swallowed for one tick
  ptr(s.canvas, 'pointerdown', 360 * K, 250 * K);
  ptr(s.canvas, 'pointermove', 420 * K, 300 * K);
  s.items[0].click();
  ptr(s.canvas, 'pointerup', 420 * K, 300 * K);
  expect(s.count(0)).toBe('1');
  expect(errors).toEqual([]);
});

test('A finger drag from the tray reaches the bottom of the sky', () => {
  // Level 08: brown dwarf, white dwarf, neutron star. The body sits 44 px above
  // the finger, so to drop it low in the sky the finger is below the canvas.
  const s = setup(7);
  const lift = 44 / K;
  const x = 850 * K, y = (930 + lift) * K;
  expect(y).toBeGreaterThan(SIDE);
  expect(y).toBeLessThan(TRAY.top);
  ptr(s.items[2], 'pointerdown', 340, 450, 'touch');
  ptr(s.canvas, 'pointermove', x, y, 'touch');
  ptr(s.canvas, 'pointerup', x, y, 'touch');
  expect(s.count(2)).toBe('0');
  expect(errors).toEqual([]);
});

test('A placed body dropped on the tray goes back to it', () => {
  const s = setup(1);
  trayDrop(s, 0, 360, 250);
  ptr(s.canvas, 'pointerdown', 360 * K, 250 * K);
  ptr(s.canvas, 'pointermove', 100, 450);
  ptr(s.canvas, 'pointerup', 100, 450);
  expect(s.count(0)).toBe('2');
});

test('While flying, the Reset slot cycles the flight speed', () => {
  const s = setup(0);
  trayDrop(s, 0, 480, 410);
  s.launch.click();
  while (s.reset.textContent !== 'Speed 1×') s.reset.click(); // the speed is kept from earlier flights
  const seen = [1, 2, 3, 4].map(() => (s.reset.click(), s.reset.textContent));
  expect(seen).toEqual(['Speed 2×', 'Speed 4×', 'Speed ½×', 'Speed 1×']);
  s.launch.click(); // Stop
  expect(s.reset.textContent).toBe('Remove'); // the moon is still selected
});

test('Classroom mode offers the solution on an empty sky; students never see it', () => {
  const student = setup(1);
  expect(student.reset.textContent).toBe('Reset');
  expect(student.reset.disabled).toBe(true);
  dispose?.();
  document.body.replaceChildren();
  vi.restoreAllMocks();

  const s = setup(1, true);
  const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
  expect(s.reset.textContent).toBe('Solution');
  s.reset.click();
  expect(s.count(0)).toBe('0'); // level 02's solution uses both moons
  expect(s.reset.textContent).toBe('Reset');
  now.mockReturnValue(1300);
  s.reset.click(); // a double tap must not wipe the solution
  expect(s.count(0)).toBe('0');
  now.mockReturnValue(2500);
  s.reset.click();
  expect(s.count(0)).toBe('2');
  expect(s.reset.textContent).toBe('Solution');
});

test('While a placed body is selected the slot is a red Remove, which sends it back to the tray', () => {
  const s = setup(1);
  trayDrop(s, 0, 360, 250);
  expect(s.reset.textContent).toBe('Remove'); // a dropped body is selected
  expect(s.reset.className).toBe('btn-danger');
  expect(s.stage.querySelector('.gv-sky button')).toBeNull(); // nothing inside the playing area
  s.reset.click();
  expect(s.count(0)).toBe('2');
  expect(s.reset.textContent).toBe('Reset');
  expect(s.reset.className).toBe('btn-ghost');
  trayDrop(s, 0, 360, 250);
  trayDrop(s, 0, 600, 420);
  ptr(s.canvas, 'pointerdown', 50 * K, 900 * K); // tap empty sky: deselect
  ptr(s.canvas, 'pointerup', 50 * K, 900 * K);
  expect(s.reset.textContent).toBe('Reset');
  ptr(s.canvas, 'pointerdown', 360 * K, 250 * K); // tap a body: select it
  ptr(s.canvas, 'pointerup', 360 * K, 250 * K);
  expect(s.reset.textContent).toBe('Remove');
  s.reset.click();
  expect(s.count(0)).toBe('1');
});

/** Flies level 01's solution at a playback speed, one 16.7 ms frame at a time (with an occasional long stall). */
function flyLevel01(speed: string, stall: boolean, pausedFrames = 0, pauseAtEnd = false) {
  let next = null as FrameRequestCallback | null;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => ((next = cb), 1));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const s = setup(0);
    trayDrop(s, 0, 480, 410); // the reference spot
    s.launch.click();
    while (s.reset.textContent !== `Speed ${speed}`) s.reset.click();
    let t = 0;
    pausedNow = pausedFrames > 0;
    for (let i = 0; i < pausedFrames; i++) next?.((t += 1000 / 60));
    pausedNow = false;
    if (pausedFrames > 0) expect(s.launch.textContent).toBe('Stop'); // still mid-flight: nothing moved
    for (let i = 0; i < 20000 && !s.launch.disabled; i++) {
      t += stall && i % 40 === 39 ? 500 : 1000 / 60;
      next?.(t);
    }
    if (pauseAtEnd) {
      pausedNow = true;
      vi.advanceTimersByTime(5000);
      expect(s.complete).not.toHaveBeenCalled(); // the level end waits behind the Physics panel
      pausedNow = false;
    }
    vi.advanceTimersByTime(1000); // the short pause before the level end
    return s.complete.mock.calls;
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (document as { hidden?: boolean }).hidden;
    dispose?.();
    dispose = null;
    vi.restoreAllMocks();
    document.body.replaceChildren();
  }
}

test('The flight speed changes only the watching: every speed, with or without stalls, gives the same win', () => {
  // The last run also sits behind the Physics panel for a minute first.
  const runs = [flyLevel01('1×', false), flyLevel01('4×', false), flyLevel01('½×', false), flyLevel01('4×', true), flyLevel01('1×', false, 3600), flyLevel01('1×', false, 0, true)];
  for (const calls of runs) {
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(3);
  }
  expect(new Set(runs.map((c) => JSON.stringify(c)))).toHaveProperty('size', 1);
});

test('Retry with this setup reopens the level with the placements from the last win', () => {
  flyLevel01('1×', false); // wins level 01 with the moon at the reference spot
  const fresh = setup(0);
  expect(fresh.count(0)).toBe('1'); // a normal start is empty
  dispose?.();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  const kept = setup(0, false, true);
  expect(kept.count(0)).toBe('0'); // the moon is back where it was
  expect(kept.reset.textContent).toBe('Reset');
});

test('The Levels button leaves for the level select', () => {
  const s = setup(0);
  expect(s.levelsBtn.textContent).toBe('Levels');
  s.levelsBtn.click();
  expect(s.levels).toHaveBeenCalledTimes(1);
});

test('Space selects each placed body in turn, for keyboard players', () => {
  const s = setup(1);
  trayDrop(s, 0, 360, 250);
  trayDrop(s, 0, 600, 420);
  const status = s.stage.querySelector('[aria-live]')!;
  const space = () => s.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  space();
  expect(status.textContent).toBe('Moon 1 of 2 selected, at 360, 250.');
  space();
  expect(status.textContent).toBe('Moon 2 of 2 selected, at 600, 420.');
  expect(s.reset.textContent).toBe('Remove');
});

test('A message is announced once: the toast itself is hidden from screen readers', () => {
  const s = setup(1);
  trayDrop(s, 0, 360, 250);
  ptr(s.canvas, 'pointerdown', 360 * K, 250 * K);
  ptr(s.canvas, 'pointermove', 5 * K, 5 * K); // a moon can't sit in the corner
  ptr(s.canvas, 'pointerup', 5 * K, 5 * K);
  const toast = s.stage.querySelector('.gv-toast')!;
  expect(toast.textContent).toBe("It doesn't fit there.");
  expect(toast.getAttribute('aria-hidden')).toBe('true');
  expect(s.stage.querySelector('[aria-live]')!.textContent).toBe("It doesn't fit there.");
});
