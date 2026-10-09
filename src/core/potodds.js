// Pot Odds in Big Blinds: Turn (eine Karte) und Flop all-in (zwei Karten).

export const DRAWS = [
  { name: 'einen Flush-Draw', outs: 9, dirty: 'Flush-Outs sind auf einem gepaarten Board nicht sauber: Hat der Gegner einen Drilling oder zwei Paare, kann er mit derselben Karte ein Full House machen.' },
  { name: 'einen Open-Ended Straight-Draw', outs: 8, dirty: 'Liegen zwei Karten einer Farbe, kann eine deiner Straßenkarten dem Gegner einen Flush bringen. Und wer auf das untere Ende der Straße zieht, kann gegen eine höhere Straße verlieren.' },
  { name: 'einen Gutshot', outs: 4, dirty: 'Bei nur vier Outs kostet jede unsaubere Karte viel: Bringt sie dem Gegner einen Flush oder eine höhere Straße, bleiben eher drei echte Outs.' },
  { name: 'einen Flush-Draw plus Gutshot', outs: 12, dirty: 'Zähle Karten nicht doppelt: Eine Karte, die Flush und Straße bringt, ist nur ein Out.' },
  { name: 'einen Flush-Draw plus Open-Ender', outs: 15, dirty: 'Zähle Karten nicht doppelt: 9 Flush-Outs plus 8 Straßen-Outs sind 15, nicht 17, weil zwei Karten beides bringen.' },
  { name: 'zwei Overcards (jedes Paar gewinnt)', outs: 6, dirty: 'Overcard-Outs sind oft unsauber: Der Gegner kann eine der Karten selbst halten oder mit seinem Paar zwei Paare machen. Rechne lieber mit 3 bis 4 Outs.' },
];
export const BET_FRACTIONS = [.25, .33, .5, .66, .75, 1, 1.5, 2];

const C2 = n => n * (n - 1) / 2;
/** Benötigte Equity für einen Call: Einsatz ÷ (Pot + Einsatz + Call). */
export const requiredEquity = (pot, bet) => bet / (pot + 2 * bet);
/** Eine Karte kommt noch (Turn → River), 46 unbekannte Karten. */
export const equityOneCard = (outs, unseen = 46) => outs / unseen;
/** Zwei Karten kommen noch (Flop all-in), 47 unbekannte Karten. */
export const equityTwoCards = (outs, unseen = 47) => 1 - C2(unseen - outs) / C2(unseen);
export const ruleOfThumb = (outs, street) => outs * (street === 'flop' ? 4 : 2) / 100;

/** Zufälliges Szenario, bei dem die Entscheidung nicht auf Messers Schneide liegt. */
export function makeScenario(rng = Math.random) {
  const pick = a => a[(rng() * a.length) | 0];
  for (let guard = 0; guard < 1000; guard++) {
    const street = rng() < .5 ? 'turn' : 'flop';
    const draw = pick(DRAWS);
    const pot = (6 + ((rng() * 75) | 0)) / 2; // 3 bis 40 BB in halben BB
    const bet = Math.max(.5, Math.round(pot * pick(BET_FRACTIONS) * 2) / 2);
    const need = requiredEquity(pot, bet);
    const eq = street === 'turn' ? equityOneCard(draw.outs) : equityTwoCards(draw.outs);
    if (Math.abs(need - eq) < .02) continue;
    return { street, draw, pot, bet, need, eq, ans: eq > need ? 'call' : 'fold' };
  }
  throw new Error('Kein Szenario gefunden');
}
