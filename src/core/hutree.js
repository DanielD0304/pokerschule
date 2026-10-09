// Heads-up-Preflop mit 100 BB: Erwartungswerte im gelösten Spielbaum (hu-strat.json).

/** Anteil am Pot des Spielers in Position bei Equity eq (Equity-Realisierung mit Faktor d). */
export const fR = (eq, d) => eq + d * 4 * eq * (1 - eq);

export function makeHU({ EQ, CPT }, { tree, strat }) {
  const paySB = (t, i, j) => t.t === 'fold' ? t.sb : t.t === 'sd' ? t.pot * fR(EQ[i][j], t.d) - t.inv : t.pot * EQ[i][j] - t.inv;
  /** Kontrafaktischer Wert für Spieler p mit Klasse h; beide spielen ab hier das Gleichgewicht. */
  function cfv(id, p, h, opp) {
    const n = tree[id];
    if (n.t) {
      let s = 0;
      for (let o = 0; o < 169; o++) { if (!opp[o]) continue; s += CPT[h][o] * opp[o] * (p === 'SB' ? paySB(n, h, o) : -paySB(n, o, h)); }
      return s;
    }
    let s = 0;
    if (n.p === p) { const st = strat[id][h]; n.a.forEach((a, k) => { if (st[k] > 0) s += st[k] * cfv(n.c[k], p, h, opp); }); }
    else n.a.forEach((a, k) => { s += cfv(n.c[k], p, h, opp.map((r, o) => r * strat[id][o][k])); });
    return s;
  }
  /** EV jeder Aktion am Knoten id in BB, bezogen auf den Start der Hand. */
  function nodeEVs(id, p, h, opp) {
    let W = 0; for (let o = 0; o < 169; o++) W += CPT[h][o] * opp[o];
    return tree[id].a.map((a, k) => cfv(tree[id].c[k], p, h, opp) / W);
  }
  return { tree, strat, nodeEVs, paySB };
}
