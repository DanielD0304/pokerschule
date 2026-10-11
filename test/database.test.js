// Datenbank: Migrationen und Zugriffsrechte für Ranglisten, Freunde, Gruppen und Wochen-Challenge (Roadmap 03).
// Läuft ohne Docker in PGlite (Postgres als WebAssembly). Supabase-Auth ist nachgebildet: Rollen anon,
// authenticated und service_role, auth.users und auth.uid() aus den JWT-Claims. Die Tests ersetzen keinen
// Lauf gegen ein echtes Supabase-Projekt (supabase test db), prüfen aber jede Funktion und jedes Recht.
import { test } from 'node:test';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const dir = new URL('../supabase/migrations/', import.meta.url);
const db = new PGlite();
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c', D = '00000000-0000-0000-0000-00000000000d';
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
for (const f of fs.readdirSync(dir).sort()) await db.exec(fs.readFileSync(new URL(f, dir), 'utf8'));
async function as(uid, fn) {
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid }) : ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`); }
}
const q = async (sql, p) => (await db.query(sql, p)).rows;
const t = test;
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} erwartet ${JSON.stringify(b)}, bekommen ${JSON.stringify(a)}`); };
const fails = async (fn, re) => { try { await fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error('falscher Fehler: ' + e.message); return; } throw new Error('kein Fehler'); };

await db.exec(`insert into auth.users (id, email) values ('${A}','a@x'),('${B}','b@x'),('${C}','c@x'),('${D}','d@x');`);
await db.exec(`update public.profiles set display_name = 'Anna', is_public = true where id = '${A}';
  update public.profiles set display_name = 'Bea', is_public = false where id = '${B}';
  update public.profiles set display_name = 'Cem', is_public = true where id = '${C}';`);

await t('Profil-Update setzt Aktivität und Verlauf', async () => {
  await as(A, () => q(`update public.profiles set rating = 1500, ratings = '{"flop":1500}', counts = '{"flop":250}', decisions = 250 where id = auth.uid()`));
  const [p] = await q(`select active_at is not null as act, counts from public.profiles where id = '${A}'`);
  eq(p.act, true); eq(p.counts.flop, 250);
  const h = await q(`select open, close from public.rating_history where user_id = '${A}'`);
  eq(h.length, 1); eq(h[0].open.flop, 1500, 'erster Wert zählt nicht als Zuwachs'); eq(h[0].close.overall, 1500);
  await as(A, () => q(`update public.profiles set ratings = '{"flop":1540}' where id = auth.uid()`));
  const [h2] = await q(`select open, close from public.rating_history where user_id = '${A}'`);
  eq([h2.open.flop, h2.close.flop], [1500, 1540]);
});
await t('Nutzer setzen weder weekly noch active_at', async () => {
  await fails(() => as(A, () => q(`update public.profiles set weekly = '{"best":1}' where id = auth.uid()`)), /permission/);
  await fails(() => as(A, () => q(`update public.profiles set active_at = now() where id = auth.uid()`)), /permission/);
});
await t('neue Tabellen sind für Browser gesperrt', async () => {
  for (const tb of ['rating_history', 'friendships', 'friend_links', 'groups', 'group_members', 'group_invites', 'group_sets', 'group_set_progress', 'weekly', 'weekly_entries'])
    await fails(() => as(A, () => q(`select * from public.${tb}`)), /permission/);
  await fails(() => as(null, () => q(`select * from public.weekly`)), /permission/);
});
await t('interne Helfer sind nicht aufrufbar', async () => {
  await fails(() => as(A, () => q(`select public.new_code()`)), /permission/);
  await fails(() => as(A, () => q(`select public.friend_set('${B}', true)`)), /permission/);
  await fails(() => as(A, () => q(`select public.is_member('${B}', '${B}')`)), /permission/);
});
await t('Einladungscode hat 8 erlaubte Zeichen', async () => {
  const codes = (await q(`select public.new_code() as c from generate_series(1, 200)`)).map(r => r.c);
  const badCode = codes.find(c => !/^[A-HJ-NP-Z2-9]{8}$/.test(c));
  if (badCode) throw new Error(badCode);
  eq(new Set(codes).size, 200, 'eindeutig');
});

// ---------- Ranglisten ----------
await t('globale Rangliste: öffentlich, Mindestzahl, Aktivität, auch ohne Konto', async () => {
  await db.exec(`update public.profiles set rating = 1700, ratings = '{"flop":1700}', counts = '{"flop":199}', decisions = 199 where id = '${C}'`);
  let r = await as(null, () => q(`select * from public.leaderboard('flop')`));
  eq(r.map(x => x.name), ['Anna'], 'Cem hat zu wenig');
  await db.exec(`update public.profiles set counts = '{"flop":300}', decisions = 300 where id = '${C}'`);
  r = await as(A, () => q(`select pos::int, name, rating, me from public.leaderboard('flop')`));
  eq(r, [{ pos: 1, name: 'Cem', rating: 1700, me: false }, { pos: 2, name: 'Anna', rating: 1540, me: true }]);
  await db.exec(`update public.profiles set rating = 2000, ratings = '{"flop":2000}', counts = '{"flop":900}', decisions = 900 where id = '${B}'`);
  r = await as(null, () => q(`select name from public.leaderboard('flop')`));
  eq(r.map(x => x.name), ['Cem', 'Anna'], 'privat');
  await db.exec(`alter table public.profiles disable trigger profiles_activity; update public.profiles set active_at = now() - interval '31 days' where id = '${C}'; alter table public.profiles enable trigger profiles_activity;`);
  r = await as(null, () => q(`select name from public.leaderboard('flop')`));
  eq(r.map(x => x.name), ['Anna'], 'inaktiv');
  await db.exec(`update public.profiles set ratings = '{"flop":1701}' where id = '${C}'`);
  await db.exec(`update public.profiles set ratings = '{"flop":1700}' where id = '${C}'`);
  await db.exec(`update public.profiles set ratings = '{"flop":"viel"}', is_public = true where id = '${B}'`);
  r = await as(null, () => q(`select name from public.leaderboard('flop')`));
  eq(r.map(x => x.name), ['Cem', 'Anna'], 'Unsinn im JSON');
  await db.exec(`update public.profiles set ratings = '{"flop":2000}', is_public = false where id = '${B}'`);
  await fails(() => as(null, () => q(`select * from public.leaderboard('poker')`)), /Unbekannte/);
  await fails(() => as(A, () => q(`select * from public.leaderboard('flop', 'all', 'group', gen_random_uuid())`)), /Gruppe/);
});
await t('Zuwachs dieser Woche aus dem Verlauf', async () => {
  await db.exec(`insert into public.rating_history (user_id, day, open, close) values ('${A}', (now() at time zone 'Europe/Berlin')::date - 10, '{"flop":1400}', '{"flop":1400}')`);
  const r = await as(A, () => q(`select name, gain from public.leaderboard('flop', 'week')`));
  eq(r.find(x => x.name === 'Anna')?.gain, 140);
});
await t('gesperrte Konten erscheinen nicht', async () => {
  await db.exec(`insert into public.fair_play (user_id, banned) values ('${C}', true)`);
  const r = await as(null, () => q(`select name from public.leaderboard('flop')`));
  eq(r.map(x => x.name), ['Anna']);
  await db.exec(`delete from public.fair_play where user_id = '${C}'`);
});

// ---------- Freunde ----------
await t('Freunde per Link, Rangliste und Vergleich nur unter Freunden', async () => {
  const code = (await as(B, () => q(`select public.friend_link() as c`)))[0].c;
  eq((await as(B, () => q(`select public.friend_link() as c`)))[0].c, code, 'Link bleibt gleich');
  const peek = await as(A, () => q(`select * from public.friend_link_peek($1)`, [code.toLowerCase()]));
  eq([peek[0].name, peek[0].own], ['Bea', false]);
  await fails(() => as(A, () => q(`select * from public.friend_compare('${B}')`)), /nicht befreundet/);
  eq((await as(A, () => q(`select public.friend_link_accept($1) as n`, [code])))[0].n, 'Bea');
  eq(await as(A, () => q(`select name, status, rating from public.friends_list()`)), [{ name: 'Bea', status: 'accepted', rating: 2000 }]);
  eq((await as(A, () => q(`select name from public.leaderboard('flop', 'all', 'friends')`))).map(x => x.name), ['Bea', 'Anna'], 'private Freundin');
  eq((await as(C, () => q(`select name from public.leaderboard('flop', 'all', 'friends')`))).map(x => x.name), ['Cem']);
  await db.exec(`insert into public.decisions (id, user_id, mode, spot, grade, ev_loss, made_at) values
    (gen_random_uuid(), '${A}', 'flop', 'flop:f_ip', 'best', 0, now()), (gen_random_uuid(), '${A}', 'flop', 'flop:f_ip', 'mist', .5, now()),
    (gen_random_uuid(), '${B}', 'flop', 'flop:f_ip', 'blun', 2, now()), (gen_random_uuid(), '${B}', 'quiz', 'quiz:x', 'best', 0, now())`);
  eq(await as(A, () => q(`select * from public.friend_compare('${B}')`)), [{ spot: 'flop:f_ip', my_n: 2, my_loss: .5, their_n: 1, their_loss: 2 }]);
  const renewed = (await as(B, () => q(`select public.friend_link(true) as c`)))[0].c;
  if (renewed === code) throw new Error('neuer Link gleich');
  await fails(() => as(C, () => q(`select public.friend_link_accept($1)`, [code])), /gilt nicht mehr/);
});
await t('Anfrage an öffentliche Profile, Annahme nur durch den Empfänger', async () => {
  await fails(() => as(C, () => q(`select public.friend_request('Bea')`)), /kein öffentliches Profil/);
  await as(C, () => q(`select public.friend_request('anna')`));
  await as(C, () => q(`select public.friend_respond('${A}', true)`));
  eq(await as(C, () => q(`select status, incoming from public.friends_list()`)), [{ status: 'pending', incoming: false }], 'eigene Anfrage');
  eq(await as(A, () => q(`select name, incoming from public.friends_list() where status = 'pending'`)), [{ name: 'Cem', incoming: true }]);
  await as(A, () => q(`select public.friend_respond('${C}', true)`));
  eq((await as(C, () => q(`select status from public.friends_list()`)))[0].status, 'accepted');
  await as(C, () => q(`select public.friend_remove('${A}')`));
  eq((await as(C, () => q(`select * from public.friends_list()`))).length, 0);
  await as(C, () => q(`select public.friend_request('Anna')`));
  await as(A, () => q(`select public.friend_request('Cem')`));
  eq((await as(C, () => q(`select status from public.friends_list()`)))[0].status, 'accepted', 'Gegenanfrage');
  await fails(() => as(D, () => q(`select public.friend_request('Anna')`)), /Anzeigenamen/);
});

// ---------- Gruppen ----------
let G, setId;
await t('Gruppe anlegen, einladen, beitreten, Rangliste, Rechte', async () => {
  G = (await as(A, () => q(`select public.group_create('  Donnerstagsrunde ') as g`)))[0].g;
  const info = (await as(A, () => q(`select public.group_info($1) as i`, [G])))[0].i;
  eq([info.name, info.role, info.members.length], ['Donnerstagsrunde', 'lead', 1]);
  await fails(() => as(B, () => q(`select public.group_info($1)`, [G])), /kein Mitglied/);
  await fails(() => as(B, () => q(`select * from public.group_invite($1)`, [G])), /Gruppenleitung/);
  const inv = (await as(A, () => q(`select * from public.group_invite($1)`, [G])))[0];
  eq((await as(A, () => q(`select * from public.group_invite($1)`, [G])))[0].code, inv.code, 'Link bleibt');
  const peek = (await as(B, () => q(`select * from public.group_peek($1)`, [inv.code])))[0];
  eq([peek.name, peek.members, peek.lead, peek.member], ['Donnerstagsrunde', 1, 'Anna', false]);
  eq((await as(B, () => q(`select public.group_join($1) as g`, [inv.code])))[0].g, G);
  await as(B, () => q(`select public.group_join($1)`, [inv.code]));
  eq(await as(B, () => q(`select role, members from public.my_groups()`)), [{ role: 'member', members: 2 }]);
  eq((await as(B, () => q(`select name from public.leaderboard('flop', 'all', 'group', $1)`, [G]))).map(x => x.name), ['Bea', 'Anna'], 'Gruppe zeigt private Profile');
  await fails(() => as(C, () => q(`select * from public.leaderboard('flop', 'all', 'group', $1)`, [G])), /kein Mitglied/);
  await fails(() => as(B, () => q(`select public.group_kick($1, $2)`, [G, A])), /Gruppenleitung/);
  await fails(() => as(B, () => q(`select public.group_rename($1, 'Neu')`, [G])), /Gruppenleitung/);
  await fails(() => as(A, () => q(`select public.group_rename($1, 'X')`, [G])), /check/);
  await as(A, () => q(`select * from public.group_invite($1, true)`, [G]));
  await fails(() => as(C, () => q(`select public.group_join($1)`, [inv.code])), /abgelaufen/);
  const inv2 = (await as(A, () => q(`select * from public.group_invite($1)`, [G])))[0];
  await db.exec(`update public.group_invites set expires_at = now() - interval '1 minute'`);
  await fails(() => as(C, () => q(`select public.group_join($1)`, [inv2.code])), /abgelaufen/);
  await fails(() => as(D, () => q(`select public.group_create('Ohne Namen')`)), /Anzeigenamen/);
});
await t('Gruppe voll bei 50', async () => {
  const ids = Array.from({ length: 48 }, (_, i) => `10000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
  await db.exec(`insert into auth.users (id) values ${ids.map(i => `('${i}')`).join(',')}; insert into public.group_members (group_id, user_id) values ${ids.map(i => `('${G}', '${i}')`).join(',')};`);
  const inv = (await as(A, () => q(`select * from public.group_invite($1, true)`, [G])))[0];
  await fails(() => as(C, () => q(`select public.group_join($1)`, [inv.code])), /voll/);
  await db.exec(`delete from auth.users where id::text like '10000000-%';`);
});
await t('Spot-Sets: nur Leitung, nur bekannte Situationen, Übungsstand', async () => {
  await fails(() => as(B, () => q(`select public.group_set_save($1, 'River', array['river:r_vs75'])`, [G])), /Gruppenleitung/);
  await fails(() => as(A, () => q(`select public.group_set_save($1, 'River', array['river:gibtsnicht'])`, [G])), /Unbekannte Situation/);
  setId = (await as(A, () => q(`select public.group_set_save($1, 'Bluff-Catching', array['river:r_vs75','river:r_vs150'], ' am River ') as s`, [G])))[0].s;
  await as(B, () => q(`select public.group_set_record($1, 1, 1, 0.8)`, [setId]));
  await as(B, () => q(`select public.group_set_record($1, 2, 0, 0.1)`, [setId]));
  await fails(() => as(B, () => q(`select public.group_set_record($1, 99, 0, 0)`, [setId])), /Ungültige/);
  await fails(() => as(C, () => q(`select public.group_set_record($1, 1, 0, 0)`, [setId])), /Kein Mitglied/);
  const s = (await as(A, () => q(`select public.group_info($1) as i`, [G])))[0].i.sets[0];
  eq([s.name, s.note, s.spots, s.progress[0].n, s.progress[0].wrong], ['Bluff-Catching', 'am River', ['river:r_vs75', 'river:r_vs150'], 3, 1]);
  await fails(() => as(B, () => q(`select public.group_set_delete($1)`, [setId])), /Gruppenleitung/);
});
await t('Leitung geht über, letzte Person löscht die Gruppe', async () => {
  await as(A, () => q(`select public.group_leave($1)`, [G]));
  eq((await as(B, () => q(`select role from public.my_groups()`)))[0].role, 'lead');
  const G2 = (await as(C, () => q(`select public.group_create('Zweite') as g`)))[0].g;
  const inv = (await as(C, () => q(`select * from public.group_invite($1)`, [G2])))[0];
  await as(A, () => q(`select public.group_join($1)`, [inv.code]));
  await as(C, () => q(`select public.delete_account()`));
  eq(await as(A, () => q(`select role from public.my_groups()`)), [{ role: 'lead' }], 'nach Kontolöschung');
  await as(A, () => q(`select public.group_leave($1)`, [G2]));
  eq((await q(`select count(*)::int as n from public.groups where id = $1`, [G2]))[0].n, 0);
  await as(B, () => q(`select public.group_delete($1)`, [G]));
  eq((await q(`select count(*)::int as n from public.groups`))[0].n, 0);
  eq((await q(`select count(*)::int as n from public.group_sets`))[0].n, 0);
});

// ---------- Wochen-Challenge ----------
await t('Wochen-Wertung: Reihenfolge, Sichtbarkeit, eigene Zeile', async () => {
  await db.exec(`insert into public.weekly (week, starts_at, ends_at, spots) values ('2026-W41', now() - interval '1 day', now() + interval '1 day', '[]');
    insert into public.weekly_entries (week, user_id, submitted_at, loss, ms, good) values
      ('2026-W41', '${A}', now(), .3, 50000, 15), ('2026-W41', '${B}', now(), .2, 90000, 16), ('2026-W41', '${D}', now(), .3, 40000, 15);`);
  eq(await as(null, () => q(`select pos::int, name from public.weekly_board('2026-W41')`)), [{ pos: 1, name: 'Anna' }].map(x => ({ ...x, pos: 3 })), 'Gast');
  eq(await as(D, () => q(`select pos::int, total::int, name, me from public.weekly_board('2026-W41')`)), [{ pos: 2, total: 3, name: 'Du', me: true }, { pos: 3, total: 3, name: 'Anna', me: false }], 'D');
});
await t('Wochen-Wertung unter Freunden', async () => {
  eq((await as(A, () => q(`select name from public.weekly_board('2026-W41', 'friends')`))).map(x => x.name), ['Bea', 'Anna']);
});
await t('Konto löschen entfernt Freundschaften und Einträge', async () => {
  await as(B, () => q(`select public.delete_account()`));
  eq((await q(`select count(*)::int as n from public.friendships where '${B}' in (user_a, user_b)`))[0].n, 0);
  eq((await q(`select count(*)::int as n from public.weekly_entries where user_id = '${B}'`))[0].n, 0);
  eq((await q(`select count(*)::int as n from public.rating_history where user_id = '${B}'`))[0].n, 0);
});

// ---------- Turn-Training (Migration turn) ----------
await t('Turn als Modus: Entscheidungen, Rangliste, unbekannte Modi weiter abgewiesen', async () => {
  await db.exec(`insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e1');
    update public.profiles set display_name = 'Turni', is_public = true where id = '00000000-0000-0000-0000-0000000000e1';`);
  const E = '00000000-0000-0000-0000-0000000000e1';
  await as(E, () => q(`insert into public.decisions (id, mode, spot, grade, ev_loss, made_at) values (gen_random_uuid(), 'turn', 'turn:u_ip', 'best', 0, now())`));
  await fails(() => as(E, () => q(`insert into public.decisions (id, mode, spot, grade, ev_loss, made_at) values (gen_random_uuid(), 'preflop6', 'x', 'best', 0, now())`)), /check/);
  await as(E, () => q(`update public.profiles set ratings = '{"turn":1600}', counts = '{"turn":250}' where id = auth.uid()`));
  eq((await as(null, () => q(`select name, rating from public.leaderboard('turn')`))), [{ name: 'Turni', rating: 1600 }]);
});
