// Konto und Synchronisierung mit Supabase. Ohne Konfiguration (VITE_SUPABASE_URL/-ANON_KEY) ist alles aus,
// und die Website verhält sich wie bisher. Die Supabase-Bibliothek wird erst geladen, wenn sie gebraucht wird.
import { state, subscribe as onStore, replaceState, persist } from './store.js';
import { onDecision } from './progress.js';
import { merge, same, summary, isEmpty, publicStats, enqueue } from '../core/sync.js';
import { exportFileName, defaults } from '../core/storage.js';

const env = import.meta.env || {};
const URL_ = env.VITE_SUPABASE_URL, KEY_ = env.VITE_SUPABASE_ANON_KEY;
export const enabled = Boolean(URL_ && KEY_);
/** Zusätzliche Anmeldewege, z. B. "google,apple"; jeder muss in Supabase eingerichtet sein. */
export const providers = String(env.VITE_AUTH_PROVIDERS || '').split(',').map(s => s.trim()).filter(p => ['google', 'apple'].includes(p));

const AUTH_KEY = 'pokerschule.auth', META_KEY = 'pokerschule.konto', OUTBOX_KEY = 'pokerschule.outbox', BACKUP_KEY = 'pokerschule.sicherung';
const ls = {
  get(k) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* egal */ } },
  has(k) { try { return localStorage.getItem(k) != null; } catch { return false; } },
};

// ---------- Zustand für die Oberfläche ----------
// phase: off | idle (abgemeldet) | loading | link (Rückfrage beim ersten Verbinden) | synced | syncing | offline | error
let status = { phase: !enabled ? 'off' : ls.has(AUTH_KEY) ? 'loading' : 'idle', user: null, profile: null, link: null, lastSync: null, error: null, sent: null };
const listeners = new Set();
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getStatus = () => status;
const set = patch => { status = { ...status, ...patch }; listeners.forEach(fn => fn()); };

// ---------- Client ----------
let clientP = null;
function client() {
  return (clientP ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const sb = createClient(URL_, KEY_, {
      // implicit: Der Link funktioniert auch, wenn er in einem anderen Browser geöffnet wird als dem, der ihn angefordert hat.
      auth: { storageKey: AUTH_KEY, flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    sb.auth.onAuthStateChange((event, session) => {
      // Supabase-Aufrufe nicht direkt im Callback abwarten (sonst Verklemmung in der Bibliothek)
      setTimeout(() => {
        if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) signedIn(session.user);
        else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) set({ phase: 'idle', user: null, profile: null, link: null });
      }, 0);
    });
    return sb;
  }).catch(e => { clientP = null; fail(e, 'Konto'); throw e; }));
}

const isNetwork = e => !navigator.onLine || /fetch|network|load failed/i.test(String(e?.message || e));
function fail(e, what) {
  if (isNetwork(e)) { set({ phase: 'offline', error: null }); return; }
  console.error(what, e);
  set({ phase: 'error', error: `${what}: ${errorText(e)}` });
}
const check = ({ data, error }) => { if (error) throw error; return data; };
/** Verständliche deutsche Meldung für Fehler aus Netz und Supabase. */
export function errorText(e) {
  const msg = String(e?.message || e);
  if (isNetwork(e)) return 'Keine Verbindung zum Server. Prüfe deine Internetverbindung und versuche es noch einmal.';
  if (e?.status === 429 || /rate limit|security purposes/i.test(msg)) return 'Zu viele Versuche. Warte eine Minute und versuche es dann noch einmal.';
  if (/expired|invalid/i.test(msg) && /otp|token/i.test(msg)) return 'Der Code ist falsch oder abgelaufen. Fordere einen neuen Link an.';
  if (/email/i.test(msg) && /invalid/i.test(msg)) return 'Diese E-Mail-Adresse ist ungültig.';
  return msg;
}

// ---------- Anmelden ----------
const redirect = () => location.origin + '/konto';
export async function sendLink(email) {
  const sb = await client();
  check(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect(), shouldCreateUser: true } }));
  state.ui.ageOk = true; persist();
  set({ sent: email });
}
export async function verifyCode(email, token) {
  const sb = await client();
  check(await sb.auth.verifyOtp({ email, token: token.trim(), type: 'email' }));
}
export async function signInWith(provider) {
  const sb = await client();
  state.ui.ageOk = true; persist();
  check(await sb.auth.signInWithOAuth({ provider, options: { redirectTo: redirect() } }));
}
/** Abmelden. Mit `wipe` wird auch der Fortschritt in diesem Browser gelöscht (geteilte Geräte). */
export async function signOut({ wipe = false } = {}) {
  const sb = await client();
  await sb.auth.signOut().catch(() => {});
  ls.del(META_KEY); ls.del(OUTBOX_KEY);
  if (wipe) { ls.del(BACKUP_KEY); replaceState({ ...defaults(), ui: { tab: null, ageOk: state.ui.ageOk } }); }
  set({ phase: 'idle', user: null, profile: null, link: null, sent: null, lastSync: null });
}

// ---------- Erstes Verbinden und laufende Synchronisierung ----------
const meta = () => ls.get(META_KEY) || {};
const setMeta = m => ls.set(META_KEY, m);

async function fetchRow(sb, uid) {
  return check(await sb.from('progress').select('data, version').eq('user_id', uid).maybeSingle());
}

async function signedIn(user) {
  if (status.user?.id === user.id && status.phase !== 'idle') return;
  set({ user, phase: 'loading', error: null, sent: null });
  try {
    const sb = await client();
    const [row, profile] = await Promise.all([fetchRow(sb, user.id), check(await sb.from('profiles').select('*').eq('id', user.id).maybeSingle())]);
    set({ profile });
    if (meta().user === user.id) { await syncNow(); return; }
    // dieses Gerät ist noch nicht mit dem Konto verbunden
    if (isEmpty(state)) { await connect(row ? 'remote' : 'merge', row); return; }
    set({ phase: 'link', link: { local: summary(state), remote: row ? summary(row.data) : null } });
  } catch (e) { fail(e, 'Anmeldung'); }
}

/**
 * Verbindet dieses Gerät mit dem Konto.
 * choice 'merge': lokalen Fortschritt mit dem Konto zusammenführen; 'remote': nur den Stand des Kontos verwenden.
 * Vorher wird der lokale Stand als Sicherung in diesem Browser abgelegt.
 */
export async function connect(choice, knownRow) {
  const uid = status.user?.id; if (!uid) return;
  set({ phase: 'syncing', link: null });
  try {
    const sb = await client();
    const row = knownRow !== undefined ? knownRow : await fetchRow(sb, uid);
    if (!isEmpty(state)) ls.set(BACKUP_KEY, { at: new Date().toISOString(), data: JSON.parse(JSON.stringify(state)) });
    const next = !row ? merge(state, {}) : choice === 'remote' ? merge(row.data, {}) : merge(state, row.data);
    applying = true; replaceState(next, { fresh: false }); applying = false;
    setMeta({ user: uid, version: row?.version ?? 0, dirty: true });
    await syncNow();
  } catch (e) { applying = false; fail(e, 'Verbinden'); }
}
/** Bricht das erste Verbinden ab und meldet ab; der lokale Fortschritt bleibt unverändert. */
export const cancelLink = () => signOut();

let applying = false, running = null, again = false;
/** Holt den Stand des Kontos, führt ihn mit dem lokalen zusammen und lädt das Ergebnis hoch. */
export function syncNow() {
  if (running) { again = true; return running; }
  running = (async () => {
    try { do { again = false; await syncOnce(); } while (again); } finally { running = null; }
  })();
  return running;
}

async function syncOnce() {
  const m = meta(), uid = status.user?.id;
  if (!uid || m.user !== uid) return;
  if (!navigator.onLine) { set({ phase: 'offline' }); return; }
  set({ phase: 'syncing', error: null });
  try {
    const sb = await client();
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await fetchRow(sb, uid);
      if (row && (row.version !== m.version || m.dirty)) {
        const next = merge(state, row.data);
        if (!same(next, state)) { applying = true; replaceState(next, { fresh: false }); applying = false; }
      }
      if (row && same(state, row.data)) { setMeta({ user: uid, version: row.version, dirty: false }); break; }
      const data = JSON.parse(JSON.stringify(state));
      if (!row) {
        const { error } = await sb.from('progress').insert({ user_id: uid, data, version: 1 });
        if (error && error.code !== '23505') throw error; // 23505: anderes Gerät war schneller → neu lesen
        if (!error) { setMeta({ user: uid, version: 1, dirty: false }); break; }
      } else {
        // nur schreiben, wenn seit dem Lesen niemand anderes geschrieben hat
        const done = check(await sb.from('progress').update({ data, version: row.version + 1 }).eq('user_id', uid).eq('version', row.version).select('version'));
        if (done.length) { setMeta({ user: uid, version: row.version + 1, dirty: false }); break; }
      }
      m.version = -1; // Konflikt: neu lesen und zusammenführen
    }
    await flushOutbox(sb, uid);
    await pushProfileStats(sb, uid);
    set({ phase: 'synced', lastSync: new Date() });
  } catch (e) { applying = false; fail(e, 'Synchronisierung'); }
}

async function flushOutbox(sb, uid) {
  let box = ls.get(OUTBOX_KEY) || [];
  while (box.length) {
    const chunk = box.slice(0, 500);
    const { error } = await sb.from('decisions').upsert(chunk.map(r => ({ ...r, user_id: uid })), { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    // während des Hochladens neu hinzugekommene Einträge behalten
    box = (ls.get(OUTBOX_KEY) || []).filter(r => !chunk.some(c => c.id === r.id));
    ls.set(OUTBOX_KEY, box);
  }
}

async function pushProfileStats(sb, uid) {
  const p = publicStats(state), cur = status.profile;
  const same = (x, y) => JSON.stringify(x ?? {}) === JSON.stringify(y ?? {});
  if (!cur || (cur.rating === p.overall && cur.decisions === p.decisions && same(cur.ratings, p.ratings) && same(cur.counts, p.counts))) return;
  const [profile] = check(await sb.from('profiles').update({ rating: p.overall, ratings: p.ratings, counts: p.counts, decisions: p.decisions }).eq('id', uid).select('*'));
  if (profile) set({ profile });
}

// ---------- Profil, Export, Löschen ----------
export async function updateProfile(patch) {
  const sb = await client(), uid = status.user.id;
  const { data, error } = await sb.from('profiles').update(patch).eq('id', uid).select('*');
  if (error) throw new Error(error.code === '23505' ? 'Dieser Anzeigename ist schon vergeben.' : error.message);
  set({ profile: data[0] });
}

/** Lädt alle Kontodaten und speichert sie als Datei. */
export async function exportAccount() {
  const sb = await client(), uid = status.user.id;
  const profile = check(await sb.from('profiles').select('*').eq('id', uid).maybeSingle());
  const progress = check(await sb.from('progress').select('*').eq('user_id', uid).maybeSingle());
  const decisions = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await sb.from('decisions').select('id, mode, spot, grade, ev_loss, made_at').eq('user_id', uid).order('made_at').range(from, from + 999));
    decisions.push(...page); if (page.length < 1000) break;
  }
  const text = JSON.stringify({ app: 'pokerschule', kind: 'konto', exported: new Date().toISOString(), email: status.user.email, profile, progress, decisions }, null, 1);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = exportFileName().replace('fortschritt', 'konto'); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Löscht das Konto mit allen Daten auf dem Server. Der Fortschritt in diesem Browser bleibt. */
export async function deleteAccount() {
  const sb = await client();
  check(await sb.rpc('delete_account'));
  await signOut();
}

/** Öffentliches Profil nach Anzeigename (für /spieler/:name). */
export async function publicProfile(name) {
  const sb = await client();
  return check(await sb.from('profiles').select('display_name, avatar, rating, ratings, counts, decisions, online, weekly, created_at').ilike('display_name', name.replace(/[%_\\]/g, c => '\\' + c)).eq('is_public', true).maybeSingle());
}

/** Lokale Sicherung vom ersten Verbinden, falls vorhanden. */
export const backupInfo = () => { const b = ls.get(BACKUP_KEY); return b ? { at: b.at, ...summary(b.data) } : null; };
export function restoreBackup() {
  const b = ls.get(BACKUP_KEY); if (!b) return;
  replaceState(merge(b.data, {}));
}

// ---------- Start ----------
let timer = null;
function schedule(ms = 2500) {
  if (applying || !meta().user || !status.user) return;
  const m = meta(); if (!m.dirty) setMeta({ ...m, dirty: true });
  clearTimeout(timer); timer = setTimeout(syncNow, ms);
}

export function initAccount() {
  if (!enabled) return;
  onStore(() => schedule());
  onDecision(d => {
    if (!meta().user) return;
    ls.set(OUTBOX_KEY, enqueue(ls.get(OUTBOX_KEY) || [], { id: crypto.randomUUID(), mode: d.mode, spot: d.spot.slice(0, 64), grade: d.q, ev_loss: Math.min(1000, d.loss), made_at: new Date().toISOString() }));
  });
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  // Bibliothek nur laden, wenn es eine Sitzung gibt oder gerade ein Anmeldelink geöffnet wurde
  const fromLink = /access_token|error_description/.test(location.hash);
  if (ls.has(AUTH_KEY) || fromLink) client();
}
/** Lädt die Bibliothek, damit die Konto-Seite den Anmeldestatus kennt. */
export const ensureClient = () => enabled && client();
/** Der Supabase-Client für andere Module (Online-Spiel). */
export const supabase = () => client();
/** Liest das eigene Profil neu (z. B. nach einem Online-Match mit neuem Rating). */
export async function refreshProfile() {
  const uid = status.user?.id; if (!uid) return;
  const sb = await client();
  const profile = check(await sb.from('profiles').select('*').eq('id', uid).maybeSingle());
  if (profile) set({ profile });
}
