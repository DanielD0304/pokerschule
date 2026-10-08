// Altershinweis, Rechtliches und Zurücksetzen mit Bestätigung auf der Seite.
import { state, persist, resetAll } from './store.js';
import { showTab } from './tabs.js';
import { $ } from './dom.js';

export function initLegal() {
  const bar = $('agebar');
  bar.hidden = !!state.ui.ageOk;
  $('age-ok').onclick = () => { state.ui.ageOk = true; persist(); bar.hidden = true; };

  let back = 'basics';
  document.querySelectorAll('[data-legal]').forEach(b => {
    b.onclick = () => {
      back = state.ui.tab || 'basics';
      showTab('legal');
      document.getElementById(b.dataset.legal)?.scrollIntoView({ block: 'start' });
    };
  });
  $('legal-back').onclick = () => { showTab(back); window.scrollTo({ top: 0 }); };

  const confirmBox = $('reset-confirm');
  $('reset').onclick = () => { confirmBox.hidden = false; $('reset-no').focus(); };
  $('reset-no').onclick = () => { confirmBox.hidden = true; };
  $('reset-yes').onclick = () => { confirmBox.hidden = true; resetAll(); };
}
