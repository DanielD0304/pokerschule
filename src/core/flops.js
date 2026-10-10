// Flop-Boards nach Typ (Roadmap 04, B-01): Einordnung (trocken, nass, gepaart …), Zusammenfassen
// strategisch gleicher Flops (Farbvertauschung) und Auswahl repräsentativer Boards mit Häufigkeitsgewicht.
// Rein, ohne Netz und DOM. Der Solver wählt damit seine Boards, das Training filtert und gewichtet damit.

const RANKS = '23456789TJQKA', SUITS = 'shdc';
export const ALL_FLOPS = 22100; // C(52, 3)

/** Board-Typen für den Filter im Training. Ein Board kann mehrere haben. */
export const TAGS = {
  dry: { name: 'Trocken', text: 'ungepaart, drei Farben, keine Straße möglich' },
  wet: { name: 'Nass', text: 'Straße und Flush möglich' },
  paired: { name: 'Gepaart', text: 'ein Paar oder Drilling auf dem Board' },
  mono: { name: 'Monoton', text: 'alle drei Karten in einer Farbe' },
  broadway: { name: 'Broadway', text: 'alle Karten Zehn oder höher' },
  low: { name: 'Niedrig', text: 'höchste Karte Acht oder niedriger' },
  ace: { name: 'Ass-hoch', text: 'ein Ass auf dem Board' },
};

/** "As7d2c" → [{ r: 12, s: 0 }, …] (r: 0 = Zwei … 12 = Ass). */
export function parseBoard(str) {
  if (!/^([2-9TJQKA][shdc]){3}$/.test(str)) throw new Error('Ungültiges Board ' + str);
  const cards = [0, 2, 4].map(k => ({ r: RANKS.indexOf(str[k]), s: SUITS.indexOf(str[k + 1]) }));
  if (new Set(cards.map(c => c.r * 4 + c.s)).size < 3) throw new Error('Karte doppelt in ' + str);
  return cards;
}
export const boardStr = cards => cards.map(c => RANKS[c.r] + SUITS[c.s]).join('');

/** Ist eine Straße mit zwei weiteren Karten möglich? (drei verschiedene Ränge in einem Fenster von fünf, Ass auch als Eins) */
function straightPossible(ranks) {
  const set = new Set(ranks);
  if (set.size < 3) return false;
  const vals = [...set].flatMap(r => r === 12 ? [12, -1] : [r]);
  for (let lo = -1; lo <= 8; lo++) if ([...set].every(r => vals.some(v => v >= lo && v <= lo + 4 && (v === r || (r === 12 && v === -1))))) return true;
  return false;
}

/** Eigenschaften eines Flops. */
export function texture(cards) {
  const ranks = cards.map(c => c.r).sort((a, b) => b - a);
  const distinctR = new Set(ranks).size, distinctS = new Set(cards.map(c => c.s)).size;
  return {
    ranks, hi: ranks[0],
    paired: 3 - distinctR,                                   // 0 ungepaart, 1 Paar, 2 Drilling
    suits: distinctS === 3 ? 'rainbow' : distinctS === 2 ? 'twotone' : 'mono',
    straight: straightPossible(ranks),
  };
}

/** Typen eines Boards (Schlüssel aus TAGS). */
export function boardTags(str) {
  const t = texture(parseBoard(str)), tags = [];
  if (!t.paired && t.suits === 'rainbow' && !t.straight) tags.push('dry');
  if (!t.paired && t.suits !== 'rainbow' && t.straight) tags.push('wet');
  if (t.paired) tags.push('paired');
  if (t.suits === 'mono') tags.push('mono');
  if (t.ranks.every(r => r >= 8)) tags.push('broadway');
  if (t.hi <= 6) tags.push('low');
  if (t.hi === 12) tags.push('ace');
  return tags;
}

// ---------- Strategisch gleiche Flops ----------

const PERMS = (() => { const out = []; const rec = (p, rest) => { if (!rest.length) out.push(p); rest.forEach((x, i) => rec([...p, x], rest.filter((_, j) => j !== i))); }; rec([], [0, 1, 2, 3]); return out; })();
const sortCards = cs => cs.slice().sort((a, b) => b.r - a.r || a.s - b.s);
/** Schlüssel, der für alle Farbvertauschungen eines Flops gleich ist. */
export function canonical(cards) {
  let best = null;
  for (const p of PERMS) {
    const k = sortCards(cards.map(c => ({ r: c.r, s: p[c.s] }))).map(c => c.r * 4 + c.s).join(',');
    if (best === null || k < best) best = k;
  }
  return best;
}
const fromKey = k => k.split(',').map(Number).map(n => ({ r: n >> 2, s: n & 3 }));

let classesCache = null;
/** Alle 1755 strategisch verschiedenen Flops mit ihrer Häufigkeit unter den 22 100 möglichen. */
export function flopClasses() {
  if (classesCache) return classesCache;
  const m = new Map();
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) {
    const k = canonical([a, b, c].map(n => ({ r: n >> 2, s: n & 3 })));
    m.set(k, (m.get(k) || 0) + 1);
  }
  classesCache = [...m].map(([key, w]) => { const cards = fromKey(key); return { key, cards, w, t: texture(cards) }; });
  return classesCache;
}

// ---------- Auswahl repräsentativer Boards ----------

const type = t => t.paired === 2 ? 'trips' : (t.paired ? 'p-' : 'u-') + t.suits;
/** Höchste Karte in Gruppen: Ass, König, Dame, Bube/Zehn, Neun/Acht, Sieben und tiefer. */
const HI_GROUPS = ['A', 'K', 'Q', 'JT', '98', '7-'];
const hiGroup = hi => hi === 12 ? 'A' : hi === 11 ? 'K' : hi === 10 ? 'Q' : hi >= 8 ? 'JT' : hi >= 6 ? '98' : '7-';
/** Die großen Typen (ungepaart, drei oder zwei Farben) werden zusätzlich nach der höchsten Karte geteilt,
 * damit z. B. Ass-hohe Flops mit ihrem echten Anteil vertreten sind. */
const SPLIT = new Set(['u-rainbow', 'u-twotone']);
const stratum = t => SPLIT.has(type(t)) ? type(t) + ':' + hiGroup(t.hi) : type(t);
/** Welche zwei Karten (nach Rang sortiert) bei zwei Farben dieselbe Farbe haben: 0 hoch+mittel, 1 hoch+niedrig, 2 mittel+niedrig. */
function suitedPair(cards) {
  const cs = sortCards(cards);
  return cs[0].s === cs[1].s ? 0 : cs[0].s === cs[2].s ? 1 : cs[1].s === cs[2].s ? 2 : -1;
}
function features(c) {
  const t = c.t ?? texture(c.cards);
  return { r: t.ranks, st: t.straight ? 1 : 0, sp: t.suits === 'twotone' ? suitedPair(c.cards) : -1 };
}
/** Abstand zweier Flops desselben Typs: Ränge, Straßenmöglichkeit, welche Karten die Flush-Farbe teilen. */
function dist(x, y) {
  const dr = (x.r[0] - y.r[0]) ** 2 + (x.r[1] - y.r[1]) ** 2 + (x.r[2] - y.r[2]) ** 2;
  return Math.sqrt(dr) + 2 * Math.abs(x.st - y.st) + (x.sp !== y.sp ? 2.5 : 0);
}

/** Plätze je Typ: proportional zur Häufigkeit, aber mindestens min[typ] (z. B. genug monotone Boards für den Filter). */
export function allocate(k, weights, min) {
  const keys = Object.keys(weights), tot = keys.reduce((a, s) => a + weights[s], 0);
  const out = Object.fromEntries(keys.map(s => [s, Math.min(min[s] ?? 1, k)]));
  let left = k - keys.reduce((a, s) => a + out[s], 0);
  if (left < 0) throw new Error('Zu wenige Plätze für die Mindestzahlen');
  // größter Rest: wer gemessen an seinem Anteil am weitesten zurückliegt, bekommt den nächsten Platz
  while (left > 0) {
    const s = keys.reduce((best, x) => (weights[x] / tot * k - out[x] > weights[best] / tot * k - out[best] ? x : best), keys[0]);
    out[s]++; left--;
  }
  return out;
}
export const MIN_PER_TYPE = { 'u-mono': 4, trips: 1, 'p-rainbow': 3, 'p-twotone': 3, 'u-rainbow': 3, 'u-twotone': 3 };

/**
 * Wählt k Boards, die zusammen alle Flops möglichst gut vertreten (gewichtete k-Medoids je Typ).
 * fixed: Boards, die auf jeden Fall dabei sind (mit genau diesen Farben). Ergebnis je Board: board, w (Anteil
 * aller Flops, die es vertritt, Summe 1), tags.
 */
export function selectFlops(k = 60, fixed = []) {
  const cls = flopClasses(), groups = {};
  for (const c of cls) (groups[stratum(c.t)] ??= []).push({ ...c, f: features(c) });
  const fixedBy = {};
  for (const str of fixed) {
    const cards = parseBoard(str), key = canonical(cards), c = cls.find(x => x.key === key);
    (fixedBy[stratum(c.t)] ??= []).push({ str, key });
  }
  const weightOf = keys => Object.fromEntries(keys.map(s => [s, groups[s].reduce((a, c) => a + c.w, 0)]));
  const types = {};
  for (const s of Object.keys(groups)) (types[s.split(':')[0]] ??= []).push(s);
  const typeW = Object.fromEntries(Object.entries(types).map(([ty, ss]) => [ty, ss.reduce((a, s) => a + Object.values(weightOf([s]))[0], 0)]));
  const quota = {};
  for (const [ty, q] of Object.entries(allocate(k, typeW, MIN_PER_TYPE))) {
    const ss = types[ty];
    if (ss.length === 1) { quota[ss[0]] = q; continue; }
    const min = Object.fromEntries(ss.map(s => [s, Math.max(1, (fixedBy[s] || []).length)]));
    Object.assign(quota, allocate(q, weightOf(ss), min));
  }
  const out = [];
  for (const [s, pts] of Object.entries(groups)) {
    const fx = fixedBy[s] || [];
    if (fx.length > quota[s]) throw new Error(`Mehr feste Boards als Plätze im Typ ${s}`);
    const D = pts.map(p => pts.map(q => dist(p.f, q.f)));
    let med = fx.map(f => pts.findIndex(p => p.key === f.key));
    // Aufbau: jeweils das Board dazunehmen, das den gewichteten Abstand aller Flops zum nächsten Board am stärksten senkt
    const near = pts.map((_, i) => med.length ? Math.min(...med.map(m => D[i][m])) : Infinity);
    while (med.length < quota[s]) {
      let best = -1, bestGain = -Infinity;
      for (let c = 0; c < pts.length; c++) {
        if (med.includes(c)) continue;
        let gain = 0;
        for (let i = 0; i < pts.length; i++) { const d = Math.min(near[i], D[i][c]); gain += pts[i].w * ((near[i] === Infinity ? 1e3 : near[i]) - d); }
        if (gain > bestGain) { bestGain = gain; best = c; }
      }
      med.push(best);
      for (let i = 0; i < pts.length; i++) near[i] = Math.min(near[i], D[i][best]);
    }
    // Verbessern: Flops dem nächsten Board zuordnen, je Gruppe das zentralste Board wählen (feste bleiben)
    const nFixed = fx.length;
    let assign = [];
    for (let iter = 0; iter < 30; iter++) {
      assign = pts.map((_, i) => med.reduce((b, m, j) => D[i][m] < D[i][med[b]] ? j : b, 0));
      let changed = false;
      for (let j = nFixed; j < med.length; j++) {
        const members = pts.map((_, i) => i).filter(i => assign[i] === j);
        let best = med[j], bestCost = Infinity;
        for (const c of members) { const cost = members.reduce((a, i) => a + pts[i].w * D[i][c], 0); if (cost < bestCost - 1e-9) { bestCost = cost; best = c; } }
        if (best !== med[j]) { med[j] = best; changed = true; }
      }
      if (!changed) break;
    }
    med.forEach((m, j) => {
      const w = pts.reduce((a, p, i) => a + (assign[i] === j ? p.w : 0), 0);
      const str = j < nFixed ? fx[j].str : boardStr(sortCards(pts[m].cards));
      out.push({ board: str, w: w / ALL_FLOPS, tags: boardTags(str) });
    });
  }
  // feste Boards zuerst in ihrer Reihenfolge, dann nach Typ und Rang
  const order = b => { const i = fixed.indexOf(b.board); return i >= 0 ? i : fixed.length; };
  return out.sort((a, b) => order(a) - order(b) || (order(a) === fixed.length ? stratum(texture(parseBoard(a.board))).localeCompare(stratum(texture(parseBoard(b.board)))) || b.board.localeCompare(a.board) : 0));
}

/** Gewichtete Auswahl eines Boards aus der Liste (optional nur Boards mit tag). rand: [0, 1). */
export function pickBoard(boards, rand, tag = null) {
  const list = tag ? boards.filter(b => b.tags.includes(tag)) : boards;
  if (!list.length) throw new Error('Kein Board dieses Typs');
  let r = rand() * list.reduce((a, b) => a + b.w, 0);
  for (const b of list) { r -= b.w; if (r < 0) return b; }
  return list[list.length - 1];
}
