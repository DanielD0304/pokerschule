import { useSyncExternalStore } from 'react';
import { state, subscribe, getVersion } from '../modes/store.js';

/** Liefert den Speicherstand und rendert neu, sobald sich etwas ändert. */
export function useProgress() {
  useSyncExternalStore(subscribe, getVersion);
  return state;
}
