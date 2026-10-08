// Eingebettete Solver-Daten (vom Build als <script type="application/json"> eingefügt), erst bei Bedarf gelesen.
import { makeTables } from '../core/preflop.js';
import { makeHU } from '../core/hutree.js';
import { makeBots } from '../core/pushfold.js';

const cache = {};
const json = id => (cache[id] ??= JSON.parse(document.getElementById(id).textContent));

export const tables = () => (cache.T ??= makeTables(json('pf-data')));
export const bots = () => (cache.B ??= makeBots(tables()));
export const hu = () => (cache.HU ??= makeHU(tables(), json('hu-data')));
export const flopData = () => {
  if (!cache.F) { cache.F = json('flop-data'); }
  return cache.F;
};
export const riverData = () => json('river-data');
