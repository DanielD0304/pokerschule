// Fehler-Training nach dem Leitner-System mit drei Boxen.
import { state, persist, onReset } from './store.js';
import { track, onMistake, spotTitle, today } from './progress.js';
import { onTab, showTab } from './tabs.js';
import { $, cardsHTML, SLOT, nf, sg, badge, modelNote } from './dom.js';
import { QUAL } from '../core/rating.js';

const BOXES = 3;
let current = null;
export let filter = 'all';
export const setFilter = f => { filter = f; };
const RV = () => state.review;

function renderHead() {
  const rv = RV(), open = rv.items.length, byBox = [0, 1, 2].map(b => rv.items.filter(i => i.box === b).length);
  $('rq-stats').innerHTML = `<div class="stat"><span class="k">Offen</span><span class="v">${open}</span><span class="d">Box 1: ${byBox[0]} · Box 2: ${byBox[1]} · Box 3: ${byBox[2]}</span></div>
    <div class="stat"><span class="k">Gemeistert</span><span class="v">${rv.mastered}</span><span class="d">dreimal in Folge richtig gelöst</span></div>
    <div class="stat"><span class="k">Heute</span><span class="v">${rv.today && rv.today.d === today() ? rv.today.n : 0}</span><span class="d">Wiederholungen</span></div>`;
  const counts = {}; rv.items.forEach(i => { counts[i.spot] = (counts[i.spot] || 0) + 1; });
  if (filter !== 'all' && !counts[filter]) filter = 'all';
  const sel = $('rq-filter');
  sel.innerHTML = `<option value="all">Alle Situationen (${open})</option>` + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<option value="${k}">${spotTitle(k)} (${n})</option>`).join('');
  sel.value = filter;
}
function pick() {
  const pool = RV().items.filter(i => filter === 'all' || i.spot === filter);
  if (!pool.length) return null;
  pool.sort((a, b) => a.box - b.box || a.last - b.last || a.made - b.made);
  return pool.length > 1 && current && pool[0].id === current.id ? pool[1] : pool[0];
}
export function reviewNew() {
  current = pick(); renderHead();
  const tb = $('rq-table'), ac = $('rq-actions'), pr = $('rq-prompt');
  $('rq-fb').innerHTML = '';
  if (!current) {
    tb.innerHTML = `<span class="label">Keine offenen Fehler</span><p style="max-width:44ch">${RV().mastered ? 'Alles gemeistert. ' : ''}Sobald du in Arena, Duell, Flop oder River eine Ungenauigkeit, einen Fehler oder einen Patzer machst, landet die Situation hier zum Wiederholen.</p>`;
    ac.innerHTML = '<button class="btn primary" data-go="arena">Zur Arena</button><button class="btn" data-go="flop">Zum Flop-Training</button>';
    pr.innerHTML = '';
    ac.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => showTab(b.dataset.go); });
    return;
  }
  const q = current;
  tb.innerHTML = `<span class="label">${spotTitle(q.spot)} · Box ${q.box + 1} von ${BOXES}</span>
    ${q.seq ? `<span style="font-size:.9rem">${q.seq}</span>` : ''}
    ${q.board.length ? `<div class="row">${cardsHTML(q.board)}${q.board.length === 3 ? SLOT + SLOT : ''}</div>` : ''}
    <span class="potline">Pot ${nf(q.pot, 2)} BB</span>
    <div class="seat"><div class="row">${cardsHTML(q.me)}</div><span class="label">Du · ${q.pos}</span>${q.extra ? `<span style="font-size:.9rem">${q.extra}</span>` : ''}</div>`;
  pr.innerHTML = `<b>${q.face}</b> Was ist hier richtig?`;
  ac.innerHTML = q.labels.map((l, k) => `<button class="btn ${/^(Fold|Check)$/.test(l) ? '' : 'primary'}" data-k="${k}">${l}</button>`).join('');
  ac.querySelectorAll('button').forEach(b => { b.onclick = () => answer(+b.dataset.k); });
}
function answer(k) {
  const rv = RV(), q = current, loss = q.ev[q.best] - q.ev[k], ok = loss < .03;
  $('rq-actions').innerHTML = ''; $('rq-prompt').innerHTML = '';
  q.seen++; q.last = Date.now();
  let note;
  if (ok) {
    q.box++;
    if (q.box >= BOXES) { rv.items = rv.items.filter(i => i.id !== q.id); rv.mastered++; note = 'Gemeistert. Die Situation verschwindet aus dem Training.'; }
    else note = `Weiter in Box ${q.box + 1}. Noch ${BOXES - q.box}× richtig, dann ist sie gemeistert.`;
  } else { q.box = 0; note = 'Zurück in Box 1. Die Situation kommt bald wieder.'; }
  const td = today(); if (!rv.today || rv.today.d !== td) rv.today = { d: td, n: 0 }; rv.today.n++;
  persist(); track('review', q.spot, ok ? 'best' : 'mist', 0);
  const rows = q.labels.map((l, x) => `<tr class="${x === q.best ? 'best' : ''} ${x === k ? 'mine' : ''}"><td>${l}${x === k ? ' (deine Wahl)' : ''}${x === q.orig && x !== k ? ' <span class="muted">(beim ersten Mal)</span>' : ''}</td><td class="num">${sg(q.ev[x])} BB</td></tr>`).join('');
  $('rq-fb').innerHTML = `<div class="analysis"><div class="head">${badge(ok ? 'best' : loss < .3 ? 'inacc' : loss < 1 ? 'mist' : 'blun')}<span>${ok ? 'Richtig.' : `Besser wäre <b>${q.labels[q.best]}</b>. EV-Verlust: <b>${nf(loss)} BB</b>.`}</span></div>
    <div style="overflow-x:auto"><table class="evt">${rows}</table></div>
    <p>Das Gleichgewicht spielt deine Hand hier so: <b>${q.mix || '–'}</b>.</p>
    <p class="muted">${note} Beim ersten Mal hattest du <b>${q.labels[q.orig]}</b> gewählt (${QUAL[q.q][0]}).</p>
    ${q.model ? modelNote(q.model) : ''}
    <div><button class="btn primary" id="rq-next">Nächste Situation</button></div></div>`;
  renderHead();
  const nb = $('rq-next'); nb.onclick = reviewNew; nb.focus({ preventScroll: true });
}

export function initReview() {
  $('rq-filter').onchange = e => { filter = e.target.value; reviewNew(); };
  onTab('review', () => { if (!current || $('rq-fb').innerHTML) reviewNew(); });
  onMistake(renderHead);
  onReset(() => { current = null; reviewNew(); });
  reviewNew();
}
