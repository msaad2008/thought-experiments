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
const errors: unknown[] = [];
const onError = (e: ErrorEvent) => errors.push(e.error);

afterEach(() => {
  dispose?.();
  dispose = null;
  window.removeEventListener('error', onError);
  errors.length = 0;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function setup(index: number, classroom = false) {
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
  dispose = startLevel(index, { stage, upgrades: new Set(), classroom, complete, levels });
  const tray = stage.querySelector<HTMLElement>('.gv-tray')!;
  vi.spyOn(tray, 'getBoundingClientRect').mockReturnValue(TRAY);
  const items = [...stage.querySelectorAll<HTMLButtonElement>('.gv-item')];
  const [launch, reset, levelsBtn] = [...stage.querySelectorAll<HTMLButtonElement>('.gv-actions > button')];
  const canvas = stage.querySelector('canvas')!;
  const count = (i: number) => items[i].querySelector('.gv-count')!.textContent;
  const remove = stage.querySelector<HTMLButtonElement>('.gv-remove')!;
  return { stage, canvas, items, launch, reset, levelsBtn, levels, count, remove };
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
  expect(s.reset.textContent).toBe('Speed 1×');
  const seen = [1, 2, 3, 4].map(() => (s.reset.click(), s.reset.textContent));
  expect(seen).toEqual(['Speed 2×', 'Speed 4×', 'Speed ½×', 'Speed 1×']);
  s.launch.click(); // Stop
  expect(s.reset.textContent).toBe('Reset');
});

test('Classroom mode offers the solution on an empty sky; students never see it', () => {
  const student = setup(1);
  expect(student.reset.textContent).toBe('Reset');
  expect(student.reset.disabled).toBe(true);
  dispose?.();
  document.body.replaceChildren();
  vi.restoreAllMocks();

  const s = setup(1, true);
  expect(s.reset.textContent).toBe('Solution');
  s.reset.click();
  expect(s.count(0)).toBe('0'); // level 02's solution uses both moons
  expect(s.reset.textContent).toBe('Reset');
  s.reset.click();
  expect(s.count(0)).toBe('2');
  expect(s.reset.textContent).toBe('Solution');
});

test('Selecting a placed body shows ✕ Remove, which sends it back to the tray', () => {
  const s = setup(1);
  trayDrop(s, 0, 360, 250);
  expect(s.remove.hidden).toBe(false); // a dropped body is selected
  s.remove.click();
  expect(s.count(0)).toBe('2');
  expect(s.remove.hidden).toBe(true);
  trayDrop(s, 0, 360, 250);
  ptr(s.canvas, 'pointerdown', 50 * K, 900 * K); // tap empty sky: deselect
  ptr(s.canvas, 'pointerup', 50 * K, 900 * K);
  expect(s.remove.hidden).toBe(true);
});

test('The Levels button leaves for the level select', () => {
  const s = setup(0);
  expect(s.levelsBtn.textContent).toBe('Levels');
  s.levelsBtn.click();
  expect(s.levels).toHaveBeenCalledTimes(1);
});
