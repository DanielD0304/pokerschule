// Fortschritt als Datei sichern und wiederherstellen; im claude.ai-Artifact ohne Downloads über Text.
import { exportState, importState, exportFileName } from '../core/storage.js';
import { state, replaceState } from './store.js';
import { $ } from './dom.js';

function message(html, kind = '') { $('bk-msg').innerHTML = `<p class="${kind}">${html}</p>`; }

function download() {
  const text = exportState(state), name = exportFileName();
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    message(`Die Datei <b>${name}</b> wird gespeichert. Falls kein Download startet (zum Beispiel in einer eingebetteten Vorschau), nutze „Als Text anzeigen“ und kopiere den Text.`);
  } catch {
    showText(); message('Speichern als Datei ist hier nicht möglich. Kopiere stattdessen den Text unten.');
  }
}
function showText() { $('bk-text').hidden = false; $('bk-area').value = exportState(state); }

/** Fragt auf der Seite nach (confirm() ist in Artifacts gesperrt) und ersetzt dann den Stand. */
function confirmImport(text) {
  let next;
  try { next = importState(text); } catch (e) { message(e.message, 'bad-text'); return; }
  const hands = ['arena', 'duel', 'flop', 'river'].reduce((s, k) => s + (next[k].hands || 0), 0), open = next.review.items.length;
  $('bk-msg').innerHTML = `<p>Die Datei enthält ${hands === 1 ? 'eine gespielte Hand' : hands + ' gespielte Hände'} und ${open === 1 ? 'einen offenen Fehler' : open + ' offene Fehler'}. <b>Dein aktueller Fortschritt in diesem Browser wird dabei ersetzt.</b></p>
    <div class="actions" style="justify-content:flex-start"><button class="btn primary" id="bk-yes">Ersetzen und neu laden</button><button class="btn" id="bk-no">Abbrechen</button></div>`;
  $('bk-yes').onclick = () => { replaceState(next); location.reload(); };
  $('bk-no').onclick = () => { $('bk-msg').innerHTML = ''; };
  $('bk-yes').focus();
}

export function initBackup() {
  $('bk-export').onclick = download;
  $('bk-show').onclick = () => { showText(); $('bk-area').focus(); };
  $('bk-copy').onclick = () => {
    const area = $('bk-area');
    navigator.clipboard?.writeText(area.value).then(() => message('Kopiert.'), () => { area.select(); message('Kopieren war nicht möglich. Der Text ist markiert, kopiere ihn mit Strg+C.'); })
      ?? (area.select(), message('Der Text ist markiert, kopiere ihn mit Strg+C.'));
  };
  $('bk-load').onclick = () => confirmImport($('bk-area').value);
  $('bk-file').onchange = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => confirmImport(String(r.result)); r.readAsText(f); e.target.value = '';
  };
}
