import '@fontsource-variable/inter';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/home.css';
import { HERO_SVG } from '../art/hero';
import { loadProgress, starsEarned, totalStars } from '../shared/progress';
import { GAMES } from './games';
import { renderTiles } from './tiles';

const $ = (id: string): HTMLElement | null => document.getElementById(id);

const art = $('hero-art');
if (art) art.innerHTML = HERO_SVG;

const tiles = $('tiles');
if (tiles) {
  tiles.innerHTML = renderTiles(GAMES, (id) => starsEarned(loadProgress(id)));
  tiles.querySelectorAll<HTMLElement>(':scope > li').forEach((li, i) => {
    li.classList.add('fade');
    li.style.setProperty('--i', String(i));
  });
}

const n = totalStars();
const total = $('total');
if (total && n > 0) {
  total.innerHTML = `<span aria-hidden="true">★ ${n}</span><span class="sr-only">${n} stars earned</span>`;
  total.hidden = false;
}

// Fade sections up as they scroll into view. Skipped entirely under reduced
// motion (and without IntersectionObserver), so content is never hidden.
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduce && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('fx');
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.08 },
  );
  document.querySelectorAll('.fade').forEach((el) => io.observe(el));
}
