// Setzbaum des Turn-Solvers (Roadmap 04, B-03): Einsätze, Stack-Grenze, Auszahlungen bei Fold, River-Bäume.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStreet, buildTurn, turnRanges } from '../solver/turnsolve.js';

/** Alle Wege von der Wurzel zu Endknoten, mit dem, was jeder Spieler insgesamt eingesetzt hat. */
function paths(T, root, I0) {
  const out = [];
  const go = (id, inv, hist) => {
    const n = T[id];
    if (n.t) { out.push({ id, n, inv, hist }); return; }
    n.a.forEach((a, k) => {
      const me = n.p === 'SB' ? 0 : 1, next = inv.slice(), amt = n.amt?.[a];
      if (a === 'call') next[me] = next[1 - me];
      else if (a === 'raise') next[me] = I0 + amt;
      else if (amt) next[me] = I0 + amt;
      go(n.c[k], next, [...hist, a]);
    });
  };
  go(root, [I0, I0], []);
  return out;
}

test('Turn-Baum: Knoten, Einsätze und Auszahlungen passen zusammen', () => {
  for (const P of [8.3, 12.5]) {
    const { T, rivers } = buildTurn(P), I0 = P / 2;
    for (const [id, n] of Object.entries(T)) if (!n.t) for (const c of n.c) assert.ok(T[c], `${id} → ${c}`);
    for (const { n, inv, hist } of paths(T, 'u_root', I0)) {
      assert.ok(inv[0] <= 100 + 1e-9 && inv[1] <= 100 + 1e-9, hist.join(','));
      if (n.t === 'fold') {
        // wer foldet, verliert, was er bis dahin eingesetzt hat (den kleineren Betrag); die Richtung prüft der nächste Test
        assert.ok(Math.abs(Math.abs(n.sb) - Math.min(inv[0], inv[1])) < .02, `${hist.join(',')}: ${n.sb} bei ${inv}`);
      } else {
        assert.equal(n.t, 'river');
        assert.ok(Math.abs(n.inv - inv[0]) < .02 && Math.abs(inv[0] - inv[1]) < .02, `${hist.join(',')} gleich viel investiert`);
        assert.ok(rivers[n.tree], 'River-Baum vorhanden');
        assert.equal(T[n.line], n, 'line ist der eigene Endknoten');
      }
    }
    // jede Turn-Linie hat ihren eigenen Schlüssel, auch wenn der River-Baum geteilt wird
    const ends = Object.values(T).filter(n => n.t === 'river');
    assert.equal(new Set(ends.map(n => n.line)).size, ends.length);
    assert.ok(new Set(ends.map(n => n.tree)).size < ends.length, 'gleiche Beträge teilen sich den River-Baum');
  }
});

test('Fold-Vorzeichen: Fold des Big Blind ist Gewinn des Small Blind', () => {
  const { T } = buildTurn(12.5);
  assert.equal(T.u_vs75_f.sb, 6.25);        // SB setzt, BB foldet
  assert.equal(T.u_vsR75_f.sb, -(6.25 + 9.38)); // BB raist, SB foldet
  assert.equal(T.u_vsLead_f.sb, -6.25);     // BB führt, SB foldet
  assert.equal(T.u_vsRLead_f.sb, 6.25 + 6.25); // SB raist auf den Lead, BB foldet
});

test('River-Bäume: Einsätze auf den Stack begrenzt, auf ein All-in kein Raise', () => {
  const { rivers } = buildTurn(12.5);
  for (const [key, R] of Object.entries(rivers)) {
    const I0 = R.v_root?.t ? R.v_root.inv : +key.slice(1) / 100;
    for (const { n, inv, hist } of paths(R, 'v_root', I0)) {
      assert.ok(inv[0] <= 100 + 1e-9 && inv[1] <= 100 + 1e-9, `${key} ${hist.join(',')}`);
      if (n.t === 'sd') assert.ok(n.pot <= 200 + 1e-9);
    }
  }
  // nach Overbet und Raise auf dem Turn (62,5 investiert) bleibt am River nur noch ein Einsatz: All-in
  const deep = rivers.L6250;
  assert.deepEqual(deep.v_ip.a, ['check', 'b33']);
  assert.equal(deep.v_ip.amt.b33, 37.5);
  assert.deepEqual(deep.v_vs33.a, ['fold', 'call']);
  // ohne Reststack gibt es nur noch den Showdown
  const none = buildStreet(200, 100, 'v', i => ({ t: 'sd', pot: 2 * i, inv: i }));
  assert.deepEqual(Object.keys(none), ['v_root']);
  assert.equal(none.v_root.t, 'sd');
});

test('Ranges für den Turn aus der Flop-Lösung', () => {
  // kleines künstliches Flop-Ergebnis: zwei Hände je Seite, SB setzt meist ¾
  const B = {
    sb: { c: [1, 2], w: [1000, 500] }, bb: { c: [1, 3], w: [1000, 1000] },
    n: {
      f_ip: { s: [0, 0, 100, 0, 50, 50] }, f_root: { s: [100, 0, 50, 50] },
      f_vsB75: { s: [0, 100, 0, 0, 100, 0] }, f_vsB33: { s: [0, 100, 0, 0, 100, 0] },
    },
  };
  const r = turnRanges(B);
  assert.equal(r.line, 'b75'); assert.equal(r.P, 12.5);
  const w = c => ({ sb: r.sbW[r.combos.indexOf(c)], bb: r.bbW[r.combos.indexOf(c)] });
  assert.deepEqual(w(1), { sb: 1, bb: 1 });
  assert.deepEqual(w(2), { sb: .25, bb: 0 });
  assert.deepEqual(w(3), { sb: 0, bb: .5 });
});
