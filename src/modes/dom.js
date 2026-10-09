// Darstellungshelfer, gemeinsam für alle Tabs.
import { RONE, SUITS, SYM, SUIT_NAME, rc, idLabel } from '../core/cards.js';
import { QUAL } from '../core/rating.js';

export const $ = id => document.getElementById(id);
export const nf = (x, d = 2) => Math.abs(x).toFixed(d).replace('.', ',');
export const sg = (x, d = 2) => (x > 0.004 ? '+' : x < -0.004 ? '−' : '±') + nf(x, d);
export const pc1 = x => (x * 100).toFixed(1).replace('.', ',') + ' %';
/** BB mit höchstens einer Nachkommastelle, ganze Zahlen ohne. */
export const b1 = x => nf(Math.round(x * 10) / 10, Math.abs(x % 1) < .05 ? 0 : 1);
export const n2 = x => nf(x, x % 1 ? 2 : 0);

export function cardHTML(c, cls = '', delay = null) {
  const su = SUITS[c.s], red = su === 'h' || su === 'd';
  const st = delay === null ? '' : ` style="animation-delay:${delay}s"`;
  return `<div class="card ${red ? 'red' : ''} ${cls}"${st} role="img" aria-label="${RONE[c.r]} ${SUIT_NAME[su]}"><span>${rc(c.r) === 'T' ? '10' : rc(c.r)}</span><span class="s">${SYM[su]}</span></div>`;
}
export const cardsHTML = (cs, cls) => cs.map(c => cardHTML(c, cls)).join('');
export const BACKS = '<div class="card back" role="img" aria-label="verdeckte Karte"></div>'.repeat(2);
export const SLOT = '<div class="card slot" aria-hidden="true"></div>';
export const boardHTML = (board, shown) => board.map((c, k) => k < shown ? cardHTML(c, '', k * .12) : SLOT).join('');
export const strCards = cs => cs.map(c => (rc(c.r) === 'T' ? '10' : rc(c.r)) + SYM[SUITS[c.s]]).join('');

export const badge = q => `<span class="badge" style="--c:var(${QUAL[q][1]})">${QUAL[q][0]}</span>`;
export const modelNote = text => `<p class="model"><span class="chip">Modell</span> ${text}</p>`;

export function spark(h) {
  const v = h.slice(-60); if (v.length < 2) return '';
  const W = 170, H = 36, mn = Math.min(...v) - 5, mx = Math.max(...v) + 5;
  const pts = v.map((y, i) => [i / (v.length - 1) * (W - 6) + 3, H - 3 - (y - mn) / (mx - mn) * (H - 6)]);
  const l = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' '), e = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><polygon points="3,${H} ${l} ${e[0].toFixed(1)},${H}" fill="var(--accent)" fill-opacity=".12"/><polyline points="${l}" fill="none" stroke="var(--accent)" stroke-width="1.6"/><circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="2.6" fill="var(--accent)"/></svg>`;
}
const accTxt = ms => ms.accN ? (ms.accSum / ms.accN).toFixed(1).replace('.', ',') + ' %' : '–';
const clsTxt = ms => ['best', 'sharp', 'inacc', 'mist', 'blun'].map(k => `${QUAL[k][0]} ${ms.cls[k] || 0}`).join(' · ');
const deltaTxt = (d, n, unit) => d === null ? `${n} bewertete Entscheidungen` : (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + ' ' + unit;
const updown = x => x > 0 ? 'up' : x < 0 ? 'down' : '';
export function ratingCard(ms, last, unit = 'letzte Hand') {
  return `<div class="stat"><span class="k">Rating</span><span class="v">${Math.round(ms.rating)}</span><span class="d ${updown(last)}">${deltaTxt(last, ms.n, unit)}</span>${spark(ms.hist)}</div>
    <div class="stat"><span class="k">Genauigkeit</span><span class="v">${accTxt(ms)}</span><span class="d">${clsTxt(ms)}</span></div>`;
}
export function evCards(ms, label, note) {
  return `<div class="stat"><span class="k">${label}</span><span class="v ${updown(ms.ev)}">${sg(ms.ev, 1)}</span><span class="d">${note}</span></div>
    <div class="stat"><span class="k">Gewinnrate</span><span class="v">${ms.hands ? sg(ms.ev / ms.hands * 100, 0) : '–'}</span><span class="d">BB pro 100 Hände</span></div>`;
}
export function logHTML(log) {
  return log.length ? log.map(l => `<div class="lr"><span class="m">${l.pos}${l.S ? ' ' + l.S : ''}</span><b>${l.lab}</b><span class="hide-sm muted">${l.seq ?? l.act ?? ''}</span><span>${l.q ? badge(l.q) : '<span class="muted">' + (l.note || '–') + '</span>'}</span></div>`).join('')
    : '<p class="muted">Noch keine Hände gespielt.</p>';
}
export function pushLog(ms, entry) { ms.log.unshift(entry); ms.log = ms.log.slice(0, 12); }
export const WORST = ['blun', 'mist', 'inacc', 'eq', 'sharp', 'best'];
export const worstOf = qs => qs.slice().sort((a, b) => WORST.indexOf(a) - WORST.indexOf(b))[0] || null;

/** Gewichtete Zufallsauswahl eines Index aus list mit Gewichten w, nur Einträge mit ok(x). */
export function pickW(list, w, ok) {
  let tot = 0; for (let i = 0; i < list.length; i++) if (ok(list[i])) tot += w[i];
  let r = Math.random() * tot;
  for (let i = 0; i < list.length; i++) { if (!ok(list[i])) continue; r -= w[i]; if (r <= 0) return i; }
  return list.length - 1;
}
export function sampleIndex(weights) {
  let r = Math.random() * weights.reduce((x, y) => x + y, 0), k = 0;
  while (k < weights.length - 1 && r >= weights[k]) { r -= weights[k]; k++; }
  return k;
}

/** Strategie-Matrix 13×13: mix(id) → Anteile je Aktion oder null (nicht in der Range). Farbe plus Text im Tooltip. */
export function mixMatrix(mix, acts, names, colors, hl) {
  let o = '';
  for (let i = 12; i >= 0; i--) for (let j = 12; j >= 0; j--) {
    const id = i * 13 + j, m = mix(id), lab = idLabel(id), cls = id === hl ? 'hl' : '';
    if (!m) { o += `<div class="${cls}" style="opacity:.35" title="${lab}: nicht in der Range">${lab}</div>`; continue; }
    let x = 0;
    const seg = acts.map((a, k) => { const from = x; x += m[k] * 100; return `color-mix(in srgb,${colors[a]} 75%,var(--surface)) ${from.toFixed(1)}% ${x.toFixed(1)}%`; }).join(',');
    const tip = acts.map((a, k) => m[k] >= .005 ? `${names[a]} ${Math.round(m[k] * 100)} %` : '').filter(Boolean).join(', ');
    o += `<div class="${cls}" style="background:linear-gradient(to right,${seg});color:var(--fg)" title="${lab}: ${tip}">${lab}</div>`;
  }
  const legend = acts.map(a => `<span><span class="swatch" style="background:color-mix(in srgb,${colors[a]} 75%,var(--surface))"></span> ${names[a]}</span>`).join('');
  return `<div class="matrix-wrap"><div class="matrix" role="img" aria-label="Strategie-Tabelle, Details je Hand im Tooltip">${o}</div></div><div class="legend">${legend}<span>Fahre über eine Hand für die genauen Anteile.</span></div>`;
}

/** Analyse einer Entscheidung: Einstufung, EV-Tabelle, Gleichgewicht, Chart. */
export function decisionBlock({ index, face, r, labels, ev, chosen, mixText, extra = '', chart = '', chartTitle = 'Strategie-Chart für diese Situation' }) {
  const verdict = r.q === 'eq' ? 'Die besten Optionen sind praktisch gleich gut.' : r.correct ? `${labels[chosen]} war richtig.` : `Besser wäre <b>${labels[r.bi]}</b> gewesen. EV-Verlust: <b>${nf(r.loss)} BB</b>.`;
  const rows = labels.map((l, k) => `<tr class="${k === r.bi && r.q !== 'eq' ? 'best' : ''} ${k === chosen ? 'mine' : ''}"><td>${l}${k === chosen ? ' (deine Wahl)' : ''}</td><td class="num">${sg(ev[k])} BB</td></tr>`).join('');
  return `<div class="decision" style="display:flex;flex-direction:column;gap:10px;${index ? 'border-top:1px solid var(--line);padding-top:12px' : ''}">
    ${face ? `<span class="muted" style="font-size:.75rem;letter-spacing:.1em;text-transform:uppercase">Entscheidung ${index + 1}: ${face}</span>` : ''}
    <div class="head">${badge(r.q)}<span>${verdict}</span>${r.q !== 'eq' ? `<span class="muted math">Rating ${r.delta >= 0 ? '+' : '−'}${Math.abs(r.delta)}</span>` : ''}</div>
    <div style="overflow-x:auto"><table class="evt">${rows}</table></div>
    ${mixText ? `<p>Das Gleichgewicht spielt deine Hand hier so: <b>${mixText}</b>.${extra ? ' ' + extra : ''}</p>` : extra ? `<p>${extra}</p>` : ''}
    ${chart ? `<details><summary>${chartTitle}</summary><div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">${chart}</div></details>` : ''}
  </div>`;
}
export const mixText = (acts, names, st) => {
  const tot = st.reduce((a, b) => a + b, 0) || 1;
  return acts.map((a, k) => st[k] / tot >= .01 ? `${names[a]} ${Math.round(st[k] / tot * 100)} %` : '').filter(Boolean).join(', ');
};

/** Setzt den Analysebereich und einen „Weiter“-Knopf. */
export function analysis(id, html, label, onNext) {
  const el = $(id);
  el.innerHTML = `<div class="analysis">${html}<div><button class="btn primary" id="${id}-next">${label}</button></div></div>`;
  const b = $(id + '-next'); b.onclick = onNext; b.focus({ preventScroll: true });
}
export function setButtons(id, list, onClick) {
  const el = $(id);
  el.innerHTML = list.map(([v, l, primary]) => `<button class="btn ${primary ? 'primary' : ''}" data-v="${v}">${l}</button>`).join('');
  el.querySelectorAll('button').forEach(b => { b.onclick = () => onClick(b.dataset.v); });
}
