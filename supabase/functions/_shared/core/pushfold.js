// Automatisch kopiert aus src/core/pushfold.js (npm run functions:sync). Nicht hier ändern.
// Push/Fold heads-up: Bot-Stile und Erwartungswert einer Entscheidung gegen einen Bot.

export const REC_PUSH = { 2: .8, 3: .68, 4: .58, 5: .5, 6: .43, 8: .34, 10: .28, 12: .23, 15: .18, 20: .13 };
export function lerp(S, tab) {
  const ks = Object.keys(tab).map(Number).sort((a, b) => a - b);
  if (S <= ks[0]) return tab[ks[0]];
  if (S >= ks[ks.length - 1]) return tab[ks[ks.length - 1]];
  for (let i = 1; i < ks.length; i++) if (S <= ks[i]) { const a = ks[i - 1], b = ks[i], t = (S - a) / (b - a); return tab[a] + (tab[b] - tab[a]) * t; }
  return tab[ks[ks.length - 1]];
}
const nashS = S => Math.min(20, Math.max(2, Math.round(S)));

export function makeBots({ NASH, PCTL }) {
  return {
    nash: {
      name: 'Gleichgewicht (Nash)', short: 'Nash-Bot',
      push: S => NASH[nashS(S)].push, call: S => NASH[nashS(S)].call,
      note: 'spielt das mathematische Gleichgewicht. Er geht oft mit schwachen Händen all-in, weil das bei kurzen Stacks profitabel ist.',
    },
    rec: {
      name: 'Typischer Freizeitspieler', short: 'Freizeit-Bot',
      push: S => { const x = lerp(S, REC_PUSH); return PCTL.map(p => p <= x ? 1 : 0); },
      call: S => { const x = lerp(S, REC_PUSH) * .55; return PCTL.map(p => p <= x ? 1 : 0); },
      note: 'spielt wie die meisten Hobbyspieler: Er geht nur mit guten Händen all-in und callt nur mit sehr starken. Gegen ihn lohnt es sich, öfter selbst all-in zu gehen.',
    },
  };
}

/**
 * EV beider Optionen in BB (bezogen auf den Start der Hand) für Klasse mi bei effektivem Stack S.
 * SB: push/fold gegen die Call-Strategie des Bots. BB: call/fold gegen seine Push-Strategie.
 */
export function evalSpot({ EQ, CPT }, pos, S, mi, bot) {
  if (pos === 'SB') {
    const c = bot.call(S); let w = 0, e = 0, wc = 0, ec = 0;
    for (let j = 0; j < 169; j++) { const ww = CPT[mi][j]; w += ww; e += ww * ((1 - c[j]) + c[j] * S * (2 * EQ[mi][j] - 1)); wc += ww * c[j]; ec += ww * c[j] * EQ[mi][j]; }
    return { ev: { push: e / w, fold: -.5 }, cp: wc / w, eqc: wc ? ec / wc : 0 };
  }
  const p = bot.push(S); let w = 0, e = 0, w0 = 0;
  for (let i = 0; i < 169; i++) { w0 += CPT[mi][i]; const ww = CPT[mi][i] * p[i]; w += ww; e += ww * EQ[mi][i]; }
  const eq = w ? e / w : .5;
  return { ev: { call: S * (2 * eq - 1), fold: -1 }, pp: w / w0, eq, need: (S - 1) / (2 * S) };
}
