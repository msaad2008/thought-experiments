import '@fontsource-variable/inter';
import '../../styles/base.css';
import '../../styles/chrome.css';
import '../../styles/game.css';
import { mountGame } from '../../game-ui/mount';
import { applyClassroomUi } from '../../site/classroom-ui';
import { LEVELS } from './levels';
import { INTRO, PHYSICS_HTML, UPGRADES } from './content';
import { startLevel } from './play';

mountGame(
  {
    id: 'uncertainty',
    title: 'Uncertain Fire',
    levels: LEVELS.map((l) => ({ id: l.id, title: l.title })),
    intro: INTRO,
    physicsHtml: PHYSICS_HTML,
    upgrades: UPGRADES,
    startLevel,
  },
  document.getElementById('game') as HTMLElement,
);
applyClassroomUi();
