// Gesamt-Dashboard: Ratings, Genauigkeit, größte Lecks, Aktivität.
import { QUAL } from '../core/rating.js';
import { state } from './store.js';
import { SPOTNAME, today } from './progress.js';
import { onTab, showTab } from './tabs.js';
import { setFilter, reviewNew } from './review.js';
import { $, nf, spark } from './dom.js';

const MODES = [['arena', 'Push/Fold-Arena'], ['duel', 'Preflop-Duell'], ['flop', 'Flop'], ['river', 'River']];

export function renderDash() {
  const el = $('dash'); if (!el) return;
  const quiz = state.quiz, dash = state.dash, rvItems = state.review.items;
  const played = MODES.map(([k, name]) => { const s = state[k]; return { k, name, s, dec: s.accN, acc: s.accN ? s.accSum / s.accN : null }; });
  const totDec = played.reduce((a, m) => a + m.dec, 0);
  const quizN = quiz.show.t + quiz.pre.t + quiz.odds.t, quizC = quiz.show.c + quiz.pre.c + quiz.odds.c;
  const accAll = totDec ? played.reduce((a, m) => a + m.s.accSum, 0) / totDec : null;
  const ratedN = played.reduce((a, m) => a + m.s.n, 0);
  const overall = ratedN ? Math.round(played.reduce((a, m) => a + m.s.rating * m.s.n, 0) / ratedN) : null;
  const spots = Object.entries(dash.spots).filter(([k]) => SPOTNAME[k]).map(([k, s]) => ({ k, ...s, avg: s.loss / s.n, rate: s.wrong / s.n }));
  const trackedLoss = spots.reduce((a, s) => a + s.loss, 0), trackedN = spots.reduce((a, s) => a + s.n, 0);
  const weak = spots.filter(s => s.n >= 3).sort((a, b) => b.avg - a.avg).slice(0, 5);
  const strong = spots.filter(s => s.n >= 5 && s.rate <= .3).sort((a, b) => a.avg - b.avg).slice(0, 3);

  let rec;
  if (!totDec && !quizN) rec = 'Du hast noch nichts gespielt. Fang mit den <b>Grundlagen</b> und dem Quiz <b>Wer gewinnt?</b> an. Danach geht es in die Arena.';
  else if (weak.length && weak[0].avg >= .05) { const w = weak[0], n = SPOTNAME[w.k]; rec = `Dein größtes Leck: <b>${n[0]} · ${n[1]}</b>. Dort verlierst du im Schnitt <b>${nf(w.avg)} BB</b> pro Entscheidung und liegst in ${Math.round(w.rate * 100)} % der Fälle daneben. Übe diese Situation gezielt und schau dir nach jeder Hand den Strategie-Chart an.`; }
  else { const nxt = played.find(m => m.dec < 20); rec = nxt ? `Du spielst sauber. Sammle als Nächstes Erfahrung in <b>${nxt.name}</b>: Dort hast du erst ${nxt.dec} Entscheidungen.` : 'Keine auffälligen Lecks. Halte das Niveau und achte auf deine Genauigkeit in knappen Spots.'; }

  const order = ['best', 'sharp', 'eq', 'inacc', 'mist', 'blun'], cls = {};
  order.forEach(q => { cls[q] = 0; }); played.forEach(m => order.forEach(q => { cls[q] += m.s.cls[q] || 0; }));
  const clsN = order.reduce((a, q) => a + cls[q], 0);
  const bar = clsN ? `<div style="display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--surface-2)" role="img" aria-label="${order.map(q => `${QUAL[q][0]} ${cls[q]}`).join(', ')}">${order.map(q => cls[q] ? `<span title="${QUAL[q][0]}: ${cls[q]}" style="width:${cls[q] / clsN * 100}%;background:var(${QUAL[q][1]})"></span>` : '').join('')}</div>
    <div class="legend">${order.map(q => `<span><span class="swatch" style="background:var(${QUAL[q][1]})"></span> ${QUAL[q][0]} ${cls[q]} (${Math.round(cls[q] / clsN * 100)} %)</span>`).join('')}</div>` : '<p class="muted">Noch keine bewerteten Entscheidungen.</p>';

  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = today(d); days.push({ k, lab: d.getDate() + '.', ...(dash.days[k] || { n: 0, ok: 0 }) }); }
  const mx = Math.max(1, ...days.map(d => d.n)), W = 420, H = 120, bw = W / 14;
  const act = `<svg viewBox="0 0 ${W} ${H + 18}" width="100%" style="max-width:${W}px;display:block" role="img" aria-label="Entscheidungen pro Tag, letzte 14 Tage: ${days.filter(d => d.n).map(d => `${d.lab} ${d.n}`).join(', ') || 'keine'}">
    <line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="var(--line)"/>
    ${days.map((d, i) => { const h = d.n / mx * (H - 16), x = i * bw + 4; return `<rect x="${x}" y="${H - h}" width="${bw - 8}" height="${h}" rx="2" fill="var(--accent)" fill-opacity="${d.n ? (.35 + .65 * (d.ok / d.n)).toFixed(2) : 0}"><title>${d.k}: ${d.n} Entscheidungen, ${d.n ? Math.round(d.ok / d.n * 100) : 0} % richtig</title></rect>${d.n ? `<text x="${x + (bw - 8) / 2}" y="${H - h - 4}" text-anchor="middle" font-size="10" fill="var(--muted)">${d.n}</text>` : ''}<text x="${x + (bw - 8) / 2}" y="${H + 13}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${d.lab}</text>`; }).join('')}</svg>`;

  const card = m => m.dec
    ? `<div class="stat"><span class="k">${m.name}</span><span class="v">${Math.round(m.s.rating)}</span><span class="d">${m.acc.toFixed(1).replace('.', ',')} % genau · ${m.dec} Entsch.</span>${spark(m.s.hist)}<button class="reset" style="align-self:flex-start;margin-top:6px" data-go="${m.k}">Weiter üben</button></div>`
    : `<div class="stat"><span class="k">${m.name}</span><span class="v muted">–</span><span class="d">Noch nicht gespielt</span><button class="reset" style="align-self:flex-start;margin-top:6px" data-go="${m.k}">Starten</button></div>`;
  const qv = o => o.t ? `${Math.round(o.c / o.t * 100)} % (${o.c}/${o.t})` : '–';
  const spotRow = s => { const n = SPOTNAME[s.k]; return `<div class="lr" style="grid-template-columns:minmax(0,1fr) auto auto"><span><span class="muted" style="font-size:.78rem">${n[0]}</span><br><b>${n[1]}</b></span><span class="m" style="text-align:right">${nf(s.avg)} BB/Entsch.<br>${Math.round(s.rate * 100)} % falsch · ${s.n}×</span><button class="btn" style="min-width:0;padding:6px 12px" data-go="${n[2]}">Üben</button></div>`; };
  const reviewSpot = weak.length && rvItems.some(i => i.spot === weak[0].k) ? weak[0].k : 'all';

  el.innerHTML = `
    <div class="arena-top">
      <div class="stat"><span class="k">Gesamt-Rating</span><span class="v">${overall ?? '–'}</span><span class="d">Mittel der Modi, gewichtet nach Entscheidungen</span></div>
      <div class="stat"><span class="k">Genauigkeit</span><span class="v">${accAll === null ? '–' : accAll.toFixed(1).replace('.', ',') + ' %'}</span><span class="d">${totDec} bewertete Entscheidungen</span></div>
      <div class="stat"><span class="k">EV-Verlust</span><span class="v">${trackedN ? nf(trackedLoss / trackedN) : '–'}</span><span class="d">BB pro Entscheidung</span></div>
      <div class="stat"><span class="k">Aktive Tage</span><span class="v">${Object.keys(dash.days).length}</span><span class="d">Quiz: ${quizN ? Math.round(quizC / quizN * 100) + ' % richtig' : 'noch nicht gespielt'}</span></div>
    </div>
    <div class="analysis" style="border-color:var(--accent)"><span class="muted" style="font-size:.75rem;letter-spacing:.1em;text-transform:uppercase">Empfehlung</span><p>${rec}</p><div class="actions" style="justify-content:flex-start">${weak.length && weak[0].avg >= .05 ? `<button class="btn primary" data-go="${SPOTNAME[weak[0].k][2]}">Jetzt üben</button>` : ''}${rvItems.length ? `<button class="btn" data-review="${reviewSpot}">Fehler wiederholen (${rvItems.length})</button>` : ''}</div></div>
    <div class="grid2">
      <div class="box" style="display:flex;flex-direction:column;gap:10px"><h3>Größte Lecks</h3>
        ${weak.length ? `<div class="log">${weak.map(spotRow).join('')}</div>` : '<p class="muted">Sobald du eine Situation mindestens dreimal gespielt hast, erscheint sie hier, sortiert nach deinem durchschnittlichen EV-Verlust.</p>'}</div>
      <div class="box" style="display:flex;flex-direction:column;gap:10px"><h3>Am sichersten</h3>
        ${strong.length ? `<div class="log">${strong.map(spotRow).join('')}</div>` : '<p class="muted">Situationen mit mindestens fünf Entscheidungen und höchstens 30 % Fehlern erscheinen hier.</p>'}
        <h3 style="margin-top:6px">Quiz-Stationen</h3>
        <div class="log"><div class="lr" style="grid-template-columns:minmax(0,1fr) auto"><span>Wer gewinnt?</span><span class="m">${qv(quiz.show)}</span></div><div class="lr" style="grid-template-columns:minmax(0,1fr) auto"><span>Preflop 6-max</span><span class="m">${qv(quiz.pre)}</span></div><div class="lr" style="grid-template-columns:minmax(0,1fr) auto"><span>Pot Odds</span><span class="m">${qv(quiz.odds)}</span></div></div>
      </div>
    </div>
    <div class="arena-top">${played.map(card).join('')}</div>
    <div class="grid2">
      <div class="box" style="display:flex;flex-direction:column;gap:10px"><h3>Wie gut sind deine Entscheidungen?</h3>${bar}</div>
      <div class="box" style="display:flex;flex-direction:column;gap:10px;min-width:0"><h3>Aktivität, letzte 14 Tage</h3>${act}<p class="muted" style="font-size:.8rem">Balkenhöhe: Anzahl Entscheidungen. Kräftigere Farbe: höherer Anteil richtiger Entscheidungen.</p></div>
    </div>`;
  el.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => { showTab(b.dataset.go); window.scrollTo({ top: 0 }); }; });
  el.querySelectorAll('[data-review]').forEach(b => { b.onclick = () => { setFilter(b.dataset.review); showTab('review'); reviewNew(); window.scrollTo({ top: 0 }); }; });
}

export function initDashboard() { onTab('dash', renderDash); renderDash(); }
