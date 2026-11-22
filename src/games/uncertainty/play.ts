// The Uncertain Fire play view. One shot = set → aim → flight → result; five shots a level.
// The shell's landing is decided the moment Fire is pressed; the flight only shows it.
import { fitSky } from '../../game-ui/fit';
import type { LevelContext } from '../../game-ui/types';
import { LEVELS, bestSetting, massKg } from './levels';
import {
  PASS_HITS, PRESETS, SHOTS, dxToSlider, flightTime, predictedCentre, sampleFound, sliderToDx, spread, velocitySpread,
  type Point,
} from './physics';
import { drawScene, fitView, spreadGraphSvg, type Scene, type View } from './render';

const TOAST_MS = 2600;
/** How long a shot's result shows before the next shot (or the level end). */
export const RESULT_MS = 1400;
/** Arrow keys move the reticle this fraction of the sky (Shift: the larger step). */
const KEY_STEP = 0.02, KEY_STEP_BIG = 0.1;
const DIRS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const MODES = [['position', 'Position mode'], ['momentum', 'Momentum mode']] as const;

/** Each level's Δx from its last completed attempt, for "Retry with this setup". This visit only; never saved. */
const lastDx = new Map<string, number>();
/** Radio names must be unique on the page. */
let mounts = 0;

type Phase = Scene['phase'];
type Mark = Scene['shotMarks'][number];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function startLevel(index: number, ctx: LevelContext, rng: () => number = Math.random): () => void {
  const level = LEVELS[index];
  const W = level.width;
  const m = massKg(level);
  const t = flightTime(level.flightTime, ctx.upgrades);
  const graph = ctx.upgrades.has('graph');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  /** The setting: null on levels 1–3 until a mode is picked. */
  let dx: number | null = (ctx.keepSetup ? lastDx.get(level.id) : undefined) ?? (level.presetsOnly ? null : sliderToDx(0.5));
  let phase: Phase = 'set';
  let shot = 0;
  let aim: Point | null = null;
  /** This attempt's landed shots; the last one is on show during 'result'. */
  let shots: Mark[] = [];
  /** Decided at Fire, shown when the flight ends. */
  let pending: Mark | null = null;
  let progress = 0;
  let solved = false; // classroom Solution chosen: Measure pre-aims at the predicted centre
  let finished = false;
  let disposed = false;
  let view: View | null = null;
  let pointer: number | null = null;
  let raf = 0;
  let lastT: number | null = null;
  let now = 0;
  let resultAt = 0;
  let toastTimer = 0;
  let resultTimer = 0;
  let shownGraphDx: number | null = null;
  /** The panel height the sky was last fitted to. */
  let fittedPanelH = -1;

  // ----- DOM -----
  const root = el('div', 'gv');
  const sky = el('div', 'gv-sky');
  const canvas = el('canvas', 'gv-canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Battle area. Tap or use the arrow keys to aim, Enter to fire.');
  const toast = el('div', 'gv-toast');
  toast.setAttribute('aria-hidden', 'true'); // screen readers hear it once, through the status line
  sky.append(canvas, toast);

  const panel = el('div', 'gv-panel');
  const hint = el('p', 'gv-hint', level.hint);
  const radios: HTMLInputElement[] = [];
  let slider: HTMLInputElement | null = null;
  let setting: HTMLElement;
  if (level.presetsOnly) {
    setting = el('div', 'uc-modes');
    setting.setAttribute('role', 'radiogroup');
    setting.setAttribute('aria-label', 'Measurement mode');
    const name = `uc-mode-${++mounts}`;
    for (const [key, text] of MODES) {
      const label = el('label', 'uc-mode');
      const r = el('input', '');
      r.type = 'radio';
      r.name = name;
      r.value = key;
      r.addEventListener('change', () => r.checked && choose(PRESETS[key]));
      label.append(r, text);
      radios.push(r);
      setting.append(label);
    }
  } else {
    setting = el('div', 'uc-dial');
    const s = el('input', 'uc-slider');
    s.type = 'range';
    s.min = '0';
    s.max = '1000';
    s.step = '1';
    s.setAttribute('aria-label', 'Measurement setting');
    s.addEventListener('input', () => choose(sliderToDx(Number(s.value) / 1000)));
    setting.append(el('span', 'uc-end', 'Position'), s, el('span', 'uc-end', 'Momentum'));
    slider = s;
  }
  const readout = el('p', 'uc-readout');
  const graphBox = graph ? el('div', 'uc-graph') : null;
  const dots = el('div', 'uc-shots');
  dots.setAttribute('role', 'img');
  const dotEls = Array.from({ length: SHOTS }, () => el('span', 'uc-dot'));
  dots.append(...dotEls);
  const actions = el('div', 'gv-actions');
  const primary = el('button', 'cta', 'Measure');
  const middle = el('button', 'btn-ghost', 'Change setting');
  const levelsBtn = el('button', 'btn-ghost', 'Levels');
  for (const b of [primary, middle, levelsBtn]) b.type = 'button';
  primary.addEventListener('click', () => {
    if (phase === 'set') measure();
    else if (phase === 'aim') fire();
    else if (phase === 'result') nextShot();
    else if (phase === 'over') tryAgain();
  });
  middle.addEventListener('click', () => {
    if (phase === 'set' && ctx.classroom) solution();
    else if (phase === 'aim') changeSetting();
  });
  levelsBtn.addEventListener('click', () => ctx.levels());
  actions.append(primary, middle, levelsBtn);
  const status = el('p', 'sr-only');
  status.setAttribute('aria-live', 'polite');
  const graphRow = el('div', 'uc-row'); // the graph and the shot dots share a line, to save height on phones
  graphRow.append(...(graphBox ? [graphBox] : []), dots);
  panel.append(hint, setting, readout, graphRow, actions, status);
  root.append(sky, panel);
  ctx.stage.replaceChildren(root);

  // ----- helpers -----
  const say = (text: string) => (status.textContent = text);
  const reading = () => level.shots[Math.min(shot, SHOTS - 1)];
  const clampPt = (p: Point): Point => ({ x: Math.min(W, Math.max(0, p.x)), y: Math.min(W, Math.max(0, p.y)) });

  function showToast(text: string): void {
    say(text);
    toast.textContent = text;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('on'), TOAST_MS);
  }

  function readoutText(): string {
    const flight = `shell flight ${t.toFixed(1)} s`;
    if (dx === null) return `Pick a mode · ${flight}`;
    const text = `Δx = ${Math.round(dx)} m · Δv = ${velocitySpread(dx, m).toFixed(1)} m/s · ${flight}`;
    // Only the Spread graph tells the blur at impact; otherwise the puzzle is "make the number smallest".
    return graph ? `${text} · blur at impact ≈ ${Math.round(spread(dx, m, t))} m` : text;
  }

  function changed(): void {
    const editable = phase === 'set';
    for (const r of radios) {
      r.checked = dx === PRESETS[r.value as keyof typeof PRESETS];
      r.disabled = !editable;
    }
    if (slider) {
      if (dx !== null) slider.value = String(Math.round(dxToSlider(dx) * 1000));
      if (dx !== null) slider.setAttribute('aria-valuetext', `Δx ${Math.round(dx)} m`);
      slider.disabled = !editable;
    }
    readout.textContent = readoutText();
    if (graphBox && dx !== null && dx !== shownGraphDx) {
      graphBox.innerHTML = spreadGraphSvg(m, t, dx);
      shownGraphDx = dx;
    }
    const hits = shots.filter((s) => s.hit).length;
    dotEls.forEach((d, i) => (d.className = i < shots.length ? `uc-dot ${shots[i].hit ? 'hit' : 'miss'}` : 'uc-dot'));
    dots.setAttribute('aria-label', `Shots: ${hits} hit, ${shots.length - hits} missed, ${SHOTS - shots.length} left.`);

    primary.textContent = { set: 'Measure', aim: 'Fire', flight: 'Fire', result: 'Next shot', over: 'Try again' }[phase];
    primary.disabled =
      (phase === 'set' && dx === null) || (phase === 'aim' && !aim) || phase === 'flight' || (phase === 'result' && finished);
    const offerSolution = phase === 'set' && ctx.classroom;
    middle.textContent = offerSolution ? 'Solution' : 'Change setting';
    middle.disabled = !offerSolution && phase !== 'aim';
    levelsBtn.disabled = finished; // the level end is on its way
    // The panel grows or shrinks (readout lines, the hint hiding): re-fit the sky to it, but never
    // while aiming or in flight, so the sky does not jump under the reticle.
    if (phase !== 'aim' && phase !== 'flight' && panel.getBoundingClientRect().height !== fittedPanelH) fit();
    if (reduced) draw(); // with reduced motion an idle sky is not redrawn every frame
  }

  /** Phones: the sky and the panel fit the viewport height without scrolling. */
  function fit(): void {
    fitSky(root, sky);
    fittedPanelH = panel.getBoundingClientRect().height;
  }

  function onWindowResize(): void {
    fit();
    resize();
  }

  function resize(): void {
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    view = fitView(r.width, r.height, dpr, W);
    draw();
  }

  function draw(): void {
    const g = view && canvas.getContext('2d');
    if (!view || !g) return;
    const showing = phase === 'result' ? shots.at(-1) : undefined;
    drawScene(g, view, {
      level,
      time: phase === 'result' ? now - resultAt : now,
      reducedMotion: reduced,
      phase,
      reading: reading(),
      dx: dx ?? PRESETS.position,
      t,
      progress,
      aim,
      found: showing?.at ?? null,
      hit: showing?.hit ?? false,
      shotMarks: showing ? shots.slice(0, -1) : shots,
    });
  }

  // ----- the shot -----
  function choose(v: number): void {
    if (phase !== 'set') return;
    dx = v;
    solved = false;
    changed();
  }

  function solution(): void {
    if (phase !== 'set' || !ctx.classroom) return;
    dx = bestSetting(level, t);
    solved = true;
    changed();
    showToast('Best setting chosen.');
  }

  function measure(): void {
    if (phase !== 'set' || dx === null) return;
    phase = 'aim';
    aim = solved ? clampPt(predictedCentre(reading(), t)) : null;
    changed();
    say(`Measured. Aim where the ship will be in ${t.toFixed(1)} seconds.`);
    canvas.focus({ preventScroll: true });
  }

  function changeSetting(): void {
    if (phase !== 'aim') return;
    phase = 'set';
    aim = null;
    pointer = null;
    changed();
  }

  function fire(): void {
    if (phase !== 'aim' || !aim || dx === null) return;
    const at = sampleFound(predictedCentre(reading(), t), spread(dx, m, t), rng);
    pending = { at, hit: Math.hypot(at.x - aim.x, at.y - aim.y) <= level.hitRadius };
    phase = 'flight';
    progress = 0;
    pointer = null;
    hint.hidden = true;
    toast.classList.remove('on');
    changed();
    say('Fired.');
    if (reduced) land(); // the flight is not animated
  }

  function land(): void {
    if (phase !== 'flight' || !pending || !aim) return;
    const mark = pending;
    pending = null;
    shots.push(mark);
    progress = 1;
    phase = 'result';
    resultAt = now;
    const text = mark.hit ? 'Hit!' : `Missed by ${Math.round(Math.hypot(mark.at.x - aim.x, mark.at.y - aim.y))} m.`;
    const hits = shots.filter((s) => s.hit).length;
    if (shots.length < SHOTS) {
      changed();
      showToast(text);
      resultTimer = window.setTimeout(nextShot, RESULT_MS);
    } else if (hits >= PASS_HITS) {
      finished = true;
      lastDx.set(level.id, dx!);
      changed();
      showToast(text);
      resultTimer = window.setTimeout(() => {
        if (!disposed) ctx.complete(hits - (PASS_HITS - 1), level.insight);
      }, RESULT_MS);
    } else {
      phase = 'over';
      const over = `${hits} of ${SHOTS} hits. You need ${PASS_HITS}.`;
      hint.textContent = over;
      hint.hidden = false;
      changed();
      showToast(text);
      say(`${text} ${over}`); // the last shot's result and the verdict, announced together
    }
  }

  function nextShot(): void {
    if (phase !== 'result' || finished || disposed) return;
    clearTimeout(resultTimer);
    shot++;
    phase = 'set';
    aim = null;
    changed();
  }

  function tryAgain(): void {
    if (phase !== 'over') return;
    shots = [];
    shot = 0;
    phase = 'set';
    aim = null;
    hint.textContent = level.hint;
    toast.classList.remove('on');
    changed();
  }

  function frame(ms: number): void {
    raf = requestAnimationFrame(frame);
    const sec = ms / 1000;
    const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, sec - lastT));
    lastT = sec;
    if (!ctx.paused() && !document.hidden) {
      now += dt;
      if (phase === 'flight') {
        progress = Math.min(1, progress + dt / t);
        if (progress >= 1) land();
      }
    }
    if (!reduced) draw();
  }

  function onVisibility(): void {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf && !disposed) {
      lastT = null; // no catch-up for the time spent hidden
      raf = requestAnimationFrame(frame);
    }
  }

  // ----- aiming input -----
  function toWorld(e: PointerEvent): Point | null {
    if (!view) return null;
    const r = canvas.getBoundingClientRect();
    return clampPt({ x: (e.clientX - r.left - view.ox) / view.k, y: (e.clientY - r.top - view.oy) / view.k });
  }

  function pointerDown(e: PointerEvent): void {
    if (phase !== 'aim' || !e.isPrimary || e.button !== 0) return;
    const p = toWorld(e);
    if (!p) return;
    e.preventDefault(); // no text selection or focus change from the press itself
    canvas.focus({ preventScroll: true });
    pointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    aim = p;
    changed();
  }

  function pointerMove(e: PointerEvent): void {
    if (phase !== 'aim' || e.pointerId !== pointer) return;
    const p = toWorld(e);
    if (p) {
      aim = p;
      changed();
    }
  }

  function pointerEnd(e: PointerEvent): void {
    if (e.pointerId === pointer) pointer = null;
  }

  function keyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      if (phase === 'set') measure();
      else if (phase === 'aim') fire();
      else return;
      e.preventDefault();
      return;
    }
    if (phase !== 'aim') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      changeSetting();
      return;
    }
    const dir = DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    const r = reading();
    // The first press starts at the cloud, never at the answer.
    const step = (e.shiftKey ? KEY_STEP_BIG : KEY_STEP) * W;
    aim = clampPt(aim ? { x: aim.x + dir[0] * step, y: aim.y + dir[1] * step } : { x: r.x, y: r.y });
    changed();
  }

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('keydown', keyDown);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onWindowResize);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  ro?.observe(sky);

  changed();
  fit();
  resize();
  if (!document.hidden) raf = requestAnimationFrame(frame);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    clearTimeout(toastTimer);
    clearTimeout(resultTimer);
    ro?.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onWindowResize);
    ctx.stage.replaceChildren();
  };
}
