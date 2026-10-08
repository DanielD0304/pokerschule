// Einstieg: alle Tabs initialisieren. Jeder Modus fängt seine eigenen Fehler ab, damit ein Fehler nicht die ganze App lahmlegt.
import { renderHeader } from './store.js';
import { initTabs } from './tabs.js';
import { initQuiz } from './quiz.js';
import { initArena } from './arena.js';
import { initDuel } from './duel.js';
import { initFlop } from './flop.js';
import { initRiver } from './river.js';
import { initReview } from './review.js';
import { initDashboard } from './dashboard.js';
import { initBackup } from './backup.js';
import { initLegal } from './legal.js';

const parts = [initLegal, initQuiz, initArena, initDuel, initFlop, initRiver, initReview, initDashboard, initBackup];
for (const init of parts) {
  try { init(); } catch (e) { console.error(`[Pokerschule] ${init.name} fehlgeschlagen:`, e); }
}
renderHeader();
initTabs();
