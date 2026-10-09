// Online-Spiel im Browser: Warteschlange, Einladungen und Live-Tisch. Der Browser schickt nur Aktionen an die
// Edge Function "online" und bekommt die Sicht seines Platzes per Realtime (Tabelle match_seats).
import { enabled, getStatus, subscribe as onAccount, supabase, refreshProfile } from './account.js';

const PING_MS = 15000, QUEUE_MS = 4000;

// phase: idle | queue | invite | match
let st = { phase: 'idle', format: null, since: null, code: null, view: null, error: null, busy: false, offset: 0, live: false };
const listeners = new Set();
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getOnline = () => st;
const set = patch => { st = { ...st, ...patch }; listeners.forEach(fn => fn()); };

/** Server-Zeit (ms), aus dem Zeitstempel der letzten Sicht geschätzt. */
export const serverNow = () => Date.now() + st.offset;

async function call(action, body = {}) {
  const sb = await supabase();
  const { data, error } = await sb.functions.invoke('online', { body: { action, ...body } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* keine JSON-Antwort */ }
    if (/Failed to send|fetch/i.test(msg)) msg = 'Keine Verbindung zum Server. Prüfe deine Internetverbindung.';
    throw new Error(msg);
  }
  return data;
}

// ---------- Sicht vom Server ----------
function applyView(view) {
  if (!view?.id) return;
  const cur = st.view;
  // ältere Stände desselben Matches ignorieren (Realtime kann sich mit der Antwort überholen)
  if (cur && cur.id === view.id && cur.now > view.now) return;
  // ein beendetes altes Match verdrängt kein laufendes
  if (cur && cur.id !== view.id && cur.status === 'active' && view.status !== 'active') return;
  const offset = view.now - Date.now();
  set({ view, phase: 'match', offset: cur?.id === view.id ? Math.max(st.offset, offset) : offset, error: null });
  if (view.status === 'finished' && cur?.status === 'active') refreshProfile().catch(() => {});
  schedule();
}

let channel = null, uid = null, pingTimer = null, tick = null, queueTimer = null;

/** Startet das Online-Modul für den angemeldeten Nutzer (idempotent). */
export async function startOnline() {
  if (!enabled) return;
  const user = getStatus().user;
  if (!user || uid === user.id) return;
  stopOnline();
  uid = user.id;
  const sb = await supabase();
  channel = sb.channel('online-' + uid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_seats', filter: `user_id=eq.${uid}` }, p => applyView(p.new?.view))
    .subscribe(status => {
      set({ live: status === 'SUBSCRIBED' });
      if (status === 'SUBSCRIBED') loadOpen();
    });
  pingTimer = setInterval(ping, PING_MS);
  document.addEventListener('visibilitychange', onVisible);
}
export function stopOnline() {
  if (channel) supabase().then(sb => sb.removeChannel(channel)).catch(() => {});
  channel = null; uid = null;
  clearInterval(pingTimer); clearTimeout(tick); clearTimeout(queueTimer);
  document.removeEventListener('visibilitychange', onVisible);
  st = { ...st, phase: 'idle', view: null, code: null, live: false };
}
function onVisible() { if (document.visibilityState === 'visible') { ping(); loadOpen(); } }

/** Lädt ein laufendes Match (nach dem Neuladen der Seite oder Wiederverbinden). */
async function loadOpen() {
  if (!uid) return;
  const sb = await supabase();
  const { data } = await sb.from('match_seats').select('view').eq('user_id', uid).eq('done', false).limit(1);
  if (data?.[0]) applyView(data[0].view);
}
/** Lädt die Sicht eines bestimmten Matches (z. B. direkt nach dem Finden eines Gegners). */
async function loadMatch(id) {
  const sb = await supabase();
  const { data } = await sb.from('match_seats').select('view').eq('user_id', uid).eq('match_id', id).maybeSingle();
  if (data) applyView(data.view);
}

function ping() {
  const v = st.view;
  if (!v || v.status !== 'active') return;
  supabase().then(sb => sb.rpc('match_ping', { p_match: v.id })).catch(() => {});
}

/** Läuft die Bedenkzeit ab, meldet der Browser das dem Server; der prüft selbst nach. */
function schedule() {
  clearTimeout(tick);
  const v = st.view, t = v?.hand?.turn;
  if (!v || v.status !== 'active' || !t) return;
  // der Wartende meldet sofort, der Handelnde mit Abstand (falls der Gegner weg ist)
  const at = t.deadline + (t.who === 'opp' ? 600 : 3000);
  tick = setTimeout(() => call('timeout', { match: v.id }).catch(() => {}), Math.max(0, at - serverNow()));
}

// ---------- Aktionen der Oberfläche ----------
const run = async (fn) => {
  set({ busy: true, error: null });
  try { return await fn(); } catch (e) { set({ error: e.message }); return null; } finally { set({ busy: false }); }
};

/** Sucht einen Gegner. Fragt alle paar Sekunden erneut, damit das Rating-Fenster mit der Wartezeit wächst. */
export function findOpponent(format) {
  set({ phase: 'queue', format, since: Date.now(), error: null, view: st.view?.status === 'finished' ? null : st.view });
  const loop = async () => {
    if (st.phase !== 'queue') return;
    try {
      const r = await call('queue', { format });
      if (r?.match) { await loadMatch(r.match); return; }
    } catch (e) { set({ phase: 'idle', error: e.message }); return; }
    queueTimer = setTimeout(loop, QUEUE_MS);
  };
  loop();
}
export function cancelSearch() {
  clearTimeout(queueTimer);
  set({ phase: 'idle', code: null });
  call('cancel').catch(() => {});
}

export const createInvite = format => run(async () => {
  const { code } = await call('challenge', { format });
  set({ phase: 'invite', format, code, view: null });
  return code;
});
export const peekInvite = code => call('peek', { code });
export const acceptInvite = code => run(async () => {
  const r = await call('accept', { code });
  if (r?.match) await loadMatch(r.match);
});

export const act = action => run(async () => {
  const v = st.view; if (!v) return;
  await call('act', { match: v.id, action });
});
export const resign = () => run(() => call('resign', { match: st.view.id }));
export const rematch = () => run(async () => {
  const r = await call('rematch', { match: st.view.id });
  if (r?.busy) throw new Error('Dein Gegner spielt schon ein anderes Match.');
  if (r?.match) await loadMatch(r.match);
});
/** Zurück in die Lobby (nach dem Match). */
export const leave = () => set({ phase: 'idle', view: null, code: null, error: null });

/** Beendete Matches mit Analyse, neueste zuerst. */
export async function history(limit = 20) {
  const sb = await supabase();
  const { data, error } = await sb.from('matches').select('id, format, players, names, record, finished_at').eq('status', 'finished').order('finished_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data.map(m => ({ ...m, seat: m.players.indexOf(uid ?? getStatus().user?.id) }));
}
export async function matchById(id) {
  const sb = await supabase();
  const { data, error } = await sb.from('matches').select('id, format, players, names, record, status, finished_at').eq('id', id).maybeSingle();
  if (error) throw error;
  return data && { ...data, seat: data.players.indexOf(getStatus().user?.id) };
}

/** Meldet den Gegner eines Matches beim Betreiber. */
export async function report(matchId, reported, reason, note) {
  const sb = await supabase();
  const { error } = await sb.from('reports').insert({ match_id: matchId, reported, reason, note: note || null });
  if (error) throw new Error(error.code === '23505' ? 'Du hast dieses Match schon gemeldet.' : error.message);
}

/** SHA-256 als Hex im Browser (für das Nachprüfen der Decks). */
export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// beim Abmelden alles beenden, beim Anmelden nichts automatisch starten (erst auf der Online-Seite)
onAccount(() => { if (uid && getStatus().user?.id !== uid) stopOnline(); });
