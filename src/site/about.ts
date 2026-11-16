import '@fontsource-variable/inter';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/pages.css';
import { resetAll } from '../shared/progress';

const btn = document.getElementById('reset');
const status = document.getElementById('reset-status');
btn?.addEventListener('click', () => {
  if (!window.confirm('Reset all your saved progress on this device?')) return;
  resetAll();
  if (status) status.textContent = 'Progress reset.';
});
