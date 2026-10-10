// Edge Function "challenge": Wochen-Challenge (Roadmap 03). Erzeugt beim ersten Aufruf einer Woche 20 Spots
// (für alle gleich), gibt sie einzeln heraus und bewertet die Antworten auf dem Server. Die EVs liegen nur in der
// Tabelle weekly, die kein Browser lesen kann; den nächsten Spot gibt es erst nach der Antwort auf den vorigen.
// Kernlogik: src/core/spots.js und src/core/community.js (Kopie in ../_shared via `npm run functions:sync`).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as S from '../_shared/core/spots.js';
import * as C from '../_shared/core/community.js';
import { makeTables } from '../_shared/core/preflop.js';
import { makeHU } from '../_shared/core/hutree.js';
import pf from '../_shared/data/pf-data.json' with { type: 'json' };
import huTree from '../_shared/data/hu-tree.json' with { type: 'json' };
import huStrat from '../_shared/data/hu-strat.json' with { type: 'json' };
import flop from '../_shared/data/flop-data.json' with { type: 'json' };
import river from '../_shared/data/river-data.json' with { type: 'json' };

const ctx = { HU: makeHU(makeTables(pf), { tree: huTree, strat: huStrat }), flop, river };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const MAX_MS = 30 * 60000; // eine Bedenkzeit zählt höchstens 30 Minuten (Tab offen gelassen)

class Fail extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const check = ({ data, error }: any) => { if (error) throw error; return data; };
const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;

/** Woche aus der Datenbank; die laufende wird beim ersten Aufruf angelegt. */
async function getWeek(key: string, create: boolean) {
  let w = check(await db.from('weekly').select('*').eq('week', key).maybeSingle());
  if (!w && create) {
    const info = C.weekFromKey(key)!;
    const spots = S.weeklySpots(ctx, rand);
    // gleichzeitige erste Aufrufe: nur einer legt an, alle lesen danach dieselbe Zeile
    check(await db.from('weekly').upsert({ week: key, starts_at: new Date(info.start).toISOString(), ends_at: new Date(info.end).toISOString(), spots },
      { onConflict: 'week', ignoreDuplicates: true }));
    w = check(await db.from('weekly').select('*').eq('week', key).single());
  }
  if (w && !w.final && Date.now() >= Date.parse(w.ends_at)) w = await finalize(w);
  return w;
}

/** Abschluss am Sonntag: Verteilung der Antworten speichern, beste Platzierung im Profil vermerken. */
async function finalize(w: any) {
  const rows = check(await db.from('weekly').update({ final: true }).eq('week', w.week).eq('final', false).select('week'));
  if (!rows.length) return check(await db.from('weekly').select('*').eq('week', w.week).single());
  const entries = check(await db.from('weekly_entries').select('user_id, answers, loss, ms').eq('week', w.week).not('submitted_at', 'is', null));
  const stats = { n: entries.length, spots: C.distribution(w.spots, entries.map((e: any) => e.answers)) };
  check(await db.from('weekly').update({ stats }).eq('week', w.week));
  const ranked = C.rankEntries(entries);
  const profiles = check(await db.from('profiles').select('id, weekly').in('id', ranked.slice(0, 1000).map((e: any) => e.user_id)));
  for (const e of ranked.slice(0, 1000)) {
    const p = profiles.find((x: any) => x.id === e.user_id);
    if (!p) continue;
    const best = Math.min(p.weekly?.best ?? Infinity, e.pos);
    if (best !== p.weekly?.best) check(await db.from('profiles').update({ weekly: { ...p.weekly, best } }).eq('id', p.id));
  }
  return { ...w, final: true, stats };
}

async function entryOf(key: string, uid: string) {
  return check(await db.from('weekly_entries').select('*').eq('week', key).eq('user_id', uid).maybeSingle());
}

/** Was der Browser über eine Woche erfährt. Spots mit EVs erst nach der eigenen Abgabe oder nach dem Abschluss. */
function present(w: any, e: any) {
  const ended = Date.now() >= Date.parse(w.ends_at), done = !!e?.submitted_at, total = w.spots.length;
  const out: any = { week: w.week, starts_at: w.starts_at, ends_at: w.ends_at, total, ended, started: !!e, done, answered: e?.n ?? 0 };
  if (e && !done && !ended) out.next = { index: e.n, spot: S.publicSpot(w.spots[e.n]) };
  if (done || ended) {
    out.spots = w.spots;
    if (done) out.result = { loss: e.loss, ms: e.ms, good: e.good, items: C.scoreEntry(w.spots, e.answers).items };
    if (w.final && w.stats) out.stats = w.stats;
  }
  return out;
}

async function handle(uid: string, body: any) {
  const action = body?.action;
  const now = C.weekOf(Date.now());
  switch (action) {
    case 'current': {
      const w = await getWeek(now.key, true);
      return present(w, await entryOf(w.week, uid));
    }
    case 'start': {
      const w = await getWeek(now.key, true);
      check(await db.from('weekly_entries').upsert({ week: w.week, user_id: uid }, { onConflict: 'week,user_id', ignoreDuplicates: true }));
      return present(w, await entryOf(w.week, uid));
    }
    case 'answer': {
      const w = await getWeek(String(body.week), false);
      if (!w) throw new Fail('Diese Woche gibt es nicht.', 404);
      if (Date.now() >= Date.parse(w.ends_at)) throw new Fail('Diese Challenge ist schon abgeschlossen.', 409);
      const e = await entryOf(w.week, uid);
      if (!e) throw new Fail('Starte die Challenge zuerst.', 409);
      if (e.submitted_at) return present(w, e);
      const index = Number(body.index), choice = Number(body.choice);
      // doppelt gesendete Antwort (z. B. nach Netzfehler): einfach den aktuellen Stand liefern
      if (index !== e.n) return present(w, e);
      if (!Number.isInteger(choice) || choice < 0 || choice >= w.spots[index].options.length) throw new Fail('Ungültige Antwort.');
      const ms = Math.min(MAX_MS, Math.max(0, Date.now() - Date.parse(e.served_at)));
      const answers = [...e.answers, { c: choice, ms }], patch: any = { answers, n: index + 1, served_at: new Date().toISOString() };
      const last = answers.length === w.spots.length;
      if (last) {
        const r = C.scoreEntry(w.spots, answers);
        Object.assign(patch, { submitted_at: new Date().toISOString(), loss: r.loss, ms: r.ms, good: r.good });
      }
      const saved = check(await db.from('weekly_entries').update(patch).eq('week', w.week).eq('user_id', uid).eq('n', index).select('*'));
      if (!saved.length) return present(w, await entryOf(w.week, uid));
      if (last) {
        const p = check(await db.from('profiles').select('weekly').eq('id', uid).maybeSingle());
        if (p) check(await db.from('profiles').update({ weekly: { ...p.weekly, played: (p.weekly?.played ?? 0) + 1 } }).eq('id', uid));
      }
      return present(w, saved[0]);
    }
    case 'review': {
      const key = String(body.week);
      if (!C.weekFromKey(key)) throw new Fail('Unbekannte Woche.');
      const w = await getWeek(key, false);
      if (!w) throw new Fail('In dieser Woche gab es keine Challenge.', 404);
      return present(w, await entryOf(key, uid));
    }
    case 'weeks': {
      const weeks = check(await db.from('weekly').select('week, starts_at, ends_at, final').order('week', { ascending: false }).limit(12));
      const mine = check(await db.from('weekly_entries').select('week, submitted_at, loss').eq('user_id', uid).in('week', weeks.map((w: any) => w.week)));
      return { weeks: weeks.map((w: any) => { const e = mine.find((x: any) => x.week === w.week); return { ...w, done: !!e?.submitted_at, loss: e?.loss ?? null }; }) };
    }
    default:
      throw new Fail('Unbekannte Aktion.');
  }
}

// ---------- HTTP ----------
const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405);
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) throw new Fail('Bitte melde dich an.', 401);
    return json(await handle(data.user.id, await req.json().catch(() => ({}))));
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Interner Fehler auf dem Server.' }, 500);
  }
});
