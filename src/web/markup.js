// Markup der Spielmodi. Die IDs werden vom imperativen Code in src/modes gefüllt.
// Aufbau wie bei chess.com: Tisch links, Analyse und Verlauf rechts.

const sideInfo = (title, body) => `<details class="box"><summary>${title}</summary><div style="display:flex;flex-direction:column;gap:8px">${body}</div></details>`;

export const ARENA = `
<div class="game">
  <div class="game-main">
    <div class="toolbar">
      <label for="ar-bot">Gegner</label>
      <select id="ar-bot"><option value="rec">Typischer Freizeitspieler</option><option value="nash">Gleichgewicht (Nash)</option></select>
      <label for="ar-start">Startstack</label>
      <select id="ar-start"><option value="10">10 BB</option><option value="15" selected>15 BB</option><option value="20">20 BB</option></select>
      <button class="btn" id="ar-newmatch">Neues Match</button>
    </div>
    <p class="muted" id="ar-botnote" style="font-size:.9rem"></p>
    <div class="matchbar" id="ar-match"></div>
    <div class="table" id="ar-table"></div>
    <div class="actions" id="ar-actions"></div>
  </div>
  <aside class="game-side" aria-label="Analyse">
    <div id="ar-fb"></div>
    <div class="side-stats" id="ar-stats"></div>
    <section class="box"><h3>Letzte Hände</h3><div class="log" id="ar-log"></div></section>
    ${sideInfo('Wie wird bewertet?', `
      <p>Für jede Entscheidung wird der <b>Erwartungswert (EV)</b> beider Optionen in Big Blinds berechnet, gegen die Strategie des Bots, gegen den du spielst. Dein <b>EV-Verlust</b> ist der Abstand zur besseren Option.</p>
      <p><b>Bester Zug</b> und <b>Präzise</b> kosten nichts, <b>Ungenauigkeit</b> unter 0,3 BB, <b>Fehler</b> unter 1 BB, <b>Patzer</b> mehr.</p>
      <p>Das <b>Rating</b> funktioniert wie Elo bei Taktikaufgaben: Knappe Entscheidungen bringen viel, klare Fehler kosten viel. <b>Glücksbereinigt</b> zählt bei einem All-in deine Gewinnchance, nicht die Karten danach.</p>`)}
  </aside>
</div>`;

export const DUEL = `
<div class="game">
  <div class="game-main">
    <div class="table" id="du-table"></div>
    <p class="prompt" id="du-prompt"></p>
    <div class="actions" id="du-actions"></div>
  </div>
  <aside class="game-side" aria-label="Analyse">
    <div id="du-fb"></div>
    <div class="side-stats" id="du-stats"></div>
    <section class="box"><h3>Letzte Hände</h3><div class="log" id="du-log"></div></section>
    ${sideInfo('Wie funktioniert der Bot?', `
      <p>Der Bot spielt ein Gleichgewicht, berechnet mit einem Preflop-Solver (CFR+) für alle 169 Starthände. Der Spielbaum ist vereinfacht: Raise auf 2,5 BB, 3-Bet auf 10, 4-Bet auf 22, danach all-in. Limps gibt es nicht.</p>
      <p>Nach dem Flop wird nicht weitergespielt: Jeder bekommt einen Anteil am Pot nach seiner Equity, der Spieler in Position etwas mehr. Die großen Linien stimmen, in Grenzfällen kann ein echter Solver anders entscheiden.</p>`)}
  </aside>
</div>`;

export const FLOP = `
<div class="game">
  <div class="game-main">
    <div class="table" id="fl-table"></div>
    <p class="prompt" id="fl-prompt"></p>
    <div class="actions" id="fl-actions"></div>
  </div>
  <aside class="game-side" aria-label="Analyse">
    <div id="fl-fb"></div>
    <div class="side-stats" id="fl-stats"></div>
    <section class="box"><h3>Letzte Hände</h3><div class="log" id="fl-log"></div></section>
    ${sideInfo('Wie funktioniert der Bot?', `
      <p>Für jeden der 12 Flops wurde mit CFR+ ein Gleichgewicht auf Kombo-Ebene berechnet. Die Ranges stammen aus dem Preflop-Duell.</p>
      <p>Turn und River werden nicht gespielt, sondern über die exakte Equity und eine Realisierungsschätzung bewertet. Fold-, Call- und Value-Entscheidungen sind recht zuverlässig, Urteile über die Einsatzgröße weniger.</p>`)}
  </aside>
</div>`;

export const RIVER = `
<div class="game">
  <div class="game-main">
    <div class="table" id="rv-table"></div>
    <p class="prompt" id="rv-prompt"></p>
    <div class="actions" id="rv-actions"></div>
  </div>
  <aside class="game-side" aria-label="Analyse">
    <div id="rv-fb"></div>
    <div class="side-stats" id="rv-stats"></div>
    <section class="box"><h3>Letzte Hände</h3><div class="log" id="rv-log"></div></section>
    ${sideInfo('Wie funktioniert der Bot?', `
      <p>Am River kommen keine Karten mehr, deshalb ist die Lösung exakt: Ein perfekter Gegner könnte die Strategie um höchstens 0,1 % des Pots ausnutzen.</p>
      <p>Die Ranges entstehen aus den Vorstufen (Raise, Call; C-Bet, Call; Turn Check-Check). Einsätze: Big Blind checkt oder setzt ½ Pot; Small Blind checkt oder setzt ⅓, ¾ oder 1,5× Pot.</p>`)}
  </aside>
</div>`;

export const REVIEW = `
<div class="game">
  <div class="game-main">
    <div class="toolbar"><label for="rq-filter">Situation</label><select id="rq-filter"></select></div>
    <div class="table" id="rq-table"></div>
    <p class="prompt" id="rq-prompt"></p>
    <div class="actions" id="rq-actions"></div>
  </div>
  <aside class="game-side" aria-label="Auswertung">
    <div id="rq-fb"></div>
    <div class="side-stats" id="rq-stats"></div>
  </aside>
</div>`;

export const SHOW = `
<div class="mode-single">
  <div class="table" id="show-table"></div>
  <div class="actions" id="show-actions">
    <button class="btn" data-a="A">Spieler A</button>
    <button class="btn" data-a="S">Split Pot</button>
    <button class="btn" data-a="B">Spieler B</button>
  </div>
  <div id="show-fb"></div>
</div>`;

export const PRE = `
<div class="mode-single">
  <p class="model"><span class="chip">Faustregel</span> Die Ranges sind vereinfachte Lehr-Ranges für 6-max und nicht vom Solver berechnet. Die Hände kommen in ihrer echten Verteilung, deshalb ist Fold die häufigste richtige Antwort.</p>
  <div class="table" id="pre-table"></div>
  <div class="actions" id="pre-actions">
    <button class="btn" data-a="fold">Fold</button>
    <button class="btn primary" data-a="raise">Raise</button>
  </div>
  <div id="pre-fb"></div>
</div>`;

export const ODDS = `
<div class="mode-single">
  <div class="table" id="odds-table"></div>
  <div class="actions" id="odds-actions">
    <button class="btn" data-a="fold">Fold</button>
    <button class="btn primary" data-a="call">Call</button>
  </div>
  <div id="odds-fb"></div>
  <details class="box">
    <summary>Spickzettel: Outs und Faustregel</summary>
    <table class="outs">
      <tr><td>Gutshot (innen offene Straße)</td><td>4 Outs</td></tr>
      <tr><td>Zwei Overcards</td><td>6 Outs</td></tr>
      <tr><td>Open-Ended Straight-Draw</td><td>8 Outs</td></tr>
      <tr><td>Flush-Draw</td><td>9 Outs</td></tr>
      <tr><td>Flush-Draw + Gutshot</td><td>12 Outs</td></tr>
      <tr><td>Flush-Draw + Open-Ender</td><td>15 Outs</td></tr>
    </table>
    <p><b>Faustregel:</b> Am Turn (eine Karte kommt noch) Outs × 2 ≈ Chance in %, am Flop all-in (zwei Karten) Outs × 4. <b>Benötigte Equity</b> = Call ÷ (Pot + Einsatz + Call).</p>
    <p><b>Unsaubere Outs:</b> Ein Flush-Out kann das Board paaren und dem Gegner ein Full House geben, eine Straßenkarte kann ihm einen Flush bringen, Overcard-Outs hält er oft selbst. Zieh solche Outs ab. Implied Odds rechnet dieses Quiz nicht ein, weil der Gegner all-in ist.</p>
  </details>
</div>`;

export const RANKING = `<div class="box"><div class="ranking" id="ranking"></div></div>`;

export const RANGES = `
<div class="mode-single">
  <p class="model"><span class="chip">Faustregel</span> Vereinfachte Lehr-Ranges für 6-max, nicht vom Solver berechnet. Oben rechts suited (s), unten links offsuit (o), Diagonale Paare.</p>
  <div class="toolbar"><label for="range-pos">Position</label><select id="range-pos"></select><span class="chip" id="range-pct"></span></div>
  <p id="range-desc"></p>
  <div class="matrix-wrap"><div class="matrix" id="range-matrix"></div></div>
  <div class="legend"><span><span class="swatch" style="background:var(--accent)"></span> Raise</span><span><span class="swatch" style="background:var(--surface-2)"></span> Fold</span></div>
</div>`;

export const BACKUP = `
<div class="box" id="backup">
  <h3>Fortschritt sichern</h3>
  <p class="muted">Dein Fortschritt liegt nur in diesem Browser. Sichere ihn als Datei, um ihn auf einem anderen Gerät oder nach dem Löschen der Browserdaten wiederherzustellen.</p>
  <div class="actions" style="justify-content:flex-start">
    <button class="btn primary" id="bk-export">Als Datei speichern</button>
    <button class="btn" id="bk-show">Als Text anzeigen</button>
    <label class="btn" for="bk-file" style="display:inline-flex;align-items:center;justify-content:center">Datei laden</label>
    <input type="file" id="bk-file" accept="application/json,.json" class="visually-hidden">
  </div>
  <div id="bk-text" hidden style="display:flex;flex-direction:column;gap:8px">
    <label for="bk-area" class="muted" style="font-size:.85rem">Fortschritt als Text. Kopiere ihn, oder füge einen gesicherten Text ein und lade ihn.</label>
    <textarea id="bk-area" rows="5" spellcheck="false"></textarea>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn" id="bk-copy">Kopieren</button>
      <button class="btn" id="bk-load">Text laden</button>
    </div>
  </div>
  <div id="bk-msg" role="status"></div>
</div>`;
