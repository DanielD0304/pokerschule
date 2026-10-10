// Automatisch kopiert aus src/core/spots.js (npm run functions:sync). Nicht hier ändern.
// Einzelne Entscheidungs-Situationen („Spots“) aus den Solver-Daten, für die Wochen-Challenge und die
// Spot-Sets der Gruppen (Roadmap 03). Rein, ohne Netz und DOM. Der Server erzeugt damit die Challenge,
// der Browser die Spot-Sets. Ein Spot enthält die EVs aller Optionen; publicSpot entfernt sie.
import { CMB } from './cards.js';
import { judge } from './rating.js';

const nf = (x, d = 2) => Math.abs(x).toFixed(d).replace('.', ',');
const n2 = x => nf(x, x % 1 ? 2 : 0);
const r4 = x => Math.round(x * 10000) / 10000;

const NAME = { check: 'Check', donk: 'Bet ⅓', b33: 'Bet ⅓', b75: 'Bet ¾', b150: 'Overbet', lead: 'Bet ½', fold: 'Fold', call: 'Call', raise: 'Raise', '3bet': '3-Bet', '4bet': '4-Bet', jam: 'All-in' };

const FLOP = {
  f_root: { pot: 5, face: 'Du handelst zuerst (out of position).', lab: { check: 'Check', donk: 'Bet 1,65 (⅓ Pot)' } },
  f_ip: { pot: 5, face: 'Der Gegner checkt zu dir.', lab: { check: 'Check', b33: 'Bet 1,65 (⅓ Pot)', b75: 'Bet 3,75 (¾ Pot)' } },
  f_vsB33: { pot: 6.65, face: 'Der Gegner setzt 1,65 BB (⅓ Pot).', lab: { fold: 'Fold', call: 'Call 1,65', raise: 'Raise auf 5' } },
  f_vsR33: { pot: 11.65, face: 'Der Gegner erhöht auf 5 BB.', lab: { fold: 'Fold', call: 'Call 3,35' } },
  f_vsB75: { pot: 8.75, face: 'Der Gegner setzt 3,75 BB (¾ Pot).', lab: { fold: 'Fold', call: 'Call 3,75', raise: 'Raise auf 11' } },
  f_vsR75: { pot: 19.75, face: 'Der Gegner erhöht auf 11 BB.', lab: { fold: 'Fold', call: 'Call 7,25' } },
  f_vsDonk: { pot: 6.65, face: 'Der Gegner setzt 1,65 BB (⅓ Pot) in dich hinein.', lab: { fold: 'Fold', call: 'Call 1,65', raise: 'Raise auf 5' } },
  f_vsDR: { pot: 11.65, face: 'Der Gegner erhöht auf 5 BB.', lab: { fold: 'Fold', call: 'Call 3,35' } },
};
const RIVER_NODES = ['r_root', 'r_ip', 'r_vs33', 'r_vs75', 'r_vs150', 'r_vsR33', 'r_vsR75', 'r_vsR150', 'r_vsLead', 'r_vsLR'];
const FRAC = { b33: '⅓ Pot', b75: '¾ Pot', b150: '1,5× Pot', lead: '½ Pot' };
const DUEL = {
  root: { pot: 1.5, face: 'Du bist im Small Blind (Button) und handelst zuerst.', lab: { fold: 'Fold', raise: 'Raise auf 2,5' } },
  vsOpen: { pot: 3.5, face: 'Der Gegner erhöht auf 2,5 BB.', lab: { fold: 'Fold', call: 'Call 1,5', '3bet': '3-Bet auf 10' } },
  vs3b: { pot: 12.5, face: 'Der Gegner 3-bettet auf 10 BB.', lab: { fold: 'Fold', call: 'Call 7,5', '4bet': '4-Bet auf 22' } },
  vs4b: { pot: 32, face: 'Der Gegner 4-bettet auf 22 BB.', lab: { fold: 'Fold', call: 'Call 12', jam: 'All-in (100)' } },
  vsJam: { pot: 122, face: 'Der Gegner geht all-in mit 100 BB.', lab: { fold: 'Fold', call: 'Call 78' } },
};

/** Alle Situationen, aus denen Spots entstehen können, in der Schreibweise der Statistik ('flop:f_ip'). */
export const SPOT_KEYS = [
  ...Object.keys(DUEL).map(n => 'duel:' + n),
  ...Object.keys(FLOP).map(n => 'flop:' + n),
  ...RIVER_NODES.map(n => 'river:' + n),
];
export const isSpotKey = k => SPOT_KEYS.includes(k);
/** Welche Solver-Daten ein Spot-Set braucht (Schlüssel wie in src/modes/data.js). */
export function dataNeeds(keys) {
  const kinds = new Set(keys.map(k => k.split(':')[0]));
  return [...(kinds.has('duel') ? ['pf', 'huTree', 'huStrat'] : []), ...(kinds.has('flop') ? ['flop'] : []), ...(kinds.has('river') ? ['river'] : [])];
}

export const MODEL = {
  flop: expl => `Flop-Gleichgewicht auf Kombo-Ebene, Turn und River über Equity-Realisierung geschätzt. Lösungsgüte dieses Boards: ausnutzbar um ${nf(expl, 3)} % des Pots.`,
  river: expl => `Exakt gelöst für diesen Spielbaum, ausnutzbar um ${nf(expl, 3)} % des Pots. Die Ranges stammen aus den vereinfachten früheren Stufen.`,
  duel: () => 'Gleichgewicht eines vereinfachten Preflop-Baums (2,5 / 10 / 22 / all-in, keine Limps), Postflop über Equity-Realisierung.',
};

/** Weg vom Wurzelknoten zu target als Liste [Knoten, Aktionsindex]; null, wenn es ihn nicht gibt. */
export function pathTo(tree, root, target) {
  if (root === target) return [];
  const n = tree[root];
  if (!n || n.t) return null;
  for (let k = 0; k < n.c.length; k++) {
    const p = pathTo(tree, n.c[k], target);
    if (p) return [[root, k], ...p];
  }
  return null;
}

/** Gewichtete Auswahl; rand liefert gleichverteilt [0, 1). -1, wenn alle Gewichte 0 sind. */
export function pickWeighted(w, rand) {
  let tot = 0; for (const x of w) tot += x;
  if (!(tot > 0)) return -1;
  let r = rand() * tot;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0 && w[i] > 0) return i; }
  for (let i = w.length - 1; i >= 0; i--) if (w[i] > 0) return i;
  return -1;
}
const pick = (list, rand) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
const boardInts = s => Array.from({ length: s.length / 2 }, (_, k) => '23456789TJQKA'.indexOf(s[2 * k]) * 4 + 'shdc'.indexOf(s[2 * k + 1]));

/** Range-Gewichte des Helden am Knoten: Startgewicht mal eigene Strategie auf dem Weg dorthin. */
function reachWeights(side, nodes, tree, path, pos) {
  return side.w.map((w0, i) => {
    let w = w0;
    for (const [id, k] of path) if (tree[id].p === pos) w *= nodes[id].s[i * tree[id].a.length + k] / 100;
    return w;
  });
}

// ---------- Flop und River (Kombo-Ebene) ----------

function postflopSpot(kind, set, node, rand, describe) {
  for (let tries = 0; tries < 40; tries++) {
    // Flop-Boards tragen ein Gewicht (Anteil aller Flops); ohne Gewicht gleich oft
    const bi = pickWeighted(set.map(b => b.w ?? 1), rand), B = set[bi], tree = describe.tree(B);
    const path = pathTo(tree, describe.root, node), n = tree[node];
    if (!path || !n || n.t) throw new Error('Unbekannte Situation ' + node);
    const pos = n.p, side = pos === 'SB' ? B.sb : B.bb;
    const mi = pickWeighted(reachWeights(side, B.n, tree, path, pos), rand);
    if (mi < 0) continue; // auf diesem Board erreicht der Held den Knoten nie
    const c = side.c[mi], A = n.a.length;
    const ev = Array.from(B.n[node].e.slice(mi * A, mi * A + A), x => r4(x / 100));
    const st = Array.from(B.n[node].s.slice(mi * A, mi * A + A)), tot = st.reduce((a, b) => a + b, 0) || 1;
    return {
      key: kind + ':' + node, kind, node, pos, ref: [B.board, mi],
      hero: [Math.floor(c / 52), c % 52], board: boardInts(B.board),
      ...describe.text(B, tree, path, node),
      acts: n.a.slice(), ev, mix: st.map(x => r4(x / tot)), model: MODEL[kind](B.expl),
    };
  }
  return null;
}

const FLOP_DESC = {
  root: 'f_root', tree: function () { return this.T; },
  text(B, tree, path, node) {
    return {
      context: 'Preflop: SB erhöht auf 2,5, BB callt.', pot: FLOP[node].pot, face: FLOP[node].face,
      line: path.map(([id, k]) => ({ pos: tree[id].p, a: tree[id].a[k], name: NAME[tree[id].a[k]] })),
      options: tree[node].a.map(a => FLOP[node].lab[a]),
    };
  },
};
const amountOf = (n, a) => { const m = n.amt || {}; return a === 'call' ? m.call : a === 'raise' ? m.raise : m[a] || 0; };
function riverLabel(n, a) {
  const m = n.amt || {};
  if (a === 'check' || a === 'fold') return NAME[a];
  if (a === 'call') return `Call ${n2(m.call)}`;
  if (a === 'raise') return `Raise auf ${n2(m.raise)}`;
  return `${a === 'b150' ? 'Overbet' : 'Bet'} ${n2(m[a])} (${FRAC[a]})`;
}
const RIVER_DESC = {
  root: 'r_root', tree: B => B.tree,
  text(B, tree, path, node) {
    let pot = B.P;
    const line = path.map(([id, k]) => { const a = tree[id].a[k], amt = amountOf(tree[id], a); pot += amt; return { pos: tree[id].p, a, name: NAME[a], amt }; });
    const last = line[line.length - 1];
    const face = !last ? 'Du handelst zuerst.' : last.a === 'check' ? 'Der Gegner checkt zu dir.'
      : last.a === 'raise' ? `Der Gegner erhöht auf ${n2(last.amt)} BB.` : `Der Gegner setzt ${n2(last.amt)} BB (${FRAC[last.a]}).`;
    return {
      context: `Preflop: SB erhöht, BB callt. Flop: BB checkt, SB setzt ${B.line === 'b75' ? '¾' : '⅓'} Pot, BB callt. Turn: Check, Check.`,
      pot: Math.round(pot * 100) / 100, face, line, options: tree[node].a.map(a => riverLabel(tree[node], a)),
    };
  },
};

// ---------- Preflop-Duell (Klassen-Ebene, 100 BB) ----------

function duelSpot(HU, node, rand) {
  const { tree, strat } = HU, n = tree[node];
  const path = pathTo(tree, 'root', node);
  if (!path || !n || n.t) throw new Error('Unbekannte Situation ' + node);
  const pos = n.p, opp = new Array(169).fill(1);
  const w = CMB.map((cs, h) => cs.length);
  for (const [id, k] of path) {
    if (tree[id].p === pos) for (let h = 0; h < 169; h++) w[h] *= strat[id][h][k];
    else for (let o = 0; o < 169; o++) opp[o] *= strat[id][o][k];
  }
  const h = pickWeighted(w, rand);
  if (h < 0) return null;
  const hero = pick(CMB[h], rand).slice();
  const st = strat[node][h], tot = st.reduce((a, b) => a + b, 0) || 1;
  return {
    key: 'duel:' + node, kind: 'duel', node, pos, ref: [h], hero, board: [],
    context: 'Heads-up, beide Spieler mit 100 BB.', pot: DUEL[node].pot, face: DUEL[node].face,
    line: path.map(([id, k]) => ({ pos: tree[id].p, a: tree[id].a[k], name: NAME[tree[id].a[k]] })),
    options: n.a.map(a => DUEL[node].lab[a]), acts: n.a.slice(),
    ev: HU.nodeEVs(node, pos, h, opp).map(r4), mix: st.map(x => r4(x / tot)), model: MODEL.duel(),
  };
}

/**
 * Erzeugt einen Spot. ctx: { flop: { tree, boards } (Flop-Index und geladene Boards mit Gewicht w), river: river-data.json,
 * HU: makeHU(...) } (nur, was gebraucht wird).
 * key: z. B. 'river:r_vs75'. rand: gleichverteilt [0, 1). Ergebnis null, wenn die Situation nicht erreichbar ist.
 */
export function makeSpot(ctx, key, rand = Math.random) {
  const [kind, node] = key.split(':');
  if (!isSpotKey(key)) throw new Error('Unbekannte Situation ' + key);
  if (kind === 'duel') return duelSpot(ctx.HU, node, rand);
  if (kind === 'flop') return postflopSpot('flop', ctx.flop.boards, node, rand, { ...FLOP_DESC, T: ctx.flop.tree });
  return postflopSpot('river', ctx.river.spots, node, rand, RIVER_DESC);
}

/** Abstand zwischen bester und schlechtester Option: Spots darunter lehren wenig. */
export const spread = s => Math.max(...s.ev) - Math.min(...s.ev);

/** Was der Browser vor der Antwort sehen darf: ohne EVs, Gleichgewicht und Herkunft in den Daten. */
export function publicSpot(s) {
  const { ev: _e, mix: _m, ref: _r, ...pub } = s;
  return pub;
}

/** Bewertet eine Antwort: Einstufung, EV-Verlust, beste Option. */
export function answer(spot, choice) {
  if (!Number.isInteger(choice) || choice < 0 || choice >= spot.ev.length) throw new Error('Ungültige Antwort');
  return judge(spot.ev, choice);
}

// ---------- Wochen-Challenge ----------

export const WEEKLY_PLAN = { flop: 7, river: 7, duel: 6 };
export const WEEKLY_MIN_SPREAD = .15;

/**
 * Die Spots einer Woche: gemischt aus Flop, River und Duell, jede Situation mit spürbarem Unterschied
 * zwischen den Optionen, keine Hand doppelt, in zufälliger Reihenfolge.
 */
export function weeklySpots(ctx, rand, plan = WEEKLY_PLAN) {
  const out = [], seen = new Set(), perKey = {};
  for (const [kind, count] of Object.entries(plan)) {
    const keys = SPOT_KEYS.filter(k => k.startsWith(kind + ':'));
    for (let i = 0, tries = 0; i < count; tries++) {
      if (tries > 400) throw new Error('Zu wenige geeignete Spots für ' + kind);
      // höchstens zweimal dieselbe Situation, damit die Woche abwechslungsreich bleibt
      const key = pick(keys, rand);
      if ((perKey[key] || 0) >= 2) continue;
      const s = makeSpot(ctx, key, rand);
      if (!s || spread(s) < WEEKLY_MIN_SPREAD) continue;
      const id = s.key + ':' + s.ref.join(',');
      if (seen.has(id)) continue;
      seen.add(id); perKey[key] = (perKey[key] || 0) + 1; out.push(s); i++;
    }
  }
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
