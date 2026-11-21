// The Slingshot play view: placement editing, input, and the flight loop.
import type { LevelContext } from '../../game-ui/types';
import { LEVELS, toSimInput } from './levels';
import { BODY_TYPES, DT, clockRate, createSim, radius, simulate, type Body, type BodyType, type Outcome, type Point, type Sim } from './physics';
import { canPlace, nearestFree, remaining } from './place';
import { bodyColor, drawScene, fitView, type View } from './render';

const TOAST_MS = 2600;
const WIN_DELAY_MS = 800;
const HIT_MIN_PX = 22;
const DRAG_START_PX = 6;
/** A body dragged from the tray by finger sits this far above it, so it stays visible. */
const TOUCH_LIFT_PX = 44;

const MISS: Record<Exclude<Outcome, 'goal' | 'crash'>, string> = {
  captured: 'Swallowed by the black hole.',
  lost: 'Lost in deep space.',
  timeout: 'Stuck in orbit.',
};

interface Drag {
  type: BodyType;
  /** Index in `placed` of the body being moved, or -1 for a new one from the tray. */
  from: number;
  pointerId: number;
  sx: number;
  sy: number;
  moved: boolean;
  /** World offset from the pointer to the body centre. */
  off: Point;
  /** World position over the sky, or null while the pointer is off it. */
  pos: Point | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function startLevel(index: number, ctx: LevelContext): () => void {
  const level = LEVELS[index];
  const aimTime = ctx.upgrades.has('aim2') ? 4 : ctx.upgrades.has('aim') ? 1.5 : 0;
  const finale = level.fixed.some((b) => b.type === 'blackHole');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const types = (Object.keys(level.inventory) as BodyType[]).sort((a, b) => BODY_TYPES[a].tier - BODY_TYPES[b].tier);

  let placed: Body[] = [];
  let selected = -1;
  let drag: Drag | null = null;
  let suppressClick = false;
  let sim: Sim | null = null;
  let simBodies: Body[] = [];
  let steps = 0;
  let acc = 0;
  let trail: Point[] = [];
  let lastPath: Point[] = [];
  let aim: Point[] = [];
  let finished = false;
  let disposed = false;
  let view: View | null = null;
  let raf = 0;
  let lastT: number | null = null;
  let now = 0;
  let toastTimer = 0;
  let winTimer = 0;

  // ----- DOM -----
  const root = el('div', 'gv');
  const sky = el('div', 'gv-sky');
  const canvas = el('canvas', 'gv-canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute(
    'aria-label',
    'Sky. Place bodies from the tray. With a body selected, arrow keys move it, Delete removes it, Enter launches.',
  );
  const clock = el('div', 'gv-clock');
  clock.hidden = true;
  const toast = el('div', 'gv-toast');
  toast.setAttribute('role', 'status');
  sky.append(canvas, clock, toast);

  const panel = el('div', 'gv-panel');
  const hint = el('p', 'gv-hint', level.hint);
  const tray = el('div', 'gv-tray');
  tray.setAttribute('role', 'group');
  tray.setAttribute('aria-label', 'Bodies to place');
  const items = new Map<BodyType, { btn: HTMLButtonElement; count: HTMLSpanElement }>();
  for (const t of types) {
    const btn = el('button', 'gv-item');
    btn.type = 'button';
    const count = el('span', 'gv-count');
    count.style.background = bodyColor(t);
    btn.append(count, el('span', '', BODY_TYPES[t].name));
    btn.addEventListener('pointerdown', (e) => trayDown(e, t));
    btn.addEventListener('click', () => trayClick(t));
    items.set(t, { btn, count });
    tray.append(btn);
  }
  const actions = el('div', 'gv-actions');
  const launchBtn = el('button', 'cta', 'Launch');
  launchBtn.type = 'button';
  launchBtn.addEventListener('click', () => (sim ? stop() : launch()));
  const resetBtn = el('button', 'btn-ghost', 'Reset');
  resetBtn.type = 'button';
  resetBtn.addEventListener('click', () => {
    placed = [];
    selected = -1;
    changed();
    say('All bodies cleared.');
  });
  actions.append(launchBtn, resetBtn);
  const status = el('p', 'sr-only');
  status.setAttribute('aria-live', 'polite');
  panel.append(hint, tray, actions, status);
  root.append(sky, panel);
  ctx.stage.replaceChildren(root);

  // ----- helpers -----
  const say = (text: string) => (status.textContent = text);
  const others = (skip = -1): Body[] => [...level.fixed, ...placed.filter((_, i) => i !== skip)];
  const name = (t: BodyType) => BODY_TYPES[t].name.toLowerCase();

  function showToast(text: string): void {
    toast.textContent = text;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('on'), TOAST_MS);
  }

  /** The placements as they would be if the current drag were dropped here. */
  function previewBodies(): Body[] {
    if (!drag) return placed;
    const b = drag.pos ? { type: drag.type, ...drag.pos } : null;
    if (drag.from < 0) return b ? [...placed, b] : placed;
    return b ? placed.map((p, i) => (i === drag!.from ? b : p)) : placed.filter((_, i) => i !== drag!.from);
  }

  function changed(): void {
    // Simulate's path includes the end point, so the aim line reaches the last step.
    aim = aimTime ? simulate(toSimInput(level, previewBodies()), aimTime).path : [];
    const left = remaining(level, placed);
    for (const [t, { btn, count }] of items) {
      const n = left[t] ?? 0;
      count.textContent = String(n);
      btn.disabled = n === 0 || !!sim || finished;
      btn.setAttribute('aria-label', `${BODY_TYPES[t].name}, ${n} left`);
    }
    launchBtn.textContent = sim ? 'Stop' : 'Launch';
    launchBtn.className = sim ? 'btn-ghost' : 'cta';
    launchBtn.disabled = finished;
    resetBtn.disabled = !!sim || finished || placed.length === 0;
  }

  function resize(): void {
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    view = fitView(r.width, r.height, dpr);
    draw();
  }

  function draw(): void {
    const g = view && canvas.getContext('2d');
    if (!view || !g) return;
    const flying = sim !== null;
    drawScene(g, view, {
      level,
      placed: drag && drag.from >= 0 ? placed.filter((_, i) => i !== drag!.from) : placed,
      selected: drag ? -1 : selected,
      drag: drag?.pos ? { body: { type: drag.type, ...drag.pos }, ok: canPlace({ type: drag.type, ...drag.pos }, others(drag.from), level) } : null,
      ship: sim ? sim.ship : level.ship,
      editing: !flying,
      collected: sim ? sim.collected : new Set(),
      trail: sim ? [...trail, { x: sim.ship.x, y: sim.ship.y }] : [],
      lastPath,
      aim,
      time: now,
      reducedMotion: reduced,
    });
    if (sim && finale) {
      const text = `Ship clock ×${clockRate(sim.ship, simBodies).toFixed(2)}`;
      if (clock.textContent !== text) clock.textContent = text;
    }
  }

  function toWorld(e: PointerEvent): Point | null {
    if (!view) return null;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) return null;
    return { x: (x - view.ox) / view.k, y: (y - view.oy) / view.k };
  }

  // ----- flight -----
  function launch(): void {
    if (sim || finished) return;
    hint.hidden = true;
    const input = toSimInput(level, placed);
    simBodies = input.bodies;
    sim = createSim(input);
    trail = [{ x: level.ship.x, y: level.ship.y }];
    steps = 0;
    acc = 0;
    toast.classList.remove('on');
    clock.hidden = !finale;
    changed();
    say('Launched.');
  }

  /** Back to editing; the flight so far stays drawn faintly. */
  function endFlight(): void {
    if (!sim) return;
    lastPath = [...trail, { x: sim.ship.x, y: sim.ship.y }];
    sim = null;
    clock.hidden = true;
    changed();
  }

  function stop(): void {
    endFlight();
    say('Stopped.');
  }

  function landed(s: Sim, outcome: Outcome): void {
    if (outcome === 'goal') {
      if (finished) return;
      finished = true;
      lastPath = [...trail, { x: s.ship.x, y: s.ship.y }];
      changed();
      const stars = s.collected.size;
      let insight = level.insight;
      if (level.id === '09') insight += ` Your clock fell ${(s.time - s.shipTime).toFixed(1)} s behind a far-away clock.`;
      showToast('Beacon reached!');
      winTimer = window.setTimeout(() => {
        if (!disposed) ctx.complete(stars, insight);
      }, WIN_DELAY_MS);
      return;
    }
    let text: string;
    if (outcome === 'crash') {
      // The body the ship hit: the one whose surface it is deepest inside.
      let hit = simBodies[0];
      let best = Infinity;
      for (const b of simBodies) {
        const d = Math.hypot(s.ship.x - b.x, s.ship.y - b.y) - radius(b.type);
        if (d < best) [best, hit] = [d, b];
      }
      text = `Crashed into the ${name(hit.type)}.`;
    } else text = MISS[outcome];
    endFlight();
    showToast(text);
    say(text);
  }

  function frame(t: number): void {
    raf = requestAnimationFrame(frame);
    const sec = t / 1000;
    const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, sec - lastT));
    lastT = sec;
    now += dt;
    if (sim && !sim.outcome) {
      acc += dt;
      while (acc >= DT && !sim.outcome) {
        sim.step();
        acc -= DT;
        if (++steps % 4 === 0) trail.push({ x: sim.ship.x, y: sim.ship.y });
      }
      if (sim.outcome) landed(sim, sim.outcome);
    }
    draw();
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

  // ----- editing input -----
  function place(t: BodyType): void {
    const p = nearestFree(t, others(), level);
    if (!p) {
      showToast('No room left for it.');
      return;
    }
    placed.push({ type: t, ...p });
    selected = placed.length - 1;
    changed();
    say(`${BODY_TYPES[t].name} placed and selected.`);
  }

  function trayClick(t: BodyType): void {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (sim || finished || (remaining(level, placed)[t] ?? 0) === 0) return;
    place(t);
    canvas.focus({ preventScroll: true });
  }

  function trayDown(e: PointerEvent, t: BodyType): void {
    if (sim || finished || drag || !e.isPrimary || e.button !== 0) return;
    if ((remaining(level, placed)[t] ?? 0) === 0) return;
    const lift = e.pointerType === 'touch' && view ? TOUCH_LIFT_PX / view.k : 0;
    drag = { type: t, from: -1, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, off: { x: 0, y: -lift }, pos: null };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function skyDown(e: PointerEvent): void {
    if (sim || finished || drag || !e.isPrimary || e.button !== 0 || !view) return;
    e.preventDefault(); // no text selection or focus change from the press itself
    canvas.focus({ preventScroll: true });
    const w = toWorld(e);
    if (!w) return;
    let hit = -1;
    let best = Infinity;
    placed.forEach((b, i) => {
      const d = Math.hypot(b.x - w.x, b.y - w.y);
      if (d * view!.k <= Math.max(radius(b.type) * view!.k, HIT_MIN_PX) && d < best) [best, hit] = [d, i];
    });
    selected = hit;
    if (hit >= 0) {
      const b = placed[hit];
      drag = { type: b.type, from: hit, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, off: { x: b.x - w.x, y: b.y - w.y }, pos: { x: b.x, y: b.y } };
      canvas.setPointerCapture(e.pointerId);
    }
  }

  /** Follows the pointer once it has moved past the drag threshold. */
  function track(d: Drag, e: PointerEvent): void {
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_START_PX) return;
    d.moved = true;
    const w = toWorld(e);
    d.pos = w ? { x: w.x + d.off.x, y: w.y + d.off.y } : null;
  }

  function pointerMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return;
    track(drag, e);
    if (drag.moved) changed();
  }

  function pointerUp(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    track(d, e); // the drop point is where the pointer is released
    drag = null;
    if (!d.moved) {
      changed();
      return; // a tap: a tray tap places via the click handler
    }
    if (d.from < 0) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
    }
    const r = tray.getBoundingClientRect();
    const onTray = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const b = d.pos ? { type: d.type, ...d.pos } : null;
    if (onTray && d.from >= 0) {
      placed.splice(d.from, 1);
      selected = -1;
      say(`${BODY_TYPES[d.type].name} returned to the tray.`);
    } else if (b && canPlace(b, others(d.from), level)) {
      if (d.from >= 0) placed[d.from] = b;
      else placed.push(b);
      selected = d.from >= 0 ? d.from : placed.length - 1;
      say(`${BODY_TYPES[d.type].name} placed.`);
    } else if (!onTray) {
      showToast("It doesn't fit there.");
    }
    changed();
  }

  function pointerCancel(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    changed();
  }

  function keyDown(e: KeyboardEvent): void {
    if (finished) return;
    if (sim) {
      if (e.key === 'Escape') {
        stop();
        e.preventDefault();
      }
      return;
    }
    if (drag) return;
    const onButton = (e.target as HTMLElement).tagName === 'BUTTON';
    if (e.key === 'Enter' && !onButton) {
      e.preventDefault();
      launch();
      return;
    }
    if (selected < 0) return;
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = dirs[e.key];
    if (dir) {
      e.preventDefault();
      const step = e.shiftKey ? 50 : 10;
      const b = placed[selected];
      const next = { type: b.type, x: b.x + dir[0] * step, y: b.y + dir[1] * step };
      if (canPlace(next, others(selected), level)) {
        placed[selected] = next;
        changed();
        say(`${BODY_TYPES[b.type].name} at ${Math.round(next.x)}, ${Math.round(next.y)}.`);
      } else say("Can't move there.");
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const t = placed[selected].type;
      placed.splice(selected, 1);
      selected = placed.length - 1;
      changed();
      say(`${BODY_TYPES[t].name} removed.`);
    }
  }

  canvas.addEventListener('pointerdown', skyDown);
  root.addEventListener('pointermove', pointerMove);
  root.addEventListener('pointerup', pointerUp);
  root.addEventListener('pointercancel', pointerCancel);
  root.addEventListener('keydown', keyDown);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', resize);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  ro?.observe(sky);

  changed();
  resize();
  if (!document.hidden) raf = requestAnimationFrame(frame);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    clearTimeout(toastTimer);
    clearTimeout(winTimer);
    ro?.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', resize);
    ctx.stage.replaceChildren();
  };
}
