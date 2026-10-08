// Tabs als Lernstationen; Tastatursteuerung nach dem ARIA-Tabs-Muster.
import { state, persist } from './store.js';

const listeners = {};
export const onTab = (id, fn) => (listeners[id] ||= []).push(fn);
const buttons = () => [...document.querySelectorAll('#tabs [role="tab"]')];

export function showTab(id) {
  if (!document.getElementById('p-' + id)) return;
  buttons().forEach(b => { const on = b.dataset.tab === id; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  document.querySelectorAll('section.panel').forEach(p => { p.hidden = p.id !== 'p-' + id; });
  if (id !== 'legal') { state.ui.tab = id; persist(); }
  (listeners[id] || []).forEach(fn => fn());
}

export function initTabs() {
  const bs = buttons();
  bs.forEach((b, i) => {
    b.id ||= 'tab-' + b.dataset.tab;
    b.setAttribute('aria-controls', 'p-' + b.dataset.tab);
    document.getElementById('p-' + b.dataset.tab)?.setAttribute('role', 'tabpanel');
    b.onclick = () => showTab(b.dataset.tab);
    b.onkeydown = e => {
      const k = e.key, n = bs.length;
      const j = k === 'ArrowRight' ? (i + 1) % n : k === 'ArrowLeft' ? (i - 1 + n) % n : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
      if (j < 0) return;
      e.preventDefault(); showTab(bs[j].dataset.tab); bs[j].focus();
    };
  });
  showTab(state.ui.tab && document.getElementById('p-' + state.ui.tab) ? state.ui.tab : 'basics');
}
