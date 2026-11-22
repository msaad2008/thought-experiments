// The Antidote Run play view: brief → flight → (ripening) → delivered → (trip home) → done, or Too late.
// Every step is the exact physics for the ship time that passed, so frame rate, playback speed and
// pauses never change a result: they only change how fast it is watched.
import { fitSky } from '../../game-ui/fit';
import { afterUnpaused } from '../../game-ui/play-helpers';
import type { LevelContext } from '../../game-ui/types';
import { LEVELS, bestLever, course as courseFor, deliveryFor, ripenTime, shipYearsPerSecond, starsFor } from './levels';
import {
  AT_REST, G_LY, RETURN_SECONDS, RIPEN_MAX_SECONDS, START_BETA, advance, deliveryYear, docked, etaStop, etaToLever, leverToEta,
  seenColonyYear, type Ship,
} from './physics';
import { drawScene, fitView, liveCurve, predictorCurve, predictorSvg, type Curve, type Phase, type View } from './render';

const TOAST_MS = 2600;
/** After launch the Arrival predictor is re-flown from the ship's state at most this often (real ms). */
const PREDICT_MS = 250;
/** How long the delivery (or the arrival home) shows before the level end. */
export const END_MS = 1200;
/** Playback speeds, in the order the Speed button cycles; 1× is the start. */
const SPEEDS = [0.5, 1, 2, 4] as const;
const speedLabel = (v: number) => `${v === 0.5 ? '½' : v}×`;
/** "0.84 c"; three decimals near light speed, so 0.999 never reads as 1.00. */
const fmtC = (beta: number) => `${beta.toFixed(beta >= 0.995 ? 3 : 2)} c`;
/** A message's sending year: "1", "2.5". */
const fmtYear = (y: number) => String(Math.round(y * 10) / 10);

/** Each level's launch lever from its last delivered run, for "Retry with this setup". This visit only; never saved. */
const launchLever = new Map<string, number>();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function startLevel(index: number, ctx: LevelContext): () => void {
  const level = LEVELS[index];
  const ups = ctx.upgrades;
  const course = courseFor(level, ups);
  const D = course.distance;
  const yearsPerSec = shipYearsPerSecond(level);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const startValue = Math.round(etaToLever(Math.atanh(START_BETA), level.leverMax) * 1000);

  /** The lever, 0..1000. */
  let value = (ctx.keepSetup ? launchLever.get(level.id) : undefined) ?? startValue;
  let launchValue = value;
  let phase: Phase = 'brief';
  /** The outbound leg; at the colony it stays docked while the culture ripens. */
  let ship: Ship = AT_REST;
  /** The trip home, counting from the colony (round trips only). */
  let home: Ship | null = null;
  /** The ripening time, in ship years: a message can change it. */
  let R = ripenTime(level, ups);
  let ripeRate = 0;
  let homeRate = 0;
  /** Real seconds of the trip home played so far (at playback speed). */
  let homeElapsed = 0;
  let deliveredYear = 0;
  const received = new Set<number>();
  let pinnedNews: string | null = null;
  let newsYear = 0;
  let brakingSaid = false;
  let speedIx = 1;
  let disposed = false;
  let view: View | null = null;
  let raf = 0;
  let lastT: number | null = null;
  let now = 0;
  let toastTimer = 0;
  let cancelWait = () => {};
  /** What the predictor was last drawn for; and when (frame ms) its live curve was last flown. */
  let predictorKey = '';
  let predictedAt = 0;
  let frameMs = 0;
  let fittedPanelH = -1;

  // ----- DOM -----
  const root = el('div', 'gv');
  const sky = el('div', 'gv-sky');
  const canvas = el('canvas', 'gv-canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'View ahead and route map');
  const toast = el('div', 'gv-toast');
  toast.setAttribute('aria-hidden', 'true'); // screen readers hear it once, through the status line
  sky.append(canvas, toast);

  const panel = el('div', 'gv-panel ar-panel');
  const hint = el('p', 'gv-hint', level.hint);
  const brief = el('div', 'ar-brief');
  const tripLine = el('p', 'ar-trip');
  // The marks: short on screen (one line even at 320 px), a full sentence for screen readers.
  const [two, three] = level.marks;
  const marks = el('p', 'ar-marks');
  const marksShort = el('span', '');
  marksShort.setAttribute('aria-hidden', 'true');
  marksShort.append(
    el('span', 'ar-mark ar-mark-deadline', `Deadline ${level.deadline.toFixed(1)}`), ' · ',
    el('span', 'ar-mark ar-mark-2', `★★ ${two.toFixed(1)}`), ' · ',
    el('span', 'ar-mark ar-mark-3', `★★★ ${three.toFixed(1)}`),
  );
  marks.append(marksShort, el('span', 'sr-only',
    `Deadline year ${level.deadline.toFixed(1)}. Two stars by ${two.toFixed(1)}. Three stars by ${three.toFixed(1)}.`));

  // The Arrival predictor (an upgrade): the marks line becomes its legend, in the lines' colours.
  const predictor = ups.has('predictor') ? el('div', 'ar-predictor') : null;
  const graph = el('div', 'ar-pred-graph');
  const caption = el('span', 'ar-pred-caption');
  if (predictor) {
    const axis = el('p', 'ar-pred-axis');
    axis.setAttribute('aria-hidden', 'true'); // the graph's label says the year
    axis.append(el('span', '', 'slower'), caption, el('span', '', 'faster'));
    predictor.append(marks, graph, axis);
    brief.append(tripLine);
  } else brief.append(tripLine, marks);

  const clocks = el('div', 'ar-clocks');
  const clock = (cls: string, label: string, caption?: string) => {
    const box = el('div', `ar-clock ${cls}`);
    const val = el('span', 'ar-clock-value');
    box.append(el('span', 'ar-clock-label', label), val);
    if (caption) box.append(el('span', 'ar-clock-caption', caption));
    clocks.append(box);
    return val;
  };
  const shipClock = clock('ar-ship-clock', 'Ship');
  const earthClock = clock('ar-earth-clock', 'Earth & colony', 'the clock you are passing');

  const speedRow = el('div', 'ar-speed');
  const speedText = el('span', 'ar-speed-text');
  const cultureBox = el('div', 'ar-culture-box');
  const bar = el('span', 'ar-bar');
  bar.setAttribute('aria-hidden', 'true');
  const fill = el('span', 'ar-bar-fill');
  bar.append(fill);
  const culture = el('span', 'ar-culture');
  cultureBox.append(culture, bar);
  speedRow.append(speedText, cultureBox);

  const news = el('p', 'ar-news');

  const leverRow = el('label', 'ar-lever');
  const leverHead = el('span', 'ar-lever-head');
  const leverVal = el('span', 'ar-lever-value');
  leverHead.append(el('span', '', 'Cruise speed'), leverVal);
  const lever = el('input', 'ar-slider');
  lever.type = 'range';
  lever.min = '0';
  lever.max = '1000';
  lever.step = '1';
  lever.setAttribute('aria-label', 'Cruise speed');
  lever.addEventListener('input', () => {
    if (phase === 'done' || phase === 'late') return;
    value = Number(lever.value);
    if (phase === 'return') homeRate = returnRate();
    changed();
  });
  leverRow.append(leverHead, lever);

  const actions = el('div', 'gv-actions');
  const primary = el('button', 'cta', 'Launch');
  const middle = el('button', 'btn-ghost', 'Solution');
  const levelsBtn = el('button', 'btn-ghost', 'Levels');
  for (const b of [primary, middle, levelsBtn]) b.type = 'button';
  primary.addEventListener('click', () => (phase === 'late' ? tryAgain() : launch()));
  middle.addEventListener('click', () => {
    if (phase === 'brief' && ctx.classroom) solution();
    else if (moving()) {
      speedIx = (speedIx + 1) % SPEEDS.length;
      changed();
      say(`Playback speed ${speedLabel(SPEEDS[speedIx])}.`);
    }
  });
  levelsBtn.addEventListener('click', () => ctx.levels());
  actions.append(primary, middle, levelsBtn);
  const status = el('p', 'sr-only');
  status.setAttribute('aria-live', 'polite');
  panel.append(hint, brief, clocks, speedRow, news, leverRow, ...(predictor ? [predictor] : []), actions, status);
  root.append(sky, panel);
  ctx.stage.replaceChildren(root);

  // ----- helpers -----
  const say = (text: string) => (status.textContent = text);
  const leverEta = () => leverToEta(value / 1000, level.leverMax);
  const moving = () => phase === 'flight' || phase === 'ripening' || phase === 'return';
  /** The ship as it is now: on the way home once the trip home has begun. */
  const current = () => home ?? ship;
  const earthYear = () => ship.t + (home?.t ?? 0);
  const shipYears = () => ship.tau + (home?.tau ?? 0);

  /** `stay`: the toast stays until the next change of phase (Too late: the panel has no room for it). */
  function showToast(text: string, stay = false): void {
    say(text);
    toast.textContent = text;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    if (!stay) toastTimer = window.setTimeout(() => toast.classList.remove('on'), TOAST_MS);
  }

  /** The numbers that move every frame. */
  function readouts(): void {
    shipClock.textContent = `${shipYears().toFixed(2)} yr`;
    earthClock.textContent = `year ${earthYear().toFixed(2)}`;
    const eta = current().eta;
    speedText.textContent = `${fmtC(Math.tanh(eta))} · γ ${Math.cosh(eta).toFixed(2)}`;
    const pct = Math.floor(Math.min(1, ship.tau / R) * 100);
    culture.textContent = `Culture ${pct}% of ${R.toFixed(1)} yr`;
    fill.style.width = `${pct}%`;
    news.textContent = pinnedNews ?? (newsYear ? `Colony, sent year ${newsYear}: holding on.` : '');
  }

  function changed(): void {
    // Phones: the brief shows the trip and the lever; once launched, the trip line and the hint
    // make way for the clocks, speed and news (all zero before launch), so the panel fits under the sky.
    const briefing = phase === 'brief';
    panel.classList.toggle('ar-live', !briefing);
    hint.hidden = tripLine.hidden = !briefing;
    brief.hidden = !briefing && !!predictor; // with the predictor the marks live in it: nothing is left here
    clocks.hidden = speedRow.hidden = news.hidden = briefing;
    const live = phase !== 'done' && phase !== 'late';
    lever.value = String(value);
    lever.disabled = !live;
    const eta = leverEta();
    lever.setAttribute('aria-valuetext', `${fmtC(Math.tanh(eta))}, gamma ${Math.cosh(eta).toFixed(2)}`);
    leverVal.textContent = `${fmtC(Math.tanh(eta))} · γ ${Math.cosh(eta).toFixed(2)}`;
    predict();
    const g = Math.round((course.accel / G_LY) * 100) / 100;
    tripLine.textContent =
      `${level.star} · ${D.toFixed(1)} light-years · crew limit ${g} g · culture needs ${R.toFixed(1)} yr of ship time`;

    primary.textContent = phase === 'late' ? 'Try again' : 'Launch';
    primary.disabled = phase !== 'brief' && phase !== 'late';
    const offerSolution = phase === 'brief' && ctx.classroom;
    middle.textContent = offerSolution ? 'Solution' : `Speed ${speedLabel(SPEEDS[speedIx])}`;
    if (offerSolution) middle.removeAttribute('aria-label');
    else middle.setAttribute('aria-label', `Playback speed ${speedLabel(SPEEDS[speedIx])}. Press to change.`);
    middle.disabled = !offerSolution && !moving();
    levelsBtn.disabled = phase === 'done' || phase === 'return'; // delivered: the level end is on its way
    readouts();
    // The panel grows or shrinks (the hint hiding, news wrapping): re-fit the sky to it, but never
    // while the ship is moving across it.
    if (phase !== 'flight' && phase !== 'return' && panel.getBoundingClientRect().height !== fittedPanelH) fit();
    if (reduced) draw(); // with reduced motion an idle sky is not redrawn every frame
  }

  /**
   * The Arrival predictor. Before launch: every setting flown from rest (cached). After launch: every
   * setting held from the ship as it is now, with the ripening time as it is now; re-flown when the lever
   * or the ripening time changes, and otherwise at most every PREDICT_MS (`force`, from the frame loop).
   * Hidden on the way home: the delivery is done. Frozen at the end of the run.
   */
  function predict(force = false): void {
    if (!predictor) return;
    predictor.hidden = home !== null;
    if (home || phase === 'done' || phase === 'late') return;
    const briefing = phase === 'brief';
    const key = `${briefing}|${value}|${R}`;
    if (!force && key === predictorKey) return;
    predictorKey = key;
    const s = value / 1000;
    let curve: Curve, here: number;
    if (briefing) {
      curve = predictorCurve(level, ups);
      here = deliveryFor(level, ups, s);
    } else {
      curve = liveCurve(level, course, ship, R);
      here = deliveryYear(advance(ship, course, leverEta(), Infinity), R);
      predictedAt = frameMs;
    }
    graph.innerHTML = predictorSvg(level, curve, s, here);
    caption.textContent = `Delivers about year ${here.toFixed(2)}`;
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
    view = fitView(r.width, r.height, dpr);
    draw();
  }

  function draw(): void {
    const g = view && canvas.getContext('2d');
    if (!view || !g) return;
    drawScene(g, view, {
      level,
      ship: current(),
      course,
      heading: home ? -1 : 1,
      colonyYearSeen: seenColonyYear(ship, D),
      time: now,
      reducedMotion: reduced,
      phase,
    });
  }

  // ----- the run -----
  function solution(): void {
    if (phase !== 'brief' || !ctx.classroom) return;
    value = Math.round(bestLever(level, ups) * 1000); // level 05: the ripening time known at launch
    changed();
    showToast('Best speed chosen.');
  }

  function launch(): void {
    if (phase !== 'brief') return;
    launchValue = value;
    phase = 'flight';
    toast.classList.remove('on');
    changed();
    fit(); // the panel changed shape: re-fit once now, never mid-flight
    lever.focus({ preventScroll: true }); // the lever is the control in flight (Launch is now disabled)
    say('Launched.');
  }

  function reset(): void {
    ship = AT_REST;
    home = null;
    R = ripenTime(level, ups);
    received.clear();
    pinnedNews = null;
    newsYear = 0;
    brakingSaid = false;
  }

  function tryAgain(): void {
    if (phase !== 'late') return;
    reset();
    value = launchValue;
    speedIx = 1;
    phase = 'brief';
    toast.classList.remove('on');
    changed();
  }

  /** Colony news whose light has reached the ship: yearly lines (visual only) and the level's messages. */
  function hearNews(): void {
    const seen = seenColonyYear(ship, D);
    level.messages.forEach((m, i) => {
      if (received.has(i) || seen < m.at) return;
      received.add(i);
      if (m.ripen !== undefined) {
        R = ripenTime(level, ups, m.ripen);
        if (phase === 'ripening') ripeRate = ripeningRate();
      }
      pinnedNews = `Colony, sent year ${fmtYear(m.at)}: ${m.text}`;
      say(pinnedNews);
      changed(); // the brief's ripening time changed too
    });
    newsYear = Math.max(newsYear, Math.floor(seen));
  }

  /** True (and the run is over) once the Earth clock is past the deadline. */
  function tooLate(): boolean {
    if (earthYear() <= level.deadline) return false;
    phase = 'late';
    changed();
    showToast(`Too late: by the colony's clocks, the deadline was year ${level.deadline.toFixed(1)}.`, true);
    primary.focus({ preventScroll: true }); // Try again
    return true;
  }

  const ripeningRate = () => Math.max(yearsPerSec, (R - ship.tau) / RIPEN_MAX_SECONDS);

  /**
   * Ship years per real second on the way home: the rest of the trip home (at the current lever) over
   * the rest of its RETURN_SECONDS, so it plays in about that long however the lever moves.
   */
  function returnRate(): number {
    const from = home ?? AT_REST;
    const left = advance(from, course, leverEta(), Infinity).tau - from.tau;
    return left / Math.max(RETURN_SECONDS - homeElapsed, 0.5);
  }

  function arrive(): void {
    if (ship.tau >= R) return deliver();
    phase = 'ripening';
    ripeRate = ripeningRate();
    changed();
    showToast(`Arrived. The culture needs ${(R - ship.tau).toFixed(1)} more years.`);
  }

  function finish(stars: number, insight: string): void {
    cancelWait = afterUnpaused(END_MS, ctx.paused, () => {
      if (!disposed) ctx.complete(stars, insight);
    });
  }

  function deliver(): void {
    deliveredYear = ship.t;
    const stars = starsFor(level, deliveredYear);
    if (stars >= 1) launchLever.set(level.id, launchValue);
    // Two decimals wherever the delivery year is shown: 13.74 must not read as "13.7" next to "★★★ 13.7".
    const text = `Delivered in year ${deliveredYear.toFixed(2)}.`;
    if (level.roundTrip) {
      phase = 'return';
      home = AT_REST;
      homeElapsed = 0;
      homeRate = returnRate();
      changed();
      showToast(text);
      return;
    }
    phase = 'done';
    changed();
    showToast(text);
    finish(stars, `${level.insight} Colony clocks: ${deliveredYear.toFixed(2)} years. Yours: ${ship.tau.toFixed(1)}.`);
  }

  function arriveHome(): void {
    phase = 'done';
    const A = earthYear(), B = shipYears();
    changed();
    showToast(`Home in year ${A.toFixed(2)}.`);
    finish(starsFor(level, deliveredYear), `${level.insight} Your twin on Earth aged ${A.toFixed(1)} years. You aged ${B.toFixed(1)}.`);
  }

  /** `dt` real seconds of play (already scaled by the playback speed). */
  function tick(dt: number): void {
    if (phase === 'flight') {
      const before = ship;
      ship = advance(ship, course, leverEta(), dt * yearsPerSec);
      hearNews();
      if (tooLate()) return;
      const isDocked = docked(ship, course);
      // Braking for the colony: slowing down while the braking curve is what limits the speed.
      if (!brakingSaid && !isDocked && ship.eta < before.eta && ship.eta >= etaStop(course, ship.x) - 1e-6) {
        brakingSaid = true;
        say('Braking for the colony.');
      }
      if (isDocked) arrive();
    } else if (phase === 'ripening') {
      const d = Math.max(0, Math.min(dt * ripeRate, R - ship.tau));
      ship = { ...ship, t: ship.t + d, tau: ship.tau + d };
      hearNews();
      if (tooLate()) return; // crossing the deadline while waiting: late wins
      if (ship.tau >= R) deliver();
    } else if (phase === 'return' && home) {
      home = advance(home, course, leverEta(), dt * homeRate);
      homeElapsed += dt;
      if (docked(home, course)) arriveHome();
    }
  }

  function frame(ms: number): void {
    raf = requestAnimationFrame(frame);
    frameMs = ms;
    const sec = ms / 1000;
    const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, sec - lastT));
    lastT = sec;
    const wasMoving = moving();
    if (!ctx.paused() && !document.hidden && dt > 0) {
      now += dt;
      if (wasMoving) tick(dt * SPEEDS[speedIx]);
      if ((phase === 'flight' || phase === 'ripening') && ms - predictedAt >= PREDICT_MS) predict(true);
    }
    if (moving()) readouts();
    if (wasMoving || !reduced) draw(); // the clocks move; an idle reduced-motion sky waits for a change
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

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onWindowResize);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  ro?.observe(sky);

  changed();
  fit();
  resize();
  // Web fonts can land after the first fit and make the panel taller: fit again (never mid-flight).
  document.fonts?.ready.then(() => {
    if (!disposed && phase !== 'flight' && phase !== 'return') onWindowResize();
  });
  if (!document.hidden) raf = requestAnimationFrame(frame);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    clearTimeout(toastTimer);
    cancelWait();
    ro?.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onWindowResize);
    ctx.stage.replaceChildren();
  };
}
