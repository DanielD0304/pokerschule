// Edge Function "online": autoritativer Server für Matches zwischen Menschen (Roadmap 02).
// Mischt mit einem kryptografischen Zufallsgenerator, teilt aus, prüft jede Aktion und bewertet mit
// derselben Kernlogik wie die Website (src/core, Kopie in ../_shared via `npm run functions:sync`).
// Browser bekommen nur die Sicht ihres Platzes (Tabelle match_seats, per Realtime).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as O from '../_shared/core/online.js';
import { makeTables } from '../_shared/core/preflop.js';
import { makeBots } from '../_shared/core/pushfold.js';
import { makeHU } from '../_shared/core/hutree.js';
import pf from '../_shared/data/pf-data.json' with { type: 'json' };
import huTree from '../_shared/data/hu-tree.json' with { type: 'json' };
import huStrat from '../_shared/data/hu-strat.json' with { type: 'json' };

const T = makeTables(pf);
const ctx = O.makeContext({ T, nash: makeBots(T).nash, HU: makeHU(T, { tree: huTree, strat: huStrat }) });
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

class Fail extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
class Conflict extends Error {}
const check = ({ data, error }: any) => { if (error) throw error; return data; };

// ---------- Zufall und Commitment ----------
function randInt(n: number) {
  const lim = Math.floor(0x100000000 / n) * n, b = new Uint32Array(1);
  do crypto.getRandomValues(b); while (b[0] >= lim);
  return b[0] % n;
}
const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
async function newDeal() {
  const deck = O.shuffledDeck(randInt), salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const commit = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(O.commitText(deck, salt))));
  return { deck, salt, commit };
}
async function dealIfNeeded(S: any, now: number) {
  while (O.needsHand(S)) O.startHand(ctx, S, await newDeal(), now);
}

// ---------- Profile ----------
async function profiles(ids: string[]) {
  const rows = check(await db.from('profiles').select('id, display_name, online').in('id', ids));
  const fair = check(await db.from('fair_play').select('user_id, banned, recent').in('user_id', ids));
  return ids.map(id => {
    const p = rows.find((r: any) => r.id === id) || {}, f = fair.find((r: any) => r.user_id === id) || {};
    return { id, name: p.display_name || 'Gelöschtes Konto', online: p.online || {}, hasName: !!p.display_name, banned: !!f.banned, recent: f.recent || {} };
  });
}
async function me(uid: string) {
  const [p] = await profiles([uid]);
  if (p.banned) throw new Fail('Dein Konto ist für das Online-Spiel gesperrt. Schreib uns, wenn du das für einen Fehler hältst.', 403);
  if (!p.hasName) throw new Fail('Lege zuerst unter „Konto“ einen Anzeigenamen fest. Er wird deinem Gegner angezeigt.', 409);
  return p;
}
async function openMatch(uid: string) {
  const rows = check(await db.from('match_seats').select('match_id').eq('user_id', uid).eq('done', false).limit(1));
  return rows[0]?.match_id ?? null;
}

// ---------- Matches ----------
async function createMatch(format: string, ids: string[], now: number) {
  const ps = await profiles(ids), kind = O.FORMATS[format].kind;
  const players = ps.map(p => ({ id: p.id, name: p.name, rating: p.online[kind]?.rating ?? 1000, games: p.online[kind]?.games ?? 0 }));
  const id = crypto.randomUUID();
  const S = O.createMatch({ id, format, players, now, firstSb: randInt(2) });
  await dealIfNeeded(S, now);
  check(await db.rpc('online_create', {
    p_match: id, p_format: format, p_players: ids, p_names: players.map(p => p.name), p_state: S,
    p_views: [0, 1].map(seat => O.viewFor(ctx, S, seat, now)),
  }));
  return id;
}

/** Lädt ein Match, wendet fn an und speichert mit Versionsprüfung; bei gleichzeitigen Zugriffen neu versuchen. */
async function withMatch(id: string, uid: string, fn: (S: any, seat: number, lastSeen: number[], now: number) => Promise<any> | any) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [sec, seats] = await Promise.all([
      db.from('match_secrets').select('state, version').eq('match_id', id).maybeSingle().then(check),
      db.from('match_seats').select('seat, user_id, last_seen').eq('match_id', id).then(check),
    ]);
    if (!sec) throw new Fail('Dieses Match gibt es nicht.', 404);
    const S = sec.state, seat = S.players.findIndex((p: any) => p.id === uid);
    if (seat < 0) throw new Fail('Du spielst in diesem Match nicht mit.', 403);
    // fehlender Platz: Konto wurde gelöscht → gilt als nicht verbunden
    const lastSeen = [0, 1].map(s => { const r = seats.find((x: any) => x.seat === s); return r ? Date.parse(r.last_seen) : 0; });
    const now = Date.now();
    const out = await fn(S, seat, lastSeen, now);
    if (out?.unchanged) return out;
    await dealIfNeeded(S, now);
    try { await save(S, sec.version, now); } catch (e) { if (e instanceof Conflict) continue; throw e; }
    return out;
  }
  throw new Fail('Der Tisch ist gerade beschäftigt. Versuch es noch einmal.', 409);
}

async function save(S: any, version: number, now: number) {
  let finish = null;
  if (S.status === 'finished' && !S.published) { S.published = true; finish = await finishPayload(S); }
  const ok = check(await db.rpc('online_save', {
    p_match: S.id, p_version: version, p_state: S, p_views: [0, 1].map(seat => O.viewFor(ctx, S, seat, now)), p_finish: finish,
  }));
  if (!ok) throw new Conflict();
}

/** Beim Matchende: Analyse veröffentlichen, Online-Ratings fortschreiben, Fair-Play-Kennzahlen und Hinweise. */
async function finishPayload(S: any) {
  const r = S.result, ps = await profiles(S.players.map((p: any) => p.id));
  const online: any[] = [], fair: any[] = [];
  ps.forEach((p, i) => {
    if (!p.hasName) return; // Konto gelöscht
    const score = r.score === null ? null : i === 0 ? r.score : 1 - r.score;
    online.push({ id: p.id, kind: S.kind, value: O.updateOnlineStats(p.online[S.kind], { rating: r.ratings[i], score }) });
    if (score === null) return;
    const ms = S.decisions.filter((d: any) => d.seat === i && !d.timeout).map((d: any) => d.ms);
    const recent = O.pushRecent(p.recent[S.kind], { q: r.quality[i], n: r.n[i], cv: O.thinkCv(ms) });
    fair.push({ id: p.id, kind: S.kind, recent, flag: O.fairPlayFlag(recent) });
  });
  return { record: O.matchRecord(S), online, fair };
}

// ---------- Aktionen ----------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const isFormat = (f: any) => typeof f === 'string' && Object.hasOwn(O.FORMATS, f);

async function handle(uid: string, body: any) {
  const { action } = body || {};
  switch (action) {
    case 'queue': {
      if (!isFormat(body.format)) throw new Fail('Unbekanntes Format.');
      const p = await me(uid);
      const open = await openMatch(uid);
      if (open) return { match: open };
      const now = new Date().toISOString();
      await db.from('online_queue').delete().lt('seen_at', new Date(Date.now() - 60000).toISOString());
      check(await db.from('online_queue').upsert({ user_id: uid, format: body.format, rating: p.online[O.FORMATS[body.format].kind]?.rating ?? 1000, seen_at: now }, { onConflict: 'user_id' }));
      const partner = check(await db.rpc('online_pair', { p_user: uid }));
      if (!partner) return { waiting: true };
      // Wer länger wartet, sitzt auf Platz 0; die Reihenfolge der Blinds lost createMatch aus.
      return { match: await createMatch(body.format, [partner, uid], Date.now()) };
    }
    case 'cancel': {
      check(await db.from('online_queue').delete().eq('user_id', uid));
      check(await db.from('challenges').delete().eq('user_id', uid));
      return { ok: true };
    }
    case 'challenge': {
      if (!isFormat(body.format)) throw new Fail('Unbekanntes Format.');
      await me(uid);
      if (await openMatch(uid)) throw new Fail('Beende zuerst dein laufendes Match.', 409);
      const code = Array.from({ length: 8 }, () => CODE_CHARS[randInt(CODE_CHARS.length)]).join('');
      check(await db.from('online_queue').delete().eq('user_id', uid));
      check(await db.from('challenges').upsert({ code, user_id: uid, format: body.format, created_at: new Date().toISOString() }, { onConflict: 'user_id' }));
      return { code };
    }
    case 'peek': {
      const c = check(await db.from('challenges').select('user_id, format, created_at').eq('code', String(body.code || '').toUpperCase()).maybeSingle());
      if (!c || Date.now() - Date.parse(c.created_at) > 30 * 60000) throw new Fail('Diese Einladung ist abgelaufen oder wurde zurückgezogen.', 404);
      const [p] = await profiles([c.user_id]);
      return { name: p.name, format: c.format, own: c.user_id === uid };
    }
    case 'accept': {
      await me(uid);
      if (await openMatch(uid)) throw new Fail('Beende zuerst dein laufendes Match.', 409);
      const rows = check(await db.from('challenges').delete().eq('code', String(body.code || '').toUpperCase()).neq('user_id', uid).select('user_id, format, created_at'));
      const c = rows[0];
      if (!c || Date.now() - Date.parse(c.created_at) > 30 * 60000) throw new Fail('Diese Einladung ist abgelaufen oder wurde zurückgezogen.', 404);
      if (await openMatch(c.user_id)) throw new Fail('Dein Gegner spielt gerade ein anderes Match.', 409);
      check(await db.from('online_queue').delete().in('user_id', [uid, c.user_id]));
      return { match: await createMatch(c.format, [c.user_id, uid], Date.now()) };
    }
    case 'act':
      return withMatch(String(body.match), uid, (S, seat, _seen, now) => {
        const r = O.act(ctx, S, seat, String(body.action), now);
        if (!r.ok && !r.changed) throw new Fail(r.error, 409);
        return r;
      });
    case 'timeout':
      return withMatch(String(body.match), uid, (S, _seat, seen, now) => {
        const what = O.checkTimeouts(ctx, S, now, seen);
        return what ? { what } : { unchanged: true };
      });
    case 'resign':
      return withMatch(String(body.match), uid, (S, seat, _seen, now) => {
        const r = O.resign(S, seat, now);
        return r.ok ? r : { ...r, unchanged: true };
      });
    case 'rematch':
      return withMatch(String(body.match), uid, async (S, seat, _seen, now) => {
        if (S.status !== 'finished' || S.next) return { unchanged: true, next: S.next };
        if (!O.offerRematch(S, seat)) return { offered: true };
        const ids = S.players.map((p: any) => p.id);
        for (const id of ids) if (await openMatch(id)) { S.rematch = [false, false]; return { busy: true }; }
        // Plätze tauschen, damit der andere zuerst den Small Blind haben kann
        S.next = await createMatch(S.format, [ids[1], ids[0]], now);
        return { match: S.next };
      });
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
