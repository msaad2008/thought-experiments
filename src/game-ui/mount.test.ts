// @vitest-environment jsdom
// The shared game screens: intro, level select, level end, classroom mode, and the context a level gets.
import { test, expect, afterEach } from 'vitest';
import { mountGame } from './mount';
import type { GameConfig, LevelContext } from './types';

window.scrollTo = () => {}; // jsdom has no scrolling

afterEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
  document.body.replaceChildren();
});

/** A three-level game whose levels hand their context to the test. */
function mount(search = '') {
  history.replaceState(null, '', `/gravity/${search}`);
  const started: { index: number; ctx: LevelContext }[] = [];
  const cfg: GameConfig = {
    id: 'gravity',
    title: 'Test',
    levels: [{ id: '01', title: 'One' }, { id: '02', title: 'Two' }, { id: '03', title: 'Three' }],
    intro: [{ art: '', text: 'Card one' }, { art: '', text: 'Card two' }],
    physicsHtml: '<p>Physics</p>',
    upgrades: [],
    startLevel(index, ctx) {
      started.push({ index, ctx });
      return () => {};
    },
  };
  const root = document.createElement('div');
  document.body.append(root);
  mountGame(cfg, root);
  const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('main button')];
  const press = (label: string) => buttons().find((b) => b.textContent === label)!.click();
  const last = () => started[started.length - 1];
  return { root, started, buttons, press, last };
}

test('Each game gets its own accent colour', () => {
  const { root } = mount();
  expect(root.style.getPropertyValue('--accent')).toBe('#ff7a3d');
});

test('A first visit runs the intro, then goes straight into level 1', () => {
  const g = mount();
  expect(g.root.querySelector('.intro-text')!.textContent).toBe('Card one');
  g.press('Next');
  g.press('Start');
  expect(g.started.map((s) => s.index)).toEqual([0]);
  expect(JSON.parse(localStorage.getItem('te:gravity')!).introSeen).toBe(true);
});

test('Short of 3 stars, the level end offers Retry with this setup', () => {
  const g = mount();
  g.press('Skip');
  g.last().ctx.complete(2, 'Nice.');
  expect(g.buttons().map((b) => b.textContent)).toEqual(['Next', 'Retry with this setup', 'Start over', 'Levels']);
  g.press('Retry with this setup');
  expect(g.last()).toMatchObject({ index: 0, ctx: { keepSetup: true } });
  g.last().ctx.complete(3, 'Perfect.');
  expect(g.buttons().map((b) => b.textContent)).toEqual(['Next', 'Retry', 'Levels']);
  expect(JSON.parse(localStorage.getItem('te:gravity')!).best).toEqual({ '01': 3 });
});

test('Classroom mode unlocks every level and saves nothing', () => {
  const g = mount('?classroom');
  g.press('Skip'); // the intro leads into level 1
  g.last().ctx.levels();
  const levels = g.root.querySelectorAll<HTMLButtonElement>('.level-btn');
  expect([...levels].every((b) => !b.disabled)).toBe(true);
  levels[2].click();
  expect(g.last().ctx.classroom).toBe(true);
  g.last().ctx.complete(3, 'Done.');
  expect(localStorage.getItem('te:gravity')).toBeNull();
});

test('A level is paused while the Physics panel is open', () => {
  const g = mount();
  g.press('Skip');
  const { ctx } = g.last();
  expect(ctx.paused()).toBe(false);
  g.root.querySelector<HTMLButtonElement>('.bar-physics')!.click();
  expect(ctx.paused()).toBe(true);
  g.root.querySelector<HTMLButtonElement>('.sheet .icon-btn')!.click();
  expect(ctx.paused()).toBe(false);
});

test('The Levels callback returns to the level select', () => {
  const g = mount();
  g.press('Skip');
  g.last().ctx.levels();
  expect(g.root.querySelector('h1')!.textContent).toBe('Choose a level');
});
