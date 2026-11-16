import { isClassroom, withClassroom } from '../shared/progress';

/** In classroom mode: keep the flag on internal links and show a small badge. */
export function applyClassroomUi(): void {
  if (!isClassroom()) return;
  document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (!href.startsWith('//')) a.setAttribute('href', withClassroom(href));
  });
  const bar = document.querySelector('.topbar-in');
  if (!bar) return;
  const badge = document.createElement('span');
  badge.className = 'classroom-badge';
  badge.textContent = 'Classroom mode · nothing is saved';
  bar.appendChild(badge);
}
