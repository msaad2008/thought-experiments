import '@fontsource-variable/inter';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/pages.css';
import { isClassroom, resetAll } from '../shared/progress';
import { applyClassroomUi } from './classroom-ui';

const btn = document.getElementById('reset');
const status = document.getElementById('reset-status');
btn?.addEventListener('click', () => {
  if (isClassroom()) {
    if (status) status.textContent = 'Classroom mode: nothing is saved.';
    return;
  }
  if (!window.confirm('Reset all your saved progress on this device?')) return;
  resetAll();
  if (status) status.textContent = 'Progress reset.';
});

applyClassroomUi();
