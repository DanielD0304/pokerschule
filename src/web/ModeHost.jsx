// Hängt einen Spielmodus (imperativer Code aus src/modes) in eine React-Seite:
// lädt die nötigen Solver-Daten, setzt das Markup und ruft die mount-Funktion.
import { useEffect, useRef, useState } from 'react';
import { loadData, isLoaded } from '../modes/data.js';

export default function ModeHost({ html, mount, needs = [] }) {
  const ref = useRef(null);
  const [status, setStatus] = useState(isLoaded(needs) ? 'ready' : 'loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    loadData(needs)
      .then(() => {
        if (!alive || !ref.current) return;
        ref.current.innerHTML = html;
        try { mount(); setStatus('ready'); } catch (e) { console.error(e); setError('Dieser Modus konnte nicht gestartet werden.'); }
      })
      .catch(e => { if (alive) setError(e.message || 'Die Daten konnten nicht geladen werden.'); });
    return () => { alive = false; if (ref.current) ref.current.innerHTML = ''; };
    // html und mount sind pro Seite fest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {error && <div className="notice" role="alert">{error} Lade die Seite neu, um es noch einmal zu versuchen.</div>}
      {status === 'loading' && !error && <div className="loading" role="status">Lade Solver-Daten …</div>}
      <div ref={ref} />
    </>
  );
}
