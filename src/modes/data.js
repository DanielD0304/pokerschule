// Solver-Daten aus /data/*.json, erst geladen, wenn ein Modus sie braucht (kleiner Startdownload).
import { makeTables } from '../core/preflop.js';
import { makeHU } from '../core/hutree.js';
import { makeBots } from '../core/pushfold.js';
import { pickBoard } from '../core/flops.js';

const BASE = (import.meta.env?.BASE_URL || '/') + 'data/';
const FILES = { pf: 'pf-data.json', huTree: 'hu-tree.json', huStrat: 'hu-strat.json', flop: 'flop/index.json', river: 'river-data.json' };
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
/** Übersicht der Flop-Boards: Baum, Board, Gewicht (Anteil aller Flops), Typen, Lösungsgüte. */
export const flopIndex = () => need('flop');

// Die Lösung eines Boards (~130 KB) wird erst geladen, wenn es ausgeteilt wird.
const boards = new Map(), boardPending = new Map();
/** Lösung eines Boards, falls schon geladen, sonst null. */
export const flopBoard = board => boards.get(board) ?? null;
/** Lädt die Lösung eines Boards (mit Gewicht und Typen aus dem Index). */
export function loadFlopBoard(board) {
  if (boards.has(board)) return Promise.resolve(boards.get(board));
  if (!boardPending.has(board)) {
    boardPending.set(board, fetch(BASE + 'flop/' + board + '.json').then(r => {
      if (!r.ok) throw new Error(`Board ${board} konnte nicht geladen werden (${r.status})`);
      return r.json();
    }).then(d => {
      const meta = flopIndex().boards.find(b => b.board === board) || {};
      const full = { ...d, w: meta.w, tags: meta.tags };
      boards.set(board, full); boardPending.delete(board);
      return full;
    }).catch(e => { boardPending.delete(board); throw e; }));
  }
  return boardPending.get(board);
}
/** Lädt n verschiedene Boards, gezogen nach Häufigkeit (für Spot-Sets); Ergebnis wie die Flop-Daten für spots.js. */
export async function loadFlopSample(n = 8, rand = Math.random) {
  const idx = flopIndex(), rest = idx.boards.slice(), pick = [];
  while (pick.length < n && rest.length) { const b = pickBoard(rest, rand); pick.push(b.board); rest.splice(rest.indexOf(b), 1); }
  return { tree: idx.tree, boards: await Promise.all(pick.map(loadFlopBoard)) };
}
export const riverData = () => need('river');
