import {
  buyUpgrade,
  isClassroom,
  loadProgress,
  recordLevel,
  saveProgress,
  starsAvailable,
  starsEarned,
  withClassroom,
  type GameProgress,
} from '../shared/progress';
import { trackLevelComplete } from '../shared/analytics';
import { canBuy, isUnlocked, ownedUpgrades } from './rules';
import type { GameConfig } from './types';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, label, { type: 'button' });
  b.addEventListener('click', onClick);
  return b;
}

export function mountGame(cfg: GameConfig, root: HTMLElement): void {
  const classroom = isClassroom();
  // Classroom mode saves nothing, but this visit still remembers what you earned.
  let progress: GameProgress = loadProgress(cfg.id);
  let cleanup: (() => void) | null = null;
  let label = '';

  root.innerHTML = '';
  root.classList.add('game');

  // ----- game bar -----
  const bar = el('header', 'gamebar');
  const barIn = el('div', 'topbar-in gamebar-in wrap');
  const back = el('a', 'bar-back', '←', { href: withClassroom('/'), 'aria-label': 'Back to all games' });
  const title = el('span', 'bar-title');
  const stars = el('span', 'bar-stars');
  const physicsBtn = button('ⓘ Physics', 'bar-physics', () => openPhysics());
  barIn.append(back, title, stars, physicsBtn);
  bar.append(barIn);

  const main = el('main', 'view-host wrap', undefined, { id: 'view', tabindex: '-1' });

  // ----- physics panel -----
  const dlg = el('dialog', 'sheet', undefined, { 'aria-labelledby': 'physics-title' });
  const sheetHead = el('div', 'sheet-head');
  sheetHead.append(el('h2', '', 'Physics', { id: 'physics-title' }));
  const closeBtn = button('✕', 'icon-btn', () => closePhysics());
  closeBtn.setAttribute('aria-label', 'Close physics panel');
  sheetHead.append(closeBtn);
  const sheetBody = el('div', 'sheet-body');
  sheetBody.innerHTML = cfg.physicsHtml;
  dlg.append(sheetHead, sheetBody);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closePhysics(); // click on the backdrop
  });
  dlg.addEventListener('close', () => physicsBtn.focus());

  function openPhysics(): void {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  function closePhysics(): void {
    if (typeof dlg.close === 'function') dlg.close();
    else {
      dlg.removeAttribute('open');
      physicsBtn.focus();
    }
  }

  root.append(bar, main, dlg);

  // ----- helpers -----
  function refreshBar(): void {
    // On narrow screens the CSS hides the game name, so the level number always shows.
    if (label) title.replaceChildren(el('span', 'bar-game', `${cfg.title} · `), label);
    else title.textContent = cfg.title;
    stars.textContent = `★ ${starsEarned(progress)}`;
    stars.setAttribute('aria-label', `${starsEarned(progress)} stars earned`);
  }

  function show(view: HTMLElement, lbl = ''): void {
    cleanup?.();
    cleanup = null;
    label = lbl;
    refreshBar();
    main.replaceChildren(view);
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function persistIntroSeen(): void {
    if (classroom || progress.introSeen) return;
    progress.introSeen = true;
    saveProgress(cfg.id, progress);
  }

  // ----- views -----
  /** `fromSelect`: replayed from "How it works", so it returns there. */
  function showIntro(fromSelect = false): void {
    const view = el('section', 'view intro');
    let i = 0;
    const art = el('div', 'intro-art');
    const text = el('p', 'intro-text', '', { 'aria-live': 'polite' });
    const dots = el('div', 'dots', undefined, { 'aria-hidden': 'true' });
    cfg.intro.forEach(() => dots.append(el('span', 'dot')));
    const actions = el('div', 'actions');
    const next = button('Next', 'cta', () => {
      if (i < cfg.intro.length - 1) {
        i++;
        render();
      } else finish();
    });
    const skip = button('Skip', 'btn-ghost', () => finish());
    actions.append(next, skip);
    view.append(art, text, dots, actions);

    function render(): void {
      art.innerHTML = cfg.intro[i].art;
      text.textContent = cfg.intro[i].text;
      [...dots.children].forEach((d, n) => d.classList.toggle('on', n === i));
      next.textContent = i === cfg.intro.length - 1 ? 'Start' : 'Next';
      art.classList.remove('slide');
      void art.offsetWidth; // restart the slide-in animation
      art.classList.add('slide');
    }
    function finish(): void {
      persistIntroSeen();
      // Spec §3: on a first visit the intro leads straight into level 1.
      if (!fromSelect && Object.keys(progress.best).length === 0) play(0);
      else showSelect();
    }
    render();
    show(view);
  }

  function showSelect(): void {
    const view = el('section', 'view select');
    view.append(el('h1', '', 'Choose a level'));
    const grid = el('ul', 'level-grid');
    const ids = cfg.levels.map((l) => l.id);
    cfg.levels.forEach((l, i) => {
      const open = isUnlocked(i, ids, progress, classroom);
      const best = progress.best[l.id] ?? 0;
      const li = el('li');
      const b = el('button', 'level-btn', undefined, { type: 'button' });
      b.disabled = !open;
      b.append(el('span', 'level-num', String(i + 1)), el('span', 'level-name', l.title));
      b.append(
        open
          ? el('span', 'level-stars', '★'.repeat(Math.min(3, best)) + '☆'.repeat(Math.max(0, 3 - best)))
          : el('span', 'level-lock', '🔒'),
      );
      b.setAttribute(
        'aria-label',
        open ? `Level ${i + 1}, ${l.title}, ${best} of 3 stars` : `Level ${i + 1}, ${l.title}, locked`,
      );
      if (open) b.addEventListener('click', () => play(i));
      li.append(b);
      grid.append(li);
    });
    const row = el('div', 'actions');
    row.append(
      button('Upgrades', 'btn-ghost', () => showShop()),
      button('How it works', 'btn-ghost', () => showIntro(true)),
    );
    view.append(grid, row);
    show(view);
  }

  function showShop(): void {
    const view = el('section', 'view shop');
    view.append(el('h1', '', 'Upgrades'));
    const owned = ownedUpgrades(cfg.upgrades, progress, classroom);
    view.append(
      el(
        'p',
        'shop-stars',
        classroom ? 'Classroom mode: every upgrade is unlocked.' : `You have ${starsAvailable(progress)} stars to spend.`,
      ),
    );
    const list = el('ul', 'upgrade-list');
    for (const u of cfg.upgrades) {
      const li = el('li', 'upgrade');
      const info = el('div', 'upgrade-info');
      info.append(el('strong', '', u.name), el('span', '', u.desc));
      li.append(info);
      if (owned.has(u.id)) {
        li.append(el('span', 'owned', 'Owned'));
      } else {
        const b = button(`Buy · ${u.cost} ★`, 'cta small', () => {
          const p = buyUpgrade(cfg.id, u.id, u.cost);
          if (p) progress = p;
          showShop();
        });
        b.disabled = !canBuy(u, progress, classroom);
        li.append(b);
        if (u.requires && !owned.has(u.requires)) {
          const need = cfg.upgrades.find((x) => x.id === u.requires)?.name ?? u.requires;
          info.append(el('span', 'needs', `Needs ${need}`));
        }
      }
      list.append(li);
    }
    view.append(list, button('Back to levels', 'btn-ghost', () => showSelect()));
    show(view);
  }

  function play(index: number): void {
    const view = el('section', 'view play');
    const stage = el('div', 'stage');
    view.append(stage);
    show(view, `Level ${index + 1}`);
    const lv = cfg.levels[index];
    cleanup = cfg.startLevel(index, {
      stage,
      upgrades: ownedUpgrades(cfg.upgrades, progress, classroom),
      levels: () => showSelect(),
      complete(starCount, insight) {
        if (classroom) {
          progress.best[lv.id] = Math.max(progress.best[lv.id] ?? 0, starCount);
        } else {
          progress = recordLevel(cfg.id, lv.id, starCount);
        }
        trackLevelComplete(cfg.id, lv.id, starCount);
        showEnd(index, starCount, insight);
      },
    });
  }

  function showEnd(index: number, starCount: number, insight: string): void {
    const view = el('section', 'view end');
    const n = Math.max(0, Math.min(3, Math.round(starCount)));
    view.append(
      el('h1', '', `Level ${index + 1} complete`),
      el('p', 'end-stars', '★'.repeat(n) + '☆'.repeat(3 - n), { 'aria-label': `${n} of 3 stars` }),
      el('p', 'insight', insight),
    );
    const actions = el('div', 'actions');
    const hasNext = index < cfg.levels.length - 1;
    if (hasNext) actions.append(button('Next', 'cta', () => play(index + 1)));
    actions.append(
      button('Retry', 'btn-ghost', () => play(index)),
      button('Levels', hasNext ? 'btn-ghost' : 'cta', () => showSelect()),
    );
    view.append(actions);
    show(view, `Level ${index + 1}`);
  }

  if (classroom || !progress.introSeen) showIntro();
  else showSelect();
}
