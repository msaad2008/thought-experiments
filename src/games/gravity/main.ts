import '@fontsource-variable/inter';
import '../../styles/base.css';
import '../../styles/chrome.css';
import '../../styles/game.css';
import { mountGame } from '../../game-ui/mount';
import { applyClassroomUi } from '../../site/classroom-ui';
import { LEVELS } from './levels';
import { INTRO, PHYSICS_HTML, UPGRADES } from './content';

mountGame(
  {
    id: 'gravity',
    title: 'Slingshot',
    levels: LEVELS.map((l) => ({ id: l.id, title: l.title })),
    intro: INTRO,
    physicsHtml: PHYSICS_HTML,
    upgrades: UPGRADES,
    // Placeholder until Task 6 builds the real play stage.
    startLevel(index, ctx) {
      const lv = LEVELS[index];
      ctx.stage.innerHTML = '';
      const h = document.createElement('p');
      h.className = 'placeholder';
      h.textContent = `${lv.title}: ${lv.hint}`;
      ctx.stage.appendChild(h);
      return () => {
        ctx.stage.innerHTML = '';
      };
    },
  },
  document.getElementById('game') as HTMLElement,
);
applyClassroomUi();
