import { RONE, SUITS, SYM, SUIT_NAME, rc } from '../core/cards.js';

export function Card({ r, s, small }) {
  const su = SUITS[s], red = su === 'h' || su === 'd';
  return (
    <div className={`card ${red ? 'red' : ''} ${small ? 'sm' : ''}`} role="img" aria-label={`${RONE[r]} ${SUIT_NAME[su]}`}>
      <span>{rc(r) === 'T' ? '10' : rc(r)}</span><span className="s">{SYM[su]}</span>
    </div>
  );
}

/** Kleiner Verlaufsgraph; skaliert auf die Breite des Containers. */
export function Spark({ values, width = 170, height = 36 }) {
  const v = values.slice(-80);
  if (v.length < 2) return <p className="muted" style={{ fontSize: '.85rem' }}>Noch zu wenige Daten für einen Verlauf.</p>;
  const mn = Math.min(...v) - 5, mx = Math.max(...v) + 5;
  const pts = v.map((y, i) => [i / (v.length - 1) * (width - 6) + 3, height - 3 - (y - mn) / (mx - mn) * (height - 6)]);
  const line = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' '), e = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width, display: 'block' }} role="img" aria-label={`Verlauf von ${v[0]} auf ${v[v.length - 1]}`}>
      <polygon points={`3,${height} ${line} ${e[0].toFixed(1)},${height}`} fill="var(--accent)" fillOpacity=".12" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="1.8" />
      <circle cx={e[0]} cy={e[1]} r="3" fill="var(--accent)" />
    </svg>
  );
}
