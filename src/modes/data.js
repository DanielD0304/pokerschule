// Solver-Daten aus /data/*.json, erst geladen, wenn ein Modus sie braucht (kleiner Startdownload).
import { makeTables } from '../core/preflop.js';
import { makeHU } from '../core/hutree.js';
import { makeBots } from '../core/pushfold.js';

const BASE = (import.meta.env?.BASE_URL || '/') + 'data/';
const FILES = { pf: 'pf-data.json', huTree: 'hu-tree.json', huStrat: 'hu-strat.json', flop: 'flop-data.json', river: 'river-data.json' };
/** Welche Dateien ein Modus braucht. */
export const NEEDS = { arena: ['pf'], duel: ['pf', 'huTree', 'huStrat'], flop: ['flop'], river: ['river'] };
const raw = {}, pending = {};

function fetchOne(key) {
  if (raw[key]) return Promise.resolve(raw[key]);
  return (pending[key] ??= fetch(BASE + FILES[key]).then(r => {
    if (!r.ok) throw new Error(`${FILES[key]} konnte nicht geladen werden (${r.status})`);
    return r.json();
  }).then(j => (raw[key] = j)).catch(e => { delete pending[key]; throw e; }));
}
export const loadData = keys => Promise.all(keys.map(fetchOne));
export const isLoaded = keys => keys.every(k => raw[k]);

const need = k => { if (!raw[k]) throw new Error(`Daten ${k} nicht geladen`); return raw[k]; };
const cache = {};
export const tables = () => (cache.T ??= makeTables(need('pf')));
export const bots = () => (cache.B ??= makeBots(tables()));
export const hu = () => (cache.HU ??= makeHU(tables(), { tree: need('huTree'), strat: need('huStrat') }));
export const flopData = () => need('flop');
export const riverData = () => need('river');
